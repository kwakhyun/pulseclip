import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  net,
  Notification,
  powerMonitor,
  protocol,
  session,
  shell,
  Tray,
  type IpcMainInvokeEvent,
  type NativeImage,
  type RenderProcessGoneDetails,
} from 'electron';
import type {
  AppEventMap,
  AppEventName,
  CaptureSource,
  PrepareCaptureRequest,
  RuntimeStatus,
  ShortcutRegistration,
  StorageCleanupResult,
} from '../shared/types';
import { resolveAppAssetPath } from './app-assets';
import { ClipRepository } from './clip-repository';
import { DiskSafetyService } from './disk-safety';
import { registerIpcHandlers } from './ipc-handlers';
import { isUuid } from './input-validation';
import { Logger } from './logger';
import { RendererCrashPolicy } from './renderer-crash-policy';
import { SettingsStore } from './settings-store';
import { RendererShutdownCoordinator } from './shutdown-coordinator';
import { decideWindowCloseAction } from './window-close-policy';
import { WriteSessionManager } from './write-session-manager';
import { mediaResponse } from './media-response';
import { PowerResumePolicy } from './power-resume-policy';
import { paintStatusDot, statusDotFor } from './tray-status-icon';
import { displayShortcut } from '../shared/hotkeys';

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
const SHUTDOWN_TIMEOUT_MS = 8_000;
const RENDERER_CRASH_WINDOW_MS = 60_000;
const MAX_RENDERER_RELOADS = 3;
const SHORTCUT_SUSPEND_LIMIT_MS = 20_000;
const RESUME_SETTLE_MS = 2_000;

if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | null = null;
let rendererCrashRecoveryPromise: Promise<void> | null = null;
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
let trayMenuKey = '';
let trayIconPhase: RuntimeStatus['phase'] | null = null;
const trayIcons = new Map<string, NativeImage>();
let shortcutResumeTimer: NodeJS.Timeout | null = null;
let dragIconImage: NativeImage | null = null;
const powerResume = new PowerResumePolicy();
const rendererShutdown = new RendererShutdownCoordinator();
const rendererCrashPolicy = new RendererCrashPolicy(
  MAX_RENDERER_RELOADS,
  RENDERER_CRASH_WINDOW_MS,
);

app.on('second-instance', () => showMainWindow());

app.whenReady().then(initialize).catch(async (error) => {
  logger?.error('Fatal initialization failure', error);
  await logger?.flush().catch(() => undefined);
  app.quit();
});

app.on('activate', () => showMainWindow());

app.on('before-quit', (event) => {
  isQuitting = true;
  if (shutdownComplete) return;
  event.preventDefault();
  shutdownPromise ??= performGracefulShutdown();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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
  clipRepository = new ClipRepository(settingsStore, logger, {
    trash: (filePath) => shell.trashItem(filePath),
    onCleanup: announceStorageCleanup,
  });
  diskSafety = new DiskSafetyService(settingsStore, logger);
  const recovered = await clipRepository.recoverPartFiles();
  writeSessionManager = new WriteSessionManager(
    settingsStore,
    clipRepository,
    logger,
    diskSafety,
    () => sendAppEvent('storage:safety-stop-requested'),
  );

  await setupProtocolHandlers();
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
    suspendShortcuts,
    getShortcutRegistration: () => ({ ...shortcutRegistration }),
    dragIcon,
    applyLoginItemSettings,
    updateTrayStatus,
    onShutdownReady: () => {
      if (isQuitting) rendererShutdown.markReady();
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow?.show();
  });

  await loadMainWindow(mainWindow);

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
  window.webContents.on('render-process-gone', (_event, details) => {
    handleRendererCrash(window, details);
  });
  window.webContents.on('did-finish-load', () => {
    logger.info('Renderer loaded', { url: window.webContents.getURL() });
  });
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      logger.error('Renderer failed to load', {
        errorCode,
        errorDescription,
        url: validatedURL,
      });
    },
  );
  window.on('maximize', () => sendAppEvent('window:maximized-changed', { maximized: true }));
  window.on('unmaximize', () => sendAppEvent('window:maximized-changed', { maximized: false }));
  window.on('close', (event) => {
    const action = decideWindowCloseAction(
      isQuitting,
      settingsStore.get().minimizeToTray,
    );
    if (action === 'hide') {
      event.preventDefault();
      window.hide();
    } else if (action === 'quit') {
      event.preventDefault();
      isQuitting = true;
      app.quit();
    }
  });

  return window;
}

async function loadMainWindow(window: BrowserWindow): Promise<void> {
  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }
  await window.loadURL('pulseclip://app/index.html');
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
  if (shortcutResumeTimer) {
    clearTimeout(shortcutResumeTimer);
    shortcutResumeTimer = null;
  }
  globalShortcut.unregisterAll();
  const shortcuts = settingsStore.get().hotkeys;
  const register = (accelerator: string, listener: () => void) => {
    try { return globalShortcut.register(accelerator, listener); }
    catch (error) { logger.warn('Could not register shortcut', { accelerator, error }); return false; }
  };
  const saveReplay = register(shortcuts.saveReplay, () => {
    sendAppEvent('shortcut:save-replay');
  });
  const toggleRecording = register(shortcuts.toggleRecording, () => {
    sendAppEvent('shortcut:toggle-recording');
  });
  shortcutRegistration = { saveReplay, toggleRecording };
  rebuildTrayMenu();
  return { ...shortcutRegistration };
}

