import { describe, expect, it } from 'vitest';
import { isUuid, requireBoolean, validateUuid } from './input-validation';

describe('main-process input validation', () => {
  it('accepts canonical UUIDs used for clips and write sessions', () => {
    const id = '7a404f39-ae80-4f61-9235-29a0b334d6ed';
    expect(isUuid(id)).toBe(true);
    expect(validateUuid(id)).toBe(id);
  });

  it.each([
    '------------------------------------',
    '7a404f39ae804f61923529a0b334d6ed',
    '7a404f39-ae80-0f61-9235-29a0b334d6ed',
    '7a404f39-ae80-4f61-1235-29a0b334d6ed',
  ])('rejects malformed UUID input: %s', (value) => {
    expect(isUuid(value)).toBe(false);
    expect(() => validateUuid(value)).toThrow('ID 형식이 올바르지 않습니다.');
  });

  it('requires real booleans instead of coercing truthy IPC values', () => {
    expect(requireBoolean(true, '옵션')).toBe(true);
    expect(requireBoolean(false, '옵션')).toBe(false);
    expect(() => requireBoolean('false', '옵션')).toThrow(
      '옵션 값이 올바르지 않습니다.',
    );
    expect(() => requireBoolean(1, '옵션')).toThrow(
      '옵션 값이 올바르지 않습니다.',
    );
  });
});
