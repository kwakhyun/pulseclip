import {
  AppendOnlyStreamTarget,
  EncodedAudioPacketSource,
  EncodedVideoPacketSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  type AudioCodec,
  type EncodedPacket,
  type VideoCodec,
} from 'mediabunny';
import { resolutionSize } from '../../shared/settings';
import type {
  AppSettings,
  CaptureSource,
  CaptureTelemetry,
  Clip,
  EnginePhase,
} from '../../shared/types';
import { findRecoverySource, shouldUseDefaultMicrophone } from './recovery-policy';

type TelemetryListener = (telemetry: CaptureTelemetry) => void;
type ClipListener = (clip: Clip) => void;

interface PacketSnapshot {
  videoPackets: EncodedPacket[];
  audioPackets: EncodedPacket[];
  videoMetadata: EncodedVideoChunkMetadata;
  audioMetadata?: EncodedAudioChunkMetadata;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
  baseTimestamp: number;
  durationSeconds: number;
}

const DEFAULT_TELEMETRY: CaptureTelemetry = {
  phase: 'idle',
  sourceName: '',
  bufferSeconds: 0,
  bufferBytes: 0,
  recordingSeconds: 0,
  width: 0,
  height: 0,
  fps: 0,
  videoCodec: '',
  audioCodec: '',
  hasSystemAudio: false,
  hasMicrophone: false,
  recoveryState: 'none',
  recoveryAttempt: 0,
  recoveryMessage: '',
  error: null,
};

