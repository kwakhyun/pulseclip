import { describe, expect, it } from 'vitest';
import type { CaptureSource } from '../../shared/types';
import { findRecoverySource, shouldUseDefaultMicrophone } from './recovery-policy';

const original: CaptureSource = {
  id: 'window:1:0',
  name: 'Example Game',
  kind: 'window',
  displayId: null,
  thumbnailDataUrl: '',
  appIconDataUrl: null,
};

describe('capture device recovery policy', () => {
  it('prefers the stable source id and falls back to the source name', () => {
    const renamed = { ...original, name: 'Renamed Game' };
    expect(findRecoverySource([renamed], original)).toBe(renamed);

    const reconnected = { ...original, id: 'window:9:0' };
    expect(findRecoverySource([reconnected], original)).toBe(reconnected);
  });

  it('uses the default microphone only when the selected device disappeared', () => {
    const devices = [{ kind: 'audioinput' as const, deviceId: 'mic-default' }];
    expect(shouldUseDefaultMicrophone(devices, 'mic-missing')).toBe(true);
    expect(shouldUseDefaultMicrophone(devices, 'mic-default')).toBe(false);
    expect(shouldUseDefaultMicrophone(devices, '')).toBe(false);
  });
});
