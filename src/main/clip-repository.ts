import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  BeginFileRequest,
  Clip,
  ClipKind,
  StorageStats,
} from '../shared/types';
import type { SettingsStore } from './settings-store';
import type { Logger } from './logger';
import { isUuid } from './input-validation';

interface StoredClip extends Omit<Clip, 'mediaUrl'> {
  schemaVersion: 1;
}

const VIDEO_PREFIX = 'PulseClip_';
const SIDECAR_SUFFIX = '.pulseclip.json';

export class ClipRepository {
  constructor(
    private readonly settings: SettingsStore,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<Clip[]> {
    const folder = this.settings.get().outputFolder;
    await mkdir(folder, { recursive: true });
    const entries = await readdir(folder, { withFileTypes: true });
    const clips: Clip[] = [];

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.startsWith(VIDEO_PREFIX) ||
        !entry.name.toLowerCase().endsWith('.mp4')
      ) {
        continue;
      }
      const filePath = path.join(folder, entry.name);
      try {
        clips.push(await this.readOrCreateMetadata(filePath));
      } catch (error) {
        this.logger.warn('Skipping unreadable clip', { filePath, error });
      }
    }

    return clips.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  async get(id: string): Promise<Clip | null> {
    const clips = await this.list();
    return clips.find((clip) => clip.id === id) ?? null;
  }

  async resolveMediaPath(id: string): Promise<string | null> {
    const clip = await this.get(id);
    if (!clip) return null;
    return path.join(this.settings.get().outputFolder, clip.fileName);
  }

  async registerCompletedFile(
    filePath: string,
    request: BeginFileRequest,
    durationMs: number,
    recovered = false,
  ): Promise<Clip> {
    const details = await stat(filePath);
    const createdAt = new Date().toISOString();
    const kind: ClipKind = recovered ? 'recovered' : request.kind;
    const stored: StoredClip = {
      schemaVersion: 1,
      id: randomUUID(),
      fileName: path.basename(filePath),
      title: createTitle(kind, createdAt),
      kind,
      createdAt,
      durationMs: Math.max(0, Math.round(durationMs)),
      sourceName: cleanText(request.sourceName, '알 수 없는 소스'),
      width: boundedInteger(request.width, 0, 16384),
      height: boundedInteger(request.height, 0, 16384),
      fps: boundedInteger(request.fps, 0, 240),
      codec: cleanText(request.codec, 'unknown'),
      bytes: details.size,
      favorite: false,
      recovered,
    };
    await this.writeMetadata(filePath, stored);
    return withMediaUrl(stored);
  }

  async setFavorite(id: string, favorite: boolean): Promise<Clip> {
    const clip = await this.get(id);
    if (!clip) throw new Error('클립을 찾을 수 없습니다.');
    const filePath = path.join(this.settings.get().outputFolder, clip.fileName);
    const stored: StoredClip = {
      ...clip,
      schemaVersion: 1,
      favorite: Boolean(favorite),
    };
    delete (stored as Partial<Clip>).mediaUrl;
    await this.writeMetadata(filePath, stored);
    return withMediaUrl(stored);
  }

  async delete(id: string): Promise<void> {
    const clip = await this.get(id);
    if (!clip) throw new Error('클립을 찾을 수 없습니다.');
    const filePath = path.join(this.settings.get().outputFolder, clip.fileName);
    await rm(filePath, { force: false });
    await rm(metadataPath(filePath), { force: true });
    this.logger.info('Clip deleted', { id, fileName: clip.fileName });
  }

  async storageStats(clips?: Clip[]): Promise<StorageStats> {
    const current = clips ?? (await this.list());
    const today = new Date();
    const bytesUsed = current.reduce((sum, clip) => sum + clip.bytes, 0);
    return {
      bytesUsed,
      limitBytes: this.settings.get().storageLimitGb * 1024 ** 3,
      clipCount: current.length,
      favoriteCount: current.filter((clip) => clip.favorite).length,
      todayCount: current.filter((clip) => isSameLocalDay(clip.createdAt, today)).length,
    };
  }

  async enforceQuota(): Promise<void> {
    const clips = await this.list();
    const limit = this.settings.get().storageLimitGb * 1024 ** 3;
    let used = clips.reduce((sum, clip) => sum + clip.bytes, 0);
    if (used <= limit) return;

    const target = limit * 0.9;
    const candidates = clips
      .filter((clip) => !clip.favorite)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    for (const clip of candidates) {
      if (used <= target) break;
      try {
        await this.delete(clip.id);
        used -= clip.bytes;
      } catch (error) {
        this.logger.warn('Quota cleanup could not delete a clip', {
          id: clip.id,
          error,
        });
      }
    }
  }

