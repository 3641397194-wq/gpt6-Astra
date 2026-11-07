"""Convert original img2.6 artwork into desktop-friendly image formats."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--hero", default="hero-girl.png")
parser.add_argument("--icon", default="icon-girl.png")
args = parser.parse_args()
assets = Path(__file__).resolve().parents[1] / "assets" / "brand-v6"
assets.mkdir(parents=True, exist_ok=True)
hero_source = args.source / args.hero
icon_source = args.source / args.icon
with Image.open(hero_source) as hero:
    hero.convert("RGB").save(assets / "hero.webp", "WEBP", quality=94, method=6)
with Image.open(icon_source) as original:
    # The original icon is edge-to-edge artwork. Only prepare platform sizes.
    icon = original.convert("RGBA")
    icon = icon.resize((1024, 1024), Image.Resampling.LANCZOS)
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1023, 1023), radius=188, fill=255)
    icon.putalpha(mask)
    icon.save(assets / "icon.png", optimize=True)
    icon.save(assets / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(assets / "avatar.webp", "WEBP", quality=96, method=6)
provenance = {
    "name": "ColdCoffee original visual identity, edition 6",
    "created": "2026-11-07",
    "model": "gpt-image-2.6",
    "quality": "high",
    "artwork": "Original adult anime heroine and matching portrait icon generated for ColdCoffee.",
    "sourceSha256": {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in [hero_source, icon_source]},
    "processing": "Format conversion, rounded icon alpha and platform size variants.",
}
(assets / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"ok": True, "assets": [file.name for file in assets.iterdir()]}, ensure_ascii=False))
