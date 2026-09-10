import { afterEach, expect, it, vi } from 'vitest';
import { IpcAppendSink } from './IpcAppendSink';

afterEach(() => vi.unstubAllGlobals());
it('splits oversized fragments into bounded ordered IPC writes', async () => {
  const chunks: ArrayBuffer[] = [];
  vi.stubGlobal('window', { pulseClip: { appendFile: async (_id: string, data: ArrayBuffer) => { chunks.push(data); } } });
  const bytes = new Uint8Array(17 * 1024 * 1024 + 3);
  bytes[0] = 10; bytes[8 * 1024 * 1024] = 20; bytes[16 * 1024 * 1024] = 30;
  const writer = new IpcAppendSink('test').writable.getWriter();
  await writer.write(bytes); await writer.close();
  expect(chunks.map(chunk => chunk.byteLength)).toEqual([8 * 1024 * 1024, 8 * 1024 * 1024, 1024 * 1024 + 3]);
  expect(chunks.map(chunk => new Uint8Array(chunk)[0])).toEqual([10, 20, 30]);
});
