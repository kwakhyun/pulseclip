import { mkdir, open, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import type {
  BeginFileRequest,
  BeginFileResult,
  Clip,
  FinalizeFileRequest,
} from '../shared/types';
import { buildClipFileName, ClipRepository } from './clip-repository';
import type { SettingsStore } from './settings-store';
import type { Logger } from './logger';
import type { DiskSafetyService } from './disk-safety';

interface WriteSession {
  id: string;
  request: BeginFileRequest;
  fileHandle: FileHandle;
  partPath: string;
  finalPath: string;
  position: number;
  queue: Promise<void>;
  closing: boolean;
  lastDiskCheckAt: number;
  lastDiskCheckPosition: number;
  safetyStopRequested: boolean;
}

const MAX_IPC_CHUNK_BYTES = 16 * 1024 * 1024;
const DISK_CHECK_INTERVAL_MS = 5_000;
const DISK_CHECK_BYTES = 64 * 1024 * 1024;

export class WriteSessionManager {
  private readonly sessions = new Map<string, WriteSession>();

  constructor(
    private readonly settings: SettingsStore,
    private readonly clips: ClipRepository,
    private readonly logger: Logger,
    private readonly diskSafety: DiskSafetyService,
    private readonly onSafetyStop: () => void,
  ) {}

  async begin(request: BeginFileRequest): Promise<BeginFileResult> {
    await this.diskSafety.assertCanStart(request.kind);
    const folder = this.settings.get().outputFolder;
    await mkdir(folder, { recursive: true });
    const finalPath = await createUniquePath(folder, buildClipFileName(request.kind));
    const partPath = `${finalPath}.part`;
    const fileHandle = await open(partPath, 'wx');
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      request,
      fileHandle,
      partPath,
      finalPath,
      position: 0,
      queue: Promise.resolve(),
      closing: false,
      lastDiskCheckAt: Date.now(),
      lastDiskCheckPosition: 0,
      safetyStopRequested: false,
    });
    this.logger.info('Started media write session', { id, kind: request.kind });
    return { sessionId: id };
  }

  async append(sessionId: string, bytes: ArrayBuffer): Promise<void> {
    const session = this.requireSession(sessionId);
    if (session.closing) throw new Error('이미 종료 중인 녹화 세션입니다.');
    if (bytes.byteLength === 0) return;
    if (bytes.byteLength > MAX_IPC_CHUNK_BYTES) {
      throw new Error('미디어 쓰기 청크가 허용 크기를 초과했습니다.');
    }
    const buffer = Buffer.from(bytes);
    session.queue = session.queue.then(async () => {
      const result = await session.fileHandle.write(
        buffer,
        0,
        buffer.length,
        session.position,
      );
      if (result.bytesWritten !== buffer.length) {
        throw new Error('미디어 파일을 완전히 기록하지 못했습니다.');
      }
      session.position += result.bytesWritten;
      await this.checkDiskSafety(session);
    });
    await session.queue;
  }

  async finalize(sessionId: string, request: FinalizeFileRequest): Promise<Clip> {
    const session = this.requireSession(sessionId);
    session.closing = true;
    try {
      await session.queue;
      await session.fileHandle.sync();
      await session.fileHandle.close();
      await rename(session.partPath, session.finalPath);
      const clip = await this.clips.registerCompletedFile(
        session.finalPath,
        session.request,
        request.durationMs,
      );
      this.sessions.delete(sessionId);
      await this.clips.enforceQuota();
      this.logger.info('Finalized media write session', {
        sessionId,
        bytes: clip.bytes,
        durationMs: request.durationMs,
      });
      return clip;
    } catch (error) {
      this.sessions.delete(sessionId);
      await session.fileHandle.close().catch(() => undefined);
      this.logger.error('Failed to finalize media write session', error);
      throw error;
    }
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closing = true;
    await session.queue.catch(() => undefined);
    await session.fileHandle.close().catch(() => undefined);
    this.sessions.delete(sessionId);
    this.logger.warn('Media write session was interrupted; part file preserved', {
      sessionId,
      partPath: session.partPath,
      bytes: session.position,
      reason,
    });
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.abort(id)));
  }

  private requireSession(sessionId: string): WriteSession {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
      throw new Error('녹화 세션 ID가 올바르지 않습니다.');
    }
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('녹화 세션을 찾을 수 없습니다.');
    return session;
  }

  private async checkDiskSafety(session: WriteSession): Promise<void> {
    if (session.safetyStopRequested) return;
    const now = Date.now();
    const bytesSinceCheck = session.position - session.lastDiskCheckPosition;
    if (
      now - session.lastDiskCheckAt < DISK_CHECK_INTERVAL_MS
      && bytesSinceCheck < DISK_CHECK_BYTES
    ) {
      return;
    }

    session.lastDiskCheckAt = now;
    session.lastDiskCheckPosition = session.position;
    const status = await this.diskSafety.inspect(session.request.kind);
    if (status.health === 'unknown' || !status.shouldStop) return;

    session.safetyStopRequested = true;
    this.logger.warn('Disk safety threshold reached; requesting a safe stop', {
      sessionId: session.id,
      kind: session.request.kind,
      freeBytes: status.freeBytes,
      reserveBytes: status.reserveBytes,
    });
    this.onSafetyStop();
  }
}

async function createUniquePath(folder: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`;
    const candidate = path.join(folder, `${parsed.name}${suffix}${parsed.ext}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('고유한 녹화 파일 이름을 만들 수 없습니다.');
}
