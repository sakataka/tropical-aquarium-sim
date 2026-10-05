# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""保管庫（sakataka/aquarium-assets）で採用した展示室の絵から、展示室の定義と絵を作る。

展示室の絵はガラスを純粋な緑で塗ってある。dots が測った緑の矩形（green-normalization-qa.json）
を、そのまま前面ガラスの位置として room/<hall-id>.json に書く。開ける水槽のガラスは暗い色で
塗りつぶし（水景が読み込まれるまで緑が見えないように）、準備中の水槽（phase 2 などで
src/content/tanks/ にまだない水槽）のガラスには、その水槽の水景を少し暗くして焼き込む。

使い方:
  AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-hall.py <hall-id>...

展示室の並び（order）は展示計画（catalog/exhibit-plan.json）の階と展示室の順。
絵を作り直したら `uv run scripts/build-room-thumbs.py` で館内図用の縮小版も作り直す。
"""

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "src" / "content"
GLASS_FILL = (8, 18, 24)
# 準備中の水槽に焼き込む水景の明るさ。開いている水槽と見分けられる程度に落とす。
UPCOMING_BRIGHTNESS = 0.38


def vault_path() -> Path:
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser()


def latest_scene_image(vault: Path, tank_id: str) -> Path:
    """水景の採用記録があればその画像、なければ最新の草案の納品画像。"""
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


def cover(image: Image.Image, width: int, height: int) -> Image.Image:
    scale = max(width / image.width, height / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def install(vault: Path, hall_id: str, order: int, plan_hall: dict) -> None:
    adoption = json.loads((vault / "adoptions" / f"hall-{hall_id}.json").read_text())["image"]
    image_path = vault / adoption["path"]
    qa = json.loads((image_path.parent / "green-normalization-qa.json").read_text())
    if "results" in qa:
        components = {item["tankId"]: item["bbox"] for item in qa["results"]["exactGreenComponents"]}
    else:
        # 最初の5室の記録は水槽IDを持たない。ガラスは展示計画と同じく左から並ぶ。
        boxes = sorted((item["bbox"] for item in qa["exactGreenComponents"]), key=lambda box: box[0])
        if len(boxes) != len(plan_hall["tanks"]):
            sys.exit(f"{hall_id}: 緑の矩形 {len(boxes)} 個と水槽 {len(plan_hall['tanks'])} 台が合いません")
        components = {tank["id"]: box for tank, box in zip(plan_hall["tanks"], boxes)}
    image = Image.open(image_path).convert("RGB")
    width, height = image.size

    tanks = []
    for tank in plan_hall["tanks"]:
        x0, y0, x1, y1 = components[tank["id"]]
        # 緑の縁のにじみも覆うよう、1px 広げて塗る。
        box = (x0 - 1, y0 - 1, x1 + 1, y1 + 1)
        if (CONTENT / "tanks" / tank["id"] / "tank.json").exists():
            image.paste(GLASS_FILL, box)
            rect = {"x": x0 / width, "y": y0 / height, "width": (x1 - x0) / width, "height": (y1 - y0) / height}
            tanks.append({"tankId": tank["id"], "glass": rect, "window": rect})
        else:
            scene = Image.open(latest_scene_image(vault, tank["id"])).convert("RGB")
            scene = ImageEnhance.Brightness(cover(scene, box[2] - box[0], box[3] - box[1])).enhance(UPCOMING_BRIGHTNESS)
            image.paste(scene, box[:2])
            print(f"  {tank['id']}: 準備中（水景を焼き込み）")

    image.save(CONTENT / "room" / f"{hall_id}.webp", "WEBP", quality=88, method=6)
    room = {
        "id": hall_id,
        "order": order,
        "displayName": plan_hall["displayName"],
        "shortName": plan_hall["displayName"],
        "image": f"{hall_id}.webp",
        "aspectRatio": width / height,
        "tanks": tanks,
    }
    (CONTENT / "room" / f"{hall_id}.json").write_text(json.dumps(room, ensure_ascii=False, indent=2) + "\n")
    print(f"{hall_id}: {width}x{height}, 水槽 {len(tanks)}/{len(plan_hall['tanks'])}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("halls", nargs="+")
    args = parser.parse_args()
    vault = vault_path()
    plan = json.loads((vault / "catalog" / "exhibit-plan.json").read_text())
    ordered = [hall for floor in plan["floors"] for hall in floor["halls"]]
    for hall_id in args.halls:
        index = next(i for i, hall in enumerate(ordered) if hall["id"] == hall_id)
        install(vault, hall_id, index + 1, ordered[index])


main()
