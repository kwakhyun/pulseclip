import { AppendOnlyStreamTarget, EncodedAudioPacketSource, EncodedVideoPacketSource, Mp4OutputFormat, Output, type EncodedPacket, type VideoCodec, type AudioCodec } from 'mediabunny';
import type { Clip } from '../../shared/types';
import { IpcAppendSink } from './IpcAppendSink';
import { codecLabel, errorMessage } from './media-utils';

interface LiveWriterOptions {
  kind: 'recording';
  sourceName: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
  videoMetadata: EncodedVideoChunkMetadata;
  audioMetadata: EncodedAudioChunkMetadata | null;
  onError: (error: unknown) => void;
}

export class LivePacketWriter {
  private sessionId = '';
  private output: Output | null = null;
  private videoSource: EncodedVideoPacketSource | null = null;
  private audioSource: EncodedAudioPacketSource | null = null;
  private baseTimestamp: number | null = null;
  private firstVideo = true;
  private firstAudio = true;
  private accepting = true;
  private pendingAudio: EncodedPacket[] = [];
  private videoQueue: Promise<void> = Promise.resolve();
  private audioQueue: Promise<void> = Promise.resolve();
  private failure: unknown = null;
  private lastVideoEndTimestamp: number | null = null;
  private readonly startedAt = performance.now();
  private pendingBytes = 0;

  private fail(error: unknown): void {
    if (this.failure) return;
    this.failure = error;
    this.accepting = false;
    queueMicrotask(() => this.options.onError(error));
  }

  private reserve(packet: EncodedPacket): boolean {
    if (this.failure) return false;
    if (this.pendingBytes + packet.byteLength > 64 * 1024 * 1024) {
      this.fail(new Error('드라이브 쓰기가 녹화 속도를 따라가지 못해 녹화를 중단했습니다. 저장 장치 또는 화질 설정을 확인해 주세요.'));
      return false;
    }
    this.pendingBytes += packet.byteLength;
    return true;
  }

  constructor(private readonly options: LiveWriterOptions) {}

  async start(): Promise<void> {
    const session = await window.pulseClip.beginFile({
      kind: this.options.kind,
      sourceName: this.options.sourceName,
      width: this.options.width,
      height: this.options.height,
      fps: this.options.fps,
      codec: codecLabel(this.options.videoCodec, this.options.audioCodec),
    });
    this.sessionId = session.sessionId;
    const sink = new IpcAppendSink(this.sessionId);
    this.videoSource = new EncodedVideoPacketSource(this.options.videoCodec);
    this.audioSource = this.options.audioCodec
      ? new EncodedAudioPacketSource(this.options.audioCodec)
      : null;
    this.output = new Output({
      format: new Mp4OutputFormat({
        fastStart: 'fragmented',
        minimumFragmentDuration: 1,
      }),
      target: new AppendOnlyStreamTarget(sink.writable),
    });
    this.output.addVideoTrack(this.videoSource, { frameRate: this.options.fps });
    if (this.audioSource) this.output.addAudioTrack(this.audioSource);
    this.output.setMetadataTags({ title: 'PulseClip Recording', artist: 'PulseClip' });
    try {
      await this.output.start();
    } catch (error) {
      await window.pulseClip.abortFile(this.sessionId, errorMessage(error));
      throw error;
    }
  }

  pushVideo(packet: EncodedPacket): void {
    if (!this.accepting || !this.videoSource) return;
    if (this.baseTimestamp === null) {
      if (packet.type !== 'key') return;
      this.baseTimestamp = packet.timestamp;
      this.lastVideoEndTimestamp = packet.timestamp + packet.duration;
      this.enqueueVideo(packet);
      for (const audioPacket of this.pendingAudio) {
        if (audioPacket.timestamp >= this.baseTimestamp) this.enqueueAudio(audioPacket);
      }
      this.pendingAudio = [];
      return;
    }
    this.lastVideoEndTimestamp = Math.max(
      this.lastVideoEndTimestamp ?? packet.timestamp,
      packet.timestamp + packet.duration,
    );
    this.enqueueVideo(packet);
  }

  prime(videoPackets: EncodedPacket[], audioPackets: EncodedPacket[]): void {
    for (const packet of videoPackets) this.pushVideo(packet);
    for (const packet of audioPackets) this.pushAudio(packet);
  }

  async cancel(reason: string): Promise<void> {
    this.accepting = false;
    await this.output?.cancel().catch(() => undefined);
    await window.pulseClip.abortFile(this.sessionId, reason);
  }

  pushAudio(packet: EncodedPacket): void {
    if (!this.accepting || !this.audioSource) return;
    if (this.baseTimestamp === null) {
      this.pendingAudio.push(packet.clone());
      if (this.pendingAudio.length > 500) this.pendingAudio.shift();
      return;
    }
    if (packet.timestamp >= this.baseTimestamp) this.enqueueAudio(packet);
  }

  async finish(): Promise<Clip> {
    this.accepting = false;
    if (this.baseTimestamp === null || !this.output) {
      await this.output?.cancel().catch(() => undefined);
      const error = new Error('녹화가 너무 짧아 저장할 키프레임이 없습니다.');
      await window.pulseClip.abortFile(this.sessionId, error.message);
      throw error;
    }
    await Promise.all([this.videoQueue, this.audioQueue]);
    if (this.failure) {
      await this.output.cancel().catch(() => undefined);
      await window.pulseClip.abortFile(this.sessionId, errorMessage(this.failure));
      throw this.failure;
    }
    this.videoSource?.close();
    this.audioSource?.close();
    try {
      await this.output.finalize();
      const packetDurationMs =
        this.baseTimestamp !== null && this.lastVideoEndTimestamp !== null
          ? Math.max(0, (this.lastVideoEndTimestamp - this.baseTimestamp) * 1000)
          : 0;
      return await window.pulseClip.finalizeFile(this.sessionId, {
        durationMs: packetDurationMs || performance.now() - this.startedAt,
      });
    } catch (error) {
      await window.pulseClip.abortFile(this.sessionId, errorMessage(error));
      throw error;
    }
  }

  private enqueueVideo(packet: EncodedPacket): void {
    if (!this.reserve(packet)) return;
    const base = this.baseTimestamp!;
    const metadata = this.firstVideo ? this.options.videoMetadata : undefined;
    this.firstVideo = false;
    this.videoQueue = this.videoQueue
      .then(() =>
        this.failure ? undefined : this.videoSource!.add(packet.clone({ timestamp: packet.timestamp - base }), metadata),
      )
      .catch((error) => {
        this.fail(error);
      }).finally(() => { this.pendingBytes -= packet.byteLength; });
  }

  private enqueueAudio(packet: EncodedPacket): void {
    if (!this.audioSource || this.baseTimestamp === null) return;
    if (!this.reserve(packet)) return;
    const metadata = this.firstAudio ? this.options.audioMetadata ?? undefined : undefined;
    this.firstAudio = false;
    const base = this.baseTimestamp;
    this.audioQueue = this.audioQueue
      .then(() =>
        this.failure ? undefined : this.audioSource!.add(
          packet.clone({ timestamp: Math.max(0, packet.timestamp - base) }),
          metadata,
        ),
      )
      .catch((error) => {
        this.fail(error);
      }).finally(() => { this.pendingBytes -= packet.byteLength; });
  }
}
