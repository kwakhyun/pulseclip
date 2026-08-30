import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from './logger';
import { SettingsStore } from './settings-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('SettingsStore persistence', () => {
  it('preserves malformed settings before restoring safe defaults', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-settings-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const outputFolder = path.join(directory, 'clips');
    await writeFile(filePath, '{broken json', 'utf8');
    const store = new SettingsStore(filePath, outputFolder, new Logger(directory));

    const loaded = await store.load();
    const entries = await readdir(directory);
    const backup = entries.find((entry) => entry.startsWith('settings.json.corrupt-'));

    expect(loaded.outputFolder).toBe(outputFolder);
    expect(backup).toBeDefined();
    expect(await readFile(path.join(directory, backup!), 'utf8')).toBe('{broken json');
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      outputFolder,
    });
  });

  it('keeps the previous in-memory settings when an update cannot be persisted', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-settings-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const store = new SettingsStore(filePath, path.join(directory, 'clips'), new Logger(directory));
    const before = store.get();
    await mkdir(`${filePath}.tmp`);

    await expect(store.update({ fps: before.fps === 60 ? 30 : 60 })).rejects.toThrow();

    expect(store.get()).toEqual(before);
  });

  it('does not switch output folders until the new settings file is durable', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pulseclip-settings-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'settings.json');
    const originalFolder = path.join(directory, 'original-clips');
    const nextFolder = path.join(directory, 'next-clips');
    const store = new SettingsStore(filePath, originalFolder, new Logger(directory));
    await mkdir(`${filePath}.tmp`);

    await expect(store.setOutputFolder(nextFolder)).rejects.toThrow();

    expect(store.get().outputFolder).toBe(originalFolder);
  });
});
