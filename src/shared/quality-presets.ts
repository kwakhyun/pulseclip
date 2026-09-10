import type { AppSettings } from './types';

export const QUALITY_PRESETS = [
  { id: 'performance', name: '성능 우선', description: '720p · 30 FPS · 6 Mbps', resolution: '720p', fps: 30, videoBitrateMbps: 6 },
  { id: 'balanced', name: '균형', description: '1080p · 60 FPS · 14 Mbps', resolution: '1080p', fps: 60, videoBitrateMbps: 14 },
  { id: 'quality', name: '선명하게', description: '1440p · 60 FPS · 24 Mbps', resolution: '1440p', fps: 60, videoBitrateMbps: 24 },
] as const;

export function matchesPreset(settings: AppSettings, preset: typeof QUALITY_PRESETS[number]): boolean {
  return settings.resolution === preset.resolution && settings.fps === preset.fps && settings.videoBitrateMbps === preset.videoBitrateMbps;
}