  async recoverPartFiles(): Promise<number> {
    const folder = this.settings.get().outputFolder;
    await mkdir(folder, { recursive: true });
    const entries = await readdir(folder, { withFileTypes: true });
    let recoveredCount = 0;

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.startsWith(VIDEO_PREFIX) ||
        !entry.name.endsWith('.mp4.part')
      ) {
        continue;
      }
      const partPath = path.join(folder, entry.name);
      try {
        const details = await stat(partPath);
        if (!(await isRecoverableFragmentedMp4(partPath, details.size))) {
          this.logger.warn('Interrupted file is not a recoverable fragmented MP4; preserving part file', {
            partPath,
            bytes: details.size,
          });
          continue;
        }
        const finalPath = await uniqueRecoveredPath(folder, entry.name.slice(0, -5));
        await rename(partPath, finalPath);
        await this.registerCompletedFile(
          finalPath,
          {
            kind: 'recording',
            sourceName: '비정상 종료에서 복구됨',
            width: 0,
            height: 0,
            fps: 0,
            codec: 'unknown',
          },
          0,
          true,
        );
        recoveredCount += 1;
      } catch (error) {
        this.logger.warn('Failed to recover an interrupted file', {
          partPath,
          error,
        });
      }
    }
    return recoveredCount;
  }

  private async readOrCreateMetadata(filePath: string): Promise<Clip> {
    const sidecarPath = metadataPath(filePath);
    try {
      const raw = JSON.parse(await readFile(sidecarPath, 'utf8')) as unknown;
      const stored = await sanitizeStoredClip(raw, filePath);
      if (!stored) throw new Error('Invalid metadata');
      if (!isValidClipId((raw as Partial<StoredClip>).id)) {
        await this.writeMetadata(filePath, stored);
      }
      return withMediaUrl(stored);
    } catch {
      const details = await stat(filePath);
      const createdAt = details.birthtime.toISOString();
      const stored: StoredClip = {
        schemaVersion: 1,
        id: randomUUID(),
        fileName: path.basename(filePath),
        title: createTitle('recovered', createdAt),
        kind: 'recovered',
        createdAt,
        durationMs: 0,
        sourceName: '메타데이터가 없는 클립',
        width: 0,
        height: 0,
        fps: 0,
        codec: 'unknown',
        bytes: details.size,
        favorite: false,
        recovered: true,
      };
      await this.writeMetadata(filePath, stored);
      return withMediaUrl(stored);
    }
  }

  private async writeMetadata(filePath: string, metadata: StoredClip): Promise<void> {
    const target = metadataPath(filePath);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, JSON.stringify(metadata, null, 2), 'utf8');
    await rename(temporary, target);
  }
}

function metadataPath(filePath: string): string {
  return `${filePath}${SIDECAR_SUFFIX}`;
}

function withMediaUrl(stored: StoredClip): Clip {
  return {
    ...stored,
    mediaUrl: `pulseclip://media/${encodeURIComponent(stored.id)}`,
  };
}

async function sanitizeStoredClip(
  input: unknown,
  filePath: string,
): Promise<StoredClip | null> {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<StoredClip>;
  const details = await stat(filePath);
  const kind: ClipKind =
    value.kind === 'recording' || value.kind === 'replay' || value.kind === 'recovered'
      ? value.kind
      : 'recovered';
  const createdAt = Number.isFinite(Date.parse(value.createdAt ?? ''))
    ? String(value.createdAt)
    : details.birthtime.toISOString();
  return {
    schemaVersion: 1,
    id: isValidClipId(value.id) ? value.id : randomUUID(),
    fileName: path.basename(filePath),
    title: cleanText(value.title, createTitle(kind, createdAt)),
    kind,
    createdAt,
    durationMs: boundedInteger(value.durationMs, 0, 7 * 24 * 60 * 60 * 1000),
    sourceName: cleanText(value.sourceName, '알 수 없는 소스'),
    width: boundedInteger(value.width, 0, 16384),
    height: boundedInteger(value.height, 0, 16384),
    fps: boundedInteger(value.fps, 0, 240),
    codec: cleanText(value.codec, 'unknown'),
    bytes: details.size,
    favorite: Boolean(value.favorite),
    recovered: Boolean(value.recovered || kind === 'recovered'),
  };
}

function isValidClipId(value: unknown): value is string {
  return isUuid(value);
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/[\u0000-\u001f]/g, '').trim();
  return text ? text.slice(0, 256) : fallback;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function createTitle(kind: ClipKind, createdAt: string): string {
  const label = kind === 'replay' ? '리플레이' : kind === 'recording' ? '녹화' : '복구된 녹화';
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
  return `${label} · ${formatted}`;
}

function isSameLocalDay(value: string, today: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

async function uniqueRecoveredPath(
  folder: string,
  originalFileName: string,
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = originalFileName.replace(/\.mp4$/i, '');
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`;
    const candidate = path.join(folder, `${baseName}_Recovered_${stamp}${suffix}.mp4`);
    try {
      await stat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new Error('복구 파일의 고유한 이름을 만들 수 없습니다.');
}

export async function isRecoverableFragmentedMp4(
  filePath: string,
  fileSize: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(fileSize) || fileSize < 8) return false;
  const handle = await open(filePath, 'r');
  let position = 0;
  let foundFtyp = false;
  let foundMoov = false;
  let foundMoof = false;

  try {
    while (position + 8 <= fileSize) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, position);
      if (bytesRead < 8) break;
      const size32 = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      let headerBytes = 8;
      let boxBytes: number;

      if (size32 === 1) {
        if (bytesRead < 16) break;
        const largeSize = header.readBigUInt64BE(8);
        if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        boxBytes = Number(largeSize);
        headerBytes = 16;
      } else if (size32 === 0) {
        boxBytes = fileSize - position;
      } else {
        boxBytes = size32;
      }

      if (boxBytes < headerBytes || position + boxBytes > fileSize) break;
      if (type === 'ftyp') foundFtyp = true;
      if (type === 'moov') foundMoov = true;
      if (type === 'moof') foundMoof = true;
      if (type === 'mdat' && foundFtyp && foundMoov && foundMoof && boxBytes > headerBytes) {
        return true;
      }
      position += boxBytes;
    }
    return false;
  } finally {
    await handle.close();
  }
}

export function buildClipFileName(kind: 'recording' | 'replay'): string {
  const stamp = new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, '');
  const label = kind === 'replay' ? 'Replay' : 'Recording';
  return `${VIDEO_PREFIX}${stamp}_${label}.mp4`;
}
