import { mkdir, rename, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(logDirectory: string) {
    this.filePath = path.join(logDirectory, 'pulseclip.log');
  }

  debug(message: string, context?: unknown): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: unknown): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: unknown): void {
    this.write('error', message, context);
  }

  flush(): Promise<void> {
    return this.queue;
  }

  private write(level: LogLevel, message: string, context?: unknown): void {
    const entry = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context: serializeContext(context),
    })}\n`;

    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await this.rotateIfNeeded();
        await appendFile(this.filePath, entry, 'utf8');
      })
      .catch(() => undefined);
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const details = await stat(this.filePath);
      if (details.size < 5 * 1024 * 1024) return;
      await rename(this.filePath, `${this.filePath}.1`).catch(() => undefined);
    } catch {
      // The log does not exist yet.
    }
  }
}

function serializeContext(context: unknown): unknown {
  if (context instanceof Error) {
    return {
      name: context.name,
      message: context.message,
      stack: context.stack,
    };
  }
  return context;
}
