# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""保管庫（sakataka/aquarium-assets）で採用した原画から、描画用の body.webp と sourceBodyBounds を作る。

原画はリポジトリに入れない。保管庫の adoptions/<species-id>.json が指す画像を読み、
ほぼ透明な縁のもやを消し、体の外接矩形で切り出して最大幅720pxの透過WebPにする。

使い方:
  AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-species.py [--dest DIR] <species-id>...
  AQUARIUM_ASSET_VAULT=... uv run scripts/install-vault-species.py --all-adopted

既定の出力先は content-drafts/fish/<species-id>/（下書き。アプリは読み込まない）。
展示室を開けるときに src/content/fish/ へ移す。species.json があれば sourceBodyBounds だけを
書き換え、なければ名前と sourceBodyBounds だけの雛形を作る。
"""

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAX_WIDTH = 720


def vault_path() -> Path:
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser()


def display_names(vault: Path) -> dict[str, str]:
    names = {}
    for name in ("species-backlog.json", "dots-additions.json"):
        path = vault / "catalog" / name
        if path.exists():
            for entry in json.loads(path.read_text())["entries"]:
                names[entry["speciesId"]] = entry["nameJa"]
    return names


def install(vault: Path, species_id: str, dest: Path, names: dict[str, str]) -> None:
    adoption = json.loads((vault / "adoptions" / f"{species_id}.json").read_text())
    image = Image.open(vault / adoption["image"]["path"]).convert("RGBA")
    red, green, blue, alpha = image.split()
    # ほぼ不透明な体は完全に不透明に、ほぼ透明な縁のもやは消す。ひれの半透明は残す。
    alpha = alpha.point(lambda value: 0 if value <= 3 else 255 if value >= 240 else value)
    image = Image.merge("RGBA", (red, green, blue, alpha))
    left, top, right, bottom = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()

    folder = dest / species_id
    folder.mkdir(parents=True, exist_ok=True)
    body = image.crop((left, top, right, bottom))
    if body.width > MAX_WIDTH:
        body = body.resize((MAX_WIDTH, round(body.height * MAX_WIDTH / body.width)), Image.LANCZOS)
    body.save(folder / "body.webp", "WEBP", quality=88, method=6)

    bounds = {"x": left, "y": top, "width": right - left, "height": bottom - top}
    species_path = folder / "species.json"
    species = json.loads(species_path.read_text()) if species_path.exists() else {
        "id": species_id,
        "displayName": names.get(species_id, species_id),
    }
    species["sourceBodyBounds"] = bounds
    species_path.write_text(json.dumps(species, ensure_ascii=False, indent=2) + "\n")
    size = (folder / "body.webp").stat().st_size // 1024
    print(f"{species_id}: body {left},{top} {right - left}x{bottom - top} -> {body.width}x{body.height} {size}KB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("species", nargs="*")
    parser.add_argument("--all-adopted", action="store_true")
    parser.add_argument("--dest", default=str(ROOT / "content-drafts" / "fish"))
    args = parser.parse_args()
    vault = vault_path()
    ids = args.species
    if args.all_adopted:
        # adoptions/ には展示室（hall-*）や水景（scene-*）の採否もあるので、生き物だけを選ぶ。
        ids = sorted(path.stem for path in (vault / "adoptions").glob("*.json")
                     if "speciesId" in json.loads(path.read_text()))
    if not ids:
        parser.error("species id か --all-adopted を指定してください")
    names = display_names(vault)
    for species_id in ids:
        install(vault, species_id, Path(args.dest), names)


main()
