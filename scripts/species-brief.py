# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=11",
# ]
# ///
"""種の定義（src/content/fish/<id>/species.json）の、動きと見え方に関わる値を、種ごとに数行で並べる。

水槽の仕上げ（docs/agent-lanes/tank-finish.md）で、最初に種を見直すときに使う。読むだけで、内容ファイルは書き換えない。

使い方:
  uv run scripts/species-brief.py <種id>...            指定した種
  uv run scripts/species-brief.py --tank <水槽id>      その水槽の種（水槽と水景の見出しも出す）
  --text      図鑑の文（catalog の origin・temperament・movement・habitat、profile の highlights・sizeNote・保全の注）も出す
  --anchors [出力.jpg]  各種の体の絵（body.webp）に、swim の「絵の中の位置」の項目を印で重ねた一覧を1枚に出す
                        （省くと tmp/tank-work/<水槽id または species>/anchors.jpg）

一覧の印: 赤の十字 = mouthAnchor（丸つきは既定値）、緑の十字 = footAnchor（丸つきは既定値。面を歩く生き物だけ既定値も描く）、
水色の縦線 = headStart、黄 = shell・radial・bell、マゼンタ = feelers・fins、橙 = legs・limbs・spine・wings・tailStartY。
泳ぐ魚は頭の側（絵の左45%）を拡大し、絵の中の位置の項目が多い生き物は絵の全体を出す。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # scripts/ に __pycache__ を作らない
import plate_frame

ROOT = Path(__file__).resolve().parent.parent
FISH = ROOT / "src" / "content" / "fish"
TANKS = ROOT / "src" / "content" / "tanks"
SCENES = ROOT / "src" / "content" / "environment" / "scenes"
DRAFTS = [ROOT / "content-drafts" / "prepared" / "fish", ROOT / "content-drafts" / "fish"]
OUT = ROOT / "tmp" / "tank-work"
# src/core/simulation.ts の ACTIVITY_BY_LIGHT と同じ表。
ACTIVITY = {
    "diurnal": {"natural": 1, "cool": 1, "evening": 0.7, "night": 0.3},
    "crepuscular": {"natural": 0.75, "cool": 0.75, "evening": 1.1, "night": 0.8},
    "nocturnal": {"natural": 0.3, "cool": 0.3, "evening": 0.9, "night": 1.1},
}
# src/core/bodyPlans.ts で walksOnSurfaces が true の体のつくり。
WALKER_PLANS = {"crustacean", "crab", "octopus", "walker", "horseshoeCrab", "seaStar", "urchin", "gastropod"}
# src/render/fishBody.ts の DEFAULT_SWIM。
DEFAULT_MOUTH, DEFAULT_FOOT = {"x": 0.025, "y": 0.62}, {"x": 0.42, "y": 0.95}
# 絵の全体を見せる項目（頭の側だけでは位置が切れる）。
WHOLE_BODY_KEYS = ("footAnchor", "shell", "legs", "limbs", "radial", "bell", "spine", "wings", "fins", "tailStartY", "feelers")
CELL = (300, 205)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def number(value: float) -> str:
    return f"{value:g}"


def habit_text(habit: dict) -> str:
    kind = habit["type"]
    if kind == "homeShelter":
        return (f"homeShelter({habit['kind']}, 範囲 体長×{number(habit['rangeBodyLengths'])}, {number(habit['visitChancePerMin'])}/分, "
                f"{number(habit['visitDurationSec'][0])}–{number(habit['visitDurationSec'][1])}秒)")
    if kind == "airBreathing":
        return f"airBreathing({habit['style']}, 毎時{number(habit['breathsPerHour'][0])}–{number(habit['breathsPerHour'][1])}回)"
    parts = []
    if "chancePerMin" in habit:
        parts.append(f"{number(habit['chancePerMin'])}/分")
    if "durationSec" in habit:
        parts.append(f"{number(habit['durationSec'][0])}–{number(habit['durationSec'][1])}秒")
    return f"{kind}({', '.join(parts)})" if parts else kind


def swim_text(swim: dict) -> str:
    parts = []
    for key, value in swim.items():
        if key == "bodyPlan":
            continue
        if isinstance(value, dict) and set(value) == {"x", "y"}:
            parts.append(f"{key}({number(value['x'])},{number(value['y'])})")
        elif isinstance(value, list):
            parts.append(f"{key}×{len(value)}")
        elif isinstance(value, dict):
            parts.append(f"{key}{{{', '.join(f'{k} {number(v)}' for k, v in value.items())}}}")
        else:
            parts.append(f"{key} {number(value)}")
    return " ".join(parts) or "（既定のまま）"


def brief(species: dict, tank: dict | None, lighting: str | None, text: bool) -> list[str]:
    ecology, zone, profile = species["ecology"], species["preferredZone"], species["profile"]
    swim = species.get("swim", {})
    plan = swim.get("bodyPlan", "fish")
    length = species["realBodyLengthCm"]
    share = ""
    if tank:
        percent = 100 * length / tank["widthCm"]
        share = f"（幅の{percent:.1f}%{' ← 3%未満' if percent < 3 else ' ← 35%超' if percent > 35 else ''}）"
    period = ecology["activityPeriod"]
    activity = f"（{lighting} での活動 {ACTIVITY[period][lighting]}）" if lighting else ""
    social, speed = ecology["social"], ecology["speedBodyLengthsPerSec"]
    lines = [
        f"■ {species['id']} {species['displayName']}  画面の体長 {number(length)}cm{share} / 図鑑 {number(profile['adultSizeCm'])}cm / 体のつくり {plan}"
        f"{'（面を歩く）' if plan in WALKER_PLANS else ''}",
        f"  preferredZone x {number(zone['minX'])}–{number(zone['maxX'])} y {number(zone['minY'])}–{number(zone['maxY'])} / depthRange {number(ecology['depthRange'][0])}–{number(ecology['depthRange'][1])}"
        f" / {period}{activity} / {ecology['gait']} 巡航 {number(speed['cruise'])}・瞬発 {number(speed['burst'])} 体長/秒 旋回 {number(ecology['turnRateRadPerSec'])} / restFraction {number(ecology['restFraction'])}",
        f"  群れ {social['grouping']} 間隔 {number(social['spacingBodyLengths'])} cohesion {number(social['cohesion'])} polarization {number(social['polarization'])}"
        f" / structureAffinity {number(ecology['structureAffinity'])} / 習性 {'、'.join(habit_text(h) for h in ecology['habits']) or 'なし'}",
        f"  swim {swim_text(swim)}",
    ]
    if text:
        catalog = species["catalog"]
        conservation = profile.get("conservation", {})
        status = conservation.get("status", "区分なし") + (f"（{conservation['assessedYear']}）" if "assessedYear" in conservation else "")
        lines += [
            f"  学名 {catalog['scientificName']} / 地域 {catalog['originRegionName']} / 飼育 {profile['keeping']} / 保全 {status}",
            f"  origin: {catalog['origin']}",
            f"  temperament: {catalog['temperament']}",
            f"  movement: {catalog['movement']}",
            f"  habitat: {catalog['habitat']}",
            *[f"  highlight: {item}" for item in profile.get("highlights", [])],
            f"  sizeNote: {profile.get('sizeNote', '')}",
        ]
        if conservation.get("note"):
            lines.append(f"  保全の注: {conservation['note']}")
    for folder in DRAFTS:
        draft = folder / species["id"]
        if (draft / "notes.md").exists():
            lines.append(f"  下書きの注: {(draft / 'notes.md').relative_to(ROOT)}")
        elif draft.exists():
            lines.append(f"  下書き: {draft.relative_to(ROOT)}/")
    return lines


def tank_header(tank: dict) -> tuple[list[str], str | None]:
    aspect, _ = plate_frame.tank_glass(tank)
    visible_height = min(tank["heightCm"], tank["widthCm"] / aspect)
    default = {entry["speciesId"]: entry["count"] for entry in tank.get("defaultStock", [])}
    lines = [
        f"水槽 {tank['id']}「{tank['displayName']}」 category「{tank['category']}」 幅 {number(tank['widthCm'])} × 見える高さ {visible_height:.0f}（仕様 {number(tank['heightCm'])}）× 奥行き {number(tank['depthCm'])}cm"
        f" / 既定 {sum(default.values())}匹・上限 {tank['maxTotalFish']}匹",
        "  匹数（既定/上限）: " + "、".join(f"{slot['speciesId']} {default.get(slot['speciesId'], 0)}/{slot['maxCount']}" for slot in tank["species"]),
    ]
    lighting = None
    for scene_id in tank["sceneIds"]:
        path = SCENES / scene_id / "scene.json"
        if not path.exists():
            continue
        scene = read_json(path)
        lighting = lighting or scene["defaultLighting"]
        water_line = scene.get("waterLine")
        lines.append(f"水景 {scene['id']}「{scene['displayName']}」 照明 {scene['defaultLighting']} / waterColor {scene['waterColor']}"
                     f" / plateBottom {scene.get('framing', {}).get('plateBottom', '既定（1）')}"
                     f" / waterLine {f'front {water_line['front']} back {water_line['back']}' if water_line else 'なし（全体が水中）'}")
    return lines, lighting


# ---------------------------------------------------------------- 絵の中の位置の一覧


def anchor_sheet(species_list: list[dict], out: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.load_default(size=12)
    columns = min(3, len(species_list))
    rows = -(-len(species_list) // columns)
    sheet = Image.new("RGB", (CELL[0] * columns, CELL[1] * rows), (70, 84, 92))
    draw = ImageDraw.Draw(sheet)
    red, green, cyan, yellow, magenta, orange = (255, 60, 50), (60, 255, 90), (0, 235, 255), (255, 230, 60), (255, 80, 255), (255, 160, 40)
    for index, species in enumerate(species_list):
        body_path = FISH / species["id"] / "body.webp"
        ox, oy = (index % columns) * CELL[0], (index // columns) * CELL[1]
        draw.text((ox + 4, oy + 2), species["id"][:44], fill=(255, 255, 255), font=font)
        if not body_path.exists():
            continue
        swim = species.get("swim", {})
        walker = swim.get("bodyPlan", "fish") in WALKER_PLANS
        whole = walker or any(key in swim for key in WHOLE_BODY_KEYS)
        body = Image.open(body_path).convert("RGBA")
        crop_w = body.width if whole else round(body.width * 0.45)
        scale = min((CELL[0] - 20) / crop_w, (CELL[1] - 24) / body.height)
        tile = body.crop((0, 0, crop_w, body.height)).resize((max(1, round(crop_w * scale)), max(1, round(body.height * scale))), Image.LANCZOS)
        left, top = ox + 14, oy + 20
        sheet.paste(tile, (left, top), tile)

        def at(point: dict) -> tuple[float, float]:
            return left + point["x"] * body.width * scale, top + point["y"] * body.height * scale

        def cross(point: dict, color, default: bool) -> None:
            x, y = at(point)
            if x > left + tile.width + 2:
                return
            for width, fill in ((4, (0, 0, 0)), (2, color)):
                draw.line([(x - 9, y), (x + 9, y)], fill=fill, width=width)
                draw.line([(x, y - 9), (x, y + 9)], fill=fill, width=width)
            if default:
                draw.ellipse([x - 6, y - 6, x + 6, y + 6], outline=color, width=1)

        def path(points: list[dict], color, width=2) -> None:
            draw.line([at(p) for p in points], fill=color, width=width)

        w, h = body.width * scale, body.height * scale
        if "headStart" in swim:
            x = left + swim["headStart"] * w
            draw.line([(x, top), (x, top + h)], fill=cyan, width=2)
        for ellipse in swim.get("shell", []):
            cx, cy = at(ellipse)
            draw.ellipse([cx - ellipse["rx"] * w, cy - ellipse["ry"] * h, cx + ellipse["rx"] * w, cy + ellipse["ry"] * h], outline=yellow, width=2)
        if "radial" in swim:
            cx, cy = at(swim["radial"])
            for radius in (swim["radial"]["radius"], swim["radial"]["reach"]):
                draw.ellipse([cx - radius * w, cy - radius * w, cx + radius * w, cy + radius * w], outline=yellow, width=2)
        if "bell" in swim:
            for key in ("top", "bottom"):
                draw.line([(left, top + swim["bell"][key] * h), (left + w, top + swim["bell"][key] * h)], fill=yellow, width=2)
        for feeler in swim.get("feelers", []):
            path([feeler["base"], feeler["tip"]], magenta)
            bx, by = at(feeler["base"])
            draw.ellipse([bx - 3, by - 3, bx + 3, by + 3], fill=magenta)
        for fin in swim.get("fins", []):
            cx, cy = at(fin)
            draw.ellipse([cx - fin["radius"] * w, cy - fin["radius"] * w, cx + fin["radius"] * w, cy + fin["radius"] * w], outline=magenta, width=2)
        for leg in swim.get("legs", []):
            path([leg, *([leg["knee"]] if "knee" in leg else []), {"x": leg["footX"], "y": leg["footY"]}], orange)
        for limb in swim.get("limbs", []):
            path(limb["joints"], orange)
        if "spine" in swim:
            path(swim["spine"], orange)
        if "tailStartY" in swim:
            draw.line([(left, top + swim["tailStartY"] * h), (left + w, top + swim["tailStartY"] * h)], fill=orange, width=2)
        if "wings" in swim:
            wings = swim["wings"]
            for side in (-1, 1):
                x = 0.5 + side * wings["rootX"]
                path([{"x": x, "y": wings["top"]}, {"x": x, "y": wings["bottom"]}], orange)
                cross({"x": x, "y": wings["y"]}, orange, False)
        if walker or "footAnchor" in swim:
            cross(swim.get("footAnchor", DEFAULT_FOOT), green, "footAnchor" not in swim)
        if not walker or "mouthAnchor" in swim:
            cross(swim.get("mouthAnchor", DEFAULT_MOUTH), red, "mouthAnchor" not in swim)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=88)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("species", nargs="*", help="種の id")
    parser.add_argument("--tank", help="水槽の id（その水槽の種を並べる）")
    parser.add_argument("--text", action="store_true", help="図鑑の文も出す")
    parser.add_argument("--anchors", nargs="?", const="", metavar="出力.jpg", help="絵の中の位置の項目を重ねた一覧を出す")
    args = parser.parse_args()

    tank = None
    lighting = None
    ids = list(args.species)
    if args.tank:
        path = TANKS / args.tank / "tank.json"
        if not path.exists():
            sys.exit(f"水槽が見つかりません: {args.tank}")
        tank = read_json(path)
        header, lighting = tank_header(tank)
        print("\n".join(header))
        ids = [slot["speciesId"] for slot in tank["species"]] + [i for i in ids if i not in {s["speciesId"] for s in tank["species"]}]
    if not ids:
        parser.error("種の id か --tank を指定する")
    species_list = []
    for species_id in ids:
        path = FISH / species_id / "species.json"
        if not path.exists():
            print(f"■ {species_id}: species.json がない（{path.relative_to(ROOT)}）")
            continue
        species = read_json(path)
        species_list.append(species)
        print("\n".join(brief(species, tank, lighting, args.text)))
    if args.anchors is not None and species_list:
        out = Path(args.anchors) if args.anchors else OUT / (args.tank or "species") / "anchors.jpg"
        anchor_sheet(species_list, out)
        print(f"絵の中の位置の一覧: {out.relative_to(ROOT) if out.is_absolute() and out.is_relative_to(ROOT) else out}"
              "（赤十字 = mouthAnchor、緑十字 = footAnchor、丸つきは既定値。ほかの印はこの道具の --help）")


if __name__ == "__main__":
    main()
