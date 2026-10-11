# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=11",
#   "numpy>=2",
# ]
# ///
"""水槽の水景の絵を画面と同じ範囲で切り出し、地形（terrain.json）や泳がせた魚を重ねた確認画像を出す。

水槽の仕上げ（docs/agent-lanes/tank-finish.md）で、地形を絵に合わせるときに使う。読むだけで、内容ファイルは書き換えない。

使い方:
  uv run scripts/tank-view.py <水槽id>                       地形を重ねた確認画像（terrain-900.jpg）と凡例
  uv run scripts/tank-view.py <水槽id> --terrain <別の.json>  書き込む前の案や下書き（tmp/terrain-drafts/<id>/terrain.json）を重ねる
  uv run scripts/tank-view.py <水槽id> --zoom 0.5,0.4,1,0.9   一部を拡大（絵に対する比率の x0,y0,x1,y1）
  uv run scripts/tank-view.py <水槽id> --positions tmp/tank-work/<水槽id>/positions-natural-default.json
                                                              泳がせた位置に体の絵を重ねた合成画像（view-900.jpg）
  --width 420 で狭い画面の目安、--with-terrain で合成画像にも地形の線を重ねる。

座標は、地形と同じ「絵（plate.webp）に対する比率」。目盛りもこの比率で振ってある。
確認画像の色: 面 = 材質の色の線（sand 黄土・stone 灰・wood 茶・leaf 緑）と点ごとの depth、
遮蔽 = 輪郭と薄い塗り（depth 0.35 未満 = 赤、0.6 未満 = 黄、それより奥 = 青）、回避領域 = 白い楕円、
隠れ場所 = マゼンタの×、寄り道先 = 水色の丸、水面（waterLine）= 水色の線。番号と id の対応は凡例（端末と terrain.txt）に出す。

合成画像はアプリの描画の近似: 体の絵を実寸の比で置き、その魚より手前の遮蔽を魚の上に描き直す。
水の色のかぶりと奥の薄さだけを写し、照明・体の変形・泳ぎの傾きは再現しない。
見える範囲の切り出しは scripts/plate_frame.py（draft-terrain.py と共通。src/core/plateFraming.ts と同じ計算）。
出力は tmp/tank-work/<水槽id>/。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True  # scripts/ に __pycache__ を作らない
import plate_frame

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "src" / "content" / "environment" / "scenes"
TANKS = ROOT / "src" / "content" / "tanks"
FISH = ROOT / "src" / "content" / "fish"
OUT = ROOT / "tmp" / "tank-work"
# scripts/content-modules.ts の SAFE_MARGIN_CM と同じ。
SAFE_MARGIN_CM = 2
MATERIAL_COLORS = {"sand": (236, 190, 90), "stone": (205, 210, 215), "wood": (190, 120, 70), "leaf": (110, 220, 110)}
# src/core/bodyPlans.ts で walksOnSurfaces が true の体のつくり。
WALKER_PLANS = {"crustacean", "crab", "octopus", "walker", "horseshoeCrab", "seaStar", "urchin", "gastropod"}
# src/core/terrainMotion.test.ts が「どの遮蔽にも覆われない」ことを確かめる点（絵に対する比率）。
OPEN_POINTS = [(0.5, 0.3, "開けた水"), (0.15, 0.99, "手前の砂利")]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def tier_color(depth: float) -> tuple[int, int, int]:
    return (255, 70, 60) if depth < 0.35 else (255, 225, 60) if depth < 0.6 else (80, 150, 255)


def tier_name(depth: float) -> str:
    return "赤" if depth < 0.35 else "黄" if depth < 0.6 else "青"


def point_in_polygon(x: float, y: float, polygon: list[dict]) -> bool:
    inside = False
    for i, a in enumerate(polygon):
        b = polygon[i - 1]
        if (a["y"] > y) != (b["y"] > y) and x < (b["x"] - a["x"]) * (y - a["y"]) / (b["y"] - a["y"]) + a["x"]:
            inside = not inside
    return inside


class View:
    """切り出した範囲と、絵に対する比率から画素への変換。"""

    def __init__(self, plate: Image.Image, visible: tuple[float, float, float, float], zoom: tuple[float, ...] | None, width: int):
        self.visible = visible
        x0, y0, x1, y1 = visible
        if zoom:
            x0, y0, x1, y1 = max(x0, zoom[0]), max(y0, zoom[1]), min(x1, zoom[2]), min(y1, zoom[3])
            if x1 <= x0 or y1 <= y0:
                sys.exit(f"--zoom が見える範囲（x {visible[0]:.3f}–{visible[2]:.3f}, y {visible[1]:.3f}–{visible[3]:.3f}）と重ならない")
        self.rect = (x0, y0, x1, y1)
        box = (round(x0 * plate.width), round(y0 * plate.height), round(x1 * plate.width), round(y1 * plate.height))
        crop = plate.crop(box)
        self.width = width
        self.height = max(1, round(width * crop.height / crop.width))
        self.base = crop.resize((self.width, self.height), Image.LANCZOS)
        self.sx, self.sy = self.width / (x1 - x0), self.height / (y1 - y0)
        # 前面ガラスの幅・高さ（画素）。魚の大きさと面の傾きに使う。
        self.glass_w, self.glass_h = (visible[2] - visible[0]) * self.sx, (visible[3] - visible[1]) * self.sy

    def at(self, point: dict) -> tuple[float, float]:
        return (point["x"] - self.rect[0]) * self.sx, (point["y"] - self.rect[1]) * self.sy


# ---------------------------------------------------------------- 地形の重ね絵


def label(draw: ImageDraw.ImageDraw, at: tuple[float, float], text: str, color=(255, 255, 255), font=None) -> None:
    # 左端の目盛りの数字と重ならず、画像の外へも出ない位置に寄せる。
    width, height = draw.im.size
    if not (-30 <= at[0] <= width + 10 and -20 <= at[1] <= height + 5):
        return  # 拡大した範囲の外にあるもの
    x = max(28.0, min(at[0], width - draw.textlength(text, font=font) - 3))
    y = max(1.0, min(at[1], height - 15))
    draw.text((x, y), text, fill=color, font=font, stroke_width=2, stroke_fill=(0, 0, 0))


def draw_grid(image: Image.Image, view: View, font) -> None:
    """絵に対する比率の目盛り。座標を読み取れるよう、薄い線と数字を上端と左端に置く。"""
    draw = ImageDraw.Draw(image, "RGBA")
    x0, y0, x1, y1 = view.rect
    span = max(x1 - x0, y1 - y0)
    step = next(s for s in (0.01, 0.02, 0.05, 0.1, 0.2) if span / s <= 12)
    digits = 2 if step < 0.1 else 1
    for axis, low, high in (("x", x0, x1), ("y", y0, y1)):
        value = math.ceil(low / step - 1e-9) * step
        while value <= high + 1e-9:
            if axis == "x":
                px = (value - x0) * view.sx
                draw.line([(px, 0), (px, view.height)], fill=(255, 255, 255, 46), width=1)
                draw.text((px + 2, 1), f"{value:.{digits}f}", fill=(255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
            else:
                py = (value - y0) * view.sy
                draw.line([(0, py), (view.width, py)], fill=(255, 255, 255, 46), width=1)
                if py > 14:
                    draw.text((2, py + 1), f"{value:.{digits}f}", fill=(255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
            value += step


def draw_terrain(image: Image.Image, view: View, document: dict, scene: dict, font) -> Image.Image:
    terrain = document["terrain"]
    fill = Image.new("RGBA", image.size, (0, 0, 0, 0))
    fill_draw = ImageDraw.Draw(fill)
    for occluder in terrain.get("occluders", []):
        fill_draw.polygon([view.at(p) for p in occluder["polygon"]], fill=(*tier_color(occluder["depth"]), 56))
    image = Image.alpha_composite(image.convert("RGBA"), fill).convert("RGB")
    draw = ImageDraw.Draw(image)
    for index, occluder in enumerate(terrain.get("occluders", []), 1):
        points = [view.at(p) for p in occluder["polygon"]]
        draw.line([*points, points[0]], fill=tier_color(occluder["depth"]), width=2)
        top = min(points, key=lambda p: p[1])
        label(draw, (top[0] - 12, top[1] + 3), f"O{index} {occluder['depth']:.2f}", tier_color(occluder["depth"]), font)
    for index, obstacle in enumerate(terrain.get("obstacles", []), 1):
        cx, cy = view.at(obstacle["center"])
        rx, ry = obstacle["radius"]["x"] * view.sx, obstacle["radius"]["y"] * view.sy
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=(255, 255, 255), width=2)
        label(draw, (cx - 30, cy - 6), f"B{index} {obstacle['center']['depth']:.2f}+-{obstacle['depthRadius']:.2f}", (255, 255, 255), font)
    for index, surface in enumerate(terrain.get("surfaces", []), 1):
        points = [view.at(p) for p in surface["points"]]
        color = MATERIAL_COLORS[surface["material"]]
        draw.line(points, fill=(0, 0, 0), width=6, joint="curve")
        draw.line(points, fill=color, width=3, joint="curve")
        for (x, y), point in zip(points, surface["points"]):
            draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255), outline=(0, 0, 0))
        for (x, y), point in ((points[0], surface["points"][0]), (points[-1], surface["points"][-1])):
            label(draw, (x - 8, y + 5), f"{point['depth']:.2f}", color, font)
        middle = points[len(points) // 2] if len(points) > 2 else ((points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2)
        label(draw, (middle[0] - 6, middle[1] - 17), f"S{index}", color, font)
    for index, shelter in enumerate(terrain.get("shelters", []), 1):
        x, y = view.at(shelter)
        for width, color in ((5, (0, 0, 0)), (2, (255, 0, 255))):
            draw.line([(x - 8, y - 8), (x + 8, y + 8)], fill=color, width=width)
            draw.line([(x - 8, y + 8), (x + 8, y - 8)], fill=color, width=width)
        label(draw, (x + 10, y - 6), f"H{index} {shelter.get('kind', '-')} {shelter['depth']:.2f}", (255, 150, 255), font)
    for index, point in enumerate(document.get("structurePoints", []), 1):
        x, y = view.at(point)
        draw.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(0, 235, 255), width=2)
        label(draw, (x + 9, y - 6), f"P{index}", (0, 235, 255), font)
    for point in document.get("bubbleSources", []):
        x, y = view.at(point)
        draw.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 255), width=1)
    for x, y, _ in OPEN_POINTS:
        px, py = view.at({"x": x, "y": y})
        draw.line([(px - 6, py), (px + 6, py)], fill=(255, 255, 255), width=1)
        draw.line([(px, py - 6), (px, py + 6)], fill=(255, 255, 255), width=1)
    water_line = scene.get("waterLine")
    if water_line:
        for key in ("front", "back"):
            _, row = view.at({"x": 0, "y": water_line[key]})
            draw.line([(0, row), (view.width, row)], fill=(0, 235, 255), width=1)
            label(draw, (view.width - 110, row - 14), f"waterLine.{key}", (0, 235, 255), font)
    draw_grid(image, view, font)
    return image


# ---------------------------------------------------------------- 凡例と確かめ


def world(point: dict, frame: dict, tank_w: float, tank_h: float) -> tuple[float, float]:
    """絵に対する比率を水槽の実寸 (cm) へ。src/core/surfaceMotion.ts の worldPoint と同じ。"""
    return (frame["x"] + point["x"] * frame["width"]) * tank_w, (frame["y"] + point["y"] * frame["height"]) * tank_h


def legend_and_checks(document: dict, tank: dict, tank_h: float, frame: dict, species: list[dict]) -> tuple[list[str], list[str]]:
    terrain = document["terrain"]
    tank_w = tank["widthCm"]
    lines: list[str] = []
    for index, surface in enumerate(terrain.get("surfaces", []), 1):
        a, b = surface["points"][0], surface["points"][-1]
        lines.append(f"面 S{index} {surface['id']} {surface['material']} ({a['x']:.3f},{a['y']:.3f},d{a['depth']:.2f})→({b['x']:.3f},{b['y']:.3f},d{b['depth']:.2f}) {len(surface['points'])}点")
    for index, occluder in enumerate(terrain.get("occluders", []), 1):
        xs, ys = [p["x"] for p in occluder["polygon"]], [p["y"] for p in occluder["polygon"]]
        lines.append(f"遮蔽 O{index} {occluder['id']} d{occluder['depth']:.2f}（{tier_name(occluder['depth'])}） x {min(xs):.2f}–{max(xs):.2f} y {min(ys):.2f}–{max(ys):.2f} {len(xs)}点")
    for index, obstacle in enumerate(terrain.get("obstacles", []), 1):
        c, r = obstacle["center"], obstacle["radius"]
        lines.append(f"回避 B{index} {obstacle['id']} 中心({c['x']:.3f},{c['y']:.3f},d{c['depth']:.2f}) 半径({r['x']:.3f},{r['y']:.3f}) 奥行き±{obstacle['depthRadius']:.2f}")
    for index, shelter in enumerate(terrain.get("shelters", []), 1):
        lines.append(f"隠れ場所 H{index} {shelter['id']} {shelter.get('kind', '-')} ({shelter['x']:.3f},{shelter['y']:.3f},d{shelter['depth']:.2f})")
    points = document.get("structurePoints", [])
    if points:
        lines.append("寄り道先 " + " ".join(f"P{i}({p['x']:.2f},{p['y']:.2f})" for i, p in enumerate(points, 1)))

    checks: list[str] = []
    for x, y, name in OPEN_POINTS:
        for occluder in terrain.get("occluders", []):
            if point_in_polygon(x, y, occluder["polygon"]):
                checks.append(f"遮蔽 {occluder['id']} が ({x},{y})（{name}）を覆う → terrainMotion.test で落ちる")
    lengths = sorted({s["realBodyLengthCm"] for s in species})
    for shelter in terrain.get("shelters", []):
        sx, sy = world(shelter, frame, tank_w, tank_h)
        if not (SAFE_MARGIN_CM < sx < tank_w - SAFE_MARGIN_CM and SAFE_MARGIN_CM < sy < tank_h - SAFE_MARGIN_CM):
            checks.append(f"隠れ場所 {shelter['id']} がガラスの内側（縁から{SAFE_MARGIN_CM}cm）にない → content.test で落ちる")
        for obstacle in terrain.get("obstacles", []):
            relative = (shelter["depth"] - obstacle["center"]["depth"]) / obstacle["depthRadius"]
            if abs(relative) >= 1:
                continue
            section = math.sqrt(1 - relative * relative)
            cx, cy = world(obstacle["center"], frame, tank_w, tank_h)
            inside = [length for length in lengths if math.hypot(
                (sx - cx) / (obstacle["radius"]["x"] * frame["width"] * tank_w * section + length * 0.2),
                (sy - cy) / (obstacle["radius"]["y"] * frame["height"] * tank_h * section + length * 0.2)) < 1]
            if inside:
                checks.append(f"隠れ場所 {shelter['id']} が回避領域 {obstacle['id']} の内側（体長 {min(inside):g}cm 以上の魚で。奥行きか位置をずらす）")
    for surface in terrain.get("surfaces", []):
        visible = False
        for a, b in zip(surface["points"], surface["points"][1:]):
            for step in range(41):
                t = step / 40
                wx, wy = world({"x": a["x"] + (b["x"] - a["x"]) * t, "y": a["y"] + (b["y"] - a["y"]) * t}, frame, tank_w, tank_h)
                visible = visible or (SAFE_MARGIN_CM < wx < tank_w - SAFE_MARGIN_CM and SAFE_MARGIN_CM < wy < tank_h - SAFE_MARGIN_CM)
        if not visible:
            checks.append(f"面 {surface['id']} がガラスの内側にない → content.test で落ちる")
    kinds = {shelter.get("kind") for shelter in terrain.get("shelters", [])}
    for s in species:
        for habit in s.get("ecology", {}).get("habits", []):
            if habit.get("type") == "homeShelter" and habit.get("kind") not in kinds:
                checks.append(f"{s['displayName']} の住みか（{habit.get('kind')}）の隠れ場所がない → content.test で落ちる")
    walkers = [s["displayName"] for s in species if s.get("swim", {}).get("bodyPlan") in WALKER_PLANS]
    if walkers:
        surfaces = terrain.get("surfaces", [])

        def joined(a: dict, b: dict) -> bool:
            return math.hypot(a["x"] - b["x"], a["y"] - b["y"], a["depth"] - b["depth"]) < 0.00001

        def linked(s: dict, t: dict) -> bool:
            return any(joined(p, q) for p in (s["points"][0], s["points"][-1]) for q in (t["points"][0], t["points"][-1]))

        for i, s in enumerate(surfaces):
            ends = [any(t is not s and joined(end, q) for t in surfaces for q in (t["points"][0], t["points"][-1]))
                    for end in (s["points"][0], s["points"][-1])]
            if not any(ends) and len(surfaces) > 1:
                checks.append(f"面 {s['id']} はどの面にもつながっていない（面を歩く生き物はここから移れない）")
            for t in surfaces[i + 1:]:
                if linked(s, t):
                    continue
                sxs, txs = [p["x"] for p in s["points"]], [p["x"] for p in t["points"]]
                overlap = min(max(sxs), max(txs)) - max(min(sxs), min(txs))
                sd, td = [p["depth"] for p in s["points"]], [p["depth"] for p in t["points"]]
                gap = max(min(sd) - max(td), min(td) - max(sd), 0)
                if overlap > 0.03 and gap <= 0.35:
                    checks.append(f"面 {s['id']} と {t['id']} は x が重なり、奥行きの差が {gap:.2f}（0.35 以下。歩く生き物が互いをよけて引き返す）")
    return lines, checks


# ---------------------------------------------------------------- 魚の合成


def composite(view: View, document: dict, data: dict, snapshot: dict, scene: dict, tank: dict) -> Image.Image:
    canvas = view.base.copy()
    color = scene.get("waterColor", "#ffffff")
    channels = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    water = [value / max(max(channels), 1) for value in channels]
    sprites: dict[str, Image.Image] = {}
    items = [("fish", fish["depth"], fish) for fish in snapshot["fish"]]
    items += [("occluder", occluder["depth"], occluder) for occluder in document["terrain"].get("occluders", [])]
    # 奥から順に描く。同じ depth では遮蔽を先に（魚は depth がより大きいときだけ隠れる）。
    items.sort(key=lambda item: (-item[1], item[0] == "fish"))
    for kind, depth, item in items:
        if kind == "occluder":
            mask = Image.new("L", canvas.size, 0)
            ImageDraw.Draw(mask).polygon([view.at(p) for p in item["polygon"]], fill=255)
            canvas.paste(view.base, (0, 0), mask)
            continue
        info = data["species"][item["speciesId"]]
        if item["speciesId"] not in sprites:
            sprites[item["speciesId"]] = Image.open(FISH / item["speciesId"] / "body.webp").convert("RGBA")
        source = sprites[item["speciesId"]]
        # src/core/scale.ts と同じ大きさ（奥ほど少し小さい）。
        width = max(2, round(view.glass_w * info["spriteLengthCm"] / tank["widthCm"] * (1.04 - 0.1 * depth)))
        sprite = source.resize((width, max(1, round(source.height * width / source.width))), Image.LANCZOS)
        # src/render/fishLayer.ts と同じ水の色のかぶりと、底・奥での暗さ。
        mix = 0.06 + depth * 0.26
        falloff = min(1.0, max(0.72, 1.04 - item.get("glassY", 0.5) * 0.2 - depth * 0.1))
        pixels = np.asarray(sprite).astype(np.float32)
        for channel in range(3):
            pixels[:, :, channel] *= (1 + (water[channel] - 1) * mix) * falloff
        pixels[:, :, 3] *= 1 - depth * 0.08
        sprite = Image.fromarray(pixels.clip(0, 255).astype(np.uint8), "RGBA")
        ax, ay = item["anchor"]["x"] * sprite.width, item["anchor"]["y"] * sprite.height
        if item["facing"] == 1:
            sprite = sprite.transpose(Image.FLIP_LEFT_RIGHT)
            ax = sprite.width - ax
        if item.get("walker") and item.get("angle"):
            # 面の傾き。ガラスに対する比率の角度を、画面の縦横比へ直す。
            angle = math.atan2(math.sin(item["angle"]) * view.glass_h, math.cos(item["angle"]) * view.glass_w)
            if angle > math.pi / 2:
                angle -= math.pi
            elif angle < -math.pi / 2:
                angle += math.pi
            big = Image.new("RGBA", (sprite.width * 3, sprite.height * 3), (0, 0, 0, 0))
            big.paste(sprite, (sprite.width, sprite.height))
            ax, ay = sprite.width + ax, sprite.height + ay
            sprite = big.rotate(-math.degrees(angle), center=(ax, ay), resample=Image.BICUBIC)
        x, y = view.at(item)
        canvas.paste(sprite, (round(x - ax), round(y - ay)), sprite)
    return canvas


# ---------------------------------------------------------------- 入口


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tank", help="水槽の id")
    parser.add_argument("--scene", help="水景の id（省くと水槽の最初の水景）")
    parser.add_argument("--terrain", type=Path, help="重ねる terrain.json（省くと水景のもの）")
    parser.add_argument("--zoom", help="拡大する範囲。絵に対する比率の x0,y0,x1,y1")
    parser.add_argument("--positions", type=Path, help="scripts/tank-probe.ts が書いた positions-*.json")
    parser.add_argument("--snapshot", type=int, default=-1, help="positions のうち何番目の時点か（既定は最後）")
    parser.add_argument("--with-terrain", action="store_true", help="合成画像にも地形の線を重ねる")
    parser.add_argument("--width", type=int, default=900, help="出す画像の横幅 (px)。狭い画面の目安は 420")
    parser.add_argument("--out", type=Path, help="出力先（省くと tmp/tank-work/<水槽id>/ の下）")
    parser.add_argument("--quiet", action="store_true", help="凡例を端末に出さず、画像のパスだけを出す")
    args = parser.parse_args()

    tank_path = TANKS / args.tank / "tank.json"
    if not tank_path.exists():
        sys.exit(f"水槽が見つかりません: {args.tank}")
    tank = read_json(tank_path)
    scene_id = args.scene or tank["sceneIds"][0]
    folder = SCENES / scene_id
    if not (folder / "plate.webp").exists():
        sys.exit(f"水景の絵が見つかりません: {folder / 'plate.webp'}")
    scene = read_json(folder / "scene.json") if (folder / "scene.json").exists() else {}
    terrain_path = args.terrain or folder / "terrain.json"
    if not terrain_path.exists():
        sys.exit(f"地形が見つかりません: {terrain_path}")
    document = read_json(terrain_path)
    if "terrain" not in document:
        document = {"terrain": document}
    species = [read_json(FISH / slot["speciesId"] / "species.json") for slot in tank["species"]
               if (FISH / slot["speciesId"] / "species.json").exists()]

    plate = Image.open(folder / "plate.webp").convert("RGB")
    aspect, overscan = plate_frame.tank_glass(tank)
    bottom = scene.get("framing", {}).get("plateBottom", 1)
    visible = plate_frame.visible_frame(aspect, overscan, bottom, plate.width, plate.height)
    frame = plate_frame.surface_frame(aspect, overscan, bottom, plate.width, plate.height)
    # 見えている水の高さ (cm)。scripts/content-modules.ts と同じ。
    tank_h = min(tank["heightCm"], tank["widthCm"] / aspect)
    zoom = tuple(float(v) for v in args.zoom.split(",")) if args.zoom else None
    if zoom and len(zoom) != 4:
        sys.exit("--zoom は x0,y0,x1,y1 の4つの数")
    view = View(plate, visible, zoom, args.width)
    font = ImageFont.load_default(size=12 if args.width >= 700 else 10)

    out_folder = OUT / args.tank
    out_folder.mkdir(parents=True, exist_ok=True)
    suffix = f"-{args.width}" + ("-zoom" if zoom else "")
    messages: list[str] = []
    if args.positions:
        data = read_json(args.positions)
        probed = data.get("frame")
        if probed and any(abs(probed[key] - frame[key]) > 1e-6 for key in ("x", "y", "width", "height")):
            messages.append(f"注意: positions の frame {probed} が、ここで求めた frame {frame} と違う（水景か展示室の絵が変わった？）")
        snapshot = data["snapshots"][args.snapshot]
        image = composite(view, document, data, snapshot, scene, tank)
        if args.with_terrain:
            image = draw_terrain(image, view, document, scene, font)
        out = args.out or out_folder / f"view{suffix}.jpg"
        counts: dict[str, int] = {}
        for fish in snapshot["fish"]:
            counts[fish["speciesId"]] = counts.get(fish["speciesId"], 0) + 1
        messages.append(f"合成: {data.get('lighting', '?')} の {snapshot['seconds']}秒の時点（{len(data['snapshots'])}時点のうち {args.snapshot % len(data['snapshots'])} 番目）、"
                        + "、".join(f"{data['species'][sid]['displayName']}{n}" for sid, n in counts.items()))
    else:
        image = draw_terrain(view.base.copy(), view, document, scene, font)
        out = args.out or out_folder / f"terrain{suffix}.jpg"
        lines, checks = legend_and_checks(document, tank, tank_h, frame, species)
        header = (f"{args.tank} {tank['widthCm']}×{tank_h:.0f}cm / 絵 {plate.width}×{plate.height}px / 見える範囲 x {visible[0]:.3f}–{visible[2]:.3f}, "
                  f"y {visible[1]:.3f}–{visible[3]:.3f}（絵に対する比率。地形の座標と同じ） / 1cm = x {1 / (frame['width'] * tank['widthCm']):.4f}, y {1 / (frame['height'] * tank_h):.4f}")
        text = [header, *lines, "確かめ: " + ("問題なし" if not checks else ""), *[f"  - {check}" for check in checks]]
        (out_folder / "terrain.txt").write_text("\n".join(text) + "\n")
        messages += text
    image.save(out, quality=85)
    if not args.quiet:
        print("\n".join(messages))
    print(out.relative_to(ROOT) if out.is_relative_to(ROOT) else out)


if __name__ == "__main__":
    main()
