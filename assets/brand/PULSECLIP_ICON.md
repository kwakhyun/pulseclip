# PulseClip icon

The icon combines three recording concepts in one compact silhouette:

- a circular replay motion;
- a central recording status dot;
- a forward notch for immediate playback and saving.

The coral-to-rose tile follows the application's existing interface palette. The mark intentionally contains no text or initials so it remains recognizable at Windows taskbar and tray sizes.

## Generation

Mode: built-in image generation, followed by deterministic alpha extraction and multi-size export with `scripts/build-icons.py`.

Final prompt:

> Create one original, simple production desktop icon for PulseClip. Express instant replay and recording with one bold geometric symbol: a compact replay loop enclosing a recording dot with a subtle forward/play notch. Use a coral-to-rose rounded-square tile, a white symbol, generous safe padding, crisp vector-like geometry, and no text, letters, watermark, thin lines, mockup, or 3D treatment. Keep it readable at 16px and use genuine transparency outside the tile.

## Outputs

- `pulseclip-icon-master.png`: 1024px RGBA master
- `../../build/icon.ico`: Windows multi-resolution application icon
- `../../build/icon.png`: Electron build icon
- `../../build/tray-icon.png`: Windows tray icon
- `../../src/renderer/assets/pulseclip-icon.png`: in-app brand mark
