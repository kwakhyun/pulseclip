from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


RESAMPLING = Image.Resampling.LANCZOS
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build PulseClip icon assets from the generated master artwork.")
    parser.add_argument("source", type=Path, help="Generated square icon source image")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="PulseClip repository root")
    return parser.parse_args()


def coral_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    mask = Image.new("L", rgb.size)
    source = rgb.load()
    target = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            red, green, blue = source[x, y]
            if red > 200 and red - green > 50 and red - blue > 30:
                target[x, y] = 255
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Could not locate the coral icon tile in the source artwork.")
    return bbox


def extract_master(source_path: Path) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    left, top, right, bottom = coral_bbox(source)
    side = max(right - left, bottom - top)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    crop_left = round(center_x - side / 2)
    crop_top = round(center_y - side / 2)
    tile = source.crop((crop_left, crop_top, crop_left + side, crop_top + side)).convert("RGB")

    scale = 4
    mask = Image.new("L", (side * scale, side * scale), 0)
    draw = ImageDraw.Draw(mask)
    radius = round(side * 0.165 * scale)
    draw.rounded_rectangle(
        (0, 0, side * scale - 1, side * scale - 1),
        radius=radius,
        fill=255,
    )
    tile_mask = mask.resize((side, side), RESAMPLING)

    clean = Image.new("RGBA", (side, side))
    clean_pixels = clean.load()
    start = (255, 98, 95)
    end = (255, 61, 113)
    for y in range(side):
        for x in range(side):
            mix = (x + y) / (2 * max(1, side - 1))
            clean_pixels[x, y] = (
                round(start[0] * (1 - mix) + end[0] * mix),
                round(start[1] * (1 - mix) + end[1] * mix),
                round(start[2] * (1 - mix) + end[2] * mix),
                255,
            )

    symbol_mask = Image.new("L", (side, side), 0)
    symbol_pixels = symbol_mask.load()
    tile_pixels = tile.load()
    safe_pad = round(side * 0.09)
    for y in range(safe_pad, side - safe_pad):
        for x in range(safe_pad, side - safe_pad):
            red, green, blue = tile_pixels[x, y]
            low = min(red, green, blue)
            spread = max(red, green, blue) - low
            if low >= 220 and spread <= 32:
                symbol_pixels[x, y] = 255
            elif low >= 175 and spread <= 45:
                brightness = (low - 175) / 45
                neutrality = (45 - spread) / 45
                symbol_pixels[x, y] = round(255 * brightness * neutrality)

    clean.paste(Image.new("RGBA", (side, side), "white"), (0, 0), symbol_mask)
    clean.putalpha(tile_mask)
    return clean.resize((1024, 1024), RESAMPLING)


def save_png(image: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), RESAMPLING).save(path, optimize=True)


def build_preview(image: Image.Image, path: Path) -> None:
    canvas = Image.new("RGB", (880, 260), "#090B10")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    sizes = (16, 24, 32, 48, 64, 128)
    x = 34
    baseline = 174
    for size in sizes:
        icon = image.resize((size, size), RESAMPLING)
        canvas.paste(icon, (x, baseline - size), icon)
        draw.text((x, 198), f"{size}px", fill="#A7ACB7", font=font)
        x += max(size + 54, 112)
    draw.text((34, 28), "PulseClip icon size check", fill="#F6F7FA", font=font)
    draw.text((34, 48), "Replay loop + record dot + forward notch", fill="#767E8C", font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, optimize=True)


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    master = extract_master(args.source.resolve())

    save_png(master, root / "assets/brand/pulseclip-icon-master.png", 1024)
    save_png(master, root / "build/icon.png", 512)
    save_png(master, root / "build/tray-icon.png", 32)
    save_png(master, root / "src/renderer/assets/pulseclip-icon.png", 256)

    ico_path = root / "build/icon.ico"
    ico_path.parent.mkdir(parents=True, exist_ok=True)
    master.save(ico_path, format="ICO", sizes=[(size, size) for size in ICO_SIZES])

    build_preview(master, root / "artifacts/brand/pulseclip-icon-sizes.png")

    print(root / "assets/brand/pulseclip-icon-master.png")
    print(root / "build/icon.ico")
    print(root / "artifacts/brand/pulseclip-icon-sizes.png")


if __name__ == "__main__":
    main()
