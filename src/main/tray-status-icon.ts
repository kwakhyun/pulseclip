import type { CapturePhase } from './power-resume-policy';

export interface StatusDot {
  red: number;
  green: number;
  blue: number;
}

/** Colors match the in-app status badge so the tray reads the same at a glance. */
export function statusDotFor(phase: CapturePhase): StatusDot | null {
  if (phase === 'recording') return { red: 0xff, green: 0x4b, blue: 0x54 };
  if (phase === 'buffering' || phase === 'saving') return { red: 0x4b, green: 0xd9, blue: 0xaa };
  if (phase === 'error' || phase === 'recovering') return { red: 0xff, green: 0xb4, blue: 0x3c };
  return null;
}

/**
 * Paints a status dot into the lower-right corner of a BGRA bitmap (Electron's
 * native image layout on Windows and Linux). Returns a new buffer.
 */
export function paintStatusDot(bitmap: Buffer, width: number, height: number, color: StatusDot): Buffer {
  const result = Buffer.from(bitmap);
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.22));
  const ring = radius + Math.max(1, Math.round(radius * 0.35));
  const centerX = width - ring;
  const centerY = height - ring;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (distance > ring) continue;
      const offset = (y * width + x) * 4;
      if (distance <= radius) {
        result[offset] = color.blue;
        result[offset + 1] = color.green;
        result[offset + 2] = color.red;
      } else {
        // A dark ring keeps the dot visible on light and dark taskbars.
        result[offset] = 0x10;
        result[offset + 1] = 0x0b;
        result[offset + 2] = 0x08;
      }
      result[offset + 3] = 0xff;
    }
  }
  return result;
}
