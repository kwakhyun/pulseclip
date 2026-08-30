import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    logDirectory: string,
    private readonly maxFileBytes = 5 * 1024 * 1024,
  ) {
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
      if (details.size < this.maxFileBytes) return;
      const backupPath = `${this.filePath}.1`;
      await rm(backupPath, { force: true });
      await rename(this.filePath, backupPath);
    } catch {
      // The log does not exist yet.
    }
  }
}

function serializeContext(context: unknown): unknown {
  if (context === undefined) return undefined;
  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(context, (_key, value: unknown) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return serialized === undefined ? String(context) : JSON.parse(serialized);
  } catch {
    return '[Unserializable context]';
  }
}
