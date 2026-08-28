import { useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  ExternalLink,
  Film,
  FolderOpen,
  Heart,
  MoreHorizontal,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import type { Clip } from '../../shared/types';
import {
  clipKindLabel,
  formatBytes,
  formatDuration,
  relativeDate,
  sourceInitial,
} from '../utils';

type Filter = 'all' | 'replay' | 'recording' | 'favorite';

interface ClipLibraryProps {
  clips: Clip[];
  onOpen: (clip: Clip) => void;
  onFavorite: (clip: Clip, favorite: boolean) => void;
  onReveal: (clip: Clip) => void;
  onOpenExternal: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
}

export function ClipLibrary({
  clips,
  onOpen,
  onFavorite,
  onReveal,
  onOpenExternal,
  onDelete,
}: ClipLibraryProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      const openWrapper = document.querySelector('[data-open-menu="true"]');
      if (event.target instanceof Node && !openWrapper?.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePress, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePress, true);
    };
  }, [openMenu]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return clips.filter((clip) => {
      if (filter === 'favorite' && !clip.favorite) return false;
      if (filter === 'replay' && clip.kind !== 'replay') return false;
      if (filter === 'recording' && clip.kind !== 'recording') return false;
      if (!normalizedQuery) return true;
      return `${clip.title} ${clip.sourceName} ${clip.fileName}`
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery);
    });
  }, [clips, filter, query]);

  return (
    <div className="page clips-page">
      <div className="library-header">
        <div>
          <span className="eyebrow">YOUR MOMENTS</span>
          <h1>내 클립</h1>
          <p>저장한 리플레이와 녹화를 한곳에서 관리하세요.</p>
        </div>
        <div className="library-count"><Film size={18} /><strong>{clips.length}</strong><span>개의 순간</span></div>
      </div>

      <div className="library-toolbar">
        <div className="filter-tabs" role="group" aria-label="클립 필터">
          {([
            ['all', '전체'],
            ['replay', '리플레이'],
            ['recording', '전체 녹화'],
            ['favorite', '즐겨찾기'],
          ] as const).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
            >
              {id === 'favorite' && <Heart size={14} />}
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="클립 또는 게임 검색"
            aria-label="클립 검색"
          />
          {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}>×</button>}
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="library-empty">
          <span><Clapperboard size={34} /></span>
          <h2>{clips.length === 0 ? '첫 번째 순간을 만들어 보세요' : '조건에 맞는 클립이 없어요'}</h2>
          <p>{clips.length === 0 ? '홈에서 리플레이 준비를 켠 뒤 F8을 누르면 여기에 저장됩니다.' : '검색어나 필터를 바꿔 보세요.'}</p>
        </div>
      ) : (
        <div className="clip-grid">
          {filtered.map((clip) => (
            <article className="clip-card" key={clip.id}>
              <button type="button" className="clip-preview" aria-label={`${clip.title} 재생`} onClick={() => onOpen(clip)}>
                <video
                  src={clip.mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  tabIndex={-1}
                  onMouseEnter={(event) => {
                    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                    event.currentTarget.currentTime = 0;
                    void event.currentTarget.play().catch(() => undefined);
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = 0;
                  }}
                />
                <span className="clip-fallback">{sourceInitial(clip.sourceName)}</span>
                <span className="clip-preview-shade" />
                <span className={`clip-type type-${clip.kind}`}>{clipKindLabel(clip.kind)}</span>
                <span className="clip-length">{formatDuration(clip.durationMs)}</span>
                <span className="clip-play"><Play size={19} fill="currentColor" /></span>
              </button>
              <div className="clip-card-body">
                <div className="clip-card-title">
                  <div><strong>{clip.title}</strong><span>{clip.sourceName}</span></div>
                  <button
                    type="button"
                    className={`favorite-button ${clip.favorite ? 'active' : ''}`}
                    aria-pressed={clip.favorite}
                    aria-label={clip.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                    onClick={() => onFavorite(clip, !clip.favorite)}
                  >
                    <Heart size={17} fill={clip.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <div className="clip-menu-wrap" data-open-menu={openMenu === clip.id ? 'true' : 'false'}>
                    <button
                      type="button"
                      aria-label="클립 메뉴"
                      aria-expanded={openMenu === clip.id}
                      aria-haspopup="menu"
                      className="more-button"
                      onClick={() => setOpenMenu(openMenu === clip.id ? null : clip.id)}
                    >
                      <MoreHorizontal size={19} />
                    </button>
                    {openMenu === clip.id && (
                      <div className="clip-menu" role="menu">
                        <button type="button" onClick={() => { setOpenMenu(null); onReveal(clip); }}><FolderOpen size={15} /> 파일 위치</button>
                        <button type="button" onClick={() => { setOpenMenu(null); onOpenExternal(clip); }}><ExternalLink size={15} /> 기본 플레이어</button>
                        <button type="button" className="destructive" onClick={() => { setOpenMenu(null); onDelete(clip); }}><Trash2 size={15} /> 삭제</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clip-card-meta">
                  <span>{relativeDate(clip.createdAt)}</span>
                  <i />
                  <span>{clip.width > 0 ? `${clip.height}p` : '해상도 미상'}</span>
                  <i />
                  <span>{formatBytes(clip.bytes)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
