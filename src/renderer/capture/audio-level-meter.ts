export interface AudioLevels {
  /** 0..1, perceptual level of Windows system audio, or null when not captured. */
  system: number | null;
  /** 0..1, perceptual level of the microphone after gain, or null when not captured. */
  microphone: number | null;
}

/**
 * Taps the captured tracks with analyser nodes so people can see that game
 * sound and voice are really arriving before they rely on a clip. The meter
 * has no output and never touches the encoded audio path.
 */
export class AudioLevelMeter {
  private readonly context: AudioContext;
  private readonly system: AnalyserNode | null;
  private readonly microphone: AnalyserNode | null;
  private readonly samples = new Float32Array(1024);

  constructor(
    systemTrack: MediaStreamTrack | null,
    microphoneTrack: MediaStreamTrack | null,
    private readonly microphoneGain: number,
  ) {
    // `sinkId: none` keeps the meter off the speakers; it only analyses input.
    this.context = new AudioContext({ latencyHint: 'playback', sinkId: { type: 'none' } } as AudioContextOptions);
    this.system = systemTrack ? this.tap(systemTrack) : null;
    this.microphone = microphoneTrack ? this.tap(microphoneTrack) : null;
    void this.context.resume().catch(() => undefined);
  }

  read(): AudioLevels {
    return {
      system: this.system ? this.level(this.system, 1) : null,
      microphone: this.microphone ? this.level(this.microphone, this.microphoneGain / 100) : null,
    };
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => undefined);
  }

  private tap(track: MediaStreamTrack): AnalyserNode {
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    this.context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    return analyser;
  }

  private level(analyser: AnalyserNode, gain: number): number {
    analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    return levelFromRms(Math.sqrt(sum / this.samples.length) * gain);
  }
}

/** Maps RMS amplitude to 0..1 over a -60 dBFS..0 dBFS range. */
export function levelFromRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const decibels = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (decibels + 60) / 60));
}