export class ReplayCaptureEngine {
  private telemetry: CaptureTelemetry = { ...DEFAULT_TELEMETRY };
  private readonly telemetryListeners = new Set<TelemetryListener>();
  private readonly clipListeners = new Set<ClipListener>();
  private settings: AppSettings | null = null;
  private source: CaptureSource | null = null;
  private displayStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private previewStream: MediaStream | null = null;
  private mixedAudioContext: AudioContext | null = null;
  private encoderOutput: Output | null = null;
  private videoTrackSource: MediaStreamVideoTrackSource | null = null;
  private audioTrackSource: MediaStreamAudioTrackSource | null = null;
  private videoPackets: EncodedPacket[] = [];
  private audioPackets: EncodedPacket[] = [];
  private videoPacketBytes = 0;
  private audioPacketBytes = 0;
  private videoMetadata: EncodedVideoChunkMetadata | null = null;
  private audioMetadata: EncodedAudioChunkMetadata | null = null;
  private videoCodec: VideoCodec | null = null;
  private audioCodec: AudioCodec | null = null;
  private manualWriter: LivePacketWriter | null = null;
  private recordingStartedAt = 0;
  private recordingTimelineAtStart = 0;
  private savingReplay = false;
  private stopping = false;
  private recovering = false;
  private releasingMedia = false;
  private recoveryGeneration = 0;
  private deviceChangeHandler: (() => void) | null = null;
  private telemetryTimer: number | null = null;

  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    listener({ ...this.telemetry });
    return () => this.telemetryListeners.delete(listener);
  }

  onClipCreated(listener: ClipListener): () => void {
    this.clipListeners.add(listener);
    return () => this.clipListeners.delete(listener);
  }

  getPreviewStream(): MediaStream | null {
    return this.previewStream;
  }

  getTelemetry(): CaptureTelemetry {
    return { ...this.telemetry };
  }

  isActive(): boolean {
    return this.telemetry.phase !== 'idle' && this.telemetry.phase !== 'error';
  }

  isRecording(): boolean {
    return this.manualWriter !== null;
  }

  async start(source: CaptureSource, settings: AppSettings): Promise<void> {
    if (this.isActive()) await this.stop();
    this.stopping = false;
    this.settings = structuredClone(settings);
    this.source = source;
    this.setPhase('starting');
    this.patchTelemetry({
      sourceName: source.name,
      recoveryState: 'none',
      recoveryAttempt: 0,
      recoveryMessage: '',
      error: null,
    });

    try {
      await window.pulseClip.prepareCapture({
        sourceId: source.id,
        includeSystemAudio: settings.systemAudio,
      });

      const requestedSize = resolutionSize(settings.resolution);
      const videoConstraints: MediaTrackConstraints & { cursor?: string } = {
        frameRate: { ideal: settings.fps, max: settings.fps },
        cursor: settings.recordCursor ? 'always' : 'never',
      };
      if (requestedSize.width) videoConstraints.width = { ideal: requestedSize.width };
      if (requestedSize.height) videoConstraints.height = { ideal: requestedSize.height };

      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: settings.systemAudio,
      });
      const videoTrack = this.displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('선택한 소스에서 영상 트랙을 가져오지 못했습니다.');
      videoTrack.contentHint = 'motion';
      videoTrack.addEventListener('ended', () => {
        this.scheduleRecovery('캡처 소스 연결이 끊겼습니다.');
      });

      if (settings.microphone) {
        const deviceConstraint = settings.microphoneDeviceId
          ? { exact: settings.microphoneDeviceId }
          : undefined;
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceConstraint,
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48_000,
          },
          video: false,
        });
      }

      const displayAudioTrack = this.displayStream.getAudioTracks()[0] ?? null;
      const microphoneTrack = this.microphoneStream?.getAudioTracks()[0] ?? null;
      displayAudioTrack?.addEventListener('ended', () => {
        this.scheduleRecovery('시스템 오디오 연결이 끊겼습니다.');
      });
      microphoneTrack?.addEventListener('ended', () => {
        this.scheduleRecovery('마이크 연결이 끊겼습니다.');
      });
      this.watchDeviceChanges(settings);
      const audioTrack = await this.createMixedAudioTrack(
        displayAudioTrack,
        microphoneTrack,
        settings.microphoneGain,
      );

      const sourceSettings = videoTrack.getSettings();
      const dimensions = fitCaptureDimensions(
        sourceSettings.width ?? requestedSize.width ?? 1920,
        sourceSettings.height ?? requestedSize.height ?? 1080,
        requestedSize.width,
        requestedSize.height,
      );
      const videoQuality = new Quality({
        bitrate: settings.videoBitrateMbps * 1_000_000,
        bitrateMode: 'variable',
      });
      const audioQuality = new Quality({ bitrate: 192_000, bitrateMode: 'variable' });

      this.videoCodec = await getFirstEncodableVideoCodec(
        ['avc', 'vp9', 'vp8'],
        { width: dimensions.width, height: dimensions.height, quality: videoQuality },
      );
      if (!this.videoCodec) {
        throw new Error('이 PC에서 사용할 수 있는 영상 하드웨어 인코더를 찾지 못했습니다.');
      }
      this.audioCodec = audioTrack
        ? await getFirstEncodableAudioCodec(['aac', 'opus'], {
            numberOfChannels: 2,
            sampleRate: 48_000,
            quality: audioQuality,
          })
        : null;
      if (audioTrack && !this.audioCodec) {
        throw new Error('이 PC에서 사용할 수 있는 오디오 인코더를 찾지 못했습니다.');
      }

      this.encoderOutput = new Output({
        format: new Mp4OutputFormat({
          fastStart: 'fragmented',
          minimumFragmentDuration: 1,
        }),
        target: new NullTarget(),
      });

      this.videoTrackSource = new MediaStreamVideoTrackSource(
        videoTrack as MediaStreamVideoTrack,
        {
          codec: this.videoCodec,
          quality: videoQuality,
          keyFrameInterval: 1,
          latencyMode: 'realtime',
          hardwareAcceleration: 'prefer-hardware',
          contentHint: 'motion',
          sizeChangeBehavior: 'passThrough',
          transform: {
            width: dimensions.width,
            height: dimensions.height,
            fit: 'contain',
            frameRate: settings.fps,
          },
          onEncodedPacket: (packet, metadata) => this.handleVideoPacket(packet, metadata),
        },
        { frameRate: settings.fps, timestampBase: 'synced-zero' },
      );
      this.videoTrackSource.errorPromise.catch((error) => this.handleFatalError(error));
      this.encoderOutput.addVideoTrack(this.videoTrackSource, {
        frameRate: settings.fps,
      });

      if (audioTrack && this.audioCodec) {
        this.audioTrackSource = new MediaStreamAudioTrackSource(
          audioTrack as MediaStreamAudioTrack,
          {
            codec: this.audioCodec,
            quality: audioQuality,
            transform: { numberOfChannels: 2, sampleRate: 48_000 },
            onEncodedPacket: (packet, metadata) =>
              this.handleAudioPacket(packet, metadata),
          },
          { timestampBase: 'synced-zero' },
        );
        this.audioTrackSource.errorPromise.catch((error) => this.handleFatalError(error));
        this.encoderOutput.addAudioTrack(this.audioTrackSource);
      }

      await this.encoderOutput.start();
      this.previewStream = new MediaStream([videoTrack]);
      this.patchTelemetry({
        width: dimensions.width,
        height: dimensions.height,
        fps: settings.fps,
        videoCodec: this.videoCodec,
        audioCodec: this.audioCodec ?? '',
        hasSystemAudio: Boolean(displayAudioTrack),
        hasMicrophone: Boolean(microphoneTrack),
      });
      this.setPhase('buffering');
      this.startTelemetryTimer();
    } catch (error) {
      await this.releaseMediaResources();
      const message = errorMessage(error);
      this.patchTelemetry({ error: message });
      this.setPhase('error');
      throw new Error(message);
    }
  }

  async stop(preserveRecovery = false): Promise<void> {
    if (!preserveRecovery) {
      this.recoveryGeneration += 1;
      this.recovering = false;
    }
    if (this.telemetry.phase === 'idle') return;
    this.stopping = true;
    if (this.manualWriter) await this.stopRecording().catch(() => undefined);
    await this.releaseMediaResources();
    this.clearPacketRing();
    this.settings = null;
    this.source = null;
    this.stopping = false;
    this.telemetry = { ...DEFAULT_TELEMETRY };
    this.emitTelemetry();
  }

  async startRecording(): Promise<void> {
    if (this.encoderOutput && !this.canMux()) {
      await this.waitUntilMuxReady(3_000);
    }
    if (!this.canMux() || !this.source || !this.settings) {
      throw new Error('먼저 리플레이 준비를 켜 주세요.');
    }
    if (this.manualWriter) return;
    const writer = new LivePacketWriter({
      kind: 'recording',
      sourceName: this.source.name,
      width: this.telemetry.width,
      height: this.telemetry.height,
      fps: this.settings.fps,
      videoCodec: this.videoCodec!,
      audioCodec: this.audioCodec,
      videoMetadata: this.videoMetadata!,
      audioMetadata: this.audioMetadata,
    });
    await writer.start();
    const latestKeyFrameIndex = findLatestKeyFrameIndex(this.videoPackets);
    if (latestKeyFrameIndex < 0) {
      await writer.cancel('녹화를 시작할 키프레임이 없습니다.');
      throw new Error('녹화를 시작할 키프레임이 없습니다. 잠시 후 다시 시도해 주세요.');
    }
    const primingVideoPackets = this.videoPackets
      .slice(latestKeyFrameIndex)
      .map((packet) => packet.clone());
    const primingTimestamp = primingVideoPackets[0].timestamp;
    const primingAudioPackets = this.audioPackets
      .filter((packet) => packet.timestamp >= primingTimestamp)
      .map((packet) => packet.clone());
    writer.prime(primingVideoPackets, primingAudioPackets);
    this.manualWriter = writer;
    this.recordingTimelineAtStart = this.videoPackets.at(-1)?.timestamp ?? primingTimestamp;
    this.recordingStartedAt = performance.now();
    this.setPhase('recording');
  }

  async stopRecording(): Promise<Clip | null> {
    const writer = this.manualWriter;
    if (!writer) return null;
    const desiredEndTimestamp =
      this.recordingTimelineAtStart +
      Math.max(0, performance.now() - this.recordingStartedAt) / 1000;
    await this.waitForVideoTimestamp(desiredEndTimestamp, 1_500);
    this.manualWriter = null;
    this.setPhase('saving');
    try {
      const clip = await writer.finish();
      this.clipListeners.forEach((listener) => listener(clip));
      await window.pulseClip.notify('녹화가 저장되었습니다', clip.title);
      return clip;
    } finally {
      this.recordingStartedAt = 0;
      this.recordingTimelineAtStart = 0;
      if (this.encoderOutput) this.setPhase('buffering');
    }
  }

  async saveReplay(seconds?: number): Promise<Clip> {
    if (this.savingReplay) throw new Error('이미 리플레이를 저장하고 있습니다.');
    if (!this.canMux() || !this.settings || !this.source) {
      throw new Error('먼저 리플레이 준비를 켜 주세요.');
    }
    const snapshot = this.createPacketSnapshot(seconds ?? this.settings.replaySeconds);
    this.savingReplay = true;
    if (!this.manualWriter) this.setPhase('saving');
    try {
      const clip = await writePacketSnapshot(snapshot, {
        kind: 'replay',
        sourceName: this.source.name,
        width: this.telemetry.width,
        height: this.telemetry.height,
        fps: this.settings.fps,
      });
      this.clipListeners.forEach((listener) => listener(clip));
      await window.pulseClip.notify(
        '리플레이가 저장되었습니다',
        `최근 ${Math.round(snapshot.durationSeconds)}초 · ${clip.title}`,
      );
      return clip;
    } finally {
      this.savingReplay = false;
      if (this.manualWriter) this.setPhase('recording');
      else if (this.encoderOutput) this.setPhase('buffering');
    }
  }

  private handleVideoPacket(
    packet: EncodedPacket,
    metadata: EncodedVideoChunkMetadata | undefined,
  ): void {
    if (metadata?.decoderConfig) this.videoMetadata = metadata;
    const copy = packet.clone();
    this.videoPackets.push(copy);
    this.videoPacketBytes += copy.byteLength;
    this.manualWriter?.pushVideo(copy);
    this.prunePacketRing(copy.timestamp);
  }

  private handleAudioPacket(
    packet: EncodedPacket,
    metadata: EncodedAudioChunkMetadata | undefined,
  ): void {
    if (metadata?.decoderConfig) this.audioMetadata = metadata;
    const copy = packet.clone();
    this.audioPackets.push(copy);
    this.audioPacketBytes += copy.byteLength;
    this.manualWriter?.pushAudio(copy);
  }

  private prunePacketRing(latestTimestamp: number): void {
    const replaySeconds = this.settings?.replaySeconds ?? 45;
    const keepAfter = latestTimestamp - replaySeconds - 2;
    if (keepAfter <= 0 || this.videoPackets.length < 2) return;

    let keepIndex = 0;
    for (let index = 0; index < this.videoPackets.length; index += 1) {
      const packet = this.videoPackets[index];
      if (packet.timestamp > keepAfter) break;
      if (packet.type === 'key') keepIndex = index;
    }
    if (keepIndex > 0) {
      const removed = this.videoPackets.splice(0, keepIndex);
      this.videoPacketBytes -= removed.reduce((sum, packet) => sum + packet.byteLength, 0);
    }
    const firstTimestamp = this.videoPackets[0]?.timestamp ?? keepAfter;
    let audioRemoveCount = 0;
    while (
      audioRemoveCount < this.audioPackets.length &&
      this.audioPackets[audioRemoveCount].timestamp < firstTimestamp
    ) {
      audioRemoveCount += 1;
    }
    if (audioRemoveCount > 0) {
      const removed = this.audioPackets.splice(0, audioRemoveCount);
      this.audioPacketBytes -= removed.reduce((sum, packet) => sum + packet.byteLength, 0);
    }
  }

  private createPacketSnapshot(requestedSeconds: number): PacketSnapshot {
    if (!this.canMux()) throw new Error('인코더 준비가 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.');
    const lastPacket = this.videoPackets.at(-1)!;
    const desiredStart = lastPacket.timestamp - requestedSeconds;
    let startIndex = -1;
    for (let index = 0; index < this.videoPackets.length; index += 1) {
      const packet = this.videoPackets[index];
      if (packet.type === 'key' && packet.timestamp <= desiredStart) startIndex = index;
      if (packet.timestamp > desiredStart) break;
    }
    if (startIndex < 0) {
      startIndex = this.videoPackets.findIndex((packet) => packet.type === 'key');
    }
    if (startIndex < 0) throw new Error('리플레이에 사용할 키프레임이 아직 없습니다.');
    const videoPackets = this.videoPackets.slice(startIndex).map((packet) => packet.clone());
    const baseTimestamp = videoPackets[0].timestamp;
    const endTimestamp = videoPackets.at(-1)!.timestamp + videoPackets.at(-1)!.duration;
    const audioPackets = this.audioPackets
      .filter(
        (packet) => packet.timestamp >= baseTimestamp && packet.timestamp <= endTimestamp,
      )
      .map((packet) => packet.clone());
    const durationSeconds = endTimestamp - baseTimestamp;
    if (durationSeconds < 1) throw new Error('저장할 리플레이가 아직 충분히 쌓이지 않았습니다.');
    return {
      videoPackets,
      audioPackets,
      videoMetadata: this.videoMetadata!,
      audioMetadata: this.audioMetadata ?? undefined,
      videoCodec: this.videoCodec!,
      audioCodec: this.audioCodec,
      baseTimestamp,
      durationSeconds,
    };
  }

  private canMux(): boolean {
    return Boolean(
      this.encoderOutput &&
        this.videoCodec &&
        this.videoMetadata?.decoderConfig &&
        (!this.audioCodec || this.audioMetadata?.decoderConfig) &&
        this.videoPackets.some((packet) => packet.type === 'key'),
    );
  }

  private async waitUntilMuxReady(timeoutMs: number): Promise<void> {
    const startedAt = performance.now();
    while (!this.canMux() && performance.now() - startedAt < timeoutMs) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
  }

  private async waitForVideoTimestamp(targetTimestamp: number, timeoutMs: number): Promise<void> {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const latestTimestamp = this.videoPackets.at(-1)?.timestamp ?? 0;
      if (latestTimestamp >= targetTimestamp - 0.25) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }

  private async createMixedAudioTrack(
    systemTrack: MediaStreamTrack | null,
    microphoneTrack: MediaStreamTrack | null,
    microphoneGain: number,
  ): Promise<MediaStreamTrack | null> {
    if (!systemTrack && !microphoneTrack) return null;
    if (systemTrack && !microphoneTrack) return systemTrack;
    if (!systemTrack && microphoneTrack && microphoneGain === 100) return microphoneTrack;

    this.mixedAudioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48_000,
    });
    const destination = this.mixedAudioContext.createMediaStreamDestination();
    if (systemTrack) {
      const source = this.mixedAudioContext.createMediaStreamSource(
        new MediaStream([systemTrack]),
      );
      source.connect(destination);
    }
    if (microphoneTrack) {
      const source = this.mixedAudioContext.createMediaStreamSource(
        new MediaStream([microphoneTrack]),
      );
      const gain = this.mixedAudioContext.createGain();
      gain.gain.value = microphoneGain / 100;
      source.connect(gain).connect(destination);
    }
    await this.mixedAudioContext.resume();
    return destination.stream.getAudioTracks()[0] ?? null;
  }

  private async releaseMediaResources(): Promise<void> {
    this.releasingMedia = true;
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
    if (this.telemetryTimer !== null) {
      window.clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    const output = this.encoderOutput;
    this.encoderOutput = null;
    // This output only feeds the in-memory replay ring through callbacks. It has
    // no file to finalize, so cancelling avoids waiting for an overloaded
    // encoder queue while the capture source is still producing frames.
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    if (output) await output.cancel().catch(() => undefined);
    this.videoTrackSource = null;
    this.audioTrackSource = null;
    this.previewStream = null;
    this.displayStream = null;
    this.microphoneStream = null;
    await this.mixedAudioContext?.close().catch(() => undefined);
    this.mixedAudioContext = null;
    this.releasingMedia = false;
  }

  private clearPacketRing(): void {
    this.videoPackets = [];
    this.audioPackets = [];
    this.videoPacketBytes = 0;
    this.audioPacketBytes = 0;
    this.videoMetadata = null;
    this.audioMetadata = null;
    this.videoCodec = null;
    this.audioCodec = null;
  }

  private startTelemetryTimer(): void {
    if (this.telemetryTimer !== null) window.clearInterval(this.telemetryTimer);
    this.telemetryTimer = window.setInterval(() => {
      const first = this.videoPackets[0];
      const last = this.videoPackets.at(-1);
      this.patchTelemetry({
        bufferSeconds: first && last ? Math.max(0, last.timestamp - first.timestamp) : 0,
        bufferBytes: this.videoPacketBytes + this.audioPacketBytes,
        recordingSeconds: this.recordingStartedAt
          ? (performance.now() - this.recordingStartedAt) / 1000
          : 0,
      });
    }, 250);
  }

  private handleFatalError(error: unknown): void {
    this.scheduleRecovery(errorMessage(error));
  }

  private scheduleRecovery(reason: string): void {
    if (
      this.stopping
      || this.releasingMedia
      || this.recovering
      || !this.source
      || !this.settings
    ) {
      return;
    }
    void this.recoverCapture(reason);
  }

  private watchDeviceChanges(settings: AppSettings): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
    if (!settings.microphone) return;

    this.deviceChangeHandler = () => {
      if (this.stopping || this.releasingMedia || this.recovering) return;
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        if (this.stopping || this.releasingMedia || this.recovering) return;
        const microphones = devices.filter((device) => device.kind === 'audioinput');
        const selectedAvailable = settings.microphoneDeviceId
          ? microphones.some((device) => device.deviceId === settings.microphoneDeviceId)
          : microphones.length > 0;
        if (!selectedAvailable) this.scheduleRecovery('선택한 마이크를 찾을 수 없습니다.');
      }).catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
  }

  private async recoverCapture(reason: string): Promise<void> {
    if (this.recovering || !this.source || !this.settings) return;

    const savedSource = this.source;
    const savedSettings = structuredClone(this.settings);
    const resumeRecording = this.manualWriter !== null;
    const generation = ++this.recoveryGeneration;
    const retryDelays = [400, 1_500, 3_000];
    let lastError: unknown = new Error(reason);
    this.recovering = true;
    this.patchTelemetry({
      recoveryState: 'recovering',
      recoveryAttempt: 0,
      recoveryMessage: reason,
      error: null,
    });
    this.setPhase('recovering');

    try {
      if (resumeRecording) {
        await this.stopRecording().catch((error) => {
          lastError = error;
        });
      }
      await this.stop(true);

      for (let index = 0; index < retryDelays.length; index += 1) {
        const attempt = index + 1;
        if (generation !== this.recoveryGeneration) return;
        this.patchTelemetry({
          phase: 'recovering',
          sourceName: savedSource.name,
          recoveryState: 'recovering',
          recoveryAttempt: attempt,
          recoveryMessage: `장치 연결을 복구하고 있습니다. ${attempt}/${retryDelays.length}`,
          error: null,
        });
        await delay(retryDelays[index]);
        if (generation !== this.recoveryGeneration) return;

        try {
          const sources = await window.pulseClip.listCaptureSources();
          const candidate = findRecoverySource(sources, savedSource);
          if (!candidate) throw new Error('기존 캡처 소스를 아직 찾을 수 없습니다.');

          const recoverySettings = structuredClone(savedSettings);
          if (recoverySettings.microphone && recoverySettings.microphoneDeviceId) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (shouldUseDefaultMicrophone(devices, recoverySettings.microphoneDeviceId)) {
              recoverySettings.microphoneDeviceId = '';
            }
          }

          // start() treats every visible active phase as a user-requested restart.
          // Keep the recovery UI visible until this point, then let start() own
          // the next emitted phase without performing a second teardown.
          this.telemetry = { ...this.telemetry, phase: 'idle' };
          await this.start(candidate, recoverySettings);
          if (generation !== this.recoveryGeneration) {
            await this.stop();
            return;
          }

          let recordingResumed = false;
          if (resumeRecording) {
            await this.waitUntilMuxReady(5_000);
            try {
              await this.startRecording();
              recordingResumed = true;
            } catch (error) {
              lastError = error;
            }
          }
          this.patchTelemetry({
            recoveryState: 'recovered',
            recoveryAttempt: attempt,
            recoveryMessage: resumeRecording
              ? recordingResumed
                ? '장치가 복구되어 새 파일로 녹화를 이어갑니다.'
                : `장치는 복구됐지만 녹화는 재개하지 못했습니다. ${errorMessage(lastError)}`
              : '장치 연결이 자동으로 복구되었습니다.',
            error: null,
          });
          return;
        } catch (error) {
          lastError = error;
          if (generation !== this.recoveryGeneration) {
            this.telemetry = { ...DEFAULT_TELEMETRY };
            this.emitTelemetry();
            return;
          }
          await this.releaseMediaResources();
          this.clearPacketRing();
        }
      }

      this.settings = savedSettings;
      this.source = savedSource;
      this.patchTelemetry({
        recoveryState: 'failed',
        recoveryAttempt: retryDelays.length,
        recoveryMessage: '장치를 자동으로 복구하지 못했습니다.',
        error: `${reason} ${errorMessage(lastError)}`,
      });
      this.setPhase('error');
    } finally {
      if (generation === this.recoveryGeneration) this.recovering = false;
      this.stopping = false;
    }
  }

  private setPhase(phase: EnginePhase): void {
    this.telemetry = { ...this.telemetry, phase };
    this.emitTelemetry();
  }

  private patchTelemetry(patch: Partial<CaptureTelemetry>): void {
    this.telemetry = { ...this.telemetry, ...patch };
    this.emitTelemetry();
  }

  private emitTelemetry(): void {
    const snapshot = { ...this.telemetry };
    this.telemetryListeners.forEach((listener) => listener(snapshot));
  }
}

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
}

