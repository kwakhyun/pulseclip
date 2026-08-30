import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import type {
  AppSettings,
  BeginFileRequest,
  DiagnosticReport,
  PrepareCaptureRequest,
  RendererDiagnosticSnapshot,
  RuntimeStatus,
  ShortcutRegistration,
} from '../shared/types';
import type { ClipRepository } from './clip-repository';
import type { SettingsStore } from './settings-store';
import type { WriteSessionManager } from './write-session-manager';
import type { Logger } from './logger';
import { buildDiagnosticReport } from './diagnostics';
import type { DiskSafetyService } from './disk-safety';
import { requireBoolean, validateUuid } from './input-validation';

interface RegisterIpcOptions {
  window: BrowserWindow;
  settings: SettingsStore;
  clips: ClipRepository;
  writer: WriteSessionManager;
  diskSafety: DiskSafetyService;
  logger: Logger;
  listCaptureSources: () => Promise<unknown>;
  prepareCapture: (
    event: IpcMainInvokeEvent,
    request: PrepareCaptureRequest,
  ) => Promise<void>;
  registerShortcuts: () => ShortcutRegistration;
  getShortcutRegistration: () => ShortcutRegistration;
  applyLoginItemSettings: () => void;
  updateTrayStatus: (status: RuntimeStatus) => void;
  onShutdownReady: () => void;
}

