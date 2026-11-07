import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, GripVertical, Heart, Pencil, Play, Scissors, Trash2, X } from 'lucide-react';
import type { Clip } from '../../shared/types';
import { MIN_TRIM_SECONDS } from '../../shared/trim';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { clipKindLabel, formatBytes, formatDuration, relativeDate } from '../utils';

interface PlayerModalProps {
  clip: Clip | null;
  editing: boolean;
  progress: number;
  onClose: () => void;
  onFavorite: (clip: Clip, favorite: boolean) => void;
  onReveal: (clip: Clip) => void;
  onOpenExternal: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
  onDragOut: (clip: Clip) => void;
  onRename: (clip: Clip, title: string) => Promise<boolean>;
  onTrim: (clip: Clip, start: number, end: number) => void;
  onCancelTrim: () => void;
}

export function PlayerModal(props: PlayerModalProps) {
  return props.clip ? <ClipPlayer key={props.clip.id} {...props} clip={props.clip} /> : null;
}

function ClipPlayer({ clip, editing, progress, onClose, onFavorite, onReveal, onOpenExternal, onDelete, onDragOut, onRename, onTrim, onCancelTrim }: PlayerModalProps & { clip: Clip }) {
  const dialogRef = useDialogFocus(true, editing ? undefined : onClose);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [current, setCurrent] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(clip.title);
  const [savingName, setSavingName] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [rate, setRate] = useState(1);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);
  const rangeValid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= duration && end - start >= MIN_TRIM_SECONDS;
  const setBoundary = (boundary: 'start' | 'end', value: number) => {
    if (!Number.isFinite(value)) return;
    if (boundary === 'start') setStart(Math.min(Math.max(0, value), end - MIN_TRIM_SECONDS));
    else setEnd(Math.max(Math.min(duration, value), start + MIN_TRIM_SECONDS));
  };
  const markAtPlayhead = (boundary: 'start' | 'end') => setBoundary(boundary, videoRef.current?.currentTime ?? (boundary === 'start' ? start : end));
  const seek = (seconds: number) => {
    if (!videoRef.current || !Number.isFinite(seconds)) return;
    videoRef.current.currentTime = Math.min(Math.max(0, seconds), duration || seconds);
    setCurrent(videoRef.current.currentTime);
  };
  const previewSelection = () => {
    if (!videoRef.current) return;
    seek(start);
    void videoRef.current.play().catch(() => undefined);
  };

  // I / O mark the selection like most editors; Space plays when focus is not
  // on a control that already uses it.
  useEffect(() => {
    if (!trimming || editing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (target?.closest('input, select, textarea, button, video')) return;
      const key = event.key.toLowerCase();
      if (key === 'i') { event.preventDefault(); markAtPlayhead('start'); }
      else if (key === 'o') { event.preventDefault(); markAtPlayhead('end'); }
      else if (key === ' ') {
        event.preventDefault();
        const video = videoRef.current;
        if (video) void (video.paused ? video.play().catch(() => undefined) : video.pause());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const percent = (seconds: number) => (duration > 0 ? `${(Math.min(Math.max(seconds, 0), duration) / duration) * 100}%` : '0%');

  return (
    <div className="modal-backdrop player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !editing) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className={`modal player-modal ${trimming ? 'is-trimming' : ''}`} role="dialog" aria-modal="true" aria-label={clip.title}>
        <header>
          <div>
            <span className={`clip-type type-${clip.kind}`}>{clipKindLabel(clip.kind)}</span>
            {renaming ? <form className="rename-form" onSubmit={async event => {
              event.preventDefault(); if (savingName || !name.trim()) return;
              setSavingName(true);
              try { if (await onRename(clip, name.trim())) setRenaming(false); }
              finally { setSavingName(false); }
            }}>
              <input autoFocus aria-label="클립 이름" maxLength={120} value={name} onChange={event => setName(event.target.value)} disabled={savingName} />
              <button className="button primary" disabled={!name.trim() || savingName}>저장</button>
              <button type="button" className="button ghost" disabled={savingName} onClick={() => setRenaming(false)}>취소</button>
            </form> : <div className="player-title-row"><h2>{clip.title}</h2><button type="button" className="icon-button" aria-label="클립 이름 변경" disabled={editing} onClick={() => { setName(clip.title); setRenaming(true); }}><Pencil size={16} /></button></div>}
            <p>{clip.sourceName} · {relativeDate(clip.createdAt)}</p>
          </div>
          <button type="button" className="modal-close" aria-label="클립 플레이어 닫기" onClick={onClose} disabled={editing}><X size={19} /></button>
        </header>
        <div className="player-stage">
          <video ref={videoRef} src={clip.mediaUrl} aria-label={`${clip.title} 영상`} controls autoPlay playsInline
            onError={() => setMediaError(true)}
            onLoadedMetadata={event => { const seconds = event.currentTarget.duration; if (Number.isFinite(seconds)) { setDuration(seconds); setEnd(seconds); } }}
            onDurationChange={event => { const seconds = event.currentTarget.duration; if (Number.isFinite(seconds) && seconds > 0 && duration === 0) { setDuration(seconds); setEnd(seconds); } }}
            onTimeUpdate={event => { setCurrent(event.currentTarget.currentTime); if (trimming && event.currentTarget.currentTime >= end) event.currentTarget.pause(); }}
            onSeeked={event => setCurrent(event.currentTarget.currentTime)} />
        </div>
        {mediaError && <p className="inline-error" role="alert">영상을 재생할 수 없습니다. 파일 위치 또는 기본 플레이어에서 확인해 주세요.</p>}
        <div className="player-tools">
          <button type="button" className={`button ${trimming ? 'ghost is-active' : 'ghost'}`} disabled={editing || mediaError || duration < MIN_TRIM_SECONDS} aria-pressed={trimming} onClick={() => setTrimming(!trimming)}><Scissors size={16} /> 구간 잘라 저장</button>
          <label>재생 속도 <select aria-label="재생 속도" value={rate} onChange={event => setRate(Number(event.target.value))}>{[0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        </div>
        {trimming && <section className="trim-panel" aria-label="클립 구간 편집">
          <div className="trim-heading">
            <div><strong>필요한 순간만 남기세요</strong><p>원본은 그대로 두고 새 MP4로 저장합니다. 구간에 따라 재인코딩될 수 있습니다.</p></div>
            <span>{formatDuration((end - start) * 1000)} 선택됨</span>
          </div>
          <div
            className="trim-timeline"
            onPointerDown={event => {
              if (editing || duration <= 0 || (event.target as HTMLElement).tagName === 'INPUT') return;
              const bounds = event.currentTarget.getBoundingClientRect();
              seek(((event.clientX - bounds.left) / bounds.width) * duration);
            }}
          >
            <div className="trim-track" />
            <div className="trim-selection" style={{ left: percent(start), width: duration > 0 ? `${((end - start) / duration) * 100}%` : '0%' }} />
            <div className="trim-playhead" style={{ left: percent(current) }} aria-hidden="true" />
            <input type="range" className="trim-handle trim-handle-start" aria-label="편집 시작 구간" aria-valuetext={`${start.toFixed(1)}초`} min={0} max={duration} step={0.05} value={start} disabled={editing} onChange={event => setBoundary('start', Number(event.target.value))} />
            <input type="range" className="trim-handle trim-handle-end" aria-label="편집 종료 구간" aria-valuetext={`${end.toFixed(1)}초`} min={0} max={duration} step={0.05} value={end} disabled={editing} onChange={event => setBoundary('end', Number(event.target.value))} />
          </div>
          <div className="trim-scale" aria-hidden="true"><span>0:00</span><span>{formatDuration(duration * 1000)}</span></div>
          <div className="trim-fields">
            <div className="trim-field">
              <label>시작 <input type="number" aria-label="편집 시작 시간 (초)" min={0} max={end - MIN_TRIM_SECONDS} step={0.1} value={Number(start.toFixed(2))} disabled={editing} onChange={event => setBoundary('start', event.target.valueAsNumber)} /> 초</label>
              <button type="button" className="button ghost compact" disabled={editing} onClick={() => markAtPlayhead('start')}>현재 위치를 시작으로 <kbd>I</kbd></button>
            </div>
            <div className="trim-field">
              <label>종료 <input type="number" aria-label="편집 종료 시간 (초)" min={start + MIN_TRIM_SECONDS} max={duration} step={0.1} value={Number(end.toFixed(2))} disabled={editing} onChange={event => setBoundary('end', event.target.valueAsNumber)} /> 초</label>
              <button type="button" className="button ghost compact" disabled={editing} onClick={() => markAtPlayhead('end')}>현재 위치를 종료로 <kbd>O</kbd></button>
            </div>
          </div>
          <div className="trim-actions">
            <small className="trim-hint">타임라인을 눌러 이동하고 <kbd>Space</kbd>로 재생·정지합니다.</small>
            <button type="button" className="button ghost" disabled={editing || !rangeValid} onClick={previewSelection}><Play size={15} /> 선택 구간 재생</button>
            {editing ? <><progress value={progress} max={1} aria-label="편집 저장 진행률" /><span role="status">{Math.round(progress * 100)}%</span><button type="button" className="button ghost" onClick={onCancelTrim}>편집 취소</button></> : <button type="button" className="button primary" disabled={!rangeValid} onClick={() => { videoRef.current?.pause(); onTrim(clip, start, end); }}><Scissors size={16} /> 새 클립 저장</button>}
          </div>
        </section>}
        <footer>
          <div className="player-metadata"><span>{formatDuration((duration || clip.durationMs / 1000) * 1000)}</span><i /><span>{clip.width > 0 ? `${clip.width} × ${clip.height}` : '해상도 미상'}</span><i /><span>{clip.fps || '—'} FPS</span><i /><span>{formatBytes(clip.bytes)}</span></div>
          <div className="player-actions">
            <span className="drag-share" draggable title="Discord, 탐색기, 편집 프로그램으로 끌어다 놓으세요" onDragStart={event => { event.preventDefault(); onDragOut(clip); }}><GripVertical size={16} /> 끌어서 공유</span>
            <button type="button" className={clip.favorite ? 'active' : ''} aria-pressed={clip.favorite} onClick={() => onFavorite(clip, !clip.favorite)}><Heart size={17} fill={clip.favorite ? 'currentColor' : 'none'} /> 즐겨찾기</button>
            <button type="button" onClick={() => onReveal(clip)}><FolderOpen size={17} /> 파일 위치</button>
            <button type="button" onClick={() => onOpenExternal(clip)}><ExternalLink size={17} /> 기본 플레이어</button>
            <button type="button" disabled={editing} className="destructive" onClick={() => onDelete(clip)}><Trash2 size={17} /> 삭제</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
