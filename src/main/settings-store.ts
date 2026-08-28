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
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.value = sanitizeSettings(JSON.parse(raw), this.value);
    } catch (error) {
      this.logger.info('Creating a fresh settings file', error);
      await this.persist();
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
    this.value = sanitizeSettings(nextInput, current);
    await this.persist();
    return this.get();
  }

  async setOutputFolder(outputFolder: string): Promise<AppSettings> {
    if (!path.isAbsolute(outputFolder) || outputFolder.includes('\0')) {
      throw new Error('출력 폴더 경로가 올바르지 않습니다.');
    }
    this.value = sanitizeSettings(
      { ...this.value, outputFolder: path.normalize(outputFolder) },
      this.value,
    );
    await mkdir(this.value.outputFolder, { recursive: true });
    await this.persist();
    return this.get();
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(this.value, null, 2), 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}
