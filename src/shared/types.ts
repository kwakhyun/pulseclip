export type CaptureSourceKind = 'screen' | 'window';
export type CaptureResolution = 'source' | '720p' | '1080p' | '1440p';
export type ClipKind = 'recording' | 'replay' | 'recovered' | 'edited';
export type NavigationPage = 'home' | 'clips' | 'diagnostics' | 'settings';
export type DiagnosticStatus = 'pass' | 'warning' | 'fail';
export type DiskHealth = 'healthy' | 'low' | 'critical' | 'unknown';
export type RecoveryState = 'none' | 'recovering' | 'recovered' | 'failed';

export interface CaptureSource {
  id: string;
  name: string;
  kind: CaptureSourceKind;
  displayId: string | null;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
}

export interface HotkeySettings {
  saveReplay: string;
  toggleRecording: string;
}

export interface AppSettings {
  schemaVersion: 1;
  completedOnboarding: boolean;
  selectedSourceId: string;
  selectedSourceName: string;
  resolution: CaptureResolution;
  fps: 30 | 60;
  videoBitrateMbps: number;
  replaySeconds: number;
  systemAudio: boolean;
  microphone: boolean;
  microphoneDeviceId: string;
  microphoneGain: number;
  recordCursor: boolean;
  autoStartBuffer: boolean;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  playSounds: boolean;
  storageLimitGb: number;
  autoCleanup: boolean;
  outputFolder: string;
  hotkeys: HotkeySettings;
}

export interface Clip {
  id: string;
  fileName: string;
  title: string;
  kind: ClipKind;
  createdAt: string;
  durationMs: number;
  sourceName: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bytes: number;
  favorite: boolean;
  recovered: boolean;
  mediaUrl: string;
}

export interface StorageStats {
  bytesUsed: number;
  limitBytes: number;
  clipCount: number;
  favoriteCount: number;
  todayCount: number;
}

export interface ShortcutRegistration {
  saveReplay: boolean;
  toggleRecording: boolean;
}

export interface BootstrapData {
  appVersion: string;
  platform: string;
  settings: AppSettings;
  clips: Clip[];
  storage: StorageStats;
  diskSpace: DiskSpaceStatus;
  shortcutRegistration: ShortcutRegistration;
  /** Saved hotkeys that were replaced because they are no longer allowed. */
  hotkeyReplacements: HotkeyReplacement[];
  windowMaximized: boolean;
}

export interface HotkeyReplacement {
  action: keyof HotkeySettings;
  previous: string;
  current: string;
}

export interface DiskSpaceStatus {
  health: DiskHealth;
  freeBytes: number;
  totalBytes: number;
  reserveBytes: number;
  requiredStartBytes: number;
  canStart: boolean;
  shouldStop: boolean;
  summary: string;
}

export interface RendererDiagnosticSnapshot {
  webCodecsAvailable: boolean;
  h264Supported: boolean;
  aacSupported: boolean;
  captureSourceCount: number;
  microphoneCount: number;
  selectedSourceAvailable: boolean;
}

export interface DiagnosticCheck {
  id: string;
  title: string;
  status: DiagnosticStatus;
  summary: string;
  detail?: string;
}

export interface DiagnosticReport {
  generatedAt: string;
  overall: DiagnosticStatus;
  checks: DiagnosticCheck[];
  diskSpace: DiskSpaceStatus;
  system: {
    appVersion: string;
    platform: string;
    architecture: string;
    osRelease: string;
    electronVersion: string;
  };
}

export interface RuntimeStatus {
  phase: EnginePhase;
  sourceName: string;
  bufferSeconds: number;
  recordingSeconds: number;
}

export interface PrepareCaptureRequest {
  sourceId: string;
  includeSystemAudio: boolean;
}

export interface BeginFileRequest {
  kind: Exclude<ClipKind, 'recovered'>;
  sourceName: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export interface BeginFileResult {
  sessionId: string;
}

export interface TrimFileRequest {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  publishedAt: string;
  releaseUrl: string;
}

export interface FinalizeFileRequest {
  durationMs: number;
}

export interface StorageCleanupResult {
  count: number;
  bytes: number;
}

/**
 * trashed: moved to the Recycle Bin. deleted: removed for good (asked for).
 * trash-unavailable: Windows refused the Recycle Bin and nothing was removed.
 */
export type ClipDeleteOutcome = 'trashed' | 'deleted' | 'trash-unavailable';

export interface DeleteClipResult {
  clips: Clip[];
  storage: StorageStats;
  outcome: ClipDeleteOutcome;
}

export interface AppEventMap {
  'shortcut:save-replay': undefined;
  'shortcut:toggle-recording': undefined;
  'capture:start-requested': undefined;
  'capture:stop-requested': undefined;
  'capture:resume-requested': undefined;
  'storage:safety-stop-requested': undefined;
  'storage:cleanup-completed': StorageCleanupResult;
  'app:shutdown-requested': undefined;
  'app:show': undefined;
  'window:maximized-changed': { maximized: boolean };
}

export type AppEventName = keyof AppEventMap;

export interface PulseClipApi {
  bootstrap(): Promise<BootstrapData>;
  listCaptureSources(): Promise<CaptureSource[]>;
  prepareCapture(request: PrepareCaptureRequest): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<{
    settings: AppSettings;
    shortcutRegistration: ShortcutRegistration;
  }>;
  chooseOutputFolder(): Promise<string | null>;
  listClips(): Promise<{ clips: Clip[]; storage: StorageStats }>;
  getDiskSpace(): Promise<DiskSpaceStatus>;
  runDiagnostics(snapshot: RendererDiagnosticSnapshot): Promise<DiagnosticReport>;
  exportDiagnostics(): Promise<string | null>;
  setClipFavorite(id: string, favorite: boolean): Promise<Clip>;
  renameClip(id: string, title: string): Promise<Clip>;
  beginTrim(request: TrimFileRequest): Promise<BeginFileResult>;
  checkForUpdates(): Promise<UpdateInfo>;
  openReleasePage(): Promise<void>;
  /** Moves to the Recycle Bin; `permanent` skips it after the user agreed. */
  deleteClip(id: string, permanent?: boolean): Promise<DeleteClipResult>;
  startClipDrag(id: string): Promise<void>;
  suspendShortcuts(suspended: boolean): Promise<ShortcutRegistration>;
  revealClip(id: string): Promise<void>;
  openClip(id: string): Promise<void>;
  beginFile(request: BeginFileRequest): Promise<BeginFileResult>;
  appendFile(sessionId: string, bytes: ArrayBuffer): Promise<void>;
  finalizeFile(sessionId: string, request: FinalizeFileRequest): Promise<Clip>;
  abortFile(sessionId: string, reason?: string): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  reportRuntimeStatus(status: RuntimeStatus): Promise<void>;
  completeShutdown(): Promise<void>;
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'quit'): Promise<void>;
  onAppEvent<T extends AppEventName>(name: T, listener: (payload: AppEventMap[T]) => void): () => void;
}

export type EnginePhase =
  | 'idle'
  | 'starting'
  | 'recovering'
  | 'buffering'
  | 'recording'
  | 'saving'
  | 'error';

export interface CaptureTelemetry {
  phase: EnginePhase;
  sourceName: string;
  bufferSeconds: number;
  bufferBytes: number;
  recordingSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasSystemAudio: boolean;
  hasMicrophone: boolean;
  recoveryState: RecoveryState;
  recoveryAttempt: number;
  recoveryMessage: string;
  error: string | null;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}
