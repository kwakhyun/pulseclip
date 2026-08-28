import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Heart,
  Keyboard,
  Monitor,
  MonitorUp,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  CaptureSource,
  Clip,
} from '../../shared/types';
import {
  clipKindLabel,
  formatBytes,
  formatDuration,
  relativeDate,
} from '../utils';
import { BrandMark } from './BrandMark';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function useDialogFocus(open: boolean, onEscape?: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const escapeHandlerRef = useRef(onEscape);
  escapeHandlerRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const initialFocus = dialog.querySelector<HTMLElement>('[data-autofocus="true"]')
      ?? dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ?? dialog;
    const frame = requestAnimationFrame(() => initialFocus.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escapeHandlerRef.current) {
        event.preventDefault();
        event.stopPropagation();
        escapeHandlerRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return dialogRef;
}

interface SourcePickerProps {
  open: boolean;
  sources: CaptureSource[];
  selectedId: string;
  refreshing: boolean;
  disabled: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (source: CaptureSource) => void;
}

export function SourcePickerModal({
  open,
  sources,
  selectedId,
  refreshing,
  disabled,
  onClose,
  onRefresh,
  onSelect,
}: SourcePickerProps) {
  const [filter, setFilter] = useState<'all' | 'screen' | 'window'>('all');
  const dialogRef = useDialogFocus(open, onClose);
  if (!open) return null;
  const visible = filter === 'all' ? sources : sources.filter((source) => source.kind === filter);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <header className="modal-header">
          <div><span className="eyebrow">CAPTURE SOURCE</span><h2 id="source-title">어떤 화면을 녹화할까요?</h2><p>게임이 전체 화면이면 모니터, 창 모드면 해당 창을 선택하세요.</p></div>
          <button type="button" className="modal-close" aria-label="소스 선택 닫기" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="source-toolbar">
          <div className="filter-tabs compact" role="group" aria-label="캡처 소스 종류">
            <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button>
            <button type="button" aria-pressed={filter === 'screen'} className={filter === 'screen' ? 'active' : ''} onClick={() => setFilter('screen')}>모니터</button>
            <button type="button" aria-pressed={filter === 'window'} className={filter === 'window' ? 'active' : ''} onClick={() => setFilter('window')}>창</button>
          </div>
          <button type="button" className="refresh-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> 새로고침</button>
        </div>
        <div className="source-grid">
          {visible.map((source) => (
            <button
              type="button"
              className={`source-card ${selectedId === source.id ? 'selected' : ''}`}
              key={source.id}
              onClick={() => onSelect(source)}
              disabled={disabled}
              data-autofocus={selectedId === source.id ? 'true' : undefined}
            >
              <div className="source-thumb">
                {source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <Monitor size={30} />}
                {selectedId === source.id && <span className="selected-check"><Check size={14} /></span>}
              </div>
              <div className="source-card-label">
                {source.appIconDataUrl ? <img src={source.appIconDataUrl} alt="" /> : source.kind === 'screen' ? <Monitor size={16} /> : <Gamepad2 size={16} />}
                <div><strong>{source.name}</strong><small>{source.kind === 'screen' ? '모니터 전체' : '애플리케이션 창'}</small></div>
              </div>
            </button>
          ))}
          {visible.length === 0 && <div className="source-empty"><MonitorUp size={28} /><strong>표시할 소스가 없습니다</strong><span>게임을 실행한 뒤 새로고침해 보세요.</span></div>}
        </div>
        <footer className="modal-footer"><span><ShieldCheck size={15} /> 선택한 화면은 로컬에서만 처리됩니다.</span><button type="button" className="button ghost" onClick={onClose}>취소</button></footer>
      </section>
    </div>
  );
}

interface OnboardingProps {
  sources: CaptureSource[];
  settings: AppSettings;
  refreshing: boolean;
  onRefresh: () => void;
  onComplete: (source: CaptureSource, patch: Partial<AppSettings>) => void;
}

