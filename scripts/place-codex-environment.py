# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11", "numpy>=2", "scipy>=1.14"]
# ///
"""Codex の画像生成で作った展示室の絵・水景を、保管庫に置いて採用を記録する。

dots が止まっている間、環境の絵（展示室・水景）は Codex で作る。dots の `drafts/`・`environment/`
には書けないので、原画は保管庫の `consumer/app-originals/environment/<entityId>/` に置き、
`adoptions/<entityId>.json` の画像のパスをそこへ向ける。こうしておけば、取り込みは dots の絵と同じ
`install-vault-hall.py`・`install-vault-scene.py` で通る。

展示室の絵（`hall-<hall-id>`）は、ガラスの緑を純粋な #00FF00 にそろえ、緑の矩形を測って
`green-normalization-qa.json`（dots と同じ形）を書く。矩形は展示計画の水槽の並びと同じく左から
数える。測った縦横比を展示計画の `glassAspect` に書き、水槽の高さ（`heightCm`）をそれに合わせる
（`--no-plan` で書かない）。

使い方:
  AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/place-codex-environment.py \
    hall-ryukyu-rivers --image out/hall.png --original out/hall.original.png --prompt out/hall.prompt.txt \
    --ref drafts/hall-japan-rivers/standard/image/request-r1/attempt-1/delivery-normalized.png
  （水景は scene-<tank-id>。`--ref` は保管庫の中のパスで、何枚でも書ける）
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

JST = timezone(timedelta(hours=9))
# 緑とみなす範囲と、ガラスとみなす最小の大きさ。dots の測り方と同じ。
MIN_GLASS_PIXELS = 1000
# 緑の画素が外接矩形を埋める割合。これより低ければ、ガラスが長方形に塗れていない。
MIN_FILL = 0.97


def vault_path() -> Path:
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plan_hall(plan: dict, hall_id: str) -> dict:
    return next(hall for floor in plan["floors"] for hall in floor["halls"] if hall["id"] == hall_id)


def normalize_green(folder: Path, hall: dict, write_plan: bool) -> Path:
    """緑を #00FF00 にそろえた絵と、緑の矩形の記録を書く。"""
    source = folder / "delivery.png"
    pixels = np.array(Image.open(source).convert("RGB"))
    red, green, blue = (pixels[..., channel].astype(int) for channel in range(3))
    mask = (red < 70) & (green > 180) & (blue < 70)
    labels, count = ndimage.label(mask)
    boxes = []
    selected = np.zeros_like(mask)
    for label, slices in enumerate(ndimage.find_objects(labels), start=1):
        region = labels[slices] == label
        if region.sum() < MIN_GLASS_PIXELS:
            continue
        selected[slices] |= region
        y, x = slices
        boxes.append({"label": label, "bbox": [x.start, y.start, x.stop, y.stop], "pixelCount": int(region.sum())})
    boxes.sort(key=lambda box: box["bbox"][0])
    tanks = hall["tanks"]
    if len(boxes) != len(tanks):
        sys.exit(f"{hall['id']}: 緑の矩形 {len(boxes)} 個と水槽 {len(tanks)} 台が合いません（緑の領域は全部で {count} 個）")

    height, width = mask.shape
    for box, tank in zip(boxes, tanks):
        x0, y0, x1, y1 = box["bbox"]
        box["tankId"] = tank["id"]
        box["aspectRatio"] = (x1 - x0) / (y1 - y0)
        box["widthFraction"] = (x1 - x0) / width
        box["fill"] = box["pixelCount"] / ((x1 - x0) * (y1 - y0))
        box["plannedAspect"] = tank["widthCm"] / tank["heightCm"]
        flags = []
        if box["fill"] < MIN_FILL:
            flags.append("長方形に塗れていない")
        if box["widthFraction"] < 0.06:
            flags.append("幅が絵の6%より狭い")
        print(f"  {tank['id']}: {x1 - x0}x{y1 - y0} 縦横比 {box['aspectRatio']:.2f}（計画 {box['plannedAspect']:.2f}）"
              f" 幅 {box['widthFraction']:.1%} 塗り {box['fill']:.3f} {' '.join(flags)}")
        if write_plan:
            tank["glassAspect"] = round(box["aspectRatio"], 2)
            tank["heightCm"] = round(tank["widthCm"] / box["aspectRatio"])

    pixels[selected] = (0, 255, 0)
    normalized = folder / "delivery-normalized.png"
    Image.fromarray(pixels).save(normalized)
    qa = {
        "createdAt": datetime.now(JST).isoformat(timespec="seconds"),
        "method": "R<70,G>180,B<70; connected regions >=1000 pixels; replace only mask pixels with RGB 0,255,0; "
                  "components numbered left to right in the exhibit plan's tank order",
        "sourceSha256": sha256(source),
        "maskPixels": int(selected.sum()),
        "results": {
            "width": width,
            "height": height,
            "mode": "RGB",
            "sha256": sha256(normalized),
            "exactGreenComponents": boxes,
        },
    }
    (folder / "green-normalization-qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("entity", help="hall-<hall-id> か scene-<tank-id>")
    parser.add_argument("--image", required=True, type=Path, help="取り込む大きさにそろえた絵")
    parser.add_argument("--original", type=Path, help="生成したままの絵（あれば）")
    parser.add_argument("--prompt", required=True, type=Path)
    parser.add_argument("--ref", action="append", default=[], help="参照画像（保管庫の中のパス）")
    parser.add_argument("--notes", default="dots が作業を止めている間に、Codex の画像生成で作った。")
    parser.add_argument("--no-plan", action="store_true", help="展示計画の glassAspect と heightCm を書かない")
    args = parser.parse_args()

    kind, _, target = args.entity.partition("-")
    if kind not in ("hall", "scene") or not target:
        sys.exit("entity は hall-<hall-id> か scene-<tank-id>")
    vault = vault_path()
    plan_path = vault / "catalog" / "exhibit-plan.json"
    plan = json.loads(plan_path.read_text())
    if kind == "scene" and not any(tank["id"] == target for floor in plan["floors"] for hall in floor["halls"] for tank in hall["tanks"]):
        sys.exit(f"{target}: 展示計画に水槽がありません")

    folder = vault / "consumer" / "app-originals" / "environment" / args.entity
    folder.mkdir(parents=True, exist_ok=True)
    Image.open(args.image).convert("RGB").save(folder / "delivery.png")
    if args.original:
        shutil.copyfile(args.original, folder / "original.png")
    shutil.copyfile(args.prompt, folder / "prompt.txt")

    adopted = folder / "delivery.png"
    if kind == "hall":
        adopted = normalize_green(folder, plan_hall(plan, target), not args.no_plan)
        if not args.no_plan:
            plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")

    now = datetime.now(JST).isoformat(timespec="seconds")
    with Image.open(adopted) as image:
        size = list(image.size)
    generation = {
        "entityId": args.entity,
        "kind": kind,
        "madeBy": "codex-image-generation (via Claude Code)",
        "madeAt": now,
        "references": [{"path": ref, "sha256": sha256(vault / ref)} for ref in args.ref],
        "size": size,
        "deliverySha256": sha256(folder / "delivery.png"),
        "originalSha256": sha256(folder / "original.png") if args.original else None,
        "notesJa": args.notes,
    }
    (folder / "generation.json").write_text(json.dumps(generation, ensure_ascii=False, indent=2) + "\n")

    adoption = {
        "schemaVersion": "aquarium-adoption/1",
        "entityId": args.entity,
        "kind": kind,
        "image": {
            "status": "accepted",
            "source": "codex",
            "path": str(adopted.relative_to(vault)),
            "sha256": sha256(adopted),
            "decidedAt": now,
            "decidedBy": "claude-code",
            "notesJa": args.notes,
        },
    }
    (vault / "adoptions" / f"{args.entity}.json").write_text(json.dumps(adoption, ensure_ascii=False, indent=2) + "\n")
    print(f"{args.entity}: {size[0]}x{size[1]} -> {adopted.relative_to(vault)}")


main()
