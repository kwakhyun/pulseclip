import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
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
      // The logger may still append to its file while the directory is removed.
      rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }),
    ),
  );
});

describe('ClipRepository metadata recovery', () => {
  it('preserves concurrent metadata edits and protects in-use originals from cleanup and deletion', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'PulseClip_test_Recording.mp4');
    await writeFile(filePath, Buffer.alloc(4096));
    const config = { outputFolder: directory, storageLimitGb: 0.000001, autoCleanup: true };
    const settings = { get: () => config } as unknown as SettingsStore;
    const repository = new ClipRepository(settings, new Logger(directory));
    const clip = await repository.registerCompletedFile(filePath, { kind: 'recording', sourceName: 'Test', width: 640, height: 360, fps: 30, codec: 'AVC' }, 3000);
    await Promise.all([repository.rename(clip.id, '하이라이트'), repository.setFavorite(clip.id, true)]);
    expect(await repository.get(clip.id)).toMatchObject({ title: '하이라이트', favorite: true });
    await repository.setFavorite(clip.id, false);
    const release = repository.protect(clip.id);
    await repository.enforceQuota();
    await expect(repository.delete(clip.id)).rejects.toThrow('내보내는 중');
    expect(await repository.list()).toHaveLength(1);
    release(); release();
    config.autoCleanup = false;
    await repository.enforceQuota();
    expect(await repository.list()).toHaveLength(1);
    config.autoCleanup = true;
    await repository.enforceQuota();
    expect(await repository.list()).toHaveLength(0);
  });
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

  it('moves manual deletes to the Recycle Bin and never deletes permanently without being asked', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const settings = { get: () => ({ outputFolder: directory, storageLimitGb: 20, autoCleanup: true }) } as unknown as SettingsStore;
    const recycleBin = new Map<string, Buffer>();
    let trashAvailable = true;
    const repository = new ClipRepository(settings, new Logger(directory), {
      trash: async filePath => {
        // Windows also refuses files larger than the Recycle Bin allows.
        if (!trashAvailable) throw new Error('File is too big for the Recycle Bin');
        recycleBin.set(filePath, await readFile(filePath));
        await rm(filePath);
      },
    });
    const request = { kind: 'replay' as const, sourceName: 'Test', width: 640, height: 360, fps: 30, codec: 'AVC' };
    for (const name of ['PulseClip_a_Replay.mp4', 'PulseClip_b_Replay.mp4']) await writeFile(path.join(directory, name), Buffer.alloc(1024));
    const first = await repository.registerCompletedFile(path.join(directory, 'PulseClip_a_Replay.mp4'), request, 1000);
    const second = await repository.registerCompletedFile(path.join(directory, 'PulseClip_b_Replay.mp4'), request, 1000);
    await repository.rename(first.id, '보스 처치');
    await repository.setFavorite(first.id, true);

    await expect(repository.delete(first.id)).resolves.toBe('trashed');
    expect([...recycleBin.keys()].map(file => path.basename(file))).toEqual(['PulseClip_a_Replay.mp4']);
    expect((await repository.list()).map(clip => clip.id)).toEqual([second.id]);
    // Restoring the MP4 from the Recycle Bin brings back its name and favorite.
    for (const [file, bytes] of recycleBin) await writeFile(file, bytes);
    expect(await repository.get(first.id)).toMatchObject({ title: '보스 처치', favorite: true, kind: 'replay' });

    trashAvailable = false;
    await expect(repository.delete(second.id)).resolves.toBe('trash-unavailable');
    expect(await repository.get(second.id)).toMatchObject({ id: second.id });
    await expect(repository.delete(second.id, true)).resolves.toBe('deleted');
    expect((await repository.list()).map(clip => clip.id)).toEqual([first.id]);
  });

  it('prunes metadata of clips that stayed in the Recycle Bin for a month', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const settings = { get: () => ({ outputFolder: directory, storageLimitGb: 20, autoCleanup: true }) } as unknown as SettingsStore;
    const repository = new ClipRepository(settings, new Logger(directory), { trash: filePath => rm(filePath) });
    const request = { kind: 'replay' as const, sourceName: 'Test', width: 640, height: 360, fps: 30, codec: 'AVC' };
    const names = ['PulseClip_old_Replay.mp4', 'PulseClip_new_Replay.mp4'];
    for (const name of names) {
      await writeFile(path.join(directory, name), Buffer.alloc(1024));
      const clip = await repository.registerCompletedFile(path.join(directory, name), request, 1000);
      await repository.delete(clip.id);
    }
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await utimes(path.join(directory, `${names[0]}.pulseclip.json`), old, old);

    await repository.recoverPartFiles();
    await expect(stat(path.join(directory, `${names[0]}.pulseclip.json`))).rejects.toThrow();
    await expect(stat(path.join(directory, `${names[1]}.pulseclip.json`))).resolves.toBeTruthy();
  });

  it('reports automatic cleanup so people know which clips disappeared', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-clips-'));
    temporaryDirectories.push(directory);
    const settings = { get: () => ({ outputFolder: directory, storageLimitGb: 2048 / 1024 ** 3, autoCleanup: true }) } as unknown as SettingsStore;
    const reports: unknown[] = [];
    const trash = async () => { throw new Error('cleanup must free space, not use the Recycle Bin'); };
    const repository = new ClipRepository(settings, new Logger(directory), { trash, onCleanup: result => reports.push(result) });
    const request = { kind: 'replay' as const, sourceName: 'Test', width: 640, height: 360, fps: 30, codec: 'AVC' };
    for (const name of ['PulseClip_1_Replay.mp4', 'PulseClip_2_Replay.mp4', 'PulseClip_3_Replay.mp4']) {
      await writeFile(path.join(directory, name), Buffer.alloc(1024));
      await repository.registerCompletedFile(path.join(directory, name), request, 1000);
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    await expect(repository.enforceQuota()).resolves.toEqual({ count: 2, bytes: 2048 });
    expect(reports).toEqual([{ count: 2, bytes: 2048 }]);
    await expect(repository.enforceQuota()).resolves.toEqual({ count: 0, bytes: 0 });
    expect(reports).toHaveLength(1);
  });
});

function mp4Box(type: string, payload = Buffer.alloc(0)): Buffer {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, 4, 'ascii');
  payload.copy(box, 8);
  return box;
}