class LivePacketWriter {
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
    const base = this.baseTimestamp!;
    const metadata = this.firstVideo ? this.options.videoMetadata : undefined;
    this.firstVideo = false;
    this.videoQueue = this.videoQueue
      .then(() =>
        this.videoSource!.add(packet.clone({ timestamp: packet.timestamp - base }), metadata),
      )
      .catch((error) => {
        this.failure = error;
      });
  }

  private enqueueAudio(packet: EncodedPacket): void {
    if (!this.audioSource || this.baseTimestamp === null) return;
    const metadata = this.firstAudio ? this.options.audioMetadata ?? undefined : undefined;
    this.firstAudio = false;
    const base = this.baseTimestamp;
    this.audioQueue = this.audioQueue
      .then(() =>
        this.audioSource!.add(
          packet.clone({ timestamp: Math.max(0, packet.timestamp - base) }),
          metadata,
        ),
      )
      .catch((error) => {
        this.failure = error;
      });
  }
}

async function writePacketSnapshot(
  snapshot: PacketSnapshot,
  details: {
    kind: 'replay';
    sourceName: string;
    width: number;
    height: number;
    fps: number;
  },
): Promise<Clip> {
  const session = await window.pulseClip.beginFile({
    ...details,
    codec: codecLabel(snapshot.videoCodec, snapshot.audioCodec),
  });
  const sink = new IpcAppendSink(session.sessionId);
  const videoSource = new EncodedVideoPacketSource(snapshot.videoCodec);
  const audioSource =
    snapshot.audioCodec && snapshot.audioPackets.length > 0 && snapshot.audioMetadata
      ? new EncodedAudioPacketSource(snapshot.audioCodec)
      : null;
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 1,
    }),
    target: new AppendOnlyStreamTarget(sink.writable),
  });
  output.addVideoTrack(videoSource, { frameRate: details.fps });
  if (audioSource) output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: 'PulseClip Replay', artist: 'PulseClip' });

  try {
    await output.start();
    await Promise.all([
      (async () => {
        for (let index = 0; index < snapshot.videoPackets.length; index += 1) {
          const packet = snapshot.videoPackets[index];
          await videoSource.add(
            packet.clone({ timestamp: packet.timestamp - snapshot.baseTimestamp }),
            index === 0 ? snapshot.videoMetadata : undefined,
          );
        }
        videoSource.close();
      })(),
      (async () => {
        if (!audioSource) return;
        for (let index = 0; index < snapshot.audioPackets.length; index += 1) {
          const packet = snapshot.audioPackets[index];
          await audioSource.add(
            packet.clone({
              timestamp: Math.max(0, packet.timestamp - snapshot.baseTimestamp),
            }),
            index === 0 ? snapshot.audioMetadata : undefined,
          );
        }
        audioSource.close();
      })(),
    ]);
    await output.finalize();
    return await window.pulseClip.finalizeFile(session.sessionId, {
      durationMs: snapshot.durationSeconds * 1000,
    });
  } catch (error) {
    await output.cancel().catch(() => undefined);
    await window.pulseClip.abortFile(session.sessionId, errorMessage(error));
    throw error;
  }
}

