# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""画像生成した魚の原画 side.png から、描画用の軽い body.webp を作る。

原画は1枚1MB前後・1500px幅あり、スマホでは読み込みとGPUメモリの負担が大きい。
species.json の sourceBodyBounds で体の部分だけを切り出し、最大幅720pxの
透過WebPにする。魚を追加・差し替えたら `uv run scripts/build-fish-sprites.py` を実行する。
"""

import json
from pathlib import Path

from PIL import Image

MAX_WIDTH = 720
FISH_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "fish"

for species_dir in sorted(path for path in FISH_DIR.iterdir() if path.is_dir()):
    species = json.loads((species_dir / "species.json").read_text())
    bounds = species["sourceBodyBounds"]
    image = Image.open(species_dir / "side.png").convert("RGBA")
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
