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
import {
  ConfirmDialog,
  OnboardingModal,
  PlayerModal,
  SourcePickerModal,
} from './components/Modals';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ToastHost, type ToastMessage } from './components/ToastHost';

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

interface ActionRegistry {
  saveReplay: () => void;
  toggleRecording: () => void;
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
    stopCapture: () => undefined,
    diskSafetyStop: () => undefined,
    shutdown: () => undefined,
    refresh: () => undefined,
  });
  const toastId = useRef(0);
  const reportRef = useRef({ phase: '', timestamp: 0 });
  const recoveryStateRef = useRef<CaptureTelemetry['recoveryState']>('none');
  const shutdownStartedRef = useRef(false);

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
  const [busy, setBusy] = useState(false);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Clip | null>(null);
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState<NavigationPage | null>(null);

  const showToast = useCallback(
    (tone: ToastMessage['tone'], title: string, description?: string) => {
      const id = ++toastId.current;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4500);
    },
    [],
  );

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
      window.pulseClip.onAppEvent('capture:stop-requested', () =>
        actionsRef.current.stopCapture(),
      ),
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
          window.pulseClip.listCaptureSources(),
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
  ): Promise<boolean> => {
    if (!source || !captureSettings) {
      setSourcePickerOpen(true);
      return false;
    }
    setBusy(true);
    try {
      await engine.start(source, captureSettings);
      showToast('success', '리플레이 준비가 켜졌습니다', `${captureSettings.hotkeys.saveReplay}을 눌러 최근 순간을 저장하세요.`);
      return true;
    } catch (error) {
      showToast('error', '캡처를 시작하지 못했습니다', messageOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleBuffer = async () => {
    if (busy || recording) return;
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
    if (busy) return;
    setBusy(true);
    try {
      if (engine.isRecording()) {
        await engine.stopRecording();
        showToast('success', '녹화 파일을 저장했습니다');
        return;
      }
      if (!engine.isActive()) {
        if (!selectedSource || !settings) {
          setSourcePickerOpen(true);
          return;
        }
        await engine.start(selectedSource, settings);
      }
      await engine.startRecording();
      showToast('info', '녹화를 시작했습니다', `${settings?.hotkeys.toggleRecording ?? 'F9'}을 다시 누르면 저장합니다.`);
    } catch (error) {
      showToast('error', '녹화 동작을 완료하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const saveReplay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clip = await engine.saveReplay();
      showToast('success', '리플레이를 저장했습니다', clip.title);
    } catch (error) {
      showToast('error', '리플레이를 저장하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const stopCapture = () => {
    if (!engine.isActive()) return;
    void engine.stop().catch((error) =>
      showToast('error', '캡처를 종료하지 못했습니다', messageOf(error)),
    );
  };

  const shutdown = () => {
    if (shutdownStartedRef.current) return;
    shutdownStartedRef.current = true;
    void engine.stop()
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
    if (!settings || recording) return;
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
    setBusy(true);
    try {
      const result = await window.pulseClip.updateSettings(patch);
      setSettings(result.settings);
      setShortcutRegistration(result.shortcutRegistration);
      await engine.start(source, result.settings);
      showToast('success', 'PulseClip이 준비되었습니다', `${result.settings.hotkeys.saveReplay}을 눌러 최근 순간을 저장하세요.`);
    } catch (error) {
      showToast('error', '초기 설정을 완료하지 못했습니다', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (draft: AppSettings) => {
    if (recording) return;
    setBusy(true);
    const wasActive = engine.isActive();
    try {
      if (wasActive) await engine.stop();
      const result = await window.pulseClip.updateSettings(draft);
      setSettings(result.settings);
      setSettingsDirty(false);
      setShortcutRegistration(result.shortcutRegistration);
      await refreshMicrophones();
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
    if (!settings || recording) return;
    try {
      const folder = await window.pulseClip.chooseOutputFolder();
      if (!folder) return;
      setSettings((current) => (current ? { ...current, outputFolder: folder } : current));
      await refreshLibrary();
      showToast('success', '저장 폴더를 변경했습니다', folder);
    } catch (error) {
      showToast('error', '저장 폴더를 변경하지 못했습니다', messageOf(error));
    }
  };

  const setFavorite = async (clip: Clip, favorite: boolean) => {
    try {
      const updated = await window.pulseClip.setClipFavorite(clip.id, favorite);
      setClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedClip((current) => (current?.id === updated.id ? updated : current));
      setStorage((current) => ({
        ...current,
        favoriteCount: Math.max(0, current.favoriteCount + (favorite ? 1 : -1)),
      }));
    } catch (error) {
      showToast('error', '즐겨찾기를 변경하지 못했습니다', messageOf(error));
    }
  };

  const confirmDelete = async () => {
    const clip = deleteCandidate;
    if (!clip) return;
    setDeleteCandidate(null);
    try {
      const result = await window.pulseClip.deleteClip(clip.id);
      setClips(result.clips);
      setStorage(result.storage);
      if (selectedClip?.id === clip.id) setSelectedClip(null);
      showToast('success', '클립을 삭제했습니다', clip.title);
    } catch (error) {
      showToast('error', '클립을 삭제하지 못했습니다', messageOf(error));
    }
  };

  const revealClip = async (clip: Clip) => {
    try {
      await window.pulseClip.revealClip(clip.id);
    } catch (error) {
      showToast('error', '파일 위치를 열지 못했습니다', messageOf(error));
    }
  };

  const openClipExternally = async (clip: Clip) => {
    try {
      await window.pulseClip.openClip(clip.id);
    } catch (error) {
      showToast('error', '기본 플레이어에서 열지 못했습니다', messageOf(error));
    }
  };

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
      <TitleBar telemetry={telemetry} />
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
            busy={busy}
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
            onOpen={setSelectedClip}
            onFavorite={(clip, favorite) => void setFavorite(clip, favorite)}
            onReveal={(clip) => void revealClip(clip)}
            onOpenExternal={(clip) => void openClipExternally(clip)}
            onDelete={setDeleteCandidate}
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
            saving={busy}
            captureActive={captureActive}
            recording={recording}
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
        />
      )}
      <PlayerModal
        clip={selectedClip}
        onClose={() => setSelectedClip(null)}
        onFavorite={(clip, favorite) => void setFavorite(clip, favorite)}
        onReveal={(clip) => void revealClip(clip)}
        onOpenExternal={(clip) => void openClipExternally(clip)}
        onDelete={setDeleteCandidate}
      />
      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="이 클립을 삭제할까요?"
        description="영상 파일과 PulseClip 메타데이터가 함께 삭제되며 되돌릴 수 없습니다."
        confirmLabel="클립 삭제"
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void confirmDelete()}
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
        hardwareAcceleration: 'prefer-hardware',
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
