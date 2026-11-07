import type { HotkeySettings } from './types';

/**
 * Global shortcuts are registered system-wide, so a key that is typed in other
 * apps (letters, digits, navigation keys) must be combined with Control, Alt or
 * Super. Shift alone is not enough: Shift+K would swallow every capital K.
 */
const MODIFIERS: Record<string, 'Control' | 'Alt' | 'Shift' | 'Super'> = {
  control: 'Control',
  ctrl: 'Control',
  commandorcontrol: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  command: 'Super',
  win: 'Super',
};
const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'] as const;
const STANDALONE_KEY = /^F(?:[1-9]|1\d|2[0-4])$/i;
const NAMED_KEYS: Record<string, string> = {
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};
const TYPING_KEY = /^(?:[A-Z0-9]|num[0-9])$/i;

export interface ParsedShortcut {
  modifiers: Array<(typeof MODIFIER_ORDER)[number]>;
  key: string;
}

export function parseShortcut(value: unknown): ParsedShortcut | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return null;
  const parts = value.split('+').map(part => part.trim());
  const rawKey = parts.pop();
  if (!rawKey) return null;
  const modifiers = new Set<ParsedShortcut['modifiers'][number]>();
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (!modifier || modifiers.has(modifier)) return null;
    modifiers.add(modifier);
  }
  const key = normalizeKey(rawKey.replace(/\s+/g, ''));
  if (!key) return null;
  return { modifiers: MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)), key };
}

function normalizeKey(value: string): string | null {
  if (STANDALONE_KEY.test(value)) return value.toUpperCase();
  if (/^[A-Z0-9]$/i.test(value)) return value.toUpperCase();
  if (/^num[0-9]$/i.test(value)) return value.toLowerCase();
  return NAMED_KEYS[value.toLowerCase()] ?? null;
}

export function formatShortcut(shortcut: ParsedShortcut): string {
  return [...shortcut.modifiers, shortcut.key].join('+');
}

/** Returns a user-facing problem for one shortcut, or null when it is safe to register. */
export function shortcutProblem(value: unknown): string | null {
  const parsed = parseShortcut(value);
  if (!parsed) return '단축키는 F1~F24 또는 Ctrl+Shift+K처럼 지정해 주세요.';
  if (STANDALONE_KEY.test(parsed.key)) return null;
  const guarded = parsed.modifiers.some(modifier => modifier !== 'Shift');
  if (!guarded) {
    return TYPING_KEY.test(parsed.key)
      ? '문자·숫자 키는 Ctrl 또는 Alt와 함께 지정해 주세요. 다른 앱에서 입력이 막힐 수 있습니다.'
      : '이 키는 Ctrl 또는 Alt와 함께 지정해 주세요. 다른 앱의 이동 키가 막힐 수 있습니다.';
  }
  return null;
}

export function sanitizeShortcut(value: unknown, fallback: string): string {
  if (shortcutProblem(value)) return fallback;
  return formatShortcut(parseShortcut(value)!);
}

/**
 * Sanitizes a saved pair. A shortcut that is no longer allowed (v0.1.4 accepted
 * bare letters) falls back to its default, but never onto the key the other
 * action still uses, which would leave one action without a hotkey.
 */
export function sanitizeHotkeys(input: Partial<Record<keyof HotkeySettings, unknown>>, defaults: HotkeySettings): HotkeySettings {
  const saveReplay = sanitizeShortcut(input.saveReplay, defaults.saveReplay);
  const toggleRecording = sanitizeShortcut(input.toggleRecording, defaults.toggleRecording);
  if (saveReplay !== toggleRecording) return { saveReplay, toggleRecording };
  const saveKept = !shortcutProblem(input.saveReplay);
  const recordKept = !shortcutProblem(input.toggleRecording);
  if (saveKept && !recordKept) {
    return { saveReplay, toggleRecording: [defaults.toggleRecording, defaults.saveReplay].find(key => key !== saveReplay)! };
  }
  if (recordKept && !saveKept) {
    return { saveReplay: [defaults.saveReplay, defaults.toggleRecording].find(key => key !== toggleRecording)!, toggleRecording };
  }
  return { ...defaults };
}

export function hotkeyProblem(hotkeys: HotkeySettings): string | null {
  for (const value of Object.values(hotkeys)) {
    const problem = shortcutProblem(value);
    if (problem) return problem;
  }
  if (sanitizeShortcut(hotkeys.saveReplay, '') === sanitizeShortcut(hotkeys.toggleRecording, '')) {
    return '리플레이와 녹화에 서로 다른 단축키를 지정해 주세요.';
  }
  return null;
}

export interface KeyboardShortcutInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * Converts a keydown event into an Electron accelerator. Returns null while only
 * modifier keys are held, or for keys PulseClip does not register globally.
 */
export function acceleratorFromKeyboard(event: KeyboardShortcutInput): string | null {
  const key = keyFromCode(event.code);
  if (!key) return null;
  const modifiers: ParsedShortcut['modifiers'] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  return formatShortcut({ modifiers, key });
}

function keyFromCode(code: string): string | null {
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1];
  match = /^Digit([0-9])$/.exec(code);
  if (match) return match[1];
  match = /^Numpad([0-9])$/.exec(code);
  if (match) return `num${match[1]}`;
  if (STANDALONE_KEY.test(code)) return code.toUpperCase();
  return NAMED_KEYS[code.toLowerCase()] ?? null;
}

/** Human-friendly label: Control+Shift+K -> Ctrl + Shift + K. */
export function displayShortcut(value: string): string {
  const parsed = parseShortcut(value);
  if (!parsed) return value;
  const labels: Record<string, string> = { Control: 'Ctrl', Super: 'Win' };
  const key = parsed.key.startsWith('num') ? `Num ${parsed.key.slice(3)}` : parsed.key;
  return [...parsed.modifiers.map(modifier => labels[modifier] ?? modifier), key].join(' + ');
}
