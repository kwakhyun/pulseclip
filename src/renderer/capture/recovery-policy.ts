import type { CaptureSource } from '../../shared/types';

export function findRecoverySource(
  sources: CaptureSource[],
  original: Pick<CaptureSource, 'id' | 'name'>,
): CaptureSource | null {
  return sources.find((source) => source.id === original.id)
    ?? sources.find((source) => source.name === original.name)
    ?? null;
}

export function shouldUseDefaultMicrophone(
  devices: Array<Pick<MediaDeviceInfo, 'kind' | 'deviceId'>>,
  selectedDeviceId: string,
): boolean {
  return Boolean(selectedDeviceId) && !devices.some(
    (device) => device.kind === 'audioinput' && device.deviceId === selectedDeviceId,
  );
}
