import type { CaptureTelemetry, Clip } from '../shared/types';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function formatClock(secondsValue: number): string {
  return formatDuration(secondsValue * 1000);
}

export function relativeDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const difference = now.getTime() - date.getTime();
  if (difference < 60_000) return '방금 전';
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}분 전`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}시간 전`;
  if (difference < 7 * 86_400_000) return `${Math.floor(difference / 86_400_000)}일 전`;
  return new Intl.DateTimeFormat('ko-KR', {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function phaseLabel(phase: CaptureTelemetry['phase']): string {
  switch (phase) {
    case 'idle':
      return '대기 중';
    case 'starting':
      return '캡처 연결 중';
    case 'recovering':
      return '장치 복구 중';
    case 'buffering':
      return '리플레이 준비됨';
    case 'recording':
      return '녹화 중';
    case 'saving':
      return '파일 저장 중';
    case 'error':
      return '확인 필요';
  }
}

export function clipKindLabel(kind: Clip['kind']): string {
  if (kind === 'replay') return '리플레이';
  if (kind === 'recovered') return '복구됨';
  return '녹화';
}

export function sourceInitial(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9가-힣]/g, '');
  return cleaned.slice(0, 2).toUpperCase() || 'PC';
}