export function registerIpcHandlers(options: RegisterIpcOptions): () => void {
  const {
    window,
    settings,
    clips,
    writer,
    diskSafety,
    logger,
    listCaptureSources,
    prepareCapture,
    registerShortcuts,
    getShortcutRegistration,
    applyLoginItemSettings,
    updateTrayStatus,
    onShutdownReady,
  } = options;

  let lastDiagnosticReport: DiagnosticReport | null = null;

  const handlers: Array<[string, (...args: never[]) => unknown]> = [];
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
  ) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedSender(event, window);
      try {
        return await listener(event, ...args);
      } catch (error) {
        logger.error(`IPC handler failed: ${channel}`, error);
        throw error;
      }
    });
    handlers.push([channel, listener as (...args: never[]) => unknown]);
  };

  handle(IPC.bootstrap, async () => {
    const currentClips = await clips.list();
    const result = {
      appVersion: app.getVersion(),
      platform: process.platform,
      settings: settings.get(),
      clips: currentClips,
      storage: await clips.storageStats(currentClips),
      diskSpace: await diskSafety.inspect(),
      shortcutRegistration: getShortcutRegistration(),
    };
    logger.info('Renderer bootstrap completed', { clipCount: currentClips.length });
    return result;
  });

  handle(IPC.listSources, () => listCaptureSources());

  handle(IPC.prepareCapture, (event, request: unknown) => {
    const validated = validatePrepareCapture(request);
    return prepareCapture(event, validated);
  });

  handle(IPC.updateSettings, async (_event, patch: unknown) => {
    if (!isRecord(patch)) throw new Error('설정 형식이 올바르지 않습니다.');
    const safePatch = { ...patch } as Partial<AppSettings>;
    delete safePatch.outputFolder;
    delete safePatch.schemaVersion;
    const updated = await settings.update(safePatch);
    applyLoginItemSettings();
    const shortcutRegistration = registerShortcuts();
    await clips.enforceQuota();
    return { settings: updated, shortcutRegistration };
  });

  handle(IPC.chooseOutputFolder, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'PulseClip 저장 폴더 선택',
      defaultPath: settings.get().outputFolder,
      buttonLabel: '이 폴더 사용',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const updated = await settings.setOutputFolder(result.filePaths[0]);
    return updated.outputFolder;
  });

  handle(IPC.listClips, async () => {
    const currentClips = await clips.list();
    return {
      clips: currentClips,
      storage: await clips.storageStats(currentClips),
    };
  });

  handle(IPC.getDiskSpace, () => diskSafety.inspect());

  handle(IPC.runDiagnostics, async (_event, snapshot: unknown) => {
    const renderer = validateRendererDiagnostics(snapshot);
    const diskSpace = await diskSafety.inspect();
    let outputWritable = true;
    let outputError: string | undefined;
    try {
      await diskSafety.probeWritable();
    } catch (error) {
      outputWritable = false;
      outputError = errorMessage(error);
    }
    lastDiagnosticReport = buildDiagnosticReport({
      appVersion: app.getVersion(),
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      electronVersion: process.versions.electron,
      diskSpace,
      renderer,
      shortcuts: getShortcutRegistration(),
      settings: settings.get(),
      outputWritable,
      outputError,
    });
    return lastDiagnosticReport;
  });

  handle(IPC.exportDiagnostics, async () => {
    if (!lastDiagnosticReport) {
      throw new Error('먼저 상태 점검을 실행해 주세요.');
    }
    const stamp = lastDiagnosticReport.generatedAt.slice(0, 19).replace(/[:T]/g, '-');
    const result = await dialog.showSaveDialog(window, {
      title: 'PulseClip 진단 보고서 저장',
      defaultPath: path.join(app.getPath('downloads'), `PulseClip-diagnostics-${stamp}.json`),
      buttonLabel: '진단 보고서 저장',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, JSON.stringify(lastDiagnosticReport, null, 2), 'utf8');
    return result.filePath;
  });

  handle(IPC.favoriteClip, async (_event, id: unknown, favorite: unknown) => {
    return clips.setFavorite(validateId(id), requireBoolean(favorite, '즐겨찾기'));
  });

  handle(IPC.deleteClip, async (_event, id: unknown) => {
    await clips.delete(validateId(id));
    const currentClips = await clips.list();
    return {
      clips: currentClips,
      storage: await clips.storageStats(currentClips),
    };
  });

  handle(IPC.revealClip, async (_event, id: unknown) => {
    const filePath = await clips.resolveMediaPath(validateId(id));
    if (!filePath) throw new Error('클립을 찾을 수 없습니다.');
    shell.showItemInFolder(filePath);
  });

  handle(IPC.openClip, async (_event, id: unknown) => {
    const filePath = await clips.resolveMediaPath(validateId(id));
    if (!filePath) throw new Error('클립을 찾을 수 없습니다.');
    const result = await shell.openPath(filePath);
    if (result) throw new Error(result);
  });

  handle(IPC.beginFile, (_event, request: unknown) => {
    return writer.begin(validateBeginFile(request));
  });

  handle(IPC.appendFile, (_event, sessionId: unknown, bytes: unknown) => {
    if (!(bytes instanceof ArrayBuffer)) {
      throw new Error('미디어 데이터 형식이 올바르지 않습니다.');
    }
    return writer.append(validateId(sessionId), bytes);
  });

  handle(IPC.finalizeFile, (_event, sessionId: unknown, request: unknown) => {
    if (!isRecord(request) || typeof request.durationMs !== 'number') {
      throw new Error('녹화 완료 정보가 올바르지 않습니다.');
    }
    const durationMs = boundedNumber(
      request.durationMs,
      0,
      7 * 24 * 60 * 60 * 1000,
      '녹화 길이',
    );
    return writer.finalize(validateId(sessionId), { durationMs });
  });

  handle(IPC.abortFile, (_event, sessionId: unknown, reason: unknown) => {
    const safeReason = reason === undefined ? undefined : cleanText(reason, 500);
    return writer.abort(validateId(sessionId), safeReason);
  });

  handle(IPC.notify, async (_event, title: unknown, body: unknown) => {
    if (!settings.get().showNotifications || !Notification.isSupported()) return;
    const safeTitle = cleanText(title, 80);
    const safeBody = cleanText(body, 240);
    new Notification({ title: safeTitle, body: safeBody }).show();
  });

  handle(IPC.reportRuntimeStatus, async (_event, status: unknown) => {
    updateTrayStatus(validateRuntimeStatus(status));
  });

  handle(IPC.shutdownReady, async () => {
    onShutdownReady();
  });

  handle(IPC.windowAction, async (_event, action: unknown) => {
    if (action === 'minimize') window.minimize();
    else if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    } else if (action === 'close') window.close();
    else if (action === 'quit') app.quit();
    else throw new Error('지원하지 않는 창 동작입니다.');
  });

  return () => {
    for (const [channel] of handlers) ipcMain.removeHandler(channel);
  };
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (
    event.sender.id !== window.webContents.id ||
    event.senderFrame !== window.webContents.mainFrame
  ) {
    throw new Error('신뢰할 수 없는 IPC 호출입니다.');
  }
}

