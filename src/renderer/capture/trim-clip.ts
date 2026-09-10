import { AppendOnlyStreamTarget, Conversion, Input, MP4, Mp4OutputFormat, Output, UrlSource } from 'mediabunny';
import type { Clip } from '../../shared/types';
import { validateTrimRange } from '../../shared/trim';
import { IpcAppendSink } from './IpcAppendSink';

export async function trimClip(
  clip: Clip, start: number, end: number, signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<Clip> {
  signal.throwIfAborted();
  const input = new Input({ formats: [MP4], source: new UrlSource(clip.mediaUrl, {
    getRetryDelay: attempts => signal.aborted || attempts >= 1 ? null : 0.25,
    fetchFn: (resource, options) => fetch(resource, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000), ...(options?.signal ? [options.signal] : [])]) }),
  }) });
  let sessionId: string | undefined;
  let conversion: Conversion | undefined;
  let output: Output | undefined;
  const cancel = () => { void conversion?.cancel().catch(() => undefined); input.dispose(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const duration = await input.computeDuration();
    validateTrimRange(start, end, duration);
    signal.throwIfAborted();
    const session = await window.pulseClip.beginTrim({ clipId: clip.id, startSeconds: start, endSeconds: end });
    sessionId = session.sessionId;
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
      target: new AppendOnlyStreamTarget(new IpcAppendSink(sessionId).writable),
    });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video?.codec) throw new Error('편집할 영상 트랙을 읽을 수 없습니다.');
    conversion = await Conversion.init({
      input, output, tracks: 'primary', trim: { start, end },
      video: { codec: video.codec },
      audio: audio?.codec ? { codec: audio.codec } : undefined,
      tags: { title: `${clip.title} · 편집`, artist: 'PulseClip' }, showWarnings: false,
    });
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      throw new Error('이 PC에서는 영상 또는 오디오를 편집할 수 없습니다. 원본은 그대로 보존됩니다.');
    }
    signal.throwIfAborted();
    conversion.onProgress = progress => onProgress(Math.min(0.99, progress));
    await conversion.execute();
    signal.throwIfAborted();
    const saved = await window.pulseClip.finalizeFile(sessionId, { durationMs: (end - start) * 1000 });
    sessionId = undefined;
    onProgress(1);
    return saved;
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    if (sessionId) await window.pulseClip.abortFile(sessionId, '클립 편집 취소 또는 실패').catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    input.dispose();
  }
}
