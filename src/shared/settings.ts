import type { AppSettings, CaptureResolution } from './types';

export const SETTINGS_SCHEMA_VERSION = 1 as const;

export function createDefaultSettings(outputFolder = ''): AppSettings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    completedOnboarding: false,
    selectedSourceId: '',
    selectedSourceName: '',
    resolution: '1080p',
    fps: 60,
    videoBitrateMbps: 14,
    replaySeconds: 45,
    systemAudio: true,
    microphone: false,
    microphoneDeviceId: '',
    microphoneGain: 100,
    recordCursor: true,
    autoStartBuffer: false,
    launchAtStartup: false,
    minimizeToTray: true,
    showNotifications: true,
    storageLimitGb: 20,
    outputFolder,
    hotkeys: {
      saveReplay: 'F8',
      toggleRecording: 'F9',
    },
  };
}

const RESOLUTIONS = new Set<CaptureResolution>([
  'source',
  '720p',
  '1080p',
  '1440p',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback: string, maxLength = 512): string {
  if (typeof value !== 'string' || value.includes('\0')) return fallback;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : fallback;
}

function clampedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  step = 1,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(maximum, Math.max(minimum, value));
  return Math.round(clamped / step) * step;
}

export function sanitizeShortcut(value: unknown, fallback: string): string {
  const shortcut = stringValue(value, fallback, 64);
  const accelerator = /^(?:(?:Alt|Shift|Control|Ctrl|Command|CommandOrControl|Super|Meta)\+)*(?:F(?:[1-9]|1[0-2])|[A-Z0-9])$/i;
  return accelerator.test(shortcut) ? shortcut : fallback;
}

export function sanitizeSettings(
  input: unknown,
  defaults = createDefaultSettings(),
): AppSettings {
  if (!isRecord(input)) return { ...defaults, hotkeys: { ...defaults.hotkeys } };

  const resolution = RESOLUTIONS.has(input.resolution as CaptureResolution)
    ? (input.resolution as CaptureResolution)
    : defaults.resolution;
  const fps = input.fps === 30 || input.fps === 60 ? input.fps : defaults.fps;
  const hotkeys = isRecord(input.hotkeys) ? input.hotkeys : {};

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    completedOnboarding: booleanValue(
      input.completedOnboarding,
      defaults.completedOnboarding,
    ),
    selectedSourceId: stringValue(input.selectedSourceId, defaults.selectedSourceId),
    selectedSourceName: stringValue(
      input.selectedSourceName,
      defaults.selectedSourceName,
    ),
    resolution,
    fps,
    videoBitrateMbps: clampedNumber(
      input.videoBitrateMbps,
      defaults.videoBitrateMbps,
      4,
      40,
    ),
    replaySeconds: clampedNumber(
      input.replaySeconds,
      defaults.replaySeconds,
      15,
      180,
      5,
    ),
    systemAudio: booleanValue(input.systemAudio, defaults.systemAudio),
    microphone: booleanValue(input.microphone, defaults.microphone),
    microphoneDeviceId: stringValue(
      input.microphoneDeviceId,
      defaults.microphoneDeviceId,
    ),
    microphoneGain: clampedNumber(
      input.microphoneGain,
      defaults.microphoneGain,
      0,
      200,
      5,
    ),
    recordCursor: booleanValue(input.recordCursor, defaults.recordCursor),
    autoStartBuffer: booleanValue(
      input.autoStartBuffer,
      defaults.autoStartBuffer,
    ),
    launchAtStartup: booleanValue(
      input.launchAtStartup,
      defaults.launchAtStartup,
    ),
    minimizeToTray: booleanValue(input.minimizeToTray, defaults.minimizeToTray),
    showNotifications: booleanValue(
      input.showNotifications,
      defaults.showNotifications,
    ),
    storageLimitGb: clampedNumber(
      input.storageLimitGb,
      defaults.storageLimitGb,
      1,
      500,
    ),
    outputFolder: stringValue(input.outputFolder, defaults.outputFolder, 1024),
    hotkeys: {
      saveReplay: sanitizeShortcut(hotkeys.saveReplay, defaults.hotkeys.saveReplay),
      toggleRecording: sanitizeShortcut(
        hotkeys.toggleRecording,
        defaults.hotkeys.toggleRecording,
      ),
    },
  };
}

export function resolutionSize(
  resolution: CaptureResolution,
): { width?: number; height?: number } {
  switch (resolution) {
    case '720p':
      return { width: 1280, height: 720 };
    case '1080p':
      return { width: 1920, height: 1080 };
    case '1440p':
      return { width: 2560, height: 1440 };
    case 'source':
      return {};
  }
}
