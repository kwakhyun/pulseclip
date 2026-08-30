import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createDefaultSettings,
  sanitizeSettings,
} from '../shared/settings';
import type { AppSettings } from '../shared/types';
import type { Logger } from './logger';

export class SettingsStore {
  private value: AppSettings;

  constructor(
    private readonly filePath: string,
    defaultOutputFolder: string,
    private readonly logger: Logger,
  ) {
    this.value = createDefaultSettings(defaultOutputFolder);
  }

  get(): AppSettings {
    return structuredClone(this.value);
  }

  async load(): Promise<AppSettings> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (!isFileNotFound(error)) {
        this.logger.error('Could not read settings file', error);
        throw error;
      }
      this.logger.info('Creating a fresh settings file');
      await this.persist(this.value);
      return this.get();
    }

    try {
      this.value = sanitizeSettings(JSON.parse(raw), this.value);
    } catch (error) {
      const backupPath = `${this.filePath}.corrupt-${timestampForFileName()}`;
      await rename(this.filePath, backupPath);
      this.logger.warn('Preserved a corrupt settings file and restored defaults', {
        backupPath,
        error,
      });
      await this.persist(this.value);
    }
    return this.get();
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = this.value;
    const nextInput: Partial<AppSettings> = {
      ...current,
      ...patch,
      outputFolder: current.outputFolder,
      hotkeys: {
        ...current.hotkeys,
        ...(patch.hotkeys ?? {}),
      },
    };
    const next = sanitizeSettings(nextInput, current);
    await this.persist(next);
    this.value = next;
    return this.get();
  }

  async setOutputFolder(outputFolder: string): Promise<AppSettings> {
    if (!path.isAbsolute(outputFolder) || outputFolder.includes('\0')) {
      throw new Error('출력 폴더 경로가 올바르지 않습니다.');
    }
    const next = sanitizeSettings(
      { ...this.value, outputFolder: path.normalize(outputFolder) },
      this.value,
    );
    await mkdir(next.outputFolder, { recursive: true });
    await this.persist(next);
    this.value = next;
    return this.get();
  }

  private async persist(value = this.value): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}

function isFileNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
