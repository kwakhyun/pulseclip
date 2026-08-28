import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  session,
  Tray,
  type IpcMainInvokeEvent,
} from 'electron';
import { APP_EVENTS } from '../shared/ipc';
import type {
  CaptureSource,
  PrepareCaptureRequest,
  RuntimeStatus,
  ShortcutRegistration,
} from '../shared/types';
import { ClipRepository } from './clip-repository';
import { registerIpcHandlers } from './ipc-handlers';
import { Logger } from './logger';
import { SettingsStore } from './settings-store';
import { WriteSessionManager } from './write-session-manager';
import { DiskSafetyService } from './disk-safety';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pulseclip',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

interface PendingCaptureGrant {
  sourceId: string;
  includeSystemAudio: boolean;
  senderId: number;
  expiresAt: number;
}

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pendingCaptureGrant: PendingCaptureGrant | null = null;
let settingsStore: SettingsStore;
let clipRepository: ClipRepository;
let writeSessionManager: WriteSessionManager;
let diskSafety: DiskSafetyService;
let logger: Logger;
let shortcutRegistration: ShortcutRegistration = {
  saveReplay: false,
  toggleRecording: false,
};
let runtimeStatus: RuntimeStatus = {
  phase: 'idle',
  sourceName: '',
  bufferSeconds: 0,
  recordingSeconds: 0,
};

app.on('second-instance', () => showMainWindow());

app.whenReady().then(initialize).catch((error) => {
  logger?.error('Fatal initialization failure', error);
  app.quit();
});

app.on('activate', () => showMainWindow());

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  void writeSessionManager?.shutdown();
});

async function initialize(): Promise<void> {
  app.setAppUserModelId('com.pulseclip.desktop');
  app.setName('PulseClip');
  logger = new Logger(app.getPath('logs'));
  settingsStore = new SettingsStore(
    path.join(app.getPath('userData'), 'settings.json'),
    path.join(app.getPath('videos'), 'PulseClip'),
    logger,
  );
  await settingsStore.load();
  clipRepository = new ClipRepository(settingsStore, logger);
  diskSafety = new DiskSafetyService(settingsStore, logger);
  const recovered = await clipRepository.recoverPartFiles();
  writeSessionManager = new WriteSessionManager(
    settingsStore,
    clipRepository,
    logger,
    diskSafety,
    () => sendAppEvent('storage:safety-stop-requested'),
  );

  setupMediaProtocol();
  setupCapturePermissions();
  mainWindow = createMainWindow();
  createTray();
  shortcutRegistration = registerGlobalShortcuts();
  applyLoginItemSettings();
  setupPowerEvents();
  registerIpcHandlers({
    window: mainWindow,
    settings: settingsStore,
    clips: clipRepository,
    writer: writeSessionManager,
    diskSafety,
    logger,
    listCaptureSources,
    prepareCapture,
    registerShortcuts: registerGlobalShortcuts,
    getShortcutRegistration: () => ({ ...shortcutRegistration }),
    applyLoginItemSettings,
    updateTrayStatus,
  });

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow?.show();
  });

  if (recovered > 0) {
    logger.info('Recovered interrupted recordings', { count: recovered });
  }
  logger.info('PulseClip initialized', {
    version: app.getVersion(),
    electron: process.versions.electron,
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#090b10',
    title: 'PulseClip',
    icon: runtimeAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });
  window.on('close', (event) => {
    if (!isQuitting && settingsStore.get().minimizeToTray) {
      event.preventDefault();
      window.hide();
    }
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  return window;
}

function setupCapturePermissions(): void {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return (
      permission === 'media' &&
      Boolean(mainWindow) &&
      webContents?.id === mainWindow?.webContents.id
    );
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === 'media' && webContents.id === mainWindow?.webContents.id);
    },
  );
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const grant = pendingCaptureGrant;
    pendingCaptureGrant = null;
    if (
      !grant ||
      Date.now() > grant.expiresAt ||
      grant.senderId !== mainWindow?.webContents.id ||
      request.frame?.top !== mainWindow?.webContents.mainFrame
    ) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find(
        (candidate) => candidate.id === grant.sourceId && !isOwnWindowSource(candidate),
      );
      if (!source) {
        callback({});
        return;
      }
      callback({
        video: source,
        audio: grant.includeSystemAudio ? 'loopback' : undefined,
      });
    } catch (error) {
      logger.error('Display media request failed', error);
      callback({});
    }
  });
}

