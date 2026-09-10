import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { mediaResponse, parseByteRange } from './media-response';

it('supports suffix/open-ended ranges and rejects invalid or multi ranges', () => {
  expect(parseByteRange('bytes=2-', 10)).toEqual({ start: 2, end: 9 });
  expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
  expect(parseByteRange('bytes=0-999', 10)).toEqual({ start: 0, end: 9 });
  for (const value of ['bytes=10-', 'bytes=2-1', 'bytes=-0', 'bytes=0-2,4-5', 'bytes=9007199254740992-']) expect(parseByteRange(value, 10)).toBe('invalid');
});

it('streams only requested bytes and implements HEAD and 416 without reading the video', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-range-'));
  try {
    const file = path.join(folder, 'clip.mp4');
    await writeFile(file, new Uint8Array([0, 1, 2, 3, 4, 5]));
    const response = await mediaResponse(file, new Request('https://app/media/id', { headers: { Range: 'bytes=2-4' } }));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-4/6');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4]);
    const head = await mediaResponse(file, new Request('https://app/media/id', { method: 'HEAD' }));
    expect(head.headers.get('Content-Length')).toBe('6');
    expect(await head.text()).toBe('');
    const invalid = await mediaResponse(file, new Request('https://app/media/id', { headers: { Range: 'bytes=8-' } }));
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('Content-Range')).toBe('bytes */6');
  } finally { await rm(folder, { recursive: true, force: true }); }
});
