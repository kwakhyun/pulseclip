import { describe, expect, it } from 'vitest';
import {
  acceleratorFromKeyboard,
  displayShortcut,
  hotkeyProblem,
  sanitizeShortcut,
  shortcutProblem,
} from './hotkeys';

const key = (code: string, modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers,
});

describe('global shortcut safety', () => {
  it('rejects keys that would block typing in other apps', () => {
    expect(shortcutProblem('K')).toContain('Ctrl 또는 Alt');
    expect(shortcutProblem('Shift+K')).toContain('Ctrl 또는 Alt');
    expect(shortcutProblem('num5')).toContain('Ctrl 또는 Alt');
    expect(shortcutProblem('Home')).toContain('이동 키');
    expect(shortcutProblem('Alt+K')).toBeNull();
    expect(shortcutProblem('Ctrl+Shift+num5')).toBeNull();
    expect(shortcutProblem('F24')).toBeNull();
  });

  it('normalizes aliases so equivalent shortcuts are detected as duplicates', () => {
    expect(sanitizeShortcut('ctrl+shift+k', 'F8')).toBe('Control+Shift+K');
    expect(sanitizeShortcut('Shift+CommandOrControl+k', 'F8')).toBe('Control+Shift+K');
    expect(hotkeyProblem({ saveReplay: 'Ctrl+Shift+K', toggleRecording: 'Shift+Control+K' })).toContain('서로 다른');
    expect(hotkeyProblem({ saveReplay: 'Ctrl+Control+K', toggleRecording: 'F9' })).toBeTruthy();
    expect(hotkeyProblem({ saveReplay: 'F8', toggleRecording: 'Alt+F9' })).toBeNull();
  });

  it('records shortcuts from physical key codes regardless of keyboard layout', () => {
    expect(acceleratorFromKeyboard(key('F8'))).toBe('F8');
    expect(acceleratorFromKeyboard(key('KeyR', { ctrlKey: true, shiftKey: true }))).toBe('Control+Shift+R');
    expect(acceleratorFromKeyboard(key('Numpad3', { altKey: true }))).toBe('Alt+num3');
    expect(acceleratorFromKeyboard(key('ShiftLeft', { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKeyboard(key('Space'))).toBeNull();
  });

  it('formats shortcuts for people, not Electron', () => {
    expect(displayShortcut('Control+Shift+K')).toBe('Ctrl + Shift + K');
    expect(displayShortcut('Alt+num3')).toBe('Alt + Num 3');
    expect(displayShortcut('F8')).toBe('F8');
  });

  it('accepts its own display format when typed back', () => {
    expect(sanitizeShortcut(displayShortcut('Control+Alt+num3'), 'F8')).toBe('Control+Alt+num3');
    expect(sanitizeShortcut('Win + Shift + F2', 'F8')).toBe('Shift+Super+F2');
  });
});
