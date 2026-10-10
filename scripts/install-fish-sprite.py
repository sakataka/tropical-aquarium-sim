# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""古い35種の画像を差し替える。画像生成した魚の透過PNGを原画 side.png として保管庫に置き、sourceBodyBounds を計算し直す。

原画の置き場所は、保管庫の consumer/app-originals/fish/<species-id>/side.png（このリポジトリには入れない）。
新しい種は、保管庫の採用の記録から install-vault-species.py で取り込む。

使い方: AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-fish-sprite.py <species-id> <生成したPNG>
取り込んだ後は `uv run scripts/build-fish-sprites.py <species-id>` で body.webp を作り直し、保管庫も commit する。
"""

import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

FISH_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "fish"


def originals_dir() -> Path:
    """古い35種の原画の置き場所（保管庫の consumer/app-originals/fish/<species-id>/side.png）。"""
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser() / "consumer" / "app-originals" / "fish"


species_id, source = sys.argv[1], Path(sys.argv[2])
image = Image.open(source).convert("RGBA")
red, green, blue, alpha = image.split()
# ほぼ不透明な体は完全に不透明に、ほぼ透明な縁のもやは消す。ひれの半透明は残す。
alpha = alpha.point(lambda value: 0 if value <= 3 else 255 if value >= 240 else value)
image = Image.merge("RGBA", (red, green, blue, alpha))
left, top, right, bottom = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
original = originals_dir() / species_id / "side.png"
original.parent.mkdir(parents=True, exist_ok=True)
image.save(original, optimize=True)

species_path = FISH_DIR / species_id / "species.json"
bounds = (
    f'"sourceBodyBounds": {{\n    "x": {left},\n    "y": {top},\n'
    f'    "width": {right - left},\n    "height": {bottom - top}\n  }}'
)
text, count = re.subn(r'"sourceBodyBounds": \{[^}]*\}', bounds, species_path.read_text())
if count != 1:
    raise SystemExit(f"sourceBodyBounds not found in {species_path}")
json.loads(text)
species_path.write_text(text)
print(f"{species_id}: {image.width}x{image.height} body {left},{top} {right - left}x{bottom - top}")
