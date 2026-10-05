# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""保管庫（sakataka/aquarium-assets）の水景を、水槽ごとの水景として取り込む。

dots の水景は水槽ごとに1枚（scene-<tank-id>）なので、水景の id は水槽の id と同じにする。
adoptions/scene-<tank-id>.json があればその画像、なければ最新の草案の納品画像を使う。
plate.webp を書き、scene.json がなければ雛形（名前と説明は空欄の仮）を作る。

dots は水槽のガラスの縦横比に合わせ、中央で切り取る前提で構図を作っている。アプリは既定で
画像の下端をガラスの下端に合わせるので、ガラスが画像より横長な水槽は framing.plateBottom で
中央の帯が映るようにする。

使い方:
  AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-scene.py <tank-id>...

取り込んだら `uv run scripts/build-scene-thumbs.py` で館内図用の縮小版を作る。
"""

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "src" / "content" / "environment" / "scenes"


def vault_path() -> Path:
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser()


def latest_scene_image(vault: Path, tank_id: str) -> Path:
    adoption = vault / "adoptions" / f"scene-{tank_id}.json"
    if adoption.exists():
        return vault / json.loads(adoption.read_text())["image"]["path"]
    states = sorted((vault / "queue" / "state" / f"scene-{tank_id}.standard.image").glob("r*.json"),
                    key=lambda path: int(path.stem[1:]))
    # dots が作り直している最中の版は成果物がまだないので、成果物のある最新の版を使う。
    output = next(state["outputs"][-1] for state in (json.loads(path.read_text()) for path in reversed(states))
                  if state["outputs"])
    paths = [artifact["path"] for artifact in output["artifacts"]]
    chosen = next((p for p in paths if p.endswith("delivery.png")), None) or next(p for p in paths if p.endswith("original.png"))
    return vault / chosen


def install(vault: Path, tank: dict, order: int) -> None:
    source = latest_scene_image(vault, tank["id"])
    image = Image.open(source).convert("RGB")
    folder = SCENES / tank["id"]
    folder.mkdir(parents=True, exist_ok=True)
    image.save(folder / "plate.webp", "WEBP", quality=92, method=6)

    scene_path = folder / "scene.json"
    scene = json.loads(scene_path.read_text()) if scene_path.exists() else {
        "id": tank["id"],
        "order": order,
        "displayName": tank["displayName"],
        "description": tank["sceneEn"],
        "defaultLighting": "natural",
        "waterColor": "#2a6f80",
    }
    visible = min(1.0, (image.width / image.height) / tank["glassAspect"])
    if visible < 0.98:
        scene["framing"] = {"plateBottom": round((1 + visible) / 2, 3)}
    else:
        scene.pop("framing", None)
    scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n")
    print(f"{tank['id']}: {image.width}x{image.height} 見える高さ {visible:.2f} <- {source.relative_to(vault)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tanks", nargs="+")
    args = parser.parse_args()
    vault = vault_path()
    plan = json.loads((vault / "catalog" / "exhibit-plan.json").read_text())
    tanks = [tank for floor in plan["floors"] for hall in floor["halls"] for tank in hall["tanks"]]
    for tank_id in args.tanks:
        index = next(i for i, tank in enumerate(tanks) if tank["id"] == tank_id)
        install(vault, tanks[index], 100 + index)


main()
