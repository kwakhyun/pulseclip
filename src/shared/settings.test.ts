import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  resolutionSize,
  sanitizeSettings,
  sanitizeShortcut,
} from './settings';

describe('settings sanitization', () => {
  it('clamps numeric input and rejects malformed values', () => {
    const defaults = createDefaultSettings('C:\\Clips');
    const result = sanitizeSettings(
      {
        ...defaults,
        replaySeconds: 999,
        videoBitrateMbps: -10,
        microphoneGain: Number.NaN,
        fps: 144,
        outputFolder: 'bad\0path',
      },
      defaults,
    );

    expect(result.replaySeconds).toBe(180);
    expect(result.videoBitrateMbps).toBe(4);
    expect(result.microphoneGain).toBe(100);
    expect(result.fps).toBe(60);
    expect(result.outputFolder).toBe('C:\\Clips');
  });

  it('accepts supported Electron accelerators only', () => {
    expect(sanitizeShortcut('Control+Shift+K', 'F8')).toBe('Control+Shift+K');
    expect(sanitizeShortcut('F12', 'F8')).toBe('F12');
    expect(sanitizeShortcut('F13', 'F8')).toBe('F8');
    expect(sanitizeShortcut('A;Remove-Item', 'F8')).toBe('F8');
  });
});

describe('resolutionSize', () => {
  it('maps presets and preserves source dimensions', () => {
    expect(resolutionSize('720p')).toEqual({ width: 1280, height: 720 });
    expect(resolutionSize('source')).toEqual({});
  });
});
