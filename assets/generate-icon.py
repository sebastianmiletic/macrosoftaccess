"""Remove the external JPEG backdrop and generate app assets from logo-source.jpeg.

White details inside the logo (the letter A) are preserved. Requires Pillow and
macOS iconutil. Run: python3 assets/generate-icon.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
from PIL import Image

root = Path(__file__).resolve().parent
source = Image.open(root / 'logo-source.jpeg').convert('RGB')
w, h = source.size
logo = Image.new('RGBA', source.size, (0, 0, 0, 0))

for y in range(h):
    # The artwork has one continuous exterior silhouette in each scanline.
    # Pixels between its two outer edges stay opaque, including white lettering.
    occupied = [x for x in range(w) if max(255 - c for c in source.getpixel((x, y))) > 36]
    if not occupied:
        continue
    left, right = occupied[0], occupied[-1]
    for x in range(max(0, left - 2), min(w, right + 3)):
        r, g, b = source.getpixel((x, y))
        if left <= x <= right:
            alpha = 255
        else:
            distance = left - x if x < left else x - right
            alpha = max(0, 255 - distance * 90)
        # Unmatte the pale antialiased exterior edge from its JPEG white background.
        if alpha < 255 and alpha > 0:
            fraction = alpha / 255
            r, g, b = (max(0, min(255, round((c - 255 * (1 - fraction)) / fraction))) for c in (r, g, b))
        logo.putpixel((x, y), (r, g, b, alpha))

logo.save(root / 'logo-transparent.png')
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
logo.thumbnail((840, 900), Image.Resampling.LANCZOS)
canvas.alpha_composite(logo, ((1024 - logo.width) // 2, (1024 - logo.height) // 2))
canvas.save(root / 'icon.png')

with TemporaryDirectory() as temp:
    iconset = Path(temp) / 'MacrosoftAccess.iconset'
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(iconset / f'icon_{size}x{size}.png')
        canvas.resize((size * 2, size * 2), Image.Resampling.LANCZOS).save(iconset / f'icon_{size}x{size}@2x.png')
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(root / 'icon.icns')], check=True)
print(f'Wrote {root / "logo-transparent.png"} and {root / "icon.icns"}')
