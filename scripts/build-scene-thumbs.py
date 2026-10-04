# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""水景の一枚絵 plate.webp から、館内図の縮小版に使う小さな thumb.webp を作る。

館内図ではどの展示室の水槽も幅200px前後にしか映らないため、1枚150KB前後の
plate.webp を全部読むと重い。最大幅480pxの WebP にしておく。
水景を追加・差し替えたら `uv run scripts/build-scene-thumbs.py` を実行する。
"""

from pathlib import Path

from PIL import Image

MAX_WIDTH = 480
SCENES_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "environment" / "scenes"

for scene_dir in sorted(path for path in SCENES_DIR.iterdir() if path.is_dir()):
    plate = Image.open(scene_dir / "plate.webp").convert("RGB")
    if plate.width > MAX_WIDTH:
        plate = plate.resize((MAX_WIDTH, round(plate.height * MAX_WIDTH / plate.width)), Image.LANCZOS)
    plate.save(scene_dir / "thumb.webp", "WEBP", quality=80, method=6)
    print(f"{scene_dir.name}: {plate.width}x{plate.height}")
