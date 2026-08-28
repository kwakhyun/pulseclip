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
  Volume2,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  CaptureSource,
  CaptureTelemetry,
  Clip,
  StorageStats,
} from '../../shared/types';
import {
  clipKindLabel,
  formatBytes,
  formatClock,
  formatDuration,
  phaseLabel,
  relativeDate,
  sourceInitial,
} from '../utils';

interface DashboardProps {
  telemetry: CaptureTelemetry;
  settings: AppSettings;
  selectedSource: CaptureSource | null;
  previewStream: MediaStream | null;
  clips: Clip[];
  storage: StorageStats;
  busy: boolean;
  onToggleBuffer: () => void;
  onToggleRecording: () => void;
  onSaveReplay: () => void;
  onChooseSource: () => void;
  onOpenClips: () => void;
  onOpenClip: (clip: Clip) => void;
}

export function Dashboard({
  telemetry,
  settings,
  selectedSource,
  previewStream,
  clips,
  storage,
  busy,
  onToggleBuffer,
  onToggleRecording,
  onSaveReplay,
  onChooseSource,
  onOpenClips,
  onOpenClip,
}: DashboardProps) {
  const active = telemetry.phase !== 'idle' && telemetry.phase !== 'error';
  const recording = telemetry.phase === 'recording';
  const recent = clips.slice(0, 4);

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GAME CAPTURE STUDIO</span>
          <h1>놓치고 싶지 않은 순간을<br /><em>지금부터 기억하세요.</em></h1>
          <p>게임 성능을 방해하지 않는 로컬 녹화와 즉시 리플레이.</p>
        </div>
        <div className={`live-badge phase-${telemetry.phase}`}>
          <span />
          {phaseLabel(telemetry.phase)}
        </div>
      </div>

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
        </div>

        <div className="control-column">
          <div className="record-orb-wrap">
            <button
              type="button"
              className={`record-orb ${recording ? 'recording' : active ? 'ready' : ''}`}
              onClick={onToggleRecording}
              disabled={busy || !selectedSource}
              aria-label={recording ? '녹화 종료' : '녹화 시작'}
            >
              <span className="orb-ring" />
              {recording ? <CircleStop size={30} /> : <Radio size={30} />}
            </button>
            <div>
              <small>{recording ? 'RECORDING' : active ? 'READY TO RECORD' : 'CAPTURE OFF'}</small>
              <strong>{recording ? formatClock(telemetry.recordingSeconds) : phaseLabel(telemetry.phase)}</strong>
            </div>
          </div>

          <div className="capture-actions">
            <button
              type="button"
              className={`button primary recording-button ${recording ? 'is-recording' : ''}`}
              onClick={onToggleRecording}
              disabled={busy || !selectedSource}
              aria-pressed={recording}
            >
              {recording ? <CircleStop size={18} /> : <Radio size={18} />}
              <span>{recording ? '전체 녹화 종료' : '전체 녹화 시작'}</span>
              <kbd>{settings.hotkeys.toggleRecording}</kbd>
            </button>
            <button
              type="button"
              className={`button buffer-button ${active ? 'danger-quiet' : ''}`}
              onClick={onToggleBuffer}
              disabled={busy || recording || !selectedSource}
              aria-pressed={active}
            >
              {active ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              {active ? '리플레이 준비 끄기' : '리플레이 준비 켜기'}
            </button>
            <button
              type="button"
              className="button replay-button"
              onClick={onSaveReplay}
              disabled={busy || !active || telemetry.bufferSeconds < 1}
            >
              <RotateCcw size={18} />
              최근 {settings.replaySeconds}초 저장
              <kbd>{settings.hotkeys.saveReplay}</kbd>
            </button>
          </div>

          <div className="signal-grid">
            <Signal
              icon={<Gauge size={16} />}
              label="화질"
              value={`${telemetry.width || resolutionLabel(settings.resolution)} × ${telemetry.height || ''}`.replace(/ × $/, '')}
              sub={`${settings.fps} FPS · ${settings.videoBitrateMbps} Mbps`}
            />
            <Signal
              icon={<Volume2 size={16} />}
              label="게임 소리"
              value={settings.systemAudio ? '켜짐' : '꺼짐'}
              sub={telemetry.hasSystemAudio ? '루프백 연결됨' : 'Windows 오디오'}
            />
            <Signal
              icon={<Mic size={16} />}
              label="마이크"
              value={settings.microphone ? '켜짐' : '꺼짐'}
              sub={settings.microphone ? `${settings.microphoneGain}% 게인` : '선택 사항'}
            />
            <Signal
              icon={<Zap size={16} />}
              label="버퍼"
              value={`${Math.floor(telemetry.bufferSeconds)}초`}
              sub={formatBytes(telemetry.bufferBytes)}
            />
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
          <div><small>사용 중인 공간</small><strong>{formatBytes(storage.bytesUsed)}</strong></div>
        </div>
        <div>
          <span className="stat-icon blue"><Keyboard size={18} /></span>
          <div><small>녹화 단축키</small><strong><kbd>{settings.hotkeys.toggleRecording}</kbd></strong></div>
        </div>
      </section>

      <section className="recent-section">
        <div className="section-heading">
          <div><span className="eyebrow">LIBRARY</span><h2>최근 클립</h2></div>
          <button type="button" className="text-button" onClick={onOpenClips}>모두 보기 <span>→</span></button>
        </div>
        {recent.length === 0 ? (
          <div className="empty-recent">
            <div className="empty-icon"><Clapperboard size={26} /></div>
            <div><strong>아직 저장된 클립이 없어요</strong><p>리플레이 준비를 켜고 멋진 순간에 {settings.hotkeys.saveReplay}을 눌러보세요.</p></div>
          </div>
        ) : (
          <div className="recent-grid">
            {recent.map((clip) => (
              <button type="button" className="recent-card" key={clip.id} onClick={() => onOpenClip(clip)}>
                <div className="recent-thumb">
                  <span className="source-monogram">{sourceInitial(clip.sourceName)}</span>
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
          <strong>녹화할 화면을 선택하세요</strong>
          <span>모니터 또는 게임 창을 선택할 수 있어요.</span>
        </button>
      )}
      <div className="preview-vignette" />
      {telemetry.phase === 'recording' && (
        <span className="recording-overlay"><i /> REC {formatClock(telemetry.recordingSeconds)}</span>
      )}
      {stream && (
        <span className="preview-live"><i /> LIVE PREVIEW</span>
      )}
    </div>
  );
}

function Signal({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="signal-item">
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><em>{sub}</em></div>
    </div>
  );
}

function resolutionLabel(value: AppSettings['resolution']): string {
  if (value === '720p') return '1280 × 720';
  if (value === '1440p') return '2560 × 1440';
  if (value === 'source') return '원본';
  return '1920 × 1080';
}
