export const MIN_TRIM_SECONDS = 0.25;

export function validateTrimRange(start: number, end: number, duration: number): void {
  if (![start, end, duration].every(Number.isFinite) || start < 0 ||
      end - start < MIN_TRIM_SECONDS || end > duration + 0.05 || duration <= 0) {
    throw new Error('영상 범위 안에서 0.25초 이상의 구간을 선택해 주세요.');
  }
}
