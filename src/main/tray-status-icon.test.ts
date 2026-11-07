import { describe, expect, it } from 'vitest';
import { paintStatusDot, statusDotFor } from './tray-status-icon';

describe('tray status icon', () => {
  it('maps capture phases to distinct status colors', () => {
    expect(statusDotFor('idle')).toBeNull();
    expect(statusDotFor('recording')).toMatchObject({ red: 0xff });
    expect(statusDotFor('buffering')).toEqual(statusDotFor('saving'));
    expect(statusDotFor('error')).not.toEqual(statusDotFor('recording'));
  });

  it('paints an opaque BGRA dot in the lower-right corner without touching the rest', () => {
    const size = 16;
    const transparent = Buffer.alloc(size * size * 4);
    const painted = paintStatusDot(transparent, size, size, { red: 1, green: 2, blue: 3 });
    const pixel = (x: number, y: number) => [...painted.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(11, 11)).toEqual([3, 2, 1, 255]);
    expect(transparent.every(byte => byte === 0)).toBe(true);
  });
});
