import { describe, expect, it } from 'vitest';
import {
  classifyDiskSpace,
  calculateRequiredStartBytes,
  DISK_RESERVE_BYTES,
} from './disk-safety';

describe('disk safety policy', () => {
  it('keeps a fixed reserve plus at least one minimum session block', () => {
    const required = calculateRequiredStartBytes(
      { videoBitrateMbps: 14, replaySeconds: 45 },
      'recording',
    );
    expect(required).toBeGreaterThan(DISK_RESERVE_BYTES);
  });

  it('allows recording only when required headroom is available', () => {
    const required = DISK_RESERVE_BYTES + 512 * 1024 ** 2;
    expect(classifyDiskSpace(required, 100 * 1024 ** 3, required).canStart).toBe(true);
    const low = classifyDiskSpace(required - 1, 100 * 1024 ** 3, required);
    expect(low.canStart).toBe(false);
    expect(low.health).toBe('low');
  });

  it('requests a safe stop at the reserve boundary', () => {
    const status = classifyDiskSpace(
      DISK_RESERVE_BYTES,
      100 * 1024 ** 3,
      DISK_RESERVE_BYTES + 1,
    );
    expect(status.shouldStop).toBe(true);
    expect(status.health).toBe('critical');
  });
});
