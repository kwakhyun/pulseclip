import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import type {
  AppSettings,
  AudioInputDevice,
  BootstrapData,
  CaptureSource,
  CaptureTelemetry,
  Clip,
  DiagnosticReport,
  DiskSpaceStatus,
  NavigationPage,
  ShortcutRegistration,
  StorageStats,
} from '../shared/types';
import { ReplayCaptureEngine } from './capture/ReplayCaptureEngine';
import { BrandMark } from './components/BrandMark';
import { ClipLibrary } from './components/ClipLibrary';
import { Dashboard } from './components/Dashboard';
import { DiagnosticsPage } from './components/DiagnosticsPage';
import { ConfirmDialog } from './components/ConfirmDialog';
import { OnboardingModal } from './components/OnboardingModal';
import { PlayerModal } from './components/PlayerModal';
import { SourcePickerModal } from './components/SourcePickerModal';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ToastHost, type ToastMessage } from './components/ToastHost';
import { useClipEditor } from './hooks/useClipEditor';
import { playFeedbackSound, type FeedbackSound } from './feedback-sounds';
import { formatBytes } from './utils';
import { displayShortcut } from '../shared/hotkeys';

/** A replay saves "the last N seconds"; running it much later would save the wrong moment. */
const HOTKEY_QUEUE_LIMIT_MS = 4_000;

const EMPTY_STORAGE: StorageStats = {
  bytesUsed: 0,
  limitBytes: 0,
  clipCount: 0,
  favoriteCount: 0,
  todayCount: 0,
};

const EMPTY_TELEMETRY: CaptureTelemetry = {
  phase: 'idle',
  sourceName: '',
  bufferSeconds: 0,
  bufferBytes: 0,
  recordingSeconds: 0,
  width: 0,
  height: 0,
  fps: 0,
  videoCodec: '',
  audioCodec: '',
  hasSystemAudio: false,
  hasMicrophone: false,
  recoveryState: 'none',
  recoveryAttempt: 0,
  recoveryMessage: '',
  error: null,
};

type HotkeyAction = 'saveReplay' | 'toggleRecording';

interface ActionRegistry extends Record<HotkeyAction, () => void> {
  startCapture: () => void;
  resumeCapture: () => void;
  stopCapture: () => void;
  diskSafetyStop: () => void;
  shutdown: () => void;
  refresh: () => void;
}

