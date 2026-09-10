import { describe, expect, it } from 'vitest';
import { validateTrimRange } from './trim';

describe('trim range validation', () => {
  it.each([[Number.NaN, 2, 5], [-1, 2, 5], [2, 1, 5], [0, 6, 5], [1, 1.1, 5], [0, Infinity, 5]])('rejects invalid ranges (%s, %s, %s)', (start, end, duration) => {
    expect(() => validateTrimRange(start, end, duration)).toThrow();
  });
  it('accepts a short highlight inside the original', () => expect(() => validateTrimRange(1, 2.5, 5)).not.toThrow());
});
