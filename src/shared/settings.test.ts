import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  resolutionSize,
  sanitizeSettings,
  sanitizeShortcut,
  hotkeyProblem,
} from './settings';

describe('settings sanitization', () => {
  it('detects equivalent shortcuts and duplicate modifiers before registration', () => {
    expect(hotkeyProblem({ saveReplay: 'Ctrl+Shift+K', toggleRecording: 'Shift+Control+K' })).toBeTruthy();
    expect(hotkeyProblem({ saveReplay: 'Ctrl+Control+K', toggleRecording: 'F9' })).toBeTruthy();
    expect(hotkeyProblem({ saveReplay: 'F8', toggleRecording: 'F9' })).toBeNull();
  });
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

  it('keeps replay always-on for new installs and preserves an explicit opt-out', () => {
    const defaults = createDefaultSettings('C:\\Clips');
    expect(defaults.autoStartBuffer).toBe(true);
    expect(defaults.playSounds).toBe(true);
    expect(sanitizeSettings({ ...defaults, autoStartBuffer: false, playSounds: false }, defaults))
      .toMatchObject({ autoStartBuffer: false, playSounds: false });
  });

  it('accepts supported Electron accelerators only', () => {
    expect(sanitizeShortcut('Control+Shift+K', 'F8')).toBe('Control+Shift+K');
    expect(sanitizeShortcut('F12', 'F8')).toBe('F12');
    expect(sanitizeShortcut('F13', 'F8')).toBe('F13');
    expect(sanitizeShortcut('F25', 'F8')).toBe('F8');
    expect(sanitizeShortcut('A;Remove-Item', 'F8')).toBe('F8');
    expect(sanitizeShortcut('K', 'F8')).toBe('F8');
  });

  it('replaces a v0.1.4 single-letter hotkey without colliding with the key the user kept', () => {
    const defaults = createDefaultSettings('C:\\Clips');
    const upgrade = (saveReplay: string, toggleRecording: string) =>
      sanitizeSettings({ ...defaults, hotkeys: { saveReplay, toggleRecording } }, defaults).hotkeys;
    expect(upgrade('K', 'F8')).toEqual({ saveReplay: 'F9', toggleRecording: 'F8' });
    expect(upgrade('F9', 'Shift+L')).toEqual({ saveReplay: 'F9', toggleRecording: 'F8' });
    expect(upgrade('Shift+K', 'Shift+L')).toEqual({ saveReplay: 'F8', toggleRecording: 'F9' });
    expect(upgrade('K', 'Alt+F2')).toEqual({ saveReplay: 'F8', toggleRecording: 'Alt+F2' });
    expect(upgrade('F7', 'f7')).toEqual({ saveReplay: 'F8', toggleRecording: 'F9' });
  });
});

describe('resolutionSize', () => {
  it('maps presets and preserves source dimensions', () => {
    expect(resolutionSize('720p')).toEqual({ width: 1280, height: 720 });
    expect(resolutionSize('source')).toEqual({});
  });
});
