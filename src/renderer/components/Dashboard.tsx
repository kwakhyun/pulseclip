import { useEffect, useRef } from 'react';
import {
  CircleStop,
  Clapperboard,
  FolderOpen,
  Gauge,
  Keyboard,
  Mic,
  MonitorUp,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  TriangleAlert,
  Volume2,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  CaptureSource,
  CaptureTelemetry,
  Clip,
  ShortcutRegistration,
  StorageStats,
} from '../../shared/types';
import type { AudioLevels } from '../capture/audio-level-meter';
import { displayShortcut } from '../../shared/hotkeys';
import {
  clipKindLabel,
  formatBytes,
  formatClock,
  formatDuration,
  phaseLabel,
  relativeDate,
  sourceInitial,
} from '../utils';
import { ClipThumbnail } from './ClipThumbnail';

interface DashboardProps {
  telemetry: CaptureTelemetry;
  settings: AppSettings;
  selectedSource: CaptureSource | null;
  previewStream: MediaStream | null;
  clips: Clip[];
  storage: StorageStats;
  shortcutRegistration: ShortcutRegistration;
  busy: boolean;
  readAudioLevels: () => AudioLevels;
  onToggleBuffer: () => void;
  onToggleRecording: () => void;
  onSaveReplay: () => void;
  onChooseSource: () => void;
  onOpenClips: () => void;
  onOpenClip: (clip: Clip) => void;
  onOpenSettings: () => void;
}

