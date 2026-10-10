# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""古い35種の原画 side.png から、描画用の軽い body.webp を作る。

原画は1枚1MB前後・1500px幅あり、スマホでは読み込みとGPUメモリの負担が大きい。
species.json の sourceBodyBounds で体の部分だけを切り出し、最大幅720pxの透過WebPにする。
原画はこのリポジトリではなく、保管庫の consumer/app-originals/fish/<species-id>/side.png にある
（2026年10月10日に移した）。原画がそこにある種だけを作り直す。新しい種は install-vault-species.py で取り込む。

使い方: AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/build-fish-sprites.py [<species-id>...]
"""

import json
import os
import sys
from pathlib import Path

from PIL import Image

MAX_WIDTH = 720
FISH_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "fish"


def originals_dir() -> Path:
    """古い35種の原画の置き場所（保管庫の consumer/app-originals/fish/<species-id>/side.png）。"""
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser() / "consumer" / "app-originals" / "fish"


ORIGINALS = originals_dir()
wanted = sys.argv[1:] or sorted(path.name for path in ORIGINALS.iterdir() if (path / "side.png").exists())
for species_id in wanted:
    species_dir = FISH_DIR / species_id
    species = json.loads((species_dir / "species.json").read_text())
    bounds = species["sourceBodyBounds"]
    image = Image.open(ORIGINALS / species_id / "side.png").convert("RGBA")
    body = image.crop((
        bounds["x"],
        bounds["y"],
        bounds["x"] + bounds["width"],
        bounds["y"] + bounds["height"],
    ))
    if body.width > MAX_WIDTH:
        body = body.resize((MAX_WIDTH, round(body.height * MAX_WIDTH / body.width)), Image.LANCZOS)
    output = species_dir / "body.webp"
    body.save(output, "WEBP", quality=88, method=6)
    print(f"{species['id']}: {body.width}x{body.height} {output.stat().st_size // 1024}KB")
