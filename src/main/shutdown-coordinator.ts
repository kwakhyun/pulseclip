export type RendererShutdownResult = 'ready' | 'timeout';

export class RendererShutdownCoordinator {
  private ready = false;
  private waiter: (() => void) | null = null;

  markReady(): void {
    this.ready = true;
    this.waiter?.();
    this.waiter = null;
  }

  async wait(timeoutMs: number): Promise<RendererShutdownResult> {
    if (this.ready) return 'ready';

    return new Promise<RendererShutdownResult>((resolve) => {
      let settled = false;
      const finish = (result: RendererShutdownResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.waiter === ready) this.waiter = null;
        resolve(result);
      };
      const ready = () => finish('ready');
      const timer = setTimeout(() => finish('timeout'), Math.max(0, timeoutMs));
      this.waiter = ready;

      if (this.ready) ready();
    });
  }
}