export function Dashboard({
  telemetry,
  settings,
  selectedSource,
  previewStream,
  clips,
  storage,
  shortcutRegistration,
  busy,
  readAudioLevels,
  onToggleBuffer,
  onToggleRecording,
  onSaveReplay,
  onChooseSource,
  onOpenClips,
  onOpenClip,
  onOpenSettings,
}: DashboardProps) {
  const active = telemetry.phase !== 'idle' && telemetry.phase !== 'error';
  const recording = telemetry.phase === 'recording';
  const recovering = telemetry.phase === 'recovering';
  const starting = telemetry.phase === 'starting';
  const transitioning = recovering || starting || telemetry.phase === 'saving';
  const recent = clips.slice(0, 4);
  const bufferRatio = Math.min(1, telemetry.bufferSeconds / settings.replaySeconds);
  const bufferedSeconds = Math.min(settings.replaySeconds, Math.floor(telemetry.bufferSeconds));
  const replayKey = displayShortcut(settings.hotkeys.saveReplay);
  const recordKey = displayShortcut(settings.hotkeys.toggleRecording);
  const shortcutsOk = shortcutRegistration.saveReplay && shortcutRegistration.toggleRecording;

  const heading = recovering
    ? '장치 연결을 복구하고 있습니다'
    : recording
      ? '플레이를 녹화하고 있습니다'
      : active
        ? '좋은 장면이 지나갔나요?'
        : '리플레이를 켜고 플레이하세요';
  const subheading = recovering
    ? '복구가 끝나면 녹화를 계속할 수 있습니다. 리플레이 준비를 끄면 복구를 취소합니다.'
    : recording
      ? `${recordKey}을 다시 누르면 녹화를 저장합니다. 녹화 중에도 ${replayKey}로 리플레이를 따로 남길 수 있습니다.`
      : active
        ? `게임 중 ${replayKey}을 누르면 최근 ${settings.replaySeconds}초가 저장됩니다.`
        : `리플레이가 켜져 있어야 ${replayKey}로 지나간 장면을 저장할 수 있습니다.`;

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">게임 녹화</span>
          <h1>{heading}</h1>
          <p>{subheading}</p>
        </div>
        <div className={`live-badge phase-${telemetry.phase}`} role="status">
          <span />
          {phaseLabel(telemetry.phase)}
        </div>
      </div>

      {(telemetry.error || recovering) && (
        <p className="capture-notice" role={telemetry.error ? 'alert' : 'status'}>
          {telemetry.error || telemetry.recoveryMessage}
        </p>
      )}

      <section className={`capture-hero ${recording ? 'is-recording' : ''}`}>
        <div className="preview-column">
          <CapturePreview
            stream={previewStream}
            source={selectedSource}
            telemetry={telemetry}
            onChooseSource={onChooseSource}
          />
          <div className="preview-meta">
            <div>
              <span className="meta-icon"><MonitorUp size={16} /></span>
              <div>
                <small>캡처 소스</small>
                <strong>{selectedSource?.name || '소스를 선택해 주세요'}</strong>
              </div>
            </div>
            <button type="button" onClick={onChooseSource} disabled={recording}>
              <Settings2 size={15} /> 변경
            </button>
          </div>
          <div className="signal-grid">
            <Signal
              icon={<Gauge size={16} />}
              label="화질"
              value={telemetry.width ? `${telemetry.width} × ${telemetry.height}` : resolutionLabel(settings.resolution)}
              sub={`${settings.fps} FPS · ${settings.videoBitrateMbps} Mbps`}
            />
            <Signal
              icon={<Volume2 size={16} />}
              label="게임 소리"
              value={!settings.systemAudio ? '꺼짐' : active ? (telemetry.hasSystemAudio ? '연결됨' : '신호 없음') : '켜짐'}
              meter={active && telemetry.hasSystemAudio ? { read: () => readAudioLevels().system } : undefined}
              sub={settings.systemAudio ? 'Windows 시스템 오디오' : '설정에서 켤 수 있어요'}
            />
            <Signal
              icon={<Mic size={16} />}
              label="마이크"
              value={!settings.microphone ? '꺼짐' : active ? (telemetry.hasMicrophone ? '연결됨' : '신호 없음') : '켜짐'}
              meter={active && telemetry.hasMicrophone ? { read: () => readAudioLevels().microphone } : undefined}
              sub={settings.microphone ? `${settings.microphoneGain}% 게인` : '선택 사항'}
            />
          </div>
        </div>

        <div className="control-column">
          <div className={`replay-panel ${active ? 'is-on' : ''}`}>
            <div className="replay-panel-heading">
              <span className="replay-panel-icon"><Zap size={18} /></span>
              <div>
                <small>즉시 리플레이</small>
                <strong>{active ? (starting ? '준비하는 중' : '켜짐') : '꺼짐'}</strong>
              </div>
            </div>
            <div className="buffer-gauge">
              <div
                className="buffer-track"
                role="progressbar"
                aria-label="리플레이 버퍼"
                aria-valuemin={0}
                aria-valuemax={settings.replaySeconds}
                aria-valuenow={bufferedSeconds}
                aria-valuetext={`최근 ${bufferedSeconds}초 확보`}
              >
                <span style={{ width: `${active ? bufferRatio * 100 : 0}%` }} />
              </div>
              <p>
                {active
                  ? <>최근 <strong>{bufferedSeconds}초</strong> / {settings.replaySeconds}초 확보 · {formatBytes(telemetry.bufferBytes)}</>
                  : <>리플레이를 켜기 전 장면은 저장할 수 없어요.</>}
              </p>
            </div>
            <div className="capture-actions">
              <button
                type="button"
                className={`button buffer-button ${active ? 'is-on' : 'primary'}`}
                onClick={onToggleBuffer}
                disabled={busy || recording || !selectedSource}
                aria-pressed={active}
              >
                {active ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                <span>{active ? '리플레이 준비 끄기' : '리플레이 준비 켜기'}</span>
              </button>
              <button
                type="button"
                className={`button replay-button ${active ? 'primary' : ''}`}
                onClick={onSaveReplay}
                disabled={busy || transitioning || !active || telemetry.bufferSeconds < 1}
              >
                <RotateCcw size={18} />
                <span>최근 {settings.replaySeconds}초 저장</span>
                <kbd>{replayKey}</kbd>
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`button recording-button ${recording ? 'is-recording' : ''}`}
            onClick={onToggleRecording}
            disabled={busy || transitioning || !selectedSource}
            aria-pressed={recording}
          >
            {recording ? <CircleStop size={18} /> : <Radio size={18} />}
            <span>{recording ? '전체 녹화 종료' : '전체 녹화 시작'}</span>
            {recording && <em className="record-timer">{formatClock(telemetry.recordingSeconds)}</em>}
            <kbd>{recordKey}</kbd>
          </button>

          <div className={`hotkey-card ${shortcutsOk ? '' : 'has-problem'}`}>
            <div className="hotkey-card-heading">
              {shortcutsOk ? <Keyboard size={16} /> : <TriangleAlert size={16} />}
              <strong>{shortcutsOk ? '게임 중에도 단축키가 동작합니다' : '단축키를 등록하지 못했습니다'}</strong>
            </div>
            <dl>
              <div><dt><kbd>{replayKey}</kbd></dt><dd>최근 {settings.replaySeconds}초 저장{!shortcutRegistration.saveReplay && <em> · 다른 앱이 사용 중</em>}</dd></div>
              <div><dt><kbd>{recordKey}</kbd></dt><dd>녹화 시작/종료{!shortcutRegistration.toggleRecording && <em> · 다른 앱이 사용 중</em>}</dd></div>
            </dl>
            {shortcutsOk
              ? <p>{settings.playSounds ? '저장하면 짧은 효과음으로 알려 드립니다.' : '효과음이 꺼져 있습니다. 설정에서 켤 수 있어요.'}</p>
              : <button type="button" className="text-button" onClick={onOpenSettings}>설정에서 다른 키 지정 <span>→</span></button>}
          </div>
        </div>
      </section>

      <section className="stat-strip">
        <div>
          <span className="stat-icon coral"><Clapperboard size={18} /></span>
          <div><small>오늘 만든 클립</small><strong>{storage.todayCount}<em>개</em></strong></div>
        </div>
        <div>
          <span className="stat-icon violet"><FolderOpen size={18} /></span>
          <div>
            <small>사용 중인 공간</small>
            <strong>{formatBytes(storage.bytesUsed)}{storage.limitBytes > 0 && <em>/ {formatBytes(storage.limitBytes)}</em>}</strong>
          </div>
        </div>
        <button type="button" className="stat-action" onClick={onOpenSettings}>
          <span className={`stat-icon ${settings.autoStartBuffer ? 'green' : 'blue'}`}><Zap size={18} /></span>
          <div>
            <small>앱 실행 시 리플레이</small>
            <strong>{settings.autoStartBuffer ? '자동으로 켜짐' : '직접 켜야 함'}</strong>
          </div>
          <Settings2 size={15} aria-hidden="true" />
        </button>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <div><span className="eyebrow">내 클립</span><h2>최근 클립</h2></div>
          <button type="button" className="text-button" onClick={onOpenClips}>모두 보기 <span>→</span></button>
        </div>
        {recent.length === 0 ? (
          <div className="empty-recent">
            <div className="empty-icon"><Clapperboard size={26} /></div>
            <div><strong>아직 저장된 클립이 없어요</strong><p>리플레이를 켜 두고 멋진 순간이 지나간 뒤 {replayKey}을 눌러 보세요.</p></div>
          </div>
        ) : (
          <div className="recent-grid">
            {recent.map((clip) => (
              <button type="button" className="recent-card" key={clip.id} onClick={() => onOpenClip(clip)}>
                <div className="recent-thumb">
                  <span className="source-monogram">{sourceInitial(clip.sourceName)}</span>
                  <ClipThumbnail url={clip.mediaUrl} durationMs={clip.durationMs} />
                  <span className="clip-kind">{clipKindLabel(clip.kind)}</span>
                  <span className="clip-duration">{formatDuration(clip.durationMs)}</span>
                  <span className="play-chip"><Play size={15} fill="currentColor" /></span>
                </div>
                <div className="recent-info"><strong>{clip.title}</strong><span>{relativeDate(clip.createdAt)} · {formatBytes(clip.bytes)}</span></div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CapturePreview({
  stream,
  source,
  telemetry,
  onChooseSource,
}: {
  stream: MediaStream | null;
  source: CaptureSource | null;
  telemetry: CaptureTelemetry;
  onChooseSource: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream) void videoRef.current.play().catch(() => undefined);
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="preview-stage">
      {stream ? (
        <video ref={videoRef} muted playsInline />
      ) : source?.thumbnailDataUrl ? (
        <img src={source.thumbnailDataUrl} alt="선택한 캡처 소스 미리보기" />
      ) : (
        <button type="button" className="preview-empty" onClick={onChooseSource}>
          <MonitorUp size={36} />
          <strong>{source ? source.name : '녹화할 화면을 선택하세요'}</strong>
          <span>{source ? '리플레이를 켜면 실시간 미리보기가 표시됩니다.' : '모니터 또는 게임 창을 선택할 수 있어요.'}</span>
        </button>
      )}
      <div className="preview-vignette" />
      {telemetry.phase === 'recording' && (
        <span className="recording-overlay"><i /> REC {formatClock(telemetry.recordingSeconds)}</span>
      )}
      {stream && (
        <span className="preview-live"><i /> 실시간 미리보기</span>
      )}
    </div>
  );
}

function Signal({
  icon,
  label,
  value,
  sub,
  meter,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  meter?: { read: () => number | null };
}) {
  return (
    <div className="signal-item">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {meter ? <LevelMeter label={`${label} 입력 레벨`} read={meter.read} /> : <em>{sub}</em>}
      </div>
    </div>
  );
}

/** Animates directly on the DOM so a 60 Hz meter never re-renders the dashboard. */
function LevelMeter({ label, read }: { label: string; read: () => number | null }) {
  const barRef = useRef<HTMLSpanElement>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let frame = 0;
    let shown = 0;
    const tick = () => {
      const level = readRef.current() ?? 0;
      // Fast attack, slow release reads like a hardware meter.
      shown = level > shown ? level : shown * 0.9 + level * 0.1;
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${shown.toFixed(3)})`;
        barRef.current.dataset.hot = shown > 0.92 ? 'true' : 'false';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span className="level-meter" role="img" aria-label={label}><span ref={barRef} /></span>;
}

function resolutionLabel(value: AppSettings['resolution']): string {
  if (value === '720p') return '1280 × 720';
  if (value === '1440p') return '2560 × 1440';
  if (value === 'source') return '원본 해상도';
  return '1920 × 1080';
}