async function prepareCapture(
  event: IpcMainInvokeEvent,
  request: PrepareCaptureRequest,
): Promise<void> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 },
  });
  if (!sources.some(
    (source) => source.id === request.sourceId && !isOwnWindowSource(source),
  )) {
    throw new Error('선택한 캡처 소스를 더 이상 찾을 수 없습니다.');
  }
  pendingCaptureGrant = {
    sourceId: request.sourceId,
    includeSystemAudio: request.includeSystemAudio,
    senderId: event.sender.id,
    expiresAt: Date.now() + 10_000,
  };
}

async function listCaptureSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 384, height: 216 },
    fetchWindowIcons: true,
  });
  return sources.filter((source) => !isOwnWindowSource(source)).map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    displayId: source.display_id || null,
    thumbnailDataUrl: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
    appIconDataUrl:
      source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
  }));
}

function isOwnWindowSource(source: { id: string; name: string }): boolean {
  return source.id.startsWith('window:')
    && source.name.trim().toLocaleLowerCase() === app.getName().trim().toLocaleLowerCase();
}

function registerGlobalShortcuts(): ShortcutRegistration {
  globalShortcut.unregisterAll();
  const shortcuts = settingsStore.get().hotkeys;
  const saveReplay = globalShortcut.register(shortcuts.saveReplay, () => {
    sendAppEvent('shortcut:save-replay');
  });
  const toggleRecording = globalShortcut.register(shortcuts.toggleRecording, () => {
    sendAppEvent('shortcut:toggle-recording');
  });
  shortcutRegistration = { saveReplay, toggleRecording };
  rebuildTrayMenu();
  return { ...shortcutRegistration };
}

function applyLoginItemSettings(): void {
  if (process.platform !== 'win32') return;
  app.setLoginItemSettings({
    openAtLogin: settingsStore.get().launchAtStartup,
    args: ['--hidden'],
  });
}

function setupMediaProtocol(): void {
  void protocol.handle('pulseclip', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'media') return new Response('Not found', { status: 404 });
      const id = decodeURIComponent(url.pathname.slice(1));
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return new Response('Bad request', { status: 400 });
      }
      const filePath = await clipRepository.resolveMediaPath(id);
      if (!filePath) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
      });
    } catch (error) {
      logger.warn('Media protocol request failed', error);
      return new Response('Not found', { status: 404 });
    }
  });
}

function createTray(): void {
  const icon = nativeImage
    .createFromPath(runtimeAssetPath('tray-icon.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('PulseClip');
  tray.on('double-click', () => showMainWindow());
  rebuildTrayMenu();
}

function runtimeAssetPath(fileName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), 'build', fileName);
}

function rebuildTrayMenu(): void {
  if (!tray || !settingsStore) return;
  const statusLabel = trayStatusLabel(runtimeStatus);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: 'PulseClip 열기', click: () => showMainWindow() },
      {
        label: `최근 구간 저장 (${settingsStore.get().hotkeys.saveReplay})`,
        click: () => sendAppEvent('shortcut:save-replay'),
      },
      {
        label: `녹화 시작/종료 (${settingsStore.get().hotkeys.toggleRecording})`,
        click: () => sendAppEvent('shortcut:toggle-recording'),
      },
      {
        label: '리플레이 준비 끄기',
        enabled: runtimeStatus.phase !== 'idle',
        click: () => sendAppEvent('capture:stop-requested'),
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function updateTrayStatus(status: RuntimeStatus): void {
  runtimeStatus = status;
  tray?.setToolTip(trayStatusLabel(status));
  rebuildTrayMenu();
}

function trayStatusLabel(status: RuntimeStatus): string {
  if (status.phase === 'recording') {
    return `녹화 중 · ${formatClock(status.recordingSeconds)}`;
  }
  if (status.phase === 'buffering' || status.phase === 'saving') {
    return `리플레이 준비됨 · ${Math.floor(status.bufferSeconds)}초`;
  }
  if (status.phase === 'error') return '오류가 발생했습니다';
  if (status.phase === 'recovering') return '장치 연결 복구 중';
  if (status.phase === 'starting') return '캡처 준비 중';
  return 'PulseClip · 대기 중';
}

function setupPowerEvents(): void {
  const requestStop = () => sendAppEvent('capture:stop-requested');
  powerMonitor.on('suspend', requestStop);
  powerMonitor.on('lock-screen', requestStop);
}

function sendAppEvent(name: (typeof APP_EVENTS)[number]): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(name);
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  sendAppEvent('app:show');
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
