import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';

export function parseByteRange(value: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return 'invalid';
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return 'invalid';
  if (!match[1]) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : 'invalid';
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && end >= first ? { start: first, end } : 'invalid';
}

/** Serve bounded byte streams; Electron's file fetch can ignore Range headers. */
export async function mediaResponse(filePath: string, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const handle = await open(filePath, 'r');
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new Error('Not a media file');
    const range = parseByteRange(request.headers.get('range'), details.size);
    const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (range === 'invalid') {
      await handle.close();
      headers.set('Content-Range', `bytes */${details.size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? details.size - 1;
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${details.size}`);
    const status = range ? 206 : 200;
    if (request.method === 'HEAD' || details.size === 0) {
      await handle.close();
      return new Response(null, { status, headers });
    }
    request.signal.throwIfAborted();
    const stream = handle.createReadStream({ start, end, autoClose: true, highWaterMark: 64 * 1024 });
    const abort = () => stream.destroy();
    request.signal.addEventListener('abort', abort, { once: true });
    stream.once('close', () => request.signal.removeEventListener('abort', abort));
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}
