import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppEventName,
  AppSettings,
  BeginFileRequest,
  FinalizeFileRequest,
  PrepareCaptureRequest,
  PulseClipApi,
  RendererDiagnosticSnapshot,
  RuntimeStatus,
} from '../shared/types';

// Sandboxed preload scripts cannot require local modules at runtime. Keep this
// small channel table self-contained; all imported shared declarations are
// type-only and are erased from the emitted JavaScript.
const IPC = {
  bootstrap: 'app:bootstrap',
  listSources: 'capture:list-sources',
  prepareCapture: 'capture:prepare',
  updateSettings: 'settings:update',
  chooseOutputFolder: 'settings:choose-output-folder',
  listClips: 'clips:list',
  getDiskSpace: 'storage:disk-space',
  runDiagnostics: 'diagnostics:run',
  exportDiagnostics: 'diagnostics:export',
  favoriteClip: 'clips:favorite',
  deleteClip: 'clips:delete',
  revealClip: 'clips:reveal',
  openClip: 'clips:open',
  beginFile: 'files:begin',
  appendFile: 'files:append',
  finalizeFile: 'files:finalize',
  abortFile: 'files:abort',
  notify: 'app:notify',
  reportRuntimeStatus: 'app:runtime-status',
  shutdownReady: 'app:shutdown-ready',
  windowAction: 'window:action',
} as const;

const APP_EVENTS = [
  'shortcut:save-replay',
  'shortcut:toggle-recording',
  'capture:stop-requested',
  'storage:safety-stop-requested',
  'app:shutdown-requested',
  'app:show',
] as const;

const api: PulseClipApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  listCaptureSources: () => ipcRenderer.invoke(IPC.listSources),
  prepareCapture: (request: PrepareCaptureRequest) =>
    ipcRenderer.invoke(IPC.prepareCapture, request),
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC.updateSettings, patch),
  chooseOutputFolder: () => ipcRenderer.invoke(IPC.chooseOutputFolder),
  listClips: () => ipcRenderer.invoke(IPC.listClips),
  getDiskSpace: () => ipcRenderer.invoke(IPC.getDiskSpace),
  runDiagnostics: (snapshot: RendererDiagnosticSnapshot) =>
    ipcRenderer.invoke(IPC.runDiagnostics, snapshot),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.exportDiagnostics),
  setClipFavorite: (id: string, favorite: boolean) =>
    ipcRenderer.invoke(IPC.favoriteClip, id, favorite),
  deleteClip: (id: string) => ipcRenderer.invoke(IPC.deleteClip, id),
  revealClip: (id: string) => ipcRenderer.invoke(IPC.revealClip, id),
  openClip: (id: string) => ipcRenderer.invoke(IPC.openClip, id),
  beginFile: (request: BeginFileRequest) => ipcRenderer.invoke(IPC.beginFile, request),
  appendFile: (sessionId: string, bytes: ArrayBuffer) =>
    ipcRenderer.invoke(IPC.appendFile, sessionId, bytes),
  finalizeFile: (sessionId: string, request: FinalizeFileRequest) =>
    ipcRenderer.invoke(IPC.finalizeFile, sessionId, request),
  abortFile: (sessionId: string, reason?: string) =>
    ipcRenderer.invoke(IPC.abortFile, sessionId, reason),
  notify: (title: string, body: string) => ipcRenderer.invoke(IPC.notify, title, body),
  reportRuntimeStatus: (status: RuntimeStatus) =>
    ipcRenderer.invoke(IPC.reportRuntimeStatus, status),
  completeShutdown: () => ipcRenderer.invoke(IPC.shutdownReady),
  windowAction: (action: 'minimize' | 'maximize' | 'close' | 'quit') =>
    ipcRenderer.invoke(IPC.windowAction, action),
  onAppEvent: (name: AppEventName, listener: () => void) => {
    if (!(APP_EVENTS as readonly string[]).includes(name)) {
      throw new Error('지원하지 않는 앱 이벤트입니다.');
    }
    const wrapped = () => listener();
    ipcRenderer.on(name, wrapped);
    return () => ipcRenderer.removeListener(name, wrapped);
  },
};

contextBridge.exposeInMainWorld('pulseClip', api);