export function OnboardingModal({
  sources,
  settings,
  refreshing,
  onRefresh,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState(settings.selectedSourceId);
  const [systemAudio, setSystemAudio] = useState(settings.systemAudio);
  const [microphone, setMicrophone] = useState(settings.microphone);
  const dialogRef = useDialogFocus(true);
  const selectedSource = sources.find((source) => source.id === sourceId) ?? null;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="modal onboarding-modal" role="dialog" aria-modal="true" aria-label="PulseClip 시작 설정">
        <div className="onboarding-visual">
          <BrandMark className="onboarding-logo" />
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-card card-one"><Clapperboard size={18} /><span>REC</span><strong>00:42</strong></div>
          <div className="visual-card card-two"><Sparkles size={17} /><span>최근 순간</span><strong>저장 완료</strong></div>
          <div className="visual-copy"><span className="eyebrow">WELCOME TO</span><h2>PulseClip</h2><p>플레이는 계속.<br />기억은 우리가 남길게요.</p></div>
        </div>
        <div className="onboarding-content">
          <div className="onboarding-progress">{[0, 1, 2].map((value) => <span key={value} className={step >= value ? 'active' : ''} />)}</div>
          {step === 0 && (
            <div className="onboarding-step">
              <span className="step-kicker">1 / 3 · 시작하기</span>
              <h1>게임의 결정적인 순간,<br />이제 놓치지 마세요.</h1>
              <p>PulseClip은 계정도, 구독도 필요 없는 Windows 게임 녹화 도구입니다.</p>
              <div className="feature-list">
                <div><span><Keyboard size={19} /></span><div><strong>단축키 한 번</strong><small>F8로 방금 전 장면을 즉시 저장</small></div></div>
                <div><span><ShieldCheck size={19} /></span><div><strong>완전한 로컬 처리</strong><small>영상과 음성을 외부로 전송하지 않음</small></div></div>
                <div><span><Sparkles size={19} /></span><div><strong>한 번만 인코딩</strong><small>녹화와 리플레이가 같은 하드웨어 파이프라인 사용</small></div></div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-step source-step">
              <div className="step-title-row"><div><span className="step-kicker">2 / 3 · 캡처 소스</span><h1>녹화할 화면을 선택하세요.</h1></div><button type="button" className="refresh-button" aria-label="캡처 소스 새로고침" onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div>
              <p>나중에 홈 화면에서 언제든 바꿀 수 있어요.</p>
              <div className="onboarding-source-list">
                {sources.slice(0, 8).map((source) => (
                  <button type="button" key={source.id} className={sourceId === source.id ? 'selected' : ''} onClick={() => setSourceId(source.id)}>
                    <div>{source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <Monitor size={22} />}</div>
                    <span>{source.name}</span>
                    <i>{sourceId === source.id && <Check size={13} />}</i>
                  </button>
                ))}
                {sources.length === 0 && <div className="onboarding-no-source"><MonitorUp size={26} /><span>소스를 찾는 중입니다…</span></div>}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-step">
              <span className="step-kicker">3 / 3 · 오디오</span>
              <h1>어떤 소리를 담을까요?</h1>
              <p>게임 소리와 마이크를 선택해서 하나의 영상에 정확히 맞춰 저장합니다.</p>
              <div className="onboarding-options">
                <button type="button" className={systemAudio ? 'selected' : ''} onClick={() => setSystemAudio(!systemAudio)}><span><Volume2 size={22} /></span><div><strong>게임 소리</strong><small>Windows 시스템 오디오</small></div><i>{systemAudio && <Check size={13} />}</i></button>
                <button type="button" className={microphone ? 'selected' : ''} onClick={() => setMicrophone(!microphone)}><span><Gamepad2 size={22} /></span><div><strong>마이크</strong><small>팀 보이스와 리액션</small></div><i>{microphone && <Check size={13} />}</i></button>
              </div>
              <div className="hotkey-preview"><Keyboard size={18} /><div><small>기본 리플레이 단축키</small><strong>{settings.hotkeys.saveReplay}</strong></div><span>설정에서 변경 가능</span></div>
            </div>
          )}
          <footer className="onboarding-footer">
            <button type="button" className="button ghost" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17} /> 이전</button>
            {step < 2 ? (
              <button type="button" className="button primary" disabled={step === 1 && !selectedSource} onClick={() => setStep((current) => current + 1)}>계속하기 <ChevronRight size={17} /></button>
            ) : (
              <button type="button" className="button primary" disabled={!selectedSource} onClick={() => selectedSource && onComplete(selectedSource, { systemAudio, microphone, completedOnboarding: true, selectedSourceId: selectedSource.id, selectedSourceName: selectedSource.name })}>PulseClip 시작 <Sparkles size={17} /></button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}

interface PlayerModalProps {
  clip: Clip | null;
  onClose: () => void;
  onFavorite: (clip: Clip, favorite: boolean) => void;
  onReveal: (clip: Clip) => void;
  onOpenExternal: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
}

export function PlayerModal({ clip, onClose, onFavorite, onReveal, onOpenExternal, onDelete }: PlayerModalProps) {
  const dialogRef = useDialogFocus(Boolean(clip), onClose);
  if (!clip) return null;
  return (
    <div className="modal-backdrop player-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal player-modal" role="dialog" aria-modal="true" aria-label={clip.title}>
        <header><div><span className={`clip-type type-${clip.kind}`}>{clipKindLabel(clip.kind)}</span><h2>{clip.title}</h2><p>{clip.sourceName} · {relativeDate(clip.createdAt)}</p></div><button type="button" className="modal-close" aria-label="클립 플레이어 닫기" onClick={onClose}><X size={19} /></button></header>
        <div className="player-stage"><video src={clip.mediaUrl} aria-label={`${clip.title} 영상`} controls autoPlay playsInline /></div>
        <footer>
          <div className="player-metadata"><span>{formatDuration(clip.durationMs)}</span><i /><span>{clip.width > 0 ? `${clip.width} × ${clip.height}` : '해상도 미상'}</span><i /><span>{clip.fps || '—'} FPS</span><i /><span>{formatBytes(clip.bytes)}</span></div>
          <div className="player-actions">
            <button type="button" className={clip.favorite ? 'active' : ''} aria-pressed={clip.favorite} onClick={() => onFavorite(clip, !clip.favorite)}><Heart size={17} fill={clip.favorite ? 'currentColor' : 'none'} /> 즐겨찾기</button>
            <button type="button" onClick={() => onReveal(clip)}><FolderOpen size={17} /> 파일 위치</button>
            <button type="button" onClick={() => onOpenExternal(clip)}><ExternalLink size={17} /> 기본 플레이어</button>
            <button type="button" className="destructive" onClick={() => onDelete(clip)}><Trash2 size={17} /> 삭제</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; tone?: 'danger' | 'warning'; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useDialogFocus(open, onCancel);
  if (!open) return null;
  const Icon = tone === 'warning' ? TriangleAlert : Trash2;
  return <div className="modal-backdrop confirm-backdrop"><section ref={dialogRef} tabIndex={-1} className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label={title}><span className={`confirm-icon ${tone}`}><Icon size={23} /></span><h2>{title}</h2><p>{description}</p><div><button type="button" className="button ghost" data-autofocus="true" onClick={onCancel}>취소</button><button type="button" className={`button ${tone === 'danger' ? 'destructive-button' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}
