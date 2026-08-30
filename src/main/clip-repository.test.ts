import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClipRepository, isRecoverableFragmentedMp4 } from './clip-repository';
import { Logger } from './logger';
import type { SettingsStore } from './settings-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('ClipRepository metadata recovery', () => {
  it('persists a replacement UUID so malformed sidecars remain playable and actionable', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const fileName = 'PulseClip_2026-08-31_00-00-00_Recording.mp4';
    const filePath = path.join(directory, fileName);
    const sidecarPath = `${filePath}.pulseclip.json`;
    await writeFile(filePath, Buffer.alloc(4_096, 1));
    await writeFile(sidecarPath, JSON.stringify({
      schemaVersion: 1,
      id: 'broken-id',
      fileName,
      title: '복구 대상',
      kind: 'recording',
      createdAt: '2026-08-31T00:00:00.000Z',
      durationMs: 1_000,
      sourceName: '화면 1',
      width: 1920,
      height: 1080,
      fps: 60,
      codec: 'H.264',
      bytes: 4_096,
      favorite: false,
      recovered: false,
    }), 'utf8');

    const settings = {
      get: () => ({ outputFolder: directory, storageLimitGb: 20 }),
    } as unknown as SettingsStore;
    const repository = new ClipRepository(settings, new Logger(directory));

    const first = await repository.list();
    const second = await repository.list();
    const persisted = JSON.parse(await readFile(sidecarPath, 'utf8')) as { id: string };

    expect(first).toHaveLength(1);
    expect(first[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second[0].id).toBe(first[0].id);
    expect(persisted.id).toBe(first[0].id);
    await expect(repository.resolveMediaPath(first[0].id)).resolves.toBe(filePath);
  });

  it('only accepts a complete fragmented MP4 segment for automatic recovery', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const validPath = path.join(directory, 'valid.mp4.part');
    const invalidPath = path.join(directory, 'invalid.mp4.part');
    const valid = Buffer.concat([
      mp4Box('ftyp', Buffer.from('isom0000')),
      mp4Box('moov'),
      mp4Box('moof'),
      mp4Box('mdat', Buffer.alloc(32, 1)),
    ]);
    await writeFile(validPath, valid);
    await writeFile(invalidPath, Buffer.alloc(8_192, 1));

    await expect(isRecoverableFragmentedMp4(validPath, valid.length)).resolves.toBe(true);
    await expect(isRecoverableFragmentedMp4(invalidPath, 8_192)).resolves.toBe(false);
  });

  it('preserves an unrecognized part file instead of exposing a broken clip', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const partName = 'PulseClip_2026-08-31_00-00-00_Recording.mp4.part';
    const partPath = path.join(directory, partName);
    await writeFile(partPath, Buffer.alloc(8_192, 1));
    const settings = {
      get: () => ({ outputFolder: directory, storageLimitGb: 20 }),
    } as unknown as SettingsStore;
    const repository = new ClipRepository(settings, new Logger(directory));

    await expect(repository.recoverPartFiles()).resolves.toBe(0);
    await expect(readFile(partPath)).resolves.toHaveLength(8_192);
    await expect(repository.list()).resolves.toHaveLength(0);
  });
});

function mp4Box(type: string, payload = Buffer.alloc(0)): Buffer {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, 4, 'ascii');
  payload.copy(box, 8);
  return box;
}
