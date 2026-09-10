import { expect, it } from 'vitest';
import type { Clip } from '../shared/types';
import { queryClips } from './library-query';

const clips = [
  { id: 'a', title: '승리', sourceName: 'Game', fileName: 'one.mp4', kind: 'replay', createdAt: '2026-09-09', durationMs: 9000, bytes: 100, favorite: true },
  { id: 'b', title: '편집', sourceName: 'Game', fileName: 'two.mp4', kind: 'edited', createdAt: '2026-09-10', durationMs: 2000, bytes: 200, favorite: false },
] as Clip[];
it('combines source search and type filters and sorts without changing the input', () => {
  expect(queryClips(clips, ' game ', 'edited', 'newest').map(clip => clip.id)).toEqual(['b']);
  expect(queryClips(clips, '', 'favorite', 'largest').map(clip => clip.id)).toEqual(['a']);
  expect(queryClips(clips, '', 'all', 'longest').map(clip => clip.id)).toEqual(['a', 'b']);
  expect(queryClips(clips, '', 'all', 'largest').map(clip => clip.id)).toEqual(['b', 'a']);
  expect(clips.map(clip => clip.id)).toEqual(['a', 'b']);
});
