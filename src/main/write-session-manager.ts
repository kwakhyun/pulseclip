import { mkdir, open, rename, stat, rm } from 'node:fs/promises';
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
import { validateUuid } from './input-validation';
import { AsyncQueue } from '../shared/async-queue';

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
  completion?: Promise<Clip>;
  abortion?: Promise<void>;
  discardOnAbort: boolean;
  onClosed?: () => void;
}

const MAX_IPC_CHUNK_BYTES = 16 * 1024 * 1024;
const DISK_CHECK_INTERVAL_MS = 5_000;
const DISK_CHECK_BYTES = 64 * 1024 * 1024;

export class WriteSessionManager {
  private readonly sessions = new Map<string, WriteSession>();
  private readonly starts = new AsyncQueue();

  hasActiveSessions(): boolean {
    return this.sessions.size > 0 || this.pendingStarts > 0;
  }

  private pendingStarts = 0;
  private shuttingDown = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly clips: ClipRepository,
    private readonly logger: Logger,
    private readonly diskSafety: DiskSafetyService,
    private readonly onSafetyStop: () => void,
  ) {}

  async begin(request: BeginFileRequest, discardOnAbort = false, onClosed?: () => void): Promise<BeginFileResult> {
    if (this.shuttingDown) throw new Error('저장 작업을 정리하고 있습니다. 잠시 후 다시 시도해 주세요.');
    this.pendingStarts += 1;
    try {
      return await this.starts.run(() => this.beginSession(request, discardOnAbort, onClosed));
    } finally {
      this.pendingStarts -= 1;
    }
  }

  private async beginSession(request: BeginFileRequest, discardOnAbort: boolean, onClosed?: () => void): Promise<BeginFileResult> {
    if (this.sessions.size >= 3) throw new Error('진행 중인 저장 작업이 너무 많습니다.');
    await this.diskSafety.assertCanStart(request.kind === 'edited' ? 'recording' : request.kind);
    const folder = this.settings.get().outputFolder;
    await mkdir(folder, { recursive: true });
    const { finalPath, partPath, fileHandle } = await reserveUniqueFile(folder, buildClipFileName(request.kind));
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
      discardOnAbort,
      onClosed,
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
      let offset = 0;
      while (offset < buffer.length) {
        const result = await session.fileHandle.write(buffer, offset, buffer.length - offset, session.position);
        if (result.bytesWritten === 0) throw new Error('미디어 파일을 기록하지 못했습니다.');
        offset += result.bytesWritten;
        session.position += result.bytesWritten;
      }
      await this.checkDiskSafety(session);
    });
    await session.queue;
  }

  async finalize(sessionId: string, request: FinalizeFileRequest): Promise<Clip> {
    const session = this.requireSession(sessionId);
    if (session.completion) return session.completion;
    if (session.closing) throw new Error('이미 종료 중인 녹화 세션입니다.');
    session.closing = true;
    session.completion = this.completeSession(session, request);
    return session.completion;
  }

  private async completeSession(session: WriteSession, request: FinalizeFileRequest): Promise<Clip> {
    const sessionId = session.id;
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
      await this.clips.enforceQuota([clip.id]).catch(error => {
        this.logger.warn('Clip saved, but quota cleanup failed', { error });
      });
      this.sessions.delete(sessionId);
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
    } finally {
      session.onClosed?.();
    }
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.abortion) return session.abortion;
    if (session.completion) {
      await session.completion.catch(() => undefined);
      return;
    }
    session.closing = true;
    session.abortion = this.abortSession(session, reason);
    return session.abortion;
  }

  private async abortSession(session: WriteSession, reason?: string): Promise<void> {
    const sessionId = session.id;
    await session.queue.catch(() => undefined);
    await session.fileHandle.close().catch(() => undefined);
    try {
      if (session.discardOnAbort) await rm(session.partPath, { force: true });
    } finally {
      this.sessions.delete(sessionId);
      session.onClosed?.();
    }
    this.logger.warn(session.discardOnAbort ? 'Canceled edit discarded' : 'Media write session was interrupted; part file preserved', {
      sessionId,
      partPath: session.partPath,
      bytes: session.position,
      reason,
    });
  }

  async shutdown(reason?: string): Promise<void> {
    this.shuttingDown = true;
    try {
      await this.starts.run(async () => undefined);
      await Promise.all([...this.sessions.keys()].map((id) => this.abort(id, reason)));
    } finally {
      this.shuttingDown = false;
    }
  }

  private requireSession(sessionId: string): WriteSession {
    validateUuid(sessionId, '녹화 세션 ID');
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
    const status = await this.diskSafety.inspect(session.request.kind === 'edited' ? 'recording' : session.request.kind);
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

async function reserveUniqueFile(folder: string, fileName: string): Promise<{ finalPath: string; partPath: string; fileHandle: FileHandle }> {
  const parsed = path.parse(fileName);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : `_${index + 1}`;
    const candidate = path.join(folder, `${parsed.name}${suffix}${parsed.ext}`);
    try {
      await stat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const partPath = `${candidate}.part`;
      try {
        const fileHandle = await open(partPath, 'wx');
        return { finalPath: candidate, partPath, fileHandle };
      } catch (reserveError) {
        if ((reserveError as NodeJS.ErrnoException).code !== 'EEXIST') throw reserveError;
      }
    }
  }
  throw new Error('고유한 녹화 파일 이름을 만들 수 없습니다.');
}
