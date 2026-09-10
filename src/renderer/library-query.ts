import type { Clip } from '../shared/types';

export type ClipFilter = 'all' | 'favorite' | Clip['kind'];
export type ClipSort = 'newest' | 'oldest' | 'largest' | 'longest';

export function queryClips(clips: readonly Clip[], query: string, filter: ClipFilter, sort: ClipSort): Clip[] {
  const needle = query.trim().toLocaleLowerCase('ko-KR');
  return clips.filter(clip => {
    if (filter === 'favorite' ? !clip.favorite : filter !== 'all' && clip.kind !== filter) return false;
    return `${clip.title} ${clip.sourceName} ${clip.fileName}`.toLocaleLowerCase('ko-KR').includes(needle);
  }).sort((a, b) => {
    if (sort === 'largest') return b.bytes - a.bytes || b.createdAt.localeCompare(a.createdAt);
    if (sort === 'longest') return b.durationMs - a.durationMs || b.createdAt.localeCompare(a.createdAt);
    return sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
  });
}
