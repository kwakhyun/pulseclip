import type { PulseClipApi } from '../shared/types';

declare global {
  interface Window {
    pulseClip: PulseClipApi;
  }

  interface MediaStreamVideoTrack extends MediaStreamTrack {}
  interface MediaStreamAudioTrack extends MediaStreamTrack {}
}

export {};
