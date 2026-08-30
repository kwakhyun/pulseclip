export type RendererCrashAction = 'reload' | 'stop';

export class RendererCrashPolicy {
  private readonly attempts: number[] = [];

  constructor(
    private readonly maxReloads: number,
    private readonly windowMs: number,
  ) {
    if (!Number.isInteger(maxReloads) || maxReloads < 0) {
      throw new Error('maxReloads must be a non-negative integer');
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be greater than zero');
    }
  }

  register(now = Date.now()): RendererCrashAction {
    const cutoff = now - this.windowMs;
    while (this.attempts[0] !== undefined && this.attempts[0] <= cutoff) {
      this.attempts.shift();
    }
    this.attempts.push(now);
    return this.attempts.length <= this.maxReloads ? 'reload' : 'stop';
  }
}
