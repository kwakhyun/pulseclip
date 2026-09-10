import type { VideoCodec, AudioCodec } from 'mediabunny';

export function codecLabel(video: VideoCodec, audio: AudioCodec | null): string {
  return audio ? `${video.toUpperCase()} / ${audio.toUpperCase()}` : video.toUpperCase();
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '화면 또는 오디오 캡처 권한이 거부되었습니다.';
    if (error.name === 'NotReadableError') return '선택한 화면을 현재 캡처할 수 없습니다.';
  }
  if (error instanceof Error && error.message) return error.message;
  return '캡처 중 알 수 없는 오류가 발생했습니다.';
}
