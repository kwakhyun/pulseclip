import { afterEach, describe, expect, it, vi } from 'vitest';
import { RendererShutdownCoordinator } from './shutdown-coordinator';

afterEach(() => {
  vi.useRealTimers();
});

describe('RendererShutdownCoordinator', () => {
  it('accepts a renderer acknowledgement that arrives before waiting', async () => {
    const coordinator = new RendererShutdownCoordinator();

    coordinator.markReady();

    await expect(coordinator.wait(5_000)).resolves.toBe('ready');
  });

  it('resolves when the renderer acknowledges an active shutdown request', async () => {
    vi.useFakeTimers();
    const coordinator = new RendererShutdownCoordinator();
    const result = coordinator.wait(5_000);

    coordinator.markReady();

    await expect(result).resolves.toBe('ready');
  });

  it('times out so the main process can preserve unfinished part files', async () => {
    vi.useFakeTimers();
    const coordinator = new RendererShutdownCoordinator();
    const result = coordinator.wait(5_000);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toBe('timeout');
  });
});