export default function App() {
  const engineRef = useRef<ReplayCaptureEngine | null>(null);
  if (!engineRef.current) engineRef.current = new ReplayCaptureEngine();
  const engine = engineRef.current;
  const actionsRef = useRef<ActionRegistry>({
    saveReplay: () => undefined,
    toggleRecording: () => undefined,
    startCapture: () => undefined,
    resumeCapture: () => undefined,
    stopCapture: () => undefined,
    diskSafetyStop: () => undefined,
    shutdown: () => undefined,
    refresh: () => undefined,
  });
  const toastId = useRef(0);
  const reportRef = useRef({ phase: '', timestamp: 0 });
  const recoveryStateRef = useRef<CaptureTelemetry['recoveryState']>('none');
  const shutdownStartedRef = useRef(false);
  const busyRef = useRef(false);
  // Hotkeys pressed while another capture action runs wait here instead of
  // being dropped. Each action is kept once, and pressing the action that is
  // already running is ignored, so mashing F8 saves one replay and a second
  // F9 does not flip recording back.
  const queuedHotkeys = useRef<Array<{ action: HotkeyAction; at: number }>>([]);
  const runningHotkey = useRef<HotkeyAction | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [storage, setStorage] = useState<StorageStats>(EMPTY_STORAGE);
  const [diskSpace, setDiskSpace] = useState<DiskSpaceStatus | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticExporting, setDiagnosticExporting] = useState(false);
  const [shortcutRegistration, setShortcutRegistration] =
    useState<ShortcutRegistration>({ saveReplay: false, toggleRecording: false });
  const [telemetry, setTelemetry] = useState<CaptureTelemetry>(EMPTY_TELEMETRY);
  const [page, setPage] = useState<NavigationPage>('home');
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
    // Let React commit first so the queued action sees the new state.
    if (!value && queuedHotkeys.current.length > 0) window.setTimeout(drainHotkeys, 0);
  };
  const drainHotkeys = () => {
    if (busyRef.current) return;
    const now = Date.now();
    const fresh = queuedHotkeys.current.filter(entry => now - entry.at <= HOTKEY_QUEUE_LIMIT_MS);
    const expired = queuedHotkeys.current.length - fresh.length;
    queuedHotkeys.current = fresh;
    if (expired > 0) {
      showToast('info', '이전 작업이 길어져 단축키 입력을 취소했습니다', '원하는 장면이 지나갔다면 다시 눌러 주세요.');
      signal('failed', { title: '단축키 입력을 취소했습니다', body: '이전 작업이 길어졌습니다. 필요하면 다시 눌러 주세요.' });
    }
    const next = queuedHotkeys.current.shift();
    if (!next) return;
    actionsRef.current[next.action]();
    // An action that stops at a guard never sets busy, so nothing would drain the rest.
    if (!busyRef.current && queuedHotkeys.current.length > 0) window.setTimeout(drainHotkeys, 0);
  };
  /** Returns true when the action was deferred behind a running one. */
  const deferHotkey = (action: HotkeyAction): boolean => {
    if (!busyRef.current) return false;
    // A second press of the running action means "did it hear me?", not "do it twice".
    if (runningHotkey.current === action) return true;
    const queued = queuedHotkeys.current.find(entry => entry.action === action);
    if (queued) queued.at = Date.now();
    else queuedHotkeys.current.push({ action, at: Date.now() });
    return true;
  };
  /** Replay is turning on or reconnecting, so there is nothing to save or record yet. */
  const captureNotReady = (action: HotkeyAction): boolean => {
    const current = engine.getTelemetry();
    const recovering = current.phase === 'recovering';
    const preparing = current.phase === 'starting' || (action === 'saveReplay' && current.bufferSeconds < 1);
    if (!recovering && !preparing) return false;
    const title = recovering ? '장치 연결을 복구하는 중입니다' : '리플레이를 준비하는 중입니다';
    const body = recovering ? '복구가 끝나면 다시 눌러 주세요.' : '몇 초 뒤 다시 눌러 주세요.';
    showToast('info', title, body);
    signal('failed', { title, body });
    return true;
  };
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Clip | null>(null);
  const [permanentDeleteCandidate, setPermanentDeleteCandidate] = useState<Clip | null>(null);
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<NavigationPage | null>(null);

  const showToast = useCallback(
    (tone: ToastMessage['tone'], title: string, description?: string, persistent = tone === 'error') => {
      const id = ++toastId.current;
      setToasts((current) => [...current.slice(-2), { id, tone, title, description }]);
      // Errors stay until dismissed; they often explain why a clip is missing.
      if (!persistent) {
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 5000);
      }
    },
    [],
  );

  /** Sound and, when PulseClip is in the background, a Windows notification. */
  const signal = useCallback((sound: FeedbackSound, notice?: { title: string; body: string }) => {
    if (settingsRef.current?.playSounds) playFeedbackSound(sound);
    if (notice && !document.hasFocus()) {
      void window.pulseClip.notify(notice.title, notice.body).catch(() => undefined);
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    const result = await window.pulseClip.listClips();
    setClips(result.clips);
    setStorage(result.storage);
    setSelectedClip((current) =>
      current ? result.clips.find((clip) => clip.id === current.id) ?? null : null,
    );
  }, []);

  const refreshSources = useCallback(async () => {
    setRefreshingSources(true);
    try {
      setSources(await window.pulseClip.listCaptureSources());
    } catch (error) {
      showToast('error', '캡처 소스를 불러오지 못했습니다', messageOf(error));
    } finally {
      setRefreshingSources(false);
    }
  }, [showToast]);

  const editor = useClipEditor(async clip => {
    await refreshLibrary();
    setSelectedClip(clip);
    showToast('success', '편집한 클립을 저장했습니다', '원본 영상은 그대로 보존됩니다.');
  }, error => showToast('error', '클립 편집을 완료하지 못했습니다', messageOf(error)));

  const renameClip = async (clip: Clip, title: string) => {
    try {
      await window.pulseClip.renameClip(clip.id, title);
      await refreshLibrary();
      showToast('success', '클립 이름을 변경했습니다');
      return true;
    } catch (error) {
      showToast('error', '이름을 변경하지 못했습니다', messageOf(error));
      return false;
    }
  };

  const refreshMicrophones = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(
        devices
          .filter((device) => device.kind === 'audioinput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `마이크 ${index + 1}`,
          })),
      );
    } catch {
      setMicrophones([]);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const unsubscribeTelemetry = engine.onTelemetry((next) => {
      if (disposed) return;
      setTelemetry(next);
      if (recoveryStateRef.current !== next.recoveryState) {
        recoveryStateRef.current = next.recoveryState;
        if (next.recoveryState === 'recovering') {
          showToast('info', '장치 연결을 자동으로 복구하고 있습니다', next.recoveryMessage);
        } else if (next.recoveryState === 'recovered') {
          showToast('success', '장치 연결이 복구되었습니다', next.recoveryMessage);
        } else if (next.recoveryState === 'failed') {
          showToast('error', '장치를 자동으로 복구하지 못했습니다', next.recoveryMessage);
        }
      }
      const now = Date.now();
      if (
        reportRef.current.phase !== next.phase ||
        now - reportRef.current.timestamp >= 1000
      ) {
        reportRef.current = { phase: next.phase, timestamp: now };
        void window.pulseClip
          .reportRuntimeStatus({
            phase: next.phase,
            sourceName: next.sourceName,
            bufferSeconds: next.bufferSeconds,
            recordingSeconds: next.recordingSeconds,
          })
          .catch(() => undefined);
      }
    });
    const unsubscribeClip = engine.onClipCreated(() => {
      void refreshLibrary().catch((error) => {
        if (!disposed) {
          showToast('error', '클립 목록을 새로고치지 못했습니다', messageOf(error));
        }
      });
    });
    const unsubscribeEvents = [
      window.pulseClip.onAppEvent('shortcut:save-replay', () =>
        actionsRef.current.saveReplay(),
      ),
      window.pulseClip.onAppEvent('shortcut:toggle-recording', () =>
        actionsRef.current.toggleRecording(),
      ),
      window.pulseClip.onAppEvent('capture:start-requested', () =>
        actionsRef.current.startCapture(),
      ),
      window.pulseClip.onAppEvent('capture:resume-requested', () =>
        actionsRef.current.resumeCapture(),
      ),
      window.pulseClip.onAppEvent('capture:stop-requested', () =>
        actionsRef.current.stopCapture(),
      ),
      window.pulseClip.onAppEvent('storage:cleanup-completed', (result) => {
        showToast('info', `저장 한도를 넘어 오래된 클립 ${result.count}개를 정리했습니다`, `${formatBytes(result.bytes)}를 확보했습니다. 즐겨찾기는 정리하지 않습니다.`);
        actionsRef.current.refresh();
      }),
      window.pulseClip.onAppEvent('storage:safety-stop-requested', () =>
        actionsRef.current.diskSafetyStop(),
      ),
      window.pulseClip.onAppEvent('app:shutdown-requested', () =>
        actionsRef.current.shutdown(),
      ),
      window.pulseClip.onAppEvent('app:show', () => actionsRef.current.refresh()),
    ];

    void (async () => {
      try {
        setBootstrapError(null);
        const [data, initialSources] = await Promise.all([
          window.pulseClip.bootstrap(),
          window.pulseClip.listCaptureSources().catch(error => {
            showToast('error', '캡처 소스를 불러오지 못했습니다', messageOf(error));
            return [] as CaptureSource[];
          }),
        ]);
        if (disposed) return;
        setBootstrap(data);
        setSettings(data.settings);
        setClips(data.clips);
        setStorage(data.storage);
        setDiskSpace(data.diskSpace);
        setSources(initialSources);
        setShortcutRegistration(data.shortcutRegistration);
        void refreshMicrophones();
        if (data.hotkeyReplacements.length > 0) {
          const changes = data.hotkeyReplacements
            .map(item => `${item.action === 'saveReplay' ? '리플레이 저장' : '녹화'} ${displayShortcut(item.previous)} → ${displayShortcut(item.current)}`)
            .join(', ');
          // Shown until dismissed: PulseClip often starts hidden in the tray.
          showToast('info', '저장된 단축키를 안전한 키로 바꿨습니다', `${changes}. 문자·숫자 키만으로는 다른 앱의 입력을 막을 수 있습니다. 설정에서 Ctrl이나 Alt와 함께 다시 지정할 수 있어요.`, true);
          if (!document.hasFocus()) {
            void window.pulseClip.notify('PulseClip 단축키를 바꿨습니다', `${changes}. 설정에서 다시 지정할 수 있어요.`).catch(() => undefined);
          }
        }

        if (data.settings.completedOnboarding && data.settings.autoStartBuffer) {
          const source = findStoredSource(initialSources, data.settings);
          if (source) {
            await engine.start(source, data.settings).catch((error) => {
              if (!disposed) {
                showToast(
                  'info',
                  '자동 캡처를 시작하지 못했습니다',
                  `${messageOf(error)} 홈에서 다시 켤 수 있어요.`,
                );
              }
            });
          }
        }
      } catch (error) {
        if (!disposed) setBootstrapError(messageOf(error));
      }
    })();

    return () => {
      disposed = true;
      unsubscribeTelemetry();
      unsubscribeClip();
      unsubscribeEvents.forEach((unsubscribe) => unsubscribe());
    };
  }, [engine, refreshLibrary, refreshMicrophones, showToast]);

  settingsRef.current = settings;
  const selectedSource = settings
    ? findStoredSource(sources, settings)
    : null;
  const captureActive =
    telemetry.phase !== 'idle' && telemetry.phase !== 'error';
  const recording = engine.isRecording();

  const runDiagnostics = async () => {
    if (!settings || diagnosticBusy) return;
    setDiagnosticBusy(true);
    try {
      const [freshSources, devices] = await Promise.all([
        window.pulseClip.listCaptureSources(),
        navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]),
      ]);
      const freshMicrophones = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `마이크 ${index + 1}`,
        }));
      setSources(freshSources);
      setMicrophones(freshMicrophones);
      const snapshot = await collectRendererDiagnostics(
        freshSources,
        freshMicrophones,
        settings,
      );
      const report = await window.pulseClip.runDiagnostics(snapshot);
      setDiagnosticReport(report);
      setDiskSpace(report.diskSpace);
    } catch (error) {
      showToast('error', '상태 점검을 완료하지 못했습니다', messageOf(error));
    } finally {
      setDiagnosticBusy(false);
    }
  };

  const exportDiagnostics = async () => {
    if (!diagnosticReport || diagnosticExporting) return;
    setDiagnosticExporting(true);
    try {
      const filePath = await window.pulseClip.exportDiagnostics();
      if (filePath) showToast('success', '점검 결과를 내보냈습니다', filePath);
    } catch (error) {
      showToast('error', '점검 결과를 내보내지 못했습니다', messageOf(error));
    } finally {
      setDiagnosticExporting(false);
    }
  };

  const startCapture = async (
    source = selectedSource,
    captureSettings = settings,
    message = '리플레이 준비가 켜졌습니다',
  ): Promise<boolean> => {
    if (!source || !captureSettings) {
      setSourcePickerOpen(true);
      signal('failed', { title: '녹화할 화면을 먼저 선택해 주세요', body: 'PulseClip을 열어 캡처 소스를 선택하면 리플레이를 켤 수 있습니다.' });
      return false;
    }
    setBusy(true);
    try {
      await engine.start(source, captureSettings);
      showToast('success', message, `${displayShortcut(captureSettings.hotkeys.saveReplay)}을 눌러 최근 순간을 저장하세요.`);
      // In a fullscreen game the sound is the only sign that replay is now on.
      signal('started');
      return true;
    } catch (error) {
      showToast('error', '캡처를 시작하지 못했습니다', messageOf(error));
      signal('failed', { title: '리플레이를 켜지 못했습니다', body: messageOf(error) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleBuffer = async () => {
    if (busyRef.current || recording) return;
    if (captureActive) {
      setBusy(true);
      try {
        await engine.stop();
        showToast('info', '리플레이 준비를 껐습니다');
      } catch (error) {
        showToast('error', '리플레이 준비를 끄지 못했습니다', messageOf(error));
      } finally {
        setBusy(false);
      }
    } else {
      await startCapture();
    }
  };

  const toggleRecording = async () => {
    if (deferHotkey('toggleRecording')) return;
    if (editor.editing) {
      showToast('info', '클립 편집을 저장하는 중입니다', '편집이 끝난 뒤 녹화를 시작해 주세요.');
      signal('failed', { title: '녹화를 시작하지 않았습니다', body: '클립 편집 저장이 끝난 뒤 다시 시도해 주세요.' });
      return;
    }
    // Recovery stops and resumes a running recording by itself.
    if (!engine.isRecording() && engine.getTelemetry().phase === 'recovering') {
      captureNotReady('toggleRecording');
      return;
    }
    runningHotkey.current = 'toggleRecording';
    setBusy(true);
    try {
      if (engine.isRecording()) {
        await engine.stopRecording();
        showToast('success', '녹화 파일을 저장했습니다');
        signal('stopped');
        return;
      }
      // While replay is still starting, start() joins that start instead of restarting.
      if (!engine.isActive() || engine.getTelemetry().phase === 'starting') {
        if (!selectedSource || !settings) {
          setSourcePickerOpen(true);
          signal('failed', { title: '녹화할 화면을 먼저 선택해 주세요', body: 'PulseClip을 열어 캡처 소스를 선택해 주세요.' });
          return;
        }
        await engine.start(selectedSource, settings);
      }
      await engine.startRecording();
      showToast('info', '녹화를 시작했습니다', `${displayShortcut(settings?.hotkeys.toggleRecording ?? 'F9')}을 다시 누르면 저장합니다.`);
      signal('started');
    } catch (error) {
      showToast('error', '녹화 동작을 완료하지 못했습니다', messageOf(error));
      signal('failed', { title: '녹화 동작을 완료하지 못했습니다', body: messageOf(error) });
    } finally {
      runningHotkey.current = null;
      setBusy(false);
    }
  };

  const saveReplay = async () => {
    if (deferHotkey('saveReplay')) return;
    if (!engine.isActive()) {
      // The user expects F8 to work. Turn replay on so the next press does.
      // Without a source, startCapture opens the picker and signals by itself.
      if (selectedSource && settings) {
        showToast('info', '리플레이가 꺼져 있어 저장할 장면이 없습니다', '지금부터 최근 장면을 모으도록 리플레이를 켭니다.');
        signal('failed', {
          title: '리플레이가 꺼져 있었습니다',
          body: '지금부터 최근 장면을 모읍니다. 잠시 후 다시 저장해 주세요.',
        });
      }
      runningHotkey.current = 'saveReplay';
      try { await startCapture(); }
      finally { runningHotkey.current = null; }
      return;
    }
    if (captureNotReady('saveReplay')) return;
    runningHotkey.current = 'saveReplay';
    setBusy(true);
    try {
      const clip = await engine.saveReplay();
      showToast('success', '리플레이를 저장했습니다', clip.title);
      signal('saved');
    } catch (error) {
      showToast('error', '리플레이를 저장하지 못했습니다', messageOf(error));
      signal('failed', { title: '리플레이를 저장하지 못했습니다', body: messageOf(error) });
    } finally {
      runningHotkey.current = null;
      setBusy(false);
    }
  };

  const stopCapture = () => {
    // An explicit or lock-screen stop must not be undone by a queued hotkey.
    queuedHotkeys.current = [];
    if (!engine.isActive()) return;
    void engine.stop().catch((error) =>
      showToast('error', '캡처를 종료하지 못했습니다', messageOf(error)),
    );
  };

  const shutdown = () => {
    if (shutdownStartedRef.current) return;
    shutdownStartedRef.current = true;
    queuedHotkeys.current = [];
    void editor.cancel().then(() => engine.stop())
      .catch(() => undefined)
      .then(() => window.pulseClip.completeShutdown())
      .catch(() => undefined);
  };

  const handleDiskSafetyStop = async () => {
    if (!engine.isRecording()) return;
    setBusy(true);
    try {
      await engine.stopRecording();
      await refreshLibrary();
      const status = await window.pulseClip.getDiskSpace();
      setDiskSpace(status);
      showToast(
        'error',
        '저장 공간 보호를 위해 녹화를 안전하게 종료했습니다',
        '완료된 영상은 보존되었습니다. 저장 공간을 확보한 뒤 다시 시작해 주세요.',
      );
    } catch (error) {
      showToast('error', '녹화 안전 종료를 완료하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  actionsRef.current = {
    saveReplay: () => void saveReplay(),
    toggleRecording: () => void toggleRecording(),
    startCapture: () => {
      if (engine.isActive() || busyRef.current) return;
      void startCapture();
    },
    resumeCapture: () => {
      if (engine.isActive() || busyRef.current || !selectedSource) return;
      void startCapture(selectedSource, settings, '돌아오셨네요. 리플레이를 다시 켰습니다');
    },
    stopCapture,
    diskSafetyStop: () => void handleDiskSafetyStop(),
    shutdown,
    refresh: () => {
      void refreshLibrary().catch((error) =>
        showToast('error', '클립 목록을 새로고치지 못했습니다', messageOf(error)),
      );
      void refreshSources();
    },
  };

  const selectSource = async (source: CaptureSource) => {
    if (!settings || recording || busyRef.current || editor.editing) return;
    setSourcePickerOpen(false);
    setBusy(true);
    const wasActive = engine.isActive();
    try {
      if (wasActive) await engine.stop();
      const result = await window.pulseClip.updateSettings({
        selectedSourceId: source.id,
        selectedSourceName: source.name,
      });
      setSettings(result.settings);
      setShortcutRegistration(result.shortcutRegistration);
      if (wasActive) await engine.start(source, result.settings);
      showToast('success', '캡처 소스를 변경했습니다', source.name);
    } catch (error) {
      showToast('error', '소스를 변경하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const completeOnboarding = async (
    source: CaptureSource,
    patch: Partial<AppSettings>,
  ) => {
    if (busyRef.current) return;
    setBusy(true);
    try {
      const result = await window.pulseClip.updateSettings(patch);
      setSettings(result.settings);
      setShortcutRegistration(result.shortcutRegistration);
      await engine.start(source, result.settings);
      showToast('success', 'PulseClip이 준비되었습니다', `${displayShortcut(result.settings.hotkeys.saveReplay)}을 눌러 최근 순간을 저장하세요.`);
    } catch (error) {
      showToast('error', '초기 설정을 완료하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (draft: AppSettings) => {
    if (recording || busyRef.current || editor.editing) return;
    setBusy(true);
    const wasActive = engine.isActive();
    try {
      if (wasActive) await engine.stop();
      const result = await window.pulseClip.updateSettings(draft);
      setSettings(result.settings);
      setSettingsDirty(false);
      setShortcutRegistration(result.shortcutRegistration);
      await refreshMicrophones();
      await refreshLibrary();
      const source = findStoredSource(sources, result.settings);
      if (wasActive && source) await engine.start(source, result.settings);
      showToast('success', '설정을 저장했습니다');
    } catch (error) {
      showToast('error', '설정을 저장하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseOutputFolder = async () => {
    if (!settings || recording || busyRef.current || editor.editing) return;
    setBusy(true);
    try {
      const folder = await window.pulseClip.chooseOutputFolder();
      if (!folder) return;
      setSettings((current) => (current ? { ...current, outputFolder: folder } : current));
      await refreshLibrary();
      showToast('success', '저장 폴더를 변경했습니다', folder);
    } catch (error) {
      showToast('error', '저장 폴더를 변경하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const setFavorite = async (clip: Clip, favorite: boolean) => {
    try {
      const updated = await window.pulseClip.setClipFavorite(clip.id, favorite);
      setClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedClip((current) => (current?.id === updated.id ? updated : current));
      await refreshLibrary();
    } catch (error) {
      showToast('error', '즐겨찾기를 변경하지 못했습니다', messageOf(error));
    }
  };

  const deleteClip = async (clip: Clip, permanent: boolean) => {
    try {
      const result = await window.pulseClip.deleteClip(clip.id, permanent);
      // Nothing was removed. Deleting for good needs its own answer.
      if (result.outcome === 'trash-unavailable') {
        setPermanentDeleteCandidate(clip);
        return;
      }
      setClips(result.clips);
      setStorage(result.storage);
      if (selectedClip?.id === clip.id) setSelectedClip(null);
      showToast(
        'success',
        result.outcome === 'trashed' ? '클립을 휴지통으로 옮겼습니다' : '클립을 영구 삭제했습니다',
        result.outcome === 'trashed' ? `${clip.title} · Windows 휴지통에서 되살릴 수 있습니다.` : clip.title,
      );
    } catch (error) {
      showToast('error', '클립을 삭제하지 못했습니다', messageOf(error));
    }
  };

  const confirmDelete = () => {
    const clip = deleteCandidate;
    if (!clip) return;
    setDeleteCandidate(null);
    void deleteClip(clip, false);
  };

  const confirmPermanentDelete = () => {
    const clip = permanentDeleteCandidate;
    if (!clip) return;
    setPermanentDeleteCandidate(null);
    void deleteClip(clip, true);
  };

  const revealClip = async (clip: Clip) => {
    try {
      await window.pulseClip.revealClip(clip.id);
    } catch (error) {
      showToast('error', '파일 위치를 열지 못했습니다', messageOf(error));
    }
  };

  const dragClipOut = (clip: Clip) => {
    void window.pulseClip.startClipDrag(clip.id).catch((error) =>
      showToast('error', '클립을 끌어다 놓을 수 없습니다', messageOf(error)),
    );
  };

  const openClipExternally = async (clip: Clip) => {
    try {
      await window.pulseClip.openClip(clip.id);
    } catch (error) {
      showToast('error', '기본 플레이어에서 열지 못했습니다', messageOf(error));
    }
  };

  const suspendShortcuts = useCallback((suspended: boolean) => {
    void window.pulseClip.suspendShortcuts(suspended)
      .then(registration => { if (!suspended) setShortcutRegistration(registration); })
      .catch(() => undefined);
  }, []);

  const navigateToPage = (next: NavigationPage) => {
    if (next === page) return;
    if (page === 'settings' && settingsDirty) {
      setPendingPage(next);
      return;
    }
    setSettingsDirty(false);
    setPage(next);
    if (next === 'settings') void refreshMicrophones();
    if (next === 'diagnostics') void runDiagnostics();
  };

  const discardSettingsChanges = () => {
    const next = pendingPage;
    setPendingPage(null);
    setSettingsDirty(false);
    if (next) {
      setPage(next);
      if (next === 'diagnostics') void runDiagnostics();
    }
  };

  if (!bootstrap || !settings) {
    if (bootstrapError) {
      return (
        <div className="splash-screen splash-error" role="alert">
          <BrandMark className="splash-mark" />
          <TriangleAlert size={24} />
          <strong>PulseClip을 시작하지 못했습니다</strong>
          <p>{bootstrapError}</p>
          <div className="splash-error-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => void window.pulseClip.windowAction('quit')}
            >
              종료
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="splash-screen">
        <BrandMark className="splash-mark" />
        <LoaderCircle size={22} className="spin" />
        <strong>PulseClip을 준비하고 있습니다</strong>
        <p>로컬 녹화 엔진과 저장소를 확인하는 중…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar telemetry={telemetry} initialMaximized={bootstrap.windowMaximized} />
      <Sidebar
        page={page}
        onNavigate={navigateToPage}
        storage={storage}
        version={bootstrap.appVersion}
      />
      <main className="main-content">
        {page === 'home' && (
          <Dashboard
            telemetry={telemetry}
            settings={settings}
            selectedSource={selectedSource}
            previewStream={engine.getPreviewStream()}
            clips={clips}
            storage={storage}
            shortcutRegistration={shortcutRegistration}
            busy={busy}
            readAudioLevels={() => engine.getAudioLevels()}
            onOpenSettings={() => navigateToPage('settings')}
            onToggleBuffer={() => void toggleBuffer()}
            onToggleRecording={() => void toggleRecording()}
            onSaveReplay={() => void saveReplay()}
            onChooseSource={() => setSourcePickerOpen(true)}
            onOpenClips={() => setPage('clips')}
            onOpenClip={setSelectedClip}
          />
        )}
        {page === 'clips' && (
          <ClipLibrary
            clips={clips}
            replayHotkey={displayShortcut(settings.hotkeys.saveReplay)}
            onGoHome={() => setPage('home')}
            onRefresh={() => void refreshLibrary().catch(error => showToast('error', '목록을 새로고치지 못했습니다', messageOf(error)))}
            onOpen={setSelectedClip}
            onFavorite={(clip, favorite) => void setFavorite(clip, favorite)}
            onReveal={(clip) => void revealClip(clip)}
            onOpenExternal={(clip) => void openClipExternally(clip)}
            onDelete={setDeleteCandidate}
            onDragOut={dragClipOut}
          />
        )}
        {page === 'diagnostics' && (
          <DiagnosticsPage
            report={diagnosticReport}
            diskSpace={diskSpace}
            loading={diagnosticBusy}
            exporting={diagnosticExporting}
            onRun={() => void runDiagnostics()}
            onExport={() => void exportDiagnostics()}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            settings={settings}
            microphones={microphones}
            shortcutRegistration={shortcutRegistration}
            saving={busy || editor.editing}
            captureActive={captureActive}
            recording={recording}
            version={bootstrap.appVersion}
            onSuspendShortcuts={suspendShortcuts}
            onSave={(draft) => void saveSettings(draft)}
            onChooseOutputFolder={() => void chooseOutputFolder()}
            onDirtyChange={setSettingsDirty}
          />
        )}
      </main>

      <SourcePickerModal
        open={sourcePickerOpen}
        sources={sources}
        selectedId={settings.selectedSourceId}
        refreshing={refreshingSources}
        disabled={busy || recording}
        onClose={() => setSourcePickerOpen(false)}
        onRefresh={() => void refreshSources()}
        onSelect={(source) => void selectSource(source)}
      />
      {!settings.completedOnboarding && (
        <OnboardingModal
          sources={sources}
          settings={settings}
          refreshing={refreshingSources}
          onRefresh={() => void refreshSources()}
          onComplete={(source, patch) => void completeOnboarding(source, patch)}
          busy={busy}
        />
      )}
      <PlayerModal
        clip={selectedClip}
        editing={editor.editing}
        progress={editor.progress}
        onTrim={(clip, start, end) => {
          if (recording || busyRef.current) { showToast('info', '녹화와 저장이 끝난 뒤 편집해 주세요'); return; }
          editor.start(clip, start, end);
        }}
        onCancelTrim={() => void editor.cancel()}
        onRename={renameClip}
        onClose={() => setSelectedClip(null)}
        onFavorite={(clip, favorite) => void setFavorite(clip, favorite)}
        onReveal={(clip) => void revealClip(clip)}
        onOpenExternal={(clip) => void openClipExternally(clip)}
        onDelete={setDeleteCandidate}
        onDragOut={dragClipOut}
      />
      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="이 클립을 삭제할까요?"
        description="영상 파일을 Windows 휴지통으로 옮깁니다. 휴지통에서 되살리면 이름과 즐겨찾기도 함께 돌아옵니다."
        confirmLabel="휴지통으로 이동"
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={Boolean(permanentDeleteCandidate)}
        title="휴지통으로 옮길 수 없습니다. 영구 삭제할까요?"
        description="휴지통이 없는 위치(네트워크 드라이브 등)이거나 파일이 휴지통 크기보다 큽니다. 아직 아무것도 삭제하지 않았으며, 영구 삭제하면 되살릴 수 없습니다."
        confirmLabel="영구 삭제"
        onCancel={() => setPermanentDeleteCandidate(null)}
        onConfirm={confirmPermanentDelete}
      />
      <ConfirmDialog
        open={Boolean(pendingPage)}
        title="저장하지 않은 변경사항을 버릴까요?"
        description="설정 화면을 나가면 방금 바꾼 값이 적용되지 않습니다."
        confirmLabel="변경사항 버리기"
        tone="warning"
        onCancel={() => setPendingPage(null)}
        onConfirm={discardSettingsChanges}
      />
      <ToastHost
        toasts={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </div>
  );
}

function findStoredSource(
  sources: CaptureSource[],
  settings: AppSettings,
): CaptureSource | null {
  return (
    sources.find((source) => source.id === settings.selectedSourceId) ??
    sources.find((source) => source.name === settings.selectedSourceName) ??
    null
  );
}

async function collectRendererDiagnostics(
  sources: CaptureSource[],
  microphones: AudioInputDevice[],
  settings: AppSettings,
) {
  const webCodecsAvailable = 'VideoEncoder' in globalThis && 'AudioEncoder' in globalThis;
  let h264Supported = false;
  let aacSupported = false;

  if (webCodecsAvailable) {
    try {
      const videoSupport = await VideoEncoder.isConfigSupported({
        codec: 'avc1.42001f',
        width: 1280,
        height: 720,
        bitrate: 4_000_000,
        framerate: 60,
        hardwareAcceleration: 'no-preference',
      });
      h264Supported = videoSupport.supported === true;
    } catch {
      h264Supported = false;
    }
    try {
      const audioSupport = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate: 48_000,
        numberOfChannels: 2,
        bitrate: 192_000,
      });
      aacSupported = audioSupport.supported === true;
    } catch {
      aacSupported = false;
    }
  }

  return {
    webCodecsAvailable,
    h264Supported,
    aacSupported,
    captureSourceCount: sources.length,
    microphoneCount: microphones.length,
    selectedSourceAvailable: Boolean(findStoredSource(sources, settings)),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '알 수 없는 오류가 발생했습니다.';
}
