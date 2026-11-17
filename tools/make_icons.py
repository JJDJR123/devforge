from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

SIZE = 1024
BG_TOP = (22, 32, 24)
BG_BOTTOM = (9, 13, 10)
ACCENT = (200, 247, 106)
ACCENT_DARK = (164, 214, 75)
CYAN = (94, 234, 212)
ORANGE = (255, 157, 92)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), BG_BOTTOM)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / (size - 1)
        # ease-out vertical gradient
        t = 1 - (1 - t) ** 2
        color = tuple(round(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3))
        draw.line((0, y, size, y), fill=color)
    return image


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    image = gradient(size)
    draw = ImageDraw.Draw(image, "RGBA")

    # grid
    step = size // 16
    for i in range(1, 16):
        line = (200, 247, 106, 16)
        draw.line((i * step, 0, i * step, size), fill=line)
        draw.line((0, i * step, size, i * step), fill=line)

    # soft radial glow behind the mark
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    cx, cy = size * 0.5, size * 0.5
    for r in range(int(size * 0.34), 0, -8):
        alpha = max(0, int(26 * (1 - r / (size * 0.34))))
        gdraw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(200, 247, 106, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.035))
    image = Image.alpha_composite(image.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(image, "RGBA")

    # pixel D
    scale = 0.86 if maskable else 1.0
    cell = int(size * 0.088 * scale)
    origin_x = int(size * 0.5 - cell * 2.5)
    origin_y = int(size * 0.5 - cell * 2.5)
    cells = [
        (0, 0), (1, 0), (2, 0),
        (0, 1), (3, 1),
        (0, 2), (3, 2),
        (0, 3), (3, 3),
        (0, 4), (1, 4), (2, 4),
    ]
    gap = max(2, int(cell * 0.08))

    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    for gx, gy in cells:
        x = origin_x + gx * cell
        y = origin_y + gy * cell
        glow_draw.rounded_rectangle(
            (x, y, x + cell - gap, y + cell - gap),
            radius=int(cell * 0.12),
            fill=(*ACCENT, 170),
        )
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(size * 0.02))
    image = Image.alpha_composite(image.convert("RGBA"), glow_layer).convert("RGB")
    draw = ImageDraw.Draw(image, "RGBA")

    for gx, gy in cells:
        x = origin_x + gx * cell
        y = origin_y + gy * cell
        color = ACCENT if (gx + gy) % 3 else ACCENT_DARK
        draw.rounded_rectangle(
            (x, y, x + cell - gap, y + cell - gap),
            radius=int(cell * 0.12),
            fill=(*color, 255),
        )

    # cyan corner + orange tick
    cyan_size = int(cell * 0.72)
    draw.rounded_rectangle(
        (
            origin_x + 4 * cell + int(cell * 0.16),
            origin_y + int(cell * 0.16),
            origin_x + 4 * cell + int(cell * 0.16) + cyan_size,
            origin_y + int(cell * 0.16) + cyan_size,
        ),
        radius=int(cyan_size * 0.18),
        fill=(*CYAN, 235),
    )
    orange_size = int(cell * 0.42)
    draw.rounded_rectangle(
        (
            origin_x - int(cell * 0.52),
            origin_y + 5 * cell + int(cell * 0.08),
            origin_x - int(cell * 0.52) + orange_size,
            origin_y + 5 * cell + int(cell * 0.08) + orange_size,
        ),
        radius=int(orange_size * 0.2),
        fill=(*ORANGE, 220),
    )

    # border
    draw.rounded_rectangle(
        (3, 3, size - 4, size - 4),
        radius=int(size * 0.22),
        outline=(200, 247, 106, 55),
        width=max(2, size // 256),
    )

    # rounded corners
    mask = rounded_mask(size, int(size * 0.22))
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(image.convert("RGBA"), (0, 0), mask)
    return result


base = draw_icon(SIZE)
for target, name in [
    (512, "icon-512.png"),
    (192, "icon-192.png"),
    (180, "apple-touch-icon.png"),
    (32, "favicon-32.png"),
]:
    base.resize((target, target), Image.Resampling.LANCZOS).save(ASSETS / name, optimize=True)

maskable = draw_icon(SIZE, maskable=True).resize((512, 512), Image.Resampling.LANCZOS)
maskable.save(ASSETS / "icon-maskable-512.png", optimize=True)

# A small vector mark for the browser tab.
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0a0d0b"/>
<g fill="#c8f76a">
<rect x="15" y="15" width="8" height="8" rx="1"/><rect x="23" y="15" width="8" height="8" rx="1"/><rect x="31" y="15" width="8" height="8" rx="1"/>
<rect x="15" y="23" width="8" height="8" rx="1"/><rect x="39" y="23" width="8" height="8" rx="1"/>
<rect x="15" y="31" width="8" height="8" rx="1"/><rect x="39" y="31" width="8" height="8" rx="1"/>
<rect x="15" y="39" width="8" height="8" rx="1"/><rect x="23" y="39" width="8" height="8" rx="1"/><rect x="31" y="39" width="8" height="8" rx="1"/>
</g>
<rect x="39" y="15" width="8" height="8" rx="1" fill="#5eead4"/>
<rect x="47" y="47" width="5" height="5" rx="1" fill="#ff9d5c"/>
</svg>
"""
(ROOT / "favicon.svg").write_text(svg, encoding="utf-8")
(ASSETS / "icon.svg").write_text(svg, encoding="utf-8")

print("icons written to", ASSETS)