/**
 * Lets the settings hotkey recorder receive keys that are registered globally.
 * The suspension always ends on its own, so a closed or crashed renderer can
 * never leave the user without F8.
 */
function suspendShortcuts(suspended: boolean): ShortcutRegistration {
  if (!suspended) return registerGlobalShortcuts();
  globalShortcut.unregisterAll();
  if (shortcutResumeTimer) clearTimeout(shortcutResumeTimer);
  shortcutResumeTimer = setTimeout(() => {
    shortcutResumeTimer = null;
    registerGlobalShortcuts();
  }, SHORTCUT_SUSPEND_LIMIT_MS);
  return { ...shortcutRegistration };
}

function dragIcon(): NativeImage {
  dragIconImage ??= nativeImage
    .createFromPath(runtimeAssetPath('icon.png'))
    .resize({ width: 48, height: 48 });
  return dragIconImage;
}

function announceStorageCleanup(result: StorageCleanupResult): void {
  sendAppEvent('storage:cleanup-completed', result);
  // The renderer shows a toast; a Windows notification is for the background.
  if (mainWindow?.isFocused()) return;
  if (!settingsStore.get().showNotifications || !Notification.isSupported()) return;
  new Notification({
    title: '저장 한도를 넘어 오래된 클립을 정리했습니다',
    body: `즐겨찾기가 아닌 클립 ${result.count}개를 삭제했습니다. 설정에서 한도와 자동 정리를 바꿀 수 있습니다.`,
  }).show();
}

function applyLoginItemSettings(): void {
  if (process.platform !== 'win32') return;
  app.setLoginItemSettings({
    openAtLogin: settingsStore.get().launchAtStartup,
    args: ['--hidden'],
  });
}

async function setupProtocolHandlers(): Promise<void> {
  await protocol.handle('pulseclip', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'media' || (url.hostname === 'app' && url.pathname.startsWith('/media/'))) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
        }
        const id = decodeURIComponent(url.pathname.slice(url.hostname === 'media' ? 1 : 7));
        if (!isUuid(id)) return new Response('Bad request', { status: 400 });
        const filePath = await clipRepository.resolveMediaPath(id);
        if (!filePath) return new Response('Not found', { status: 404 });
        return mediaResponse(filePath, request);
      }
      if (url.hostname === 'app') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'GET, HEAD' },
          });
        }
        const assetPath = resolveAppAssetPath(
          path.join(__dirname, '../../dist'),
          url.pathname,
        );
        if (!assetPath) return new Response('Bad request', { status: 400 });
        return net.fetch(pathToFileURL(assetPath).toString(), {
          method: request.method,
          headers: request.headers,
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      logger.warn('Protocol request failed', error);
      return new Response('Not found', { status: 404 });
    }
  });
}

function createTray(): void {
  tray = new Tray(trayIconFor(runtimeStatus.phase));
  trayIconPhase = runtimeStatus.phase;
  tray.setToolTip('PulseClip');
  tray.on('double-click', () => showMainWindow());
  rebuildTrayMenu();
}

function trayIconFor(phase: RuntimeStatus['phase']): NativeImage {
  const dot = statusDotFor(phase);
  const key = dot ? `${dot.red}-${dot.green}-${dot.blue}` : 'plain';
  const cached = trayIcons.get(key);
  if (cached) return cached;
  const base = nativeImage
    .createFromPath(runtimeAssetPath('tray-icon.png'))
    .resize({ width: 16, height: 16 });
  let icon = base;
  if (dot && !base.isEmpty()) {
    const { width, height } = base.getSize();
    icon = nativeImage.createFromBitmap(paintStatusDot(base.toBitmap(), width, height, dot), { width, height });
  }
  trayIcons.set(key, icon);
  return icon;
}

function runtimeAssetPath(fileName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), 'build', fileName);
}