class IpcAppendSink {
  readonly writable: WritableStream<Uint8Array>;

  constructor(sessionId: string) {
    this.writable = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        const copy = chunk.slice();
        await window.pulseClip.appendFile(sessionId, copy.buffer as ArrayBuffer);
      },
    });
  }
}

function findLatestKeyFrameIndex(packets: EncodedPacket[]): number {
  for (let index = packets.length - 1; index >= 0; index -= 1) {
    if (packets[index].type === 'key') return index;
  }
  return -1;
}

function fitCaptureDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maximumWidth?: number,
  maximumHeight?: number,
): { width: number; height: number } {
  const safeWidth = Math.max(2, sourceWidth);
  const safeHeight = Math.max(2, sourceHeight);
  const scale = Math.min(
    1,
    maximumWidth ? maximumWidth / safeWidth : 1,
    maximumHeight ? maximumHeight / safeHeight : 1,
  );
  return {
    width: toEven(safeWidth * scale),
    height: toEven(safeHeight * scale),
  };
}

function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function codecLabel(video: VideoCodec, audio: AudioCodec | null): string {
  return audio ? `${video.toUpperCase()} / ${audio.toUpperCase()}` : video.toUpperCase();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '화면 또는 오디오 캡처 권한이 거부되었습니다.';
    if (error.name === 'NotReadableError') return '선택한 화면을 현재 캡처할 수 없습니다.';
  }
  if (error instanceof Error && error.message) return error.message;
  return '캡처 중 알 수 없는 오류가 발생했습니다.';
}
