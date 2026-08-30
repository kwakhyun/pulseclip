import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from './logger';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Logger', () => {
  it('replaces the previous backup instead of allowing the active log to grow forever', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-logger-'));
    temporaryDirectories.push(directory);
    const logger = new Logger(directory, 1);

    logger.info('first rotation');
    await logger.flush();
    logger.info('second rotation');
    await logger.flush();
    logger.info('active entry');
    await logger.flush();

    const active = await readFile(path.join(directory, 'pulseclip.log'), 'utf8');
    const backup = await readFile(path.join(directory, 'pulseclip.log.1'), 'utf8');
    expect(active).toContain('active entry');
    expect(backup).toContain('second rotation');
    expect(backup).not.toContain('first rotation');
  });

  it('serializes nested errors and circular diagnostic context without throwing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-logger-'));
    temporaryDirectories.push(directory);
    const logger = new Logger(directory);
    const context: { error: Error; self?: unknown } = { error: new Error('device lost') };
    context.self = context;

    expect(() => logger.error('capture failed', context)).not.toThrow();
    await logger.flush();

    const entry = JSON.parse(
      await readFile(path.join(directory, 'pulseclip.log'), 'utf8'),
    ) as { context: { error: { message: string }; self: string } };
    expect(entry.context.error.message).toBe('device lost');
    expect(entry.context.self).toBe('[Circular]');
  });
});