function rebuildTrayMenu(): void {
  if (!tray || !settingsStore) return;
  const hotkeys = settingsStore.get().hotkeys;
  const captureOn = runtimeStatus.phase !== 'idle' && runtimeStatus.phase !== 'error';
  const statusLabel = trayPhaseLabel(runtimeStatus.phase);
  // Rebuilding a native menu every second can close it while it is open.
  // Only rebuild when something shown in the menu actually changed.
  const key = [statusLabel, captureOn, hotkeys.saveReplay, hotkeys.toggleRecording].join('|');
  if (key === trayMenuKey) return;
  trayMenuKey = key;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      { label: 'PulseClip 열기', click: () => showMainWindow() },
      captureOn
        ? {
            label: '리플레이 준비 끄기',
            click: () => sendAppEvent('capture:stop-requested'),
          }
        : {
            label: '리플레이 준비 켜기',
            click: () => sendAppEvent('capture:start-requested'),
          },
      {
        label: `최근 구간 저장 (${displayShortcut(hotkeys.saveReplay)})`,
        enabled: captureOn,
        click: () => sendAppEvent('shortcut:save-replay'),
      },
      {
        label: `녹화 시작/종료 (${displayShortcut(hotkeys.toggleRecording)})`,
        click: () => sendAppEvent('shortcut:toggle-recording'),
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
  if (tray && trayIconPhase !== status.phase) {
    trayIconPhase = status.phase;
    tray.setImage(trayIconFor(status.phase));
  }
  rebuildTrayMenu();
}

function trayPhaseLabel(phase: RuntimeStatus['phase']): string {
  if (phase === 'recording') return '녹화 중';
  if (phase === 'buffering' || phase === 'saving') return '리플레이 준비됨';
  if (phase === 'error') return '오류가 발생했습니다';
  if (phase === 'recovering') return '장치 연결 복구 중';
  if (phase === 'starting') return '캡처 준비 중';
  return 'PulseClip · 대기 중';
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
  let resumeTimer: NodeJS.Timeout | null = null;
  const isLocked = () => powerMonitor.getSystemIdleState(1) === 'locked';
  const requestStop = () => {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    if (powerResume.onSuspendOrLock(runtimeStatus.phase)) sendAppEvent('capture:stop-requested');
  };
  const requestResume = (event: 'resume' | 'unlock-screen') => {
    if (!powerResume.onResumeOrUnlock(event, isLocked())) return;
    // Give Windows a moment to restore displays and audio endpoints. A lock or
    // sleep in the meantime cancels this and the next unlock restarts instead.
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      if (powerResume.onSettled(isLocked())) sendAppEvent('capture:resume-requested');
    }, RESUME_SETTLE_MS);
  };
  powerMonitor.on('suspend', requestStop);
  powerMonitor.on('lock-screen', requestStop);
  powerMonitor.on('resume', () => requestResume('resume'));
  powerMonitor.on('unlock-screen', () => requestResume('unlock-screen'));
}

async function performGracefulShutdown(): Promise<void> {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      sendAppEvent('app:shutdown-requested');
      const result = await rendererShutdown.wait(SHUTDOWN_TIMEOUT_MS);
      if (result === 'timeout') {
        logger?.warn('Renderer shutdown timed out; preserving unfinished recordings');
      }
    }
  } catch (error) {
    logger?.error('Renderer shutdown failed', error);
  }

  try {
    await writeSessionManager?.shutdown('app-shutdown');
  } catch (error) {
    logger?.error('Failed to close media write sessions during shutdown', error);
  }

  await logger?.flush().catch(() => undefined);
  shutdownComplete = true;
  app.quit();
}

function handleRendererCrash(
  window: BrowserWindow,
  details: RenderProcessGoneDetails,
): void {
  if (isQuitting) {
    rendererShutdown.markReady();
    return;
  }
  if (rendererCrashRecoveryPromise) return;

  const recovery = performRendererCrashRecovery(window, details).catch((error) => {
    logger?.error('Renderer crash recovery failed', error);
    requestFatalQuit(
      '화면을 복구하지 못했습니다. 진행 중이던 녹화의 보존을 시도한 뒤 PulseClip을 종료합니다.',
    );
  });
  rendererCrashRecoveryPromise = recovery;
  void recovery.finally(() => {
    if (rendererCrashRecoveryPromise === recovery) {
      rendererCrashRecoveryPromise = null;
    }
  });
}

async function performRendererCrashRecovery(
  window: BrowserWindow,
  details: RenderProcessGoneDetails,
): Promise<void> {
  const action = rendererCrashPolicy.register();
  pendingCaptureGrant = null;
  logger.error('Renderer process terminated unexpectedly', {
    reason: details.reason,
    exitCode: details.exitCode,
    action,
  });

  await writeSessionManager.shutdown('renderer-crash');
  const recovered = await clipRepository.recoverPartFiles();
  if (recovered > 0) {
    logger.info('Recovered recordings after renderer crash', { count: recovered });
  }

  if (isQuitting || window.isDestroyed()) return;
  if (action === 'stop') {
    requestFatalQuit(
      '화면 프로세스가 짧은 시간에 반복해서 종료되었습니다. 녹화 파일을 보존한 뒤 PulseClip을 안전하게 종료합니다.',
    );
    return;
  }

  updateTrayStatus({
    phase: 'recovering',
    sourceName: '',
    bufferSeconds: 0,
    recordingSeconds: 0,
  });
  window.webContents.reload();
  window.show();
  logger.info('Reloading renderer after unexpected termination', {
    reason: details.reason,
  });
}

function requestFatalQuit(message: string): void {
  if (isQuitting) return;
  dialog.showErrorBox('PulseClip을 복구할 수 없습니다', message);
  isQuitting = true;
  rendererShutdown.markReady();
  app.quit();
}

function sendAppEvent<T extends AppEventName>(
  name: T,
  ...payload: AppEventMap[T] extends undefined ? [] : [AppEventMap[T]]
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(name, ...payload);
  } catch (error) {
    logger?.warn('Could not deliver renderer event', { name, error });
  }
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
