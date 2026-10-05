# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""展示室の一枚絵から、館内図の縮小版に使う小さな絵を room/thumbs/ に作る。

館内図では展示室が十数室並び、1室あたり幅250px前後にしか映らない。原寸の絵
（1枚150〜200KB）を全部読むと重いので、幅960pxの WebP にしておく（高精細画面でも足りる幅）。
展示室の絵を追加・差し替えたら `uv run scripts/build-room-thumbs.py` を実行する。
"""

from pathlib import Path

from PIL import Image

MAX_WIDTH = 960
ROOM_DIR = Path(__file__).resolve().parent.parent / "src" / "content" / "room"
(ROOM_DIR / "thumbs").mkdir(exist_ok=True)

for path in sorted(ROOM_DIR.glob("*.webp")):
    image = Image.open(path).convert("RGB")
    if image.width > MAX_WIDTH:
        image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)), Image.LANCZOS)
    output = ROOM_DIR / "thumbs" / path.name
    image.save(output, "WEBP", quality=78, method=6)
    print(f"{path.name}: {image.width}x{image.height} {output.stat().st_size // 1024}KB")
