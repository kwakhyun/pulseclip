import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Heart, MoreHorizontal, Play, Trash2 } from 'lucide-react';
import type { Clip } from '../../shared/types';
import { clipKindLabel, formatBytes, formatDuration, relativeDate, sourceInitial } from '../utils';
import { ClipThumbnail } from './ClipThumbnail';

export interface ClipActions {
  onOpen: (clip: Clip) => void;
  onFavorite: (clip: Clip, favorite: boolean) => void;
  onReveal: (clip: Clip) => void;
  onOpenExternal: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
}

export function ClipCard({ clip, ...actions }: ClipActions & { clip: Clip }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return <article className="clip-card">
    <button type="button" className="clip-preview" aria-label={`${clip.title} 재생`} onClick={() => actions.onOpen(clip)}>
      <ClipThumbnail url={clip.mediaUrl} />
      <span className="clip-fallback">{sourceInitial(clip.sourceName)}</span><span className="clip-preview-shade" />
      <span className={`clip-type type-${clip.kind}`}>{clipKindLabel(clip.kind)}</span>
      <span className="clip-length">{clip.durationMs ? formatDuration(clip.durationMs) : '길이 확인 필요'}</span>
      <span className="clip-play"><Play size={19} fill="currentColor" /></span>
    </button>
    <div className="clip-card-body">
      <div className="clip-card-title">
        <div><strong title={clip.title}>{clip.title}</strong><span>{clip.sourceName}</span></div>
        <button type="button" className={`favorite-button ${clip.favorite ? 'active' : ''}`} aria-pressed={clip.favorite} aria-label={`${clip.title} ${clip.favorite ? '즐겨찾기 해제' : '즐겨찾기'}`} onClick={() => actions.onFavorite(clip, !clip.favorite)}><Heart size={17} fill={clip.favorite ? 'currentColor' : 'none'} /></button>
        <div ref={wrapper} className="clip-menu-wrap" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
          <button ref={trigger} type="button" aria-label={`${clip.title} 관리`} aria-expanded={open} aria-controls={`actions-${clip.id}`} className="more-button" onClick={() => setOpen(!open)}><MoreHorizontal size={19} /></button>
          {open && <div id={`actions-${clip.id}`} className="clip-menu" role="group" aria-label="클립 관리">
            <button type="button" onClick={() => { setOpen(false); actions.onOpen(clip); }}><Play size={15} /> 재생 · 편집</button>
            <button type="button" onClick={() => { setOpen(false); actions.onReveal(clip); }}><FolderOpen size={15} /> 파일 위치</button>
            <button type="button" onClick={() => { setOpen(false); actions.onOpenExternal(clip); }}><ExternalLink size={15} /> 기본 플레이어</button>
            <button type="button" className="destructive" onClick={() => { setOpen(false); actions.onDelete(clip); }}><Trash2 size={15} /> 삭제</button>
          </div>}
        </div>
      </div>
      <div className="clip-card-meta"><span>{relativeDate(clip.createdAt)}</span><i /><span>{clip.width > 0 ? `${clip.height}p` : '해상도 미상'}</span><i /><span>{formatBytes(clip.bytes)}</span></div>
    </div>
  </article>;
}
