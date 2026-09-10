import { useMemo, useState } from 'react';
import { Clapperboard, Film, Heart, RefreshCw, Search, X } from 'lucide-react';
import type { Clip } from '../../shared/types';
import { queryClips, type ClipFilter, type ClipSort } from '../library-query';
import { formatBytes } from '../utils';
import { ClipCard, type ClipActions } from './ClipCard';

interface ClipLibraryProps extends ClipActions {
  clips: Clip[];
  replayHotkey: string;
  onGoHome: () => void;
  onRefresh: () => void;
}

export function ClipLibrary({ clips, replayHotkey, onGoHome, onRefresh, ...actions }: ClipLibraryProps) {
  const [filter, setFilter] = useState<ClipFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ClipSort>('newest');
  const [limit, setLimit] = useState(24);
  const filtered = useMemo(() => queryClips(clips, query, filter, sort), [clips, query, filter, sort]);
  const bytes = filtered.reduce((sum, clip) => sum + clip.bytes, 0);
  return <div className="page clips-page">
    <div className="library-header"><div><span className="eyebrow">YOUR MOMENTS</span><h1>내 클립</h1><p>장면을 찾고, 필요한 구간만 잘라 새 클립으로 남기세요.</p></div><div className="library-count"><Film size={18} /><strong>{clips.length}</strong><span>개</span><button className="icon-button" type="button" aria-label="클립 목록 새로고침" onClick={onRefresh}><RefreshCw size={17} /></button></div></div>
    <div className="library-toolbar">
      <div className="filter-tabs" role="group" aria-label="클립 필터">{([
        ['all', '전체'], ['replay', '리플레이'], ['recording', '녹화'], ['edited', '편집'], ['recovered', '복구'], ['favorite', '즐겨찾기'],
      ] as const).map(([id, label]) => <button type="button" key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(24); }}>{id === 'favorite' && <Heart size={14} />}{label}</button>)}</div>
      <label className="search-box"><Search size={17} /><input value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder="클립 이름 또는 게임 검색" aria-label="클립 검색" />{query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
    </div>
    <div className="library-results"><span role="status">{filtered.length}개 클립 · {formatBytes(bytes)}</span><label>정렬 <select aria-label="클립 정렬" value={sort} onChange={event => { setSort(event.target.value as ClipSort); setLimit(24); }}><option value="newest">최신순</option><option value="oldest">오래된순</option><option value="largest">용량 큰순</option><option value="longest">길이 긴순</option></select></label></div>
    {filtered.length === 0 ? <div className="library-empty"><span><Clapperboard size={34} /></span><h2>{clips.length === 0 ? '첫 번째 순간을 남겨 보세요' : '조건에 맞는 클립이 없어요'}</h2><p>{clips.length === 0 ? `홈에서 리플레이를 켜고 ${replayHotkey}을 누르면 여기에 저장됩니다.` : '검색어나 필터를 바꿔 보세요.'}</p><button type="button" className="button primary" onClick={clips.length === 0 ? onGoHome : () => { setFilter('all'); setQuery(''); }}>{clips.length === 0 ? '녹화하러 가기' : '전체 클립 보기'}</button></div>
      : <><div className="clip-grid">{filtered.slice(0, limit).map(clip => <ClipCard key={clip.id} clip={clip} {...actions} />)}</div>{filtered.length > limit && <button type="button" className="button ghost load-more" onClick={() => setLimit(limit + 24)}>클립 더 보기 · {filtered.length - limit}개 남음</button>}</>}
  </div>;
}
