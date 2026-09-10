import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../shared/settings';
import { buildClipFileName, ClipRepository } from './clip-repository';
import { WriteSessionManager } from './write-session-manager';
import type { SettingsStore } from './settings-store';
import type { DiskSafetyService } from './disk-safety';
import { Logger } from './logger';

const directories: string[] = [];
const loggers: Logger[] = [];
afterEach(async () => {
  await Promise.all(loggers.splice(0).map(logger => logger.flush()));
  await Promise.all(directories.splice(0).map(folder => rm(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});
const request = { kind: 'recording' as const, sourceName: 'Test', width: 640, height: 360, fps: 30, codec: 'AVC' };
async function setup(limit = 20) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-writer-')); directories.push(folder);
  const settings = { get: () => ({ ...createDefaultSettings(folder), storageLimitGb: limit }) } as SettingsStore;
  const logger = new Logger(path.join(folder, 'logs'));
  loggers.push(logger);
  const clips = new ClipRepository(settings, logger);
  const safety = { assertCanStart: vi.fn().mockResolvedValue({}) };
  const writer = new WriteSessionManager(settings, clips, logger, safety as unknown as DiskSafetyService, () => {});
  return { folder, clips, writer, safety };
}

describe('durable write sessions', () => {
  it('reserves distinct paths for concurrent starts and leaves existing partial recordings intact', async () => {
    const { folder, writer } = await setup();
    const existing = path.join(folder, `${buildClipFileName('recording')}.part`);
    await writeFile(existing, 'existing recording');
    const [a, b] = await Promise.all([writer.begin(request), writer.begin(request)]);
    expect(a.sessionId).not.toBe(b.sessionId);
    await Promise.all([writer.append(a.sessionId, new Uint8Array([1, 2]).buffer), writer.append(b.sessionId, new Uint8Array([3, 4]).buffer)]);
    await writer.shutdown();
    expect(await readFile(existing, 'utf8')).toBe('existing recording');
    expect((await readdir(folder)).filter(name => name.endsWith('.part'))).toHaveLength(3);
  });

  it('serializes appends and coalesces duplicate finalization without deleting the just-saved oversized clip', async () => {
    const { folder, writer, clips } = await setup(0.000001);
    const { sessionId } = await writer.begin(request);
    await Promise.all([writer.append(sessionId, new Uint8Array(1024).fill(1).buffer), writer.append(sessionId, new Uint8Array(1024).fill(2).buffer)]);
    const [a, b] = await Promise.all([writer.finalize(sessionId, { durationMs: 3000 }), writer.finalize(sessionId, { durationMs: 3000 })]);
    expect(a.id).toBe(b.id);
    const bytes = await readFile(path.join(folder, a.fileName));
    expect([...bytes.subarray(1020, 1028)]).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(await clips.list()).toHaveLength(1);
    expect(writer.hasActiveSessions()).toBe(false);
  });

  it('discards explicitly canceled edits and releases their source protection', async () => {
    const { folder, writer } = await setup();
    const release = vi.fn();
    const { sessionId } = await writer.begin({ ...request, kind: 'edited' }, true, release);
    await writer.append(sessionId, new Uint8Array([1, 2]).buffer);
    await Promise.all([writer.abort(sessionId, 'cancel'), writer.abort(sessionId, 'cancel')]);
    expect((await readdir(folder)).filter(name => name.endsWith('.part'))).toHaveLength(0);
    expect(release).toHaveBeenCalledOnce();
  });

  it('drains pending starts on shutdown and accepts new writes after cleanup', async () => {
    const { writer, safety } = await setup();
    let allowStart!: () => void;
    safety.assertCanStart.mockImplementationOnce(() => new Promise<void>(resolve => { allowStart = resolve; }));
    const starting = writer.begin(request);
    await vi.waitFor(() => expect(allowStart).toBeTypeOf('function'));
    const shutdown = writer.shutdown('renderer closed');
    await expect(writer.begin(request)).rejects.toThrow('정리하고 있습니다');
    allowStart();
    await starting;
    await shutdown;
    expect(writer.hasActiveSessions()).toBe(false);
    const next = await writer.begin(request);
    await writer.abort(next.sessionId);
    expect(writer.hasActiveSessions()).toBe(false);
  });
});
