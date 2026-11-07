import { describe, expect, it } from 'vitest';
import { levelFromRms } from './audio-level-meter';

describe('levelFromRms', () => {
  it('maps silence, quiet and full-scale audio onto a readable meter range', () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(Number.NaN)).toBe(0);
    expect(levelFromRms(0.001)).toBe(0);
    expect(levelFromRms(0.0316)).toBeCloseTo(0.5, 2);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(4)).toBe(1);
  });
});
