import { randomUUID } from 'node:crypto';
import { mkdir, open, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { AppSettings, DiskSpaceStatus } from '../shared/types';
import type { Logger } from './logger';
import type { SettingsStore } from './settings-store';

export type DiskOperation = 'idle' | 'recording' | 'replay';

export const DISK_RESERVE_BYTES = 2 * 1024 ** 3;
export const CRITICAL_DISK_BYTES = 256 * 1024 ** 2;
const MINIMUM_SESSION_BYTES = 256 * 1024 ** 2;

export class DiskSafetyService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly logger: Logger,
  ) {}

  async inspect(operation: DiskOperation = 'idle'): Promise<DiskSpaceStatus> {
    const settings = this.settings.get();
    const requiredStartBytes = calculateRequiredStartBytes(settings, operation);
    try {
      await mkdir(settings.outputFolder, { recursive: true });
      const stats = await statfs(settings.outputFolder);
      const freeBytes = safeByteCount(stats.bavail, stats.bsize);
      const totalBytes = safeByteCount(stats.blocks, stats.bsize);
      return classifyDiskSpace(freeBytes, totalBytes, requiredStartBytes);
    } catch (error) {
      this.logger.warn('Could not inspect output disk space', { error });
      return {
        health: 'unknown',
        freeBytes: 0,
        totalBytes: 0,
        reserveBytes: DISK_RESERVE_BYTES,
        requiredStartBytes,
        canStart: false,
        shouldStop: true,
        summary: '저장 드라이브의 여유 공간을 확인할 수 없습니다.',
      };
    }
  }

  async assertCanStart(operation: Exclude<DiskOperation, 'idle'>): Promise<DiskSpaceStatus> {
    const status = await this.inspect(operation);
    if (!status.canStart) {
      throw new Error(`${status.summary} 저장공간을 확보한 뒤 다시 시도해 주세요.`);
    }
    return status;
  }

  async probeWritable(): Promise<void> {
    const folder = this.settings.get().outputFolder;
    await mkdir(folder, { recursive: true });
    const probePath = path.join(folder, `.pulseclip-health-${randomUUID()}.tmp`);
    const handle = await open(probePath, 'wx');
    try {
      await handle.writeFile(Buffer.alloc(64 * 1024, 0x50));
      await handle.sync();
    } finally {
      await handle.close().catch(() => undefined);
      await rm(probePath, { force: true }).catch(() => undefined);
    }
  }
}

export function calculateRequiredStartBytes(
  settings: Pick<AppSettings, 'videoBitrateMbps' | 'replaySeconds'>,
  operation: DiskOperation,
): number {
  const bytesPerSecond = settings.videoBitrateMbps * 1_000_000 / 8;
  const estimatedPayload = operation === 'replay'
    ? bytesPerSecond * settings.replaySeconds * 1.25
    : bytesPerSecond * 60;
  return DISK_RESERVE_BYTES + Math.max(MINIMUM_SESSION_BYTES, estimatedPayload);
}

export function classifyDiskSpace(
  freeBytes: number,
  totalBytes: number,
  requiredStartBytes: number,
): DiskSpaceStatus {
  const safeFree = Math.max(0, Math.floor(freeBytes));
  const safeTotal = Math.max(0, Math.floor(totalBytes));
  const shouldStop = safeFree <= DISK_RESERVE_BYTES;
  const canStart = safeFree >= requiredStartBytes;
  const health = safeFree <= CRITICAL_DISK_BYTES || shouldStop
    ? 'critical'
    : canStart
      ? 'healthy'
      : 'low';
  const summary = health === 'healthy'
    ? '녹화를 시작하기에 충분한 여유 공간이 있습니다.'
    : health === 'low'
      ? '안전 예약 공간을 제외하면 새 녹화를 시작하기 어렵습니다.'
      : '디스크 보호 임계치에 도달해 녹화를 안전 종료해야 합니다.';

  return {
    health,
    freeBytes: safeFree,
    totalBytes: safeTotal,
    reserveBytes: DISK_RESERVE_BYTES,
    requiredStartBytes,
    canStart,
    shouldStop,
    summary,
  };
}

function safeByteCount(blocks: number, blockSize: number): number {
  const value = blocks * blockSize;
  return Number.isFinite(value) && value > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))
    : 0;
}