function validatePrepareCapture(input: unknown): PrepareCaptureRequest {
  if (!isRecord(input)) throw new Error('캡처 요청이 올바르지 않습니다.');
  return {
    sourceId: cleanText(input.sourceId, 512),
    includeSystemAudio: requireBoolean(input.includeSystemAudio, '시스템 오디오'),
  };
}

function validateBeginFile(input: unknown): BeginFileRequest {
  if (!isRecord(input)) throw new Error('녹화 파일 요청이 올바르지 않습니다.');
  if (input.kind !== 'recording' && input.kind !== 'replay') {
    throw new Error('지원하지 않는 녹화 종류입니다.');
  }
  return {
    kind: input.kind,
    sourceName: cleanText(input.sourceName, 256),
    width: boundedNumber(input.width, 0, 16384, '너비'),
    height: boundedNumber(input.height, 0, 16384, '높이'),
    fps: boundedNumber(input.fps, 0, 240, '프레임률'),
    codec: cleanText(input.codec, 64),
  };
}

function validateRuntimeStatus(input: unknown): RuntimeStatus {
  if (!isRecord(input)) throw new Error('런타임 상태가 올바르지 않습니다.');
  const allowed = new Set(['idle', 'starting', 'recovering', 'buffering', 'recording', 'saving', 'error']);
  if (typeof input.phase !== 'string' || !allowed.has(input.phase)) {
    throw new Error('런타임 단계가 올바르지 않습니다.');
  }
  return {
    phase: input.phase as RuntimeStatus['phase'],
    sourceName: cleanOptionalText(input.sourceName, 256),
    bufferSeconds: boundedNumber(input.bufferSeconds, 0, 3600, '버퍼 길이'),
    recordingSeconds: boundedNumber(
      input.recordingSeconds,
      0,
      7 * 24 * 60 * 60,
      '녹화 길이',
    ),
  };
}

function validateRendererDiagnostics(input: unknown): RendererDiagnosticSnapshot {
  if (!isRecord(input)) throw new Error('렌더러 진단 정보가 올바르지 않습니다.');
  return {
    webCodecsAvailable: requireBoolean(input.webCodecsAvailable, 'WebCodecs 지원'),
    h264Supported: requireBoolean(input.h264Supported, 'H.264 지원'),
    aacSupported: requireBoolean(input.aacSupported, 'AAC 지원'),
    captureSourceCount: boundedNumber(input.captureSourceCount, 0, 10_000, '캡처 소스 수'),
    microphoneCount: boundedNumber(input.microphoneCount, 0, 1_000, '마이크 수'),
    selectedSourceAvailable: requireBoolean(
      input.selectedSourceAvailable,
      '선택한 소스 상태',
    ),
  };
}

function validateId(value: unknown): string {
  return validateUuid(value);
}

function cleanText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') throw new Error('문자열 값이 필요합니다.');
  const text = value.replace(/[\u0000-\u001f]/g, '').trim();
  if (!text || text.length > maximumLength) throw new Error('문자열 길이가 올바르지 않습니다.');
  return text;
}

function cleanOptionalText(value: unknown, maximumLength: number): string {
  if (value === '') return '';
  return cleanText(value, maximumLength);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : '알 수 없는 오류';
}
