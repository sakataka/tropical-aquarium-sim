# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pillow>=11",
#   "numpy>=2",
#   "opencv-python-headless>=4.10",
#   "torch>=2.4",
#   "transformers>=4.45",
# ]
# ///
"""水景の絵（plate.webp）だけから、地形（terrain.json）の下書きと確認用の重ね絵を作る。

仕組み、評価の数字、人が見るべき点は docs/terrain-drafting.md に書いた。

使い方:
  uv run scripts/draft-terrain.py <水景id|画像のパス>... [--compare] [--debug] [--write]
  uv run scripts/draft-terrain.py <水景id> --occluders <塗り分け版.png> --shelters <印の版.png>  案内の絵を使う
  uv run scripts/draft-terrain.py <水景id> --no-tops --connect-sand  面を歩く生き物（エビ・カニなど）だけの水槽向け
  uv run scripts/draft-terrain.py evaluate [<水景id>...]  既存の手書きの地形と比べて数字を出す
  uv run scripts/draft-terrain.py stats                   既存の手書きの地形の統計

下書きは tmp/terrain-drafts/<id>/terrain.json、確認画像は同じフォルダの overlay.jpg に出す。
src/content/environment/scenes/<id>/terrain.json を書き換えるのは --write を付けたときだけ。

奥行きの推定には Depth Anything V2 Small（Apache-2.0。Hugging Face の
depth-anything/Depth-Anything-V2-Small-hf）を使う。重みは初回に ~/.cache/huggingface へ入る。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

sys.dont_write_bytecode = True  # scripts/ に __pycache__ を作らない
import plate_frame  # 見える範囲の計算。確認画像を出す scripts/tank-view.py と共通。

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "src" / "content" / "environment" / "scenes"
TANKS = ROOT / "src" / "content" / "tanks"
FISH = ROOT / "src" / "content" / "fish"
OUT = ROOT / "tmp" / "terrain-drafts"
MODELS = {
    "small": "depth-anything/Depth-Anything-V2-Small-hf",
    # Base は CC-BY-NC-4.0。比べるためだけに置いてある。
    "base": "depth-anything/Depth-Anything-V2-Base-hf",
}
# scripts/content-modules.ts の SAFE_MARGIN_CM と同じ。面や隠れ場所はこれよりガラスの内側に置く。
SAFE_MARGIN_CM = 2
# 作業用の画像の横幅 (px)。
WORK_WIDTH = 960

# 手書きの92水景から決めた値（docs/terrain-drafting.md の「仕組み」の5）。
# u は「見える範囲の下端の底を0、いちばん遠い水を1」とした近さの比率。砂の面の depth はこの折れ線で決める。
SAND_DEPTH_CURVE = [(-0.3, 0.15), (0.0, 0.18), (0.25, 0.22), (0.4, 0.45), (0.5, 0.52), (0.6, 0.64), (0.7, 0.72), (0.85, 0.78), (1.0, 0.85)]
# 岩や流木の depth。手書きでは近さとの相関が弱く（0.3〜0.5 に集まる）、この直線で十分だった。
OBJECT_DEPTH = (0.326, 0.273)
# 砂の面の段（depth の目標）。手前の面は見える範囲の下端のすぐ上に置く。
SAND_TIERS = [("middle-sand", 0.45), ("far-sand", 0.72)]
# 物体を手前・中・奥に分ける u の境目。
LAYERS = [("front", 0.22), ("middle", 0.55), ("back", 0.7)]
# 物体のマスクから細いもの（茎、枝、根）を落とす大きさ（絵の横幅に対する比率）。回避領域にはより太い部分だけを使う。
OPEN_SMALL, OPEN_LARGE = 0.012, 0.028
# 回避領域の楕円の半径を、かたまりの画素の広がり（標準偏差）の何倍にするか。一様な楕円なら2倍でちょうど重なる。
OBSTACLE_SIGMA = 1.2
OBSTACLE_DEPTH_RADIUS = 0.12
# 楕円がガラスの近くまで来たら、ガラスの外まで伸ばす（楕円とガラスの細いすき間に魚が挟まる）。底へは伸ばさない。
OBSTACLE_EXTEND_WALL, OBSTACLE_EXTEND_BOTTOM = True, False
MAX_OCCLUDERS, MAX_LEDGES, MAX_OBSTACLES = 6, 5, 4
# 行ごとの底の視差に使う分位点（%）。底はその行でいちばん奥にあるが、岩のすき間の暗がりなどの外れ値は避ける。
FLOOR_PERCENTILE = 12
# 底からこの高さ（見える高さに対する比率）以上立ち上がるものを物体とする。
SOLID_LIFT = 0.055
# 物体とみなす近さの下限（絵全体の視差の幅に対する比率）。
MIN_NEARNESS = 0.12
# 物体とみなす絵のきめの下限（明るさ 0〜255 の局所的な標準偏差）。手書きの遮蔽は最小でも 5.6、水と読み違えた候補は 1 未満だった。
MIN_TEXTURE = 3.0


# 遮蔽にする物体を塗り分けた版（--occluders）の色と、その段の遮蔽の depth。手書きの地形の depth の並びに合わせた。
GUIDE_TIERS = [("front", (255, 0, 0), 0.3), ("middle", (255, 255, 0), 0.42), ("back", (0, 0, 255), 0.55)]
# 隠れ場所に印を付けた版（--shelters）の印の色。
GUIDE_MARKER = (255, 0, 255)
# 塗りや印とみなす色の近さ（RGB の各成分の差の上限）。
GUIDE_TOLERANCE = 70
# 同じ色で隣り合う物体を分ける細い切れ目（輪郭線、細く残した元の絵）の太さの上限（案内の絵の横幅に対する比率）。
# 塗りをこの太さだけ縁から削り、残った芯のつながりで物体を数える。これより太くつながった塗りは1つの物体とみなす。
GUIDE_CUT = 0.003
# 塗りの中の輪郭線を拾うときの、まわりの色を取る窓（案内の絵の横幅に対する比率）と、まわりの色との差の下限（RGB の成分）。
GUIDE_LINE_WINDOW, GUIDE_LINE_CONTRAST = 0.0055, 14
# 1つの塗りを、くびれで別の物体に分ける条件。くびれの幅が、分かれる両側のうち細いほうの幅のこの倍より狭ければ分ける。
GUIDE_NECK = 0.6
# 塗り分けた版から作る遮蔽の数の上限と、遮蔽にする物体の大きさの下限（見える範囲に対する比率）。
# 人が選んで塗った物体なので、案内なしのとき（6個、0.4%）より多く、小さいものまで採る。
GUIDE_MAX_OCCLUDERS, GUIDE_MIN_AREA = 16, 0.002
# これより小さい物体は、同じ色で隣り合う物体があれば、それに付ける（見える範囲に対する比率）。
GUIDE_JOIN_AREA = 0.004
# 遮蔽が上限を超えたときに物体をまとめる幅の上限（見える範囲の幅に対する比率）。回避領域のかたまりを2つに分ける幅と同じ。
GUIDE_JOIN_WIDTH = 0.42
# 塗り分けた版から作る遮蔽の depth の上限。砂の面の奥の段（0.72）より奥には置かない。
GUIDE_DEPTH_LIMIT = 0.72
# 奥の段（青）の塗りを「開けた水に掛かる広い塗り」として遮蔽から外す条件: 幅か面積（見える範囲に対する比率）がこれ以上で、
# 奥行きの推定で底でも物体でもない所（水）がこの割合以上を占める。
GUIDE_WATER_WIDTH, GUIDE_WATER_AREA, GUIDE_WATER_SHARE = 0.2, 0.02, 0.6


# ---------------------------------------------------------------- 水景・水槽の読み込み


@dataclass
class Subject:
    """下書きを作る対象。既存の水景か、画像1枚。"""

    id: str
    image_path: Path
    scene: dict = field(default_factory=dict)
    tank: dict | None = None
    aspect: float | None = None  # ガラスの縦横比（幅 / 高さ）
    overscan: tuple[float, float] = (1.0, 1.0)
    hand: dict | None = None  # 既存の手書きの terrain.json 全体
    shelter_kinds: list[str] = field(default_factory=list)  # 水槽の生き物が住みかにする隠れ場所の種類
    max_body_cm: float = 0.0
    occluder_guide: Path | None = None  # 遮蔽にする物体を、手前=赤・中=黄・奥=青で塗った版
    shelter_guide: Path | None = None  # 隠れ場所にマゼンタの丸を付けた版
    tops: bool = True  # 岩や流木の上面を面として出す（--no-tops で出さない）
    connect_sand: bool = False  # 砂の面を段に分け、斜めの道で端点をつなぐ（--connect-sand）


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def load_subject(arg: str, aspect: float | None, plate_bottom: float | None,
                 occluder_guide: Path | None = None, shelter_guide: Path | None = None) -> Subject:
    path = Path(arg).expanduser()
    if (SCENES / arg / "plate.webp").exists():
        folder = SCENES / arg
        subject = Subject(id=arg, image_path=folder / "plate.webp")
        if (folder / "scene.json").exists():
            subject.scene = read_json(folder / "scene.json")
        if (folder / "terrain.json").exists():
            subject.hand = read_json(folder / "terrain.json")
        tank = next((t for t in (read_json(p) for p in sorted(TANKS.glob("*/tank.json"))) if arg in t["sceneIds"]), None)
        if tank:
            subject.tank = tank
            subject.aspect, subject.overscan = plate_frame.tank_glass(tank)
            kinds: list[str] = []
            for slot in tank["species"]:
                species_path = FISH / slot["speciesId"] / "species.json"
                if not species_path.exists():
                    continue
                species = read_json(species_path)
                subject.max_body_cm = max(subject.max_body_cm, species.get("realBodyLengthCm", 0))
                for habit in species.get("ecology", {}).get("habits", []):
                    if habit.get("type") == "homeShelter" and habit.get("kind") not in kinds:
                        kinds.append(habit["kind"])
            subject.shelter_kinds = kinds
    elif path.exists():
        subject = Subject(id=path.stem, image_path=path)
    else:
        sys.exit(f"水景も画像も見つかりません: {arg}")
    if aspect:
        subject.aspect = aspect
    if plate_bottom:
        subject.scene = {**subject.scene, "framing": {"plateBottom": plate_bottom}}
    subject.occluder_guide, subject.shelter_guide = occluder_guide, shelter_guide
    return subject


def visible_frame(subject: Subject, width: int, height: int) -> tuple[float, float, float, float]:
    """前面ガラスに映る範囲（画像に対する比率の x0, y0, x1, y1）。src/core/plateFraming.ts の framePlate と同じ計算。"""
    return plate_frame.visible_frame(subject.aspect or width / height, subject.overscan,
                                     subject.scene.get("framing", {}).get("plateBottom", 1), width, height)


# ---------------------------------------------------------------- 奥行きの推定


_depth_model: dict = {}


def estimate_disparity(image_path: Path, model_name: str) -> np.ndarray:
    """単眼の奥行き推定。値が大きいほど手前（視差）。結果は tmp/terrain-drafts/.cache に置く。"""
    stat = image_path.stat()
    key = hashlib.sha1(f"{image_path.resolve()}:{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()[:16]
    cache = OUT / ".cache" / model_name / f"{image_path.parent.name}-{image_path.stem}-{key}.npy"
    if cache.exists():
        return np.load(cache)
    import torch
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    if model_name not in _depth_model:
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        repo = MODELS[model_name]
        _depth_model[model_name] = (AutoImageProcessor.from_pretrained(repo),
                                    AutoModelForDepthEstimation.from_pretrained(repo).to(device).eval(), device)
    processor, model, device = _depth_model[model_name]
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt").to(device)
    with torch.no_grad():
        predicted = model(**inputs).predicted_depth
    scale = WORK_WIDTH / image.width
    size = (round(image.height * scale), WORK_WIDTH)
    resized = torch.nn.functional.interpolate(predicted[None], size=size, mode="bicubic", align_corners=False)[0, 0]
    disparity = resized.float().cpu().numpy().astype(np.float32)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, disparity)
    return disparity


# ---------------------------------------------------------------- 絵の解析


@dataclass
class Analysis:
    rgb: np.ndarray  # 作業用の大きさの絵 (H, W, 3)
    disparity: np.ndarray
    u: np.ndarray  # 近さの比率。0 が見える範囲の下端の底、1 がいちばん遠い水
    frame: tuple[int, int, int, int]  # 見える範囲 (px)
    water_top: int  # 水のある範囲の上端 (px)
    floor: np.ndarray  # 底の面のマスク
    solid: np.ndarray  # 底から立ち上がる物体のマスク
    floor_rows: np.ndarray | None  # 行ごとの底の視差。底が見えない絵では None
    d_front: float
    d_far: float
    notes: list[str]
    debug: dict = field(default_factory=dict)
    guide_layers: list[np.ndarray] | None = None  # 塗り分けた版から読んだ、手前・中・奥の物体のマスク
    guide_objects: list[tuple[int, np.ndarray]] | None = None  # 同じ版の塗りを物体ごとに分けたもの（段の番号、マスク）
    guide_markers: list[tuple[float, float]] | None = None  # 印を付けた版から読んだ、隠れ場所の位置 (px)


def floor_profile(disparity: np.ndarray, columns: tuple[int, int], top: int, d_far: float) -> np.ndarray:
    """行ごとの底の視差。

    底は、その行に見えているもののうちいちばん奥にある（底より奥の物は見えない）。行ごとに視差の低い側の
    分位点を取り、下の行ほど手前になるようにそろえる。平面を当てはめないので、手前が急に近づく谷のような底や、
    奥行き推定の視差の曲がりにもついていく。底が見えない行（水だけの行）は、いちばん遠い水の値になる。
    """
    height = disparity.shape[0]
    rows = np.percentile(disparity[:, columns[0]:columns[1]], FLOOR_PERCENTILE, axis=1).astype(np.float64)
    rows[:top] = d_far
    # 物体で埋まった行は値が手前へずれる。下の行より手前にはならないので、下からの最小値で抑える。
    profile = np.minimum.accumulate(rows[::-1])[::-1]
    size = max(3, round(0.015 * height)) | 1
    smooth = cv2.blur(profile.astype(np.float32).reshape(-1, 1), (1, size)).ravel().astype(np.float64)
    return np.maximum.accumulate(smooth)


def read_guide(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        sys.exit(f"画像を読めません: {path}")
    return image[..., ::-1]


def guide_paint(image: np.ndarray, color: tuple[int, int, int]) -> np.ndarray:
    """案内の絵（RGB）のうち、指定の色で塗られた画素。案内の絵の大きさのまま返す。"""
    return (np.abs(image.astype(int) - np.array(color)) <= GUIDE_TOLERANCE).all(axis=2)


def shrink(mask: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """案内の絵の大きさのマスクを、作業用の大きさにする。"""
    return cv2.resize(mask.astype(np.uint8), size, interpolation=cv2.INTER_AREA).astype(bool)


def guide_lines(image: np.ndarray) -> np.ndarray:
    """平らな塗りの中を走る細い線（同じ色で隣り合う物体のあいだの輪郭線）の画素。

    線は塗りの色に近い薄い色のことがあり、色の近さ（GUIDE_TOLERANCE）だけでは塗りの一部に見える。
    まわりの色（中央値）との差で拾う。塗りの縁や、塗りに掛かる草の葉の縁も拾うが、物体を分ける妨げにはならない。
    """
    size = max(5, round(GUIDE_LINE_WINDOW * image.shape[1])) | 1
    around = cv2.medianBlur(np.ascontiguousarray(image), size)
    return np.abs(image.astype(int) - around.astype(int)).max(axis=2) > GUIDE_LINE_CONTRAST


def split_paint(paint: np.ndarray, lines: np.ndarray, other: np.ndarray) -> list[np.ndarray]:
    """1つの色の塗りを、物体ごとのマスクに分ける（案内の絵の大きさのまま）。other はほかの色の塗り。

    隣り合う石は、あいだの細い輪郭線（か、細く残した元の絵）で区切られている。作業用の大きさへ縮めると線が消えて
    1枚につながるので、縮める前に分ける。

    1. 塗りに掛かる草の葉などの切れ目（OPEN_SMALL まで）は埋める。葉の後ろの岩は1つの物体のままにする。
    2. 細い切れ目（GUIDE_CUT まで）と、塗りの中の輪郭線は、物体の境目として残す。
    3. 境目はところどころ途切れ、埋めた切れ目が石どうしを橋のようにつなぐこともある。縁からの距離で塗りを
       少しずつ削っていき、くびれ（幅が、分かれる両側のうち細いほうの GUIDE_NECK 倍より狭い所）で切れたら、
       別の物体とする。太さがあまり変わらない流木や、細い枝の付け根では切れない。
    4. 切れた芯を、縁からの距離を高さとする分水嶺（watershed）で元の大きさへ戻す。境目はくびれの所に来る。
    """
    height, width = paint.shape

    def disk(ratio: float) -> np.ndarray:
        size = max(3, round(ratio * width)) | 1
        return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))

    raw = paint.astype(np.uint8)
    body = cv2.morphologyEx(raw, cv2.MORPH_CLOSE, disk(OPEN_SMALL)).astype(bool) & ~other
    cut = (lines & paint) | (cv2.morphologyEx(raw, cv2.MORPH_CLOSE, disk(GUIDE_CUT)).astype(bool) & ~paint)
    distance = cv2.distanceTransform((body & ~cut).astype(np.uint8), cv2.DIST_L2, 5)
    least = max(2.0, GUIDE_CUT * width)  # 物体の芯とみなす、縁からの距離の下限
    peak = float(distance.max())
    if peak < least:
        return []
    levels = [1.0]
    while levels[-1] < peak:
        levels.append(levels[-1] * 1.25)
    cores: list[tuple[int, int, np.ndarray]] = []

    def divide(top: int, left: int, part: np.ndarray, start: int) -> None:
        local = distance[top:top + part.shape[0], left:left + part.shape[1]]
        current = part
        for index in range(start, len(levels)):
            level = levels[index]
            need = max(level / GUIDE_NECK, least)
            count, labels, stats, _ = cv2.connectedComponentsWithStats((current & (local > level)).astype(np.uint8), connectivity=8)
            strong = []
            for label in range(1, count):
                x, y, w, h, _ = stats[label]
                if level + min(w, h) / 2 + 1 < need:
                    continue  # この大きさでは、縁からの距離が need に届かない
                piece = labels[y:y + h, x:x + w] == label
                if float(local[y:y + h, x:x + w][piece].max()) >= need:
                    strong.append((top + y, left + x, piece, labels == label))
            if len(strong) >= 2:
                for piece_top, piece_left, piece, _ in strong:
                    divide(piece_top, piece_left, piece, index + 1)
                return
            if not strong:
                break
            current = strong[0][3]
        cores.append((top, left, part))

    divide(0, 0, body & ~cut, 0)
    markers = np.zeros((height, width), np.int32)
    markers[~cv2.dilate(body.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)] = len(cores) + 1
    for number, (top, left, part) in enumerate(cores, start=1):
        markers[top:top + part.shape[0], left:left + part.shape[1]][part] = number
    relief = (255 - np.clip(distance / peak * 255, 0, 255)).astype(np.uint8)
    cv2.watershed(cv2.merge([relief, relief, relief]), markers)
    return [(markers == number) & body for number in range(1, len(cores) + 1)]


def read_guides(subject: Subject, analysis: "Analysis") -> None:
    height, width = analysis.disparity.shape
    x0, y0, x1, y1 = analysis.frame
    inside = np.zeros((height, width), bool)
    inside[analysis.water_top:y1, x0:x1] = True
    if subject.occluder_guide:
        guide = read_guide(subject.occluder_guide)
        lines = guide_lines(guide)
        analysis.guide_layers, analysis.guide_objects = [], []
        paints = [guide_paint(guide, color) for _, color, _ in GUIDE_TIERS]
        for tier, paint in enumerate(paints):
            other = np.logical_or.reduce([item for index, item in enumerate(paints) if index != tier])
            analysis.guide_layers.append(shrink(paint, (width, height)) & inside)
            analysis.guide_objects += [(tier, shrink(part, (width, height)) & inside) for part in split_paint(paint, lines, other)]
        analysis.notes.append("遮蔽と回避領域は、塗り分けた版（--occluders）の物体から作った")
    if subject.shelter_guide:
        marks = shrink(guide_paint(read_guide(subject.shelter_guide), GUIDE_MARKER), (width, height))
        count, _, stats, centroids = cv2.connectedComponentsWithStats(marks.astype(np.uint8), connectivity=8)
        analysis.guide_markers = [(float(cx), float(cy)) for (cx, cy), stat in zip(centroids[1:], stats[1:])
                                  if stat[cv2.CC_STAT_AREA] >= 4 and inside[int(cy), int(cx)]]
        analysis.notes.append(f"隠れ場所は、印を付けた版（--shelters）の印 {len(analysis.guide_markers)} 個から作った: "
                              "入口の位置と種類（cave・crevice・burrow など）を絵で確かめる")


def analyze(subject: Subject, model_name: str) -> Analysis:
    image = cv2.imread(str(subject.image_path), cv2.IMREAD_COLOR)
    if image is None:
        sys.exit(f"画像を読めません: {subject.image_path}")
    full_h, full_w = image.shape[:2]
    disparity = estimate_disparity(subject.image_path, model_name)
    height, width = disparity.shape
    rgb = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    fx0, fy0, fx1, fy1 = visible_frame(subject, full_w, full_h)
    x0, y0, x1, y1 = round(fx0 * width), round(fy0 * height), round(fx1 * width), round(fy1 * height)
    notes: list[str] = []
    water_line = subject.scene.get("waterLine")
    # 水面より上（空気、岸、水面の反射）は、奥行きの推定が水中と別の物として読むので、地形の候補から外す。
    water_top = max(y0, round(water_line["front"] * height)) if water_line else y0
    if water_line:
        notes.append("waterLine あり: 手前の水面より上は解析していない。岸の面や水面より上の巣穴は人が足す")
    visible = disparity[water_top:y1, x0:x1]
    d_far = float(np.percentile(visible, 2))
    profile = floor_profile(disparity, (x0, x1), water_top, d_far)
    d_front = float(profile[y1 - 1])
    has_floor = d_front - d_far >= 0.15 * (float(np.percentile(visible, 99)) - d_far)
    if not has_floor:
        # 底が見えない絵（クラゲの水槽など）。近さの基準は、下端の帯の中央値にする。
        d_front = max(d_far + 1e-3, float(np.median(disparity[y1 - max(2, round(0.02 * (y1 - y0))):y1, x0:x1])))
        notes.append("底の面が見つからない: 手前の面だけを置いた。物体は近さだけで切り出している")
    span = d_front - d_far
    u = (d_front - disparity) / span
    floor = np.zeros((height, width), bool)
    solid = np.zeros((height, width), bool)
    floor_rows = None
    if has_floor:
        # 底からの高さ（見える高さに対する比率）: 同じ視差の底が、何行下にあるか。絵の下端より手前は、下端の傾きで延ばす。
        tail = max(3, round(0.15 * (height - water_top)))
        slope = max((profile[-1] - profile[-tail]) / tail, 0.3 * span / (y1 - y0))
        extended = np.concatenate([profile, profile[-1] + slope * np.arange(1, height + 1)])
        strict = extended + np.arange(len(extended)) * 1e-9  # np.interp のために、等しい値をわずかにずらす
        contact = np.interp(disparity, strict, np.arange(len(extended)))
        lift = (contact - np.arange(height)[:, None]) / (y1 - y0)
        below_horizon = (profile > d_far + 0.08 * span)[:, None]
        # 底より大きく奥に見えるところ（底の向こうの水）は、底として数えない。
        floor = (lift < 0.035) & (lift > -0.1) & below_horizon & (u < 0.97)
        # 見える範囲がほとんど水の絵では、水の中のわずかな視差の差が物体に見える。絵全体の近さの幅で見ても手前にあるものだけを採る。
        near_enough = disparity - d_far >= MIN_NEARNESS * (float(np.percentile(disparity[water_top:], 99)) - d_far)
        solid = (lift >= SOLID_LIFT) & (u < LAYERS[-1][1]) & near_enough
        floor_rows = profile
    else:
        solid = u < 0.45
    # 開けた水には、きめ（局所的な明るさのばらつき）がない。奥行きの推定は、暗い水や広い水に周辺が手前へ寄る
    # ゆるい勾配を付けることがあり、それだけでは水を物体と読んでしまう。きめのないところは物体にしない。
    gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY).astype(np.float32)
    size = max(5, round(0.012 * width)) | 1
    mean = cv2.blur(gray, (size, size))
    texture = np.sqrt(np.maximum(cv2.blur(gray * gray, (size, size)) - mean * mean, 0))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size * 2 + 1, size * 2 + 1))
    textured = cv2.morphologyEx((texture > MIN_TEXTURE).astype(np.uint8), cv2.MORPH_CLOSE, kernel).astype(bool)
    solid &= textured
    inside = np.zeros((height, width), bool)
    inside[water_top:y1, x0:x1] = True
    floor &= inside
    solid &= inside
    analysis = Analysis(rgb=rgb, disparity=disparity, u=u, frame=(x0, y0, x1, y1), water_top=water_top, floor=floor,
                        solid=solid, floor_rows=floor_rows, d_front=d_front, d_far=d_far, notes=notes)
    read_guides(subject, analysis)
    return analysis


# ---------------------------------------------------------------- 地形の下書き


def sand_depth(u: float) -> float:
    return float(np.interp(u, [p[0] for p in SAND_DEPTH_CURVE], [p[1] for p in SAND_DEPTH_CURVE]))


def sand_u(depth: float) -> float:
    return float(np.interp(depth, [p[1] for p in SAND_DEPTH_CURVE], [p[0] for p in SAND_DEPTH_CURVE]))


def object_depth(u: float) -> float:
    return float(np.clip(OBJECT_DEPTH[0] + OBJECT_DEPTH[1] * u, 0.2, 0.65))


def clean(mask: np.ndarray, size: int) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    opened = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    return cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel).astype(bool)


def components(mask: np.ndarray, min_area: float):
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    found = []
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] >= min_area:
            found.append((labels == index, stats[index]))
    return sorted(found, key=lambda item: -item[1][cv2.CC_STAT_AREA])


def runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """True が続く区間（始まり、終わりの次）。"""
    padded = np.concatenate([[False], flags, [False]])
    change = np.flatnonzero(padded[1:] != padded[:-1])
    return list(zip(change[::2].tolist(), change[1::2].tolist()))


def r3(value: float) -> float:
    return round(float(min(1.0, max(0.0, value))), 3)


def link_sand(surfaces: list[dict], blocked: np.ndarray, walkable: np.ndarray, frame_w: float, notes: list[str]) -> list[dict]:
    """砂の面（手前・中・奥の段）を、斜めの道でつないだ形に直す。面を歩く生き物だけの水槽向け（--connect-sand）。

    面を歩く生き物は、端点（最初か最後の点）がぴったり重なる面にしか移れない（src/core/surfaceMotion.ts）。
    段と段のあいだに、物体（blocked）を横切らない斜めの道を1本ずつ渡し、道の付け根で段を切って、付け根が
    どの面でも端点になるようにする。道の付け根は、段の面の上（もとの点か、点のあいだ）から選ぶ。面の形は変えない。
    """
    height, width = blocked.shape
    tier_of = {"front-sand": 0, "middle-sand": 1, "far-sand": 2}
    lines = [surface for surface in surfaces if surface["material"] == "sand"]
    tiers = [next((tier for name, tier in tier_of.items() if surface["id"].startswith(name)), 0) for surface in lines]

    def stops(points: list[dict]) -> list[tuple[float, dict]]:
        """道の付け根の候補。面の点と、点のあいだを絵の幅の約5%おきに刻んだ点。位置は「点の番号 + 区間の中の割合」。"""
        found = []
        for index, (start, end) in enumerate(zip(points, points[1:])):
            found.append((float(index), start))
            pieces = max(1, round(abs(end["x"] - start["x"]) * (width - 1) / (0.05 * frame_w)))
            for step in range(1, pieces):
                t = step / pieces
                found.append((index + t, {"x": r3(start["x"] + (end["x"] - start["x"]) * t), "y": r3(start["y"] + (end["y"] - start["y"]) * t),
                                          "depth": round(start["depth"] + (end["depth"] - start["depth"]) * t, 2)}))
        return [*found, (float(len(points) - 1), points[-1])]

    def clear(start: dict, end: dict) -> float | None:
        """道が物体を横切らなければ、道のうち底が見えている割合。横切れば None。"""
        xs = (np.linspace(start["x"], end["x"], 24) * (width - 1)).round().astype(int)
        ys = (np.linspace(start["y"], end["y"], 24) * (height - 1)).round().astype(int)
        return None if blocked[ys, xs].any() else float(walkable[ys, xs].mean())

    # 段の組ごとに、いちばんよい道の候補を1つ。道の横の長さは、縦の3倍（絵の幅の8〜25%）を目安にする。
    places = [stops(line["points"]) for line in lines]
    candidates = []
    for near in range(len(lines)):
        for far in range(len(lines)):
            if tiers[far] <= tiers[near]:
                continue
            best = None
            for near_at, start in places[near]:
                for far_at, end in places[far]:
                    open_floor = clear(start, end)
                    if open_floor is None:
                        continue
                    run, rise = abs(end["x"] - start["x"]) * (width - 1), abs(end["y"] - start["y"]) * (height - 1)
                    cost = abs(run - float(np.clip(3 * rise, 0.08 * frame_w, 0.25 * frame_w))) / frame_w + 0.3 * (1 - open_floor)
                    if best is None or cost < best[0]:
                        best = (cost, near_at, far_at, start, end)
            if best:
                candidates.append((tiers[far] - tiers[near], best[0], near, far, *best[1:]))
    # 隣の段どうしを先に、費用の小さい道から採る。もうつながっている面どうしには渡さない。
    group = list(range(len(lines)))

    def root(index: int) -> int:
        while group[index] != index:
            index = group[index]
        return index

    joints: list[dict[float, dict]] = [{} for _ in lines]
    slopes: list[dict] = []
    names = ["front", "middle", "far"]
    for _, _, near, far, near_at, far_at, start, end in sorted(candidates, key=lambda item: item[:4]):
        if root(near) == root(far):
            continue
        group[root(near)] = root(far)
        joints[near][near_at], joints[far][far_at] = start, end
        middle = {"x": r3((start["x"] + end["x"]) / 2), "y": r3((start["y"] + end["y"]) / 2),
                  "depth": round((start["depth"] + end["depth"]) / 2, 2)}
        name = f"{names[tiers[near]]}-{names[tiers[far]]}-slope"
        count = sum(1 for slope in slopes if slope["id"].startswith(name))
        slopes.append({"id": name if count == 0 else f"{name}-{count + 1}", "material": "sand",
                       "points": [dict(start), middle, dict(end)]})
    linked: list[dict] = []
    for surface in surfaces:
        index = next((i for i, line in enumerate(lines) if line is surface), None)
        last = len(surface["points"]) - 1
        cuts = sorted(at for at in joints[index] if 0 < at < last) if index is not None else []
        if not cuts:
            linked.append(surface)
            continue
        # 付け根（点のあいだのものは足す）で面を切る。切り口の点は、両側の面と道で同じ値にする。
        path = sorted({**{float(i): point for i, point in enumerate(surface["points"])}, **joints[index]}.items())
        bounds = [0.0, *cuts, float(last)]
        for letter, (first, final) in zip("abcdefgh", zip(bounds, bounds[1:])):
            linked.append({"id": f"{surface['id']}-{letter}", "material": "sand",
                           "points": [dict(point) for at, point in path if first <= at <= final]})
    alone = len({root(index) for index in range(len(lines))}) - 1
    if slopes:
        notes.append(f"砂の面を段に分け、斜めの道 {len(slopes)} 本で端点をつないだ（--connect-sand）: 道が石や草を横切っていないか確かめる")
    if alone > 0:
        notes.append(f"砂の面のうち {alone} 本は、ほかの面につなげなかった（あいだに物体がある）: 面を歩く生き物はそこから出られない。人がつなぐか消す")
    return linked + slopes


def draft_terrain(subject: Subject, analysis: Analysis) -> dict:
    a = analysis
    height, width = a.disparity.shape
    x0, y0, x1, y1 = a.frame
    frame_w, frame_h = x1 - x0, y1 - y0
    water_h = y1 - a.water_top
    frame_area = frame_w * water_h
    tank = subject.tank
    margin_x = max(0.03 * frame_w, (SAFE_MARGIN_CM * 1.5 / tank["widthCm"] * frame_w) if tank else 0)
    if subject.connect_sand and tank:
        # 面を歩く生き物は面の端まで来る。体の半分がガラスの縁で切れないよう、面の端を体長の半分だけ内へ寄せる。
        margin_x = max(margin_x, (SAFE_MARGIN_CM + 0.5 * subject.max_body_cm) / tank["widthCm"] * frame_w)
    margin_y = max(0.045 * frame_h, (SAFE_MARGIN_CM * 1.5 / tank["heightCm"] * frame_h) if tank else 0)
    small = max(3, round(OPEN_SMALL * width)) | 1
    large = max(5, round(OPEN_LARGE * width)) | 1
    u_smooth = cv2.medianBlur(a.u.astype(np.float32), 5)
    notes = a.notes
    span = a.d_front - a.d_far

    def side_name(cx: float) -> str:
        position = (cx - x0) / frame_w
        return "west" if position < 0.36 else "east" if position > 0.64 else "center"

    used: dict[str, int] = {}

    def unique(name: str) -> str:
        used[name] = used.get(name, 0) + 1
        return name if used[name] == 1 else f"{name}-{used[name]}"

    # ---- 物体（底から立ち上がるもの）。細い茎や枝は落とす。
    guided = a.guide_layers is not None
    solid = clean(a.solid, small)
    # 底に沿った薄い帯（底の凹凸や、当てはめのずれ）は物体にしない。
    tall = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, round(0.06 * frame_h))))
    solid = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_OPEN, tall).astype(bool)
    floor_near = cv2.dilate(a.floor.astype(np.uint8), np.ones((small * 2 + 1, small * 2 + 1), np.uint8)).astype(bool)
    grounded = np.zeros_like(solid)
    for mask, stats in components(solid, 0.004 * frame_area):
        bottom = stats[cv2.CC_STAT_TOP] + stats[cv2.CC_STAT_HEIGHT]
        left, right = stats[cv2.CC_STAT_LEFT], stats[cv2.CC_STAT_LEFT] + stats[cv2.CC_STAT_WIDTH]
        touches_floor = bool((mask & floor_near).any()) or bottom >= y1 - 2
        touches_side = (left <= x0 + 1 or right >= x1 - 1) and bottom > a.water_top + 0.5 * water_h
        # 水面から垂れるもの（浮き草の裏、水面の波）は、底や横のガラスに届かないので外す。
        if touches_floor or touches_side:
            grounded |= mask
    solid = grounded

    def outline(mask: np.ndarray) -> list[dict] | None:
        """マスクのいちばん大きい輪郭を、遮蔽の多角形にする。"""
        contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        polygon = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 0.0035 * width, True)[:, 0, :]
        if len(polygon) < 3:
            return None
        return [{"x": r3(px / (width - 1)), "y": r3(py / (height - 1))} for px, py in polygon]

    pieces: list[dict] = []
    if guided:
        # ---- 遮蔽（塗り分けた版）: 塗られた物体を、色の境目と連結成分ごとに1つずつ別の遮蔽にする。
        # どれを物体にするかは塗り分けた版に従う（奥行きの推定からは選ばない）。
        min_area = GUIDE_MIN_AREA * frame_area
        parts = [{"tier": tier, "mask": mask} for tier, mask in a.guide_objects if mask.any()]
        # 小さなかけら（草の葉で切れた岩の端など）は、同じ色で隣り合う物体に付ける。隣がなければ、ごく小さいものだけ捨てる。
        reach = np.ones((small, small), np.uint8)

        def extent(mask: np.ndarray) -> tuple[int, int]:
            columns = np.flatnonzero(mask.any(axis=0))
            return int(columns[0]), int(columns[-1])

        def touching(part: dict, others: list[dict], widest: float = math.inf) -> tuple[int, dict | None]:
            """同じ色で隣り合う物体のうち、いちばん長く接しているもの。まとめた幅が widest を超える相手は除く。"""
            near = cv2.dilate(part["mask"].astype(np.uint8), reach).astype(bool)
            left, right = extent(part["mask"])
            hosts = [(int((near & other["mask"]).sum()), other) for other in others
                     if other is not part and other["tier"] == part["tier"] and "gone" not in other
                     and max(right, extent(other["mask"])[1]) - min(left, extent(other["mask"])[0]) + 1 <= widest]
            return max(hosts, key=lambda item: item[0], default=(0, None))

        for part in sorted(parts, key=lambda item: int(item["mask"].sum())):
            if part["mask"].sum() >= GUIDE_JOIN_AREA * frame_area:
                continue
            touch, host = touching(part, parts)
            if touch:
                host["mask"] = host["mask"] | part["mask"]
            if touch or part["mask"].sum() < min_area:
                part["gone"] = True
        # 奥の段（青）のうち、開けた水（奥行きの推定で、底でも物体でもない所）に掛かる広い塗りは遮蔽にしない。
        # かすんだ遠くの岩まで塗られると、絵の幅いっぱいの遮蔽になり、その手前を泳ぐ魚まで隠してしまう。
        open_water = ~(a.floor | a.solid)
        dropped = np.zeros_like(solid)
        back = len(GUIDE_TIERS) - 1
        for mask, stats in components(clean(a.guide_layers[back], small), min_area):
            wide = stats[cv2.CC_STAT_WIDTH] >= GUIDE_WATER_WIDTH * frame_w or stats[cv2.CC_STAT_AREA] >= GUIDE_WATER_AREA * frame_area
            if wide and open_water[mask].mean() >= GUIDE_WATER_SHARE:
                dropped |= mask
                left = stats[cv2.CC_STAT_LEFT]
                notes.append(f"奥の段（青）の塗りのうち、開けた水に掛かる広いもの（絵の x {left / (width - 1):.2f}〜"
                             f"{(left + stats[cv2.CC_STAT_WIDTH] - 1) / (width - 1):.2f}）は遮蔽にしなかった: かすんだ遠くの岩なら、そのままでよい")
        for part in parts:
            if part["tier"] == back and (part["mask"] & dropped).sum() >= 0.5 * part["mask"].sum():
                part["gone"] = True
        solid = clean(np.logical_or.reduce(a.guide_layers), small) & ~dropped
        parts = [part for part in parts if "gone" not in part]
        # 物体が上限より多ければ、奥の段から順に、隣り合う同じ色の物体を小さいものからまとめる（手書きの地形でも、
        # 手前の石は1つずつ、奥の石はまとめて1枚にしてある）。絵の幅いっぱいの遮蔽に戻らないよう、まとめた幅には上限を置く。
        # それでも多ければ、小さいものを落とす。
        found_count, joined = len(parts), 0
        for tier in reversed(range(len(GUIDE_TIERS))):
            while len(parts) > GUIDE_MAX_OCCLUDERS:
                for part in sorted((item for item in parts if item["tier"] == tier), key=lambda item: int(item["mask"].sum())):
                    touch, host = touching(part, parts, GUIDE_JOIN_WIDTH * frame_w)
                    if touch:
                        host["mask"] = host["mask"] | part["mask"]
                        parts = [item for item in parts if item is not part]
                        joined += 1
                        break
                else:
                    break
        # 輪郭は、すき間を埋めてから、細い枝やひげを落として整える。人が選んで塗った物体なので、案内なしのときより細いものまで残す。
        thin = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, small // 2) | 1,) * 2)
        fill = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (small, small))
        tidy = [(part["tier"], mask) for part in parts for mask, _ in components(cv2.morphologyEx(
            cv2.morphologyEx(part["mask"].astype(np.uint8), cv2.MORPH_CLOSE, fill), cv2.MORPH_OPEN, thin), min_area)]
        for tier, mask in tidy:
            polygon = outline(mask)
            if polygon is None:
                continue
            name, _, depth = GUIDE_TIERS[tier]
            if a.floor_rows is not None:
                # 段の色は3つしかなく、同じ段の石どうしの前後は出ない。物体の足もとの高さにある底の depth と、段の depth の
                # 中ほどを取る（手書きの5水景・46個の遮蔽で、段の値だけより手書きに近かった。docs/terrain-drafting.md）。
                foot = min(y1 - 1, int(np.percentile(np.nonzero(mask)[0], 98)))
                depth = float(np.clip((sand_depth((a.d_front - a.floor_rows[foot]) / span) + depth) / 2, 0.1, GUIDE_DEPTH_LIMIT))
            pieces.append({"layer": name, "depth": depth, "area": int(mask.sum()), "cx": float(np.mean(np.nonzero(mask)[1])),
                           "mask": mask, "fresh": mask, "polygon": polygon})
        if joined:
            notes.append(f"塗られた物体が {found_count} 個あり、上限の {GUIDE_MAX_OCCLUDERS} 個を超えた: 奥の段から、隣り合う同じ色の物体を "
                         f"{joined} 回まとめた")
        if len(pieces) > GUIDE_MAX_OCCLUDERS:
            notes.append(f"まとめても遮蔽の候補が {len(pieces)} 個あった: 大きい順に {GUIDE_MAX_OCCLUDERS} 個を残した")
        pieces = sorted(pieces, key=lambda item: -item["area"])[:GUIDE_MAX_OCCLUDERS]
    else:
        # ---- 遮蔽: 手前から奥へ、近さの境目ごとに「そこまでの物体」を重ねていく。
        # 奥の段の多角形は手前の段を含む。どれも同じ絵の切り抜きなので、重なっても見た目は変わらない。
        covered = np.zeros_like(solid)
        for layer_name, limit in LAYERS:
            layer = clean(solid & (u_smooth <= limit), small)
            for mask, stats in components(layer, 0.004 * frame_area):
                fresh = mask & ~covered
                if fresh.sum() < 0.004 * frame_area or fresh.sum() < 0.2 * mask.sum():
                    continue
                if stats[cv2.CC_STAT_TOP] + stats[cv2.CC_STAT_HEIGHT] < a.water_top + 0.15 * water_h:
                    continue  # 水面のすぐ下だけにある帯（水面の裏の映り込み）
                polygon = outline(mask)
                if polygon is None:
                    continue
                pieces.append({"layer": layer_name, "depth": object_depth(float(np.median(u_smooth[fresh]))),
                               "area": int(fresh.sum()), "cx": float(np.mean(np.nonzero(fresh)[1])), "mask": mask, "fresh": fresh,
                               "polygon": polygon})
            covered |= layer
        pieces = sorted(pieces, key=lambda item: -item["area"])[:MAX_OCCLUDERS]
    occluders = [{"id": unique(f"{side_name(piece['cx'])}-{piece['layer']}-object"), "depth": round(piece["depth"], 2),
                  "polygon": piece["polygon"]} for piece in sorted(pieces, key=lambda item: item["cx"])]

    # ---- 砂の面: 手前（下端のすぐ上）と、中・奥の段。
    surfaces: list[dict] = []
    walkable = a.floor & ~cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    gap = max(2, round(0.03 * frame_h))
    columns = np.arange(round(x0 + margin_x), round(x1 - margin_x))

    def sand_line(name: str, rows: np.ndarray, depth_at, need_floor: bool) -> bool:
        valid = (rows > a.water_top + margin_y) & (rows < y1 - margin_y + 1)
        if need_floor:
            for i in np.flatnonzero(valid):
                row = int(rows[i])
                valid[i] = walkable[max(0, row - gap):row + gap + 1, columns[i]].mean() > 0.6
        spans = sorted(((s, e) for s, e in runs(valid) if e - s >= 0.12 * frame_w), key=lambda item: item[0] - item[1])[:2]
        added = False
        for index, (start, end) in enumerate(spans):
            if index == 1 and end - start < 0.2 * frame_w:
                continue
            count = int(np.clip(round((end - start) / (0.2 * frame_w)) + 1, 2, 6))
            picks = np.linspace(start, end - 1, count).round().astype(int)
            points = [{"x": r3(columns[i] / (width - 1)), "y": r3(rows[i] / (height - 1)),
                       "depth": round(depth_at(int(columns[i]), float(rows[i])), 2)} for i in picks]
            surfaces.append({"id": unique(name), "material": "sand", "points": points})
            added = True
        return added

    def local_u(x: int, row: float) -> float:
        r = int(np.clip(row, 0, height - 1))
        return float(np.median(u_smooth[max(0, r - 2):r + 3, max(0, x - 6):x + 7]))

    front_rows = np.full(len(columns), float(y1 - margin_y))
    if a.floor_rows is not None:
        # 手前の面は下端のすぐ上に置く。下端が手前の岩や草で埋まっている列では、底が見え始める高さまで上げる。
        window = walkable[a.water_top:y1, :][:, columns]
        lowest = a.water_top + window.shape[0] - 1 - np.argmax(window[::-1], axis=0).astype(np.float64)
        blocked = ~window.any(axis=0) | (lowest < front_rows - 0.2 * frame_h)
        lifted = np.where(blocked, front_rows, np.minimum(front_rows, lowest - gap))
        front = lifted.copy()
        front[blocked] = -1
        if not sand_line("front-sand", front, lambda x, row: float(np.clip(sand_depth(local_u(x, row)), 0.1, 0.3)), True):
            sand_line("front-sand", front_rows, lambda x, row: 0.15, False)
            notes.append("手前の底が物体で埋まっている: 手前の面は下端のすぐ上に機械的に置いた")
        last_row = float(y1 - margin_y)
        reach = max(2, round(0.06 * frame_h))
        tolerance = 0.06 * span
        for name, target in SAND_TIERS:
            # その depth に当たる視差の底が何行目にあるか。列ごとに、近くの行から視差の合う底を探して等高線をなぞる。
            level = a.d_front - sand_u(target) * span
            hits = np.flatnonzero(a.floor_rows[a.water_top:y1] >= level)
            if len(hits) == 0:
                continue
            base = a.water_top + int(hits[0])
            if base > last_row - 0.05 * frame_h or base < a.water_top + margin_y:
                continue
            low, high = max(a.water_top, base - reach), min(y1, base + reach + 1)
            miss = np.abs(a.disparity[low:high, :][:, columns] - level)
            miss[~walkable[low:high, :][:, columns]] = np.inf
            rows = low + np.argmin(miss, axis=0).astype(np.float64)
            good = miss.min(axis=0) <= tolerance
            rows[good] = cv2.blur(np.where(good, rows, base).astype(np.float32).reshape(1, -1),
                                  (max(3, round(0.05 * frame_w)) | 1, 1)).ravel()[good]
            rows[~good] = -1
            if sand_line(name, rows, lambda x, row, target=target: target, False):
                last_row = base
    else:
        sand_line("front-sand", front_rows, lambda x, row: 0.15, False)
    if subject.connect_sand:
        surfaces = link_sand(surfaces, cv2.dilate(solid.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool), walkable, frame_w, notes)

    # ---- 岩や流木の上面: 遮蔽にした物体の上の輪郭のうち、なだらかな区間。
    hsv = cv2.cvtColor(a.rgb, cv2.COLOR_BGR2HSV)
    ledges: list[dict] = []
    window = max(3, round(0.02 * width)) | 1
    for piece in pieces:
        mask, fresh = piece["mask"], piece["fresh"]
        inside_columns = columns[mask[:, columns].any(axis=0)]
        if len(inside_columns) < 0.05 * frame_w:
            continue
        tops = np.argmax(mask[:, inside_columns], axis=0)
        own = fresh[tops, inside_columns]  # 手前の段の物体の上面は、その段のものとして数える
        smooth = cv2.blur(tops.astype(np.float32).reshape(1, -1), (window, 1)).ravel()
        slope = np.abs(np.gradient(smooth))
        ok = own & (slope < 0.7) & (smooth > a.water_top + margin_y) & (smooth < y1 - margin_y) & \
            (np.concatenate([[1], np.diff(inside_columns)]) == 1)
        hue, saturation = hsv[fresh][:, 0].astype(int) * 2, hsv[fresh][:, 1] / 255
        brown = float(((hue >= 10) & (hue <= 45) & (saturation > 0.3)).mean())
        box = cv2.minAreaRect(np.column_stack(np.nonzero(fresh)[::-1]).astype(np.float32))[1]
        material = "wood" if brown > 0.5 and max(box) / max(1.0, min(box)) > 2.6 else "stone"
        for start, end in sorted(((s, e) for s, e in runs(ok) if e - s >= 0.06 * frame_w), key=lambda item: item[0] - item[1])[:2]:
            count = int(np.clip(round((end - start) / (0.08 * frame_w)) + 1, 2, 4))
            picks = np.linspace(start, end - 1, count).round().astype(int)
            points = [{"x": r3(inside_columns[i] / (width - 1)), "y": r3((smooth[i] + 1) / (height - 1)),
                       "depth": round(piece["depth"] - 0.03, 2)} for i in picks]
            ledges.append({"length": end - start, "cx": float(inside_columns[(start + end) // 2]), "material": material,
                           "points": points, "peak": points[len(points) // 2]})
    ledges = sorted(ledges, key=lambda item: -item["length"])[:MAX_LEDGES]
    # 面を歩く生き物だけの水槽では、砂の面とつながらない上面に乗った生き物がそこから動けないので、出さない選択ができる。
    for ledge in sorted(ledges, key=lambda item: item["cx"]) if subject.tops else []:
        surfaces.append({"id": unique(f"{side_name(ledge['cx'])}-{ledge['material']}-top"), "material": ledge["material"],
                         "points": ledge["points"]})
    if subject.connect_sand and subject.tops and ledges:
        notes.append("岩や流木の上面は、砂の面とつないでいない: 面を歩く生き物だけの水槽なら --no-tops で出さないか、人がつなぐ")
    structure_points = [{"x": ledge["peak"]["x"], "y": ledge["peak"]["y"]} for ledge in ledges[:3]]

    # ---- 回避領域: 手前と中ほどの物体の太い部分ごとに、軸に平行な楕円を1つ。
    core = clean(solid & (np.logical_or.reduce(a.guide_layers[:2]) if guided else u_smooth <= LAYERS[1][1]), large)
    top_limit = a.water_top + 0.16 * water_h
    min_gap = max(0.06 * frame_w, (1.4 * subject.max_body_cm / tank["widthCm"] * frame_w) if tank else 0)
    wall_gap = max(0.07 * frame_w, (0.8 * subject.max_body_cm / tank["widthCm"] * frame_w) if tank else 0)
    ellipses = []
    blobs: list[np.ndarray] = []
    for mask, stats in components(core, 0.012 * frame_area):
        left, blob_w = stats[cv2.CC_STAT_LEFT], stats[cv2.CC_STAT_WIDTH]
        if blob_w > 0.42 * frame_w:
            # 横に長いかたまりは、中ほどのいちばん低いところで2つに分ける。1つの大きな楕円にすると泳ぐ場所がなくなる。
            thickness = mask[:, left:left + blob_w].sum(axis=0).astype(np.float32)
            inner = slice(round(0.25 * blob_w), round(0.75 * blob_w))
            cut = left + inner.start + int(np.argmin(cv2.blur(thickness.reshape(1, -1), (small, 1)).ravel()[inner]))
            halves = [mask.copy(), mask.copy()]
            halves[0][:, cut:] = False
            halves[1][:, :cut] = False
            blobs += [half for half in halves if half.sum() >= 0.012 * frame_area]
        else:
            blobs.append(mask)
    for mask in sorted(blobs, key=lambda item: -int(item.sum()))[:MAX_OBSTACLES]:
        ys, xs = np.nonzero(mask)
        cx, cy = float(xs.mean()), float(ys.mean())
        rx, ry = OBSTACLE_SIGMA * float(xs.std()) + 1, OBSTACLE_SIGMA * float(ys.std()) + 1
        left, right, top, bottom = cx - rx, cx + rx, cy - ry, cy + ry
        # 楕円の下と底、楕円とガラスの間に、魚が挟まる細いすき間を残さない。
        if OBSTACLE_EXTEND_BOTTOM and bottom > y1 - 0.14 * frame_h:
            bottom = y1 + 0.04 * frame_h
        if OBSTACLE_EXTEND_WALL:
            if left < x0 + wall_gap:
                left = x0 - 0.05 * frame_w
            if right > x1 - wall_gap:
                right = x1 + 0.05 * frame_w
        top = max(top, top_limit)
        if bottom - top < 0.08 * frame_h or right - left < 0.04 * frame_w:
            continue
        tier_depth = None
        if guided:
            # かたまりに入る遮蔽のうち、いちばん奥の面に合わせる。岩の芯は、どの遮蔽の面（と上面）よりも奥から始める。
            # 芯の奥に置く隠れ場所（depth の上限 0.9）が芯の外に出るよう、面の depth は 0.6 で頭打ちにする。
            faces = [piece["depth"] for piece in pieces if (piece["mask"] & mask).sum() >= 0.3 * piece["area"]]
            tier_depth = min(0.6, max(faces)) if faces else GUIDE_TIERS[0 if (mask & a.guide_layers[0]).sum() >= 0.5 * mask.sum() else 1][2]
        ellipses.append({"left": left, "right": right, "top": top, "bottom": bottom, "masks": [mask],
                         "u": [float(np.median(u_smooth[mask]))], "depths": [tier_depth]})
    ellipses.sort(key=lambda item: item["left"])
    merged: list[dict] = []
    for ellipse in ellipses:
        previous = merged[-1] if merged else None
        if previous and ellipse["left"] - previous["right"] < min_gap:
            if max(previous["right"], ellipse["right"]) - previous["left"] <= 0.5 * frame_w:
                # 近すぎる楕円は1つにまとめる。重なりのくぼみや細いすき間に魚が挟まる。
                previous.update(right=max(previous["right"], ellipse["right"]), top=min(previous["top"], ellipse["top"]),
                                bottom=max(previous["bottom"], ellipse["bottom"]))
                previous["masks"] += ellipse["masks"]
                previous["u"] += ellipse["u"]
                previous["depths"] += ellipse["depths"]
                continue
            # まとめると広すぎるときは、向かい合う縁を引いてすき間を空ける。
            middle = (previous["right"] + ellipse["left"]) / 2
            previous["right"], ellipse["left"] = middle - min_gap / 2, middle + min_gap / 2
        merged.append(ellipse)
    # 砂の面（底で休む行き先）は楕円の外に出す。楕円の内側の行き先へは、魚が同じ奥行きのまま近づけず、楕円の縁で
    # 止まり続ける。砂の面が楕円の横に来るよう、楕円のほうを削る。岩の上面は、奥行きで楕円の手前に置いて分ける（下）。
    body_x = (0.25 * subject.max_body_cm / tank["widthCm"] * frame_w) if tank else 0
    body_y = (0.25 * subject.max_body_cm / tank["heightCm"] * frame_h) if tank else 0
    goals = []
    for surface in surfaces:
        for start, end in zip(surface["points"], surface["points"][1:]):
            for t in np.linspace(0, 1, 9):
                goals.append(((start["x"] + (end["x"] - start["x"]) * t) * (width - 1),
                              (start["y"] + (end["y"] - start["y"]) * t) * (height - 1), surface["material"] == "sand"))
    for ellipse in merged:
        for gx, gy, sand in goals:
            cx, cy = (ellipse["left"] + ellipse["right"]) / 2, (ellipse["top"] + ellipse["bottom"]) / 2
            rx, ry = (ellipse["right"] - ellipse["left"]) / 2 + body_x, (ellipse["bottom"] - ellipse["top"]) / 2 + body_y
            if rx <= 0 or ry <= 0 or ((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2 >= 1:
                continue
            if not sand:
                continue
            if gx >= cx:
                ellipse["right"] = min(ellipse["right"], gx - body_x - 0.02 * frame_w)
            else:
                ellipse["left"] = max(ellipse["left"], gx + body_x + 0.02 * frame_w)
    merged = [e for e in merged if e["right"] - e["left"] >= 0.05 * frame_w and e["bottom"] - e["top"] >= 0.06 * frame_h]
    obstacles: list[dict] = []
    for ellipse in merged:
        cx, cy = (ellipse["left"] + ellipse["right"]) / 2, (ellipse["top"] + ellipse["bottom"]) / 2
        rx, ry = (ellipse["right"] - ellipse["left"]) / 2, (ellipse["bottom"] - ellipse["top"]) / 2
        # 手書きの地形と同じ並び: 遮蔽の面（と上面）のすぐ奥から、岩の芯が始まる。上面へ向かう魚は楕円の手前を通れる。
        depth = float(max(ellipse["depths"]) if guided else np.mean([object_depth(value) for value in ellipse["u"]])) \
            + OBSTACLE_DEPTH_RADIUS + 0.03
        ellipse["obstacle"] = {"id": unique(f"{side_name(cx)}-mass"),
                               "center": {"x": r3(cx / (width - 1)), "y": r3(cy / (height - 1)), "depth": round(depth, 2)},
                               "radius": {"x": round(min(0.999, rx / width), 3), "y": round(min(0.999, ry / height), 3)},
                               "depthRadius": OBSTACLE_DEPTH_RADIUS}
        obstacles.append(ellipse["obstacle"])

    # ---- 隠れ場所: かたまりの中のいちばん暗いところ（岩のすき間や陰）。
    # 回避領域の楕円の外（魚の体長ぶんの余白も外）に置く。楕円の内側だと、魚が同じ奥行きのままたどり着けない。
    shelters: list[dict] = []
    luminance = cv2.GaussianBlur(cv2.cvtColor(a.rgb, cv2.COLOR_BGR2GRAY), (0, 0), 0.012 * width)
    reach = np.zeros((height, width), bool)
    reach[round(a.water_top + margin_y * 1.4):round(y1 - margin_y * 1.4), round(x0 + margin_x * 1.4):round(x1 - margin_x * 1.4)] = True
    grid_y, grid_x = np.mgrid[0:height, 0:width]
    pad_x = 0.02 * frame_w + (0.25 * subject.max_body_cm / tank["widthCm"] * frame_w if tank else 0)
    pad_y = 0.02 * frame_h + (0.25 * subject.max_body_cm / tank["heightCm"] * frame_h if tank else 0)
    for ellipse in merged:
        cx, cy = (ellipse["left"] + ellipse["right"]) / 2, (ellipse["top"] + ellipse["bottom"]) / 2
        rx, ry = (ellipse["right"] - ellipse["left"]) / 2 + pad_x, (ellipse["bottom"] - ellipse["top"]) / 2 + pad_y
        reach &= ((grid_x - cx) / rx) ** 2 + ((grid_y - cy) / ry) ** 2 > 1
    kinds = [kind for kind in subject.shelter_kinds if kind in ("cave", "crevice")]
    for px, py in a.guide_markers or []:
        # 印は岩のすき間や穴の口にある。回避領域の楕円に掛かる印は、その岩の芯より奥の depth に置く（手書きの並びと同じ）。
        behind = [e["obstacle"]["center"]["depth"] + OBSTACLE_DEPTH_RADIUS + 0.08 for e in merged if "obstacle" in e and
                  ((px - (e["left"] + e["right"]) / 2) / ((e["right"] - e["left"]) / 2 + pad_x)) ** 2 +
                  ((py - (e["top"] + e["bottom"]) / 2) / ((e["bottom"] - e["top"]) / 2 + pad_y)) ** 2 <= 1]
        on_floor = bool(a.floor[int(py), int(px)]) and not solid[int(py), int(px)]
        depth = max(behind) if behind else sand_depth(float(u_smooth[int(py), int(px)])) if on_floor else 0.6
        shelter = {"id": unique(f"{side_name(px)}-{'burrow' if on_floor else 'gap'}"), "x": r3(px / (width - 1)),
                   "y": r3(py / (height - 1)), "depth": round(min(0.9, depth), 2), "px": px, "py": py}
        wanted = [kind for kind in subject.shelter_kinds if (kind == "burrow") == on_floor]
        if wanted:
            shelter["kind"] = wanted[len(shelters) % len(wanted)]
        shelters.append(shelter)
    hides = [] if a.guide_markers is not None else sorted(pieces, key=lambda piece: -piece["area"])[:3]
    for index, piece in enumerate(hides):
        candidates = cv2.erode(piece["mask"].astype(np.uint8), np.ones((small, small), np.uint8)).astype(bool) & reach
        # 物体の足もと（下から3割）に限る。草むらの上のほうの暗がりは隠れ場所にしない。
        rows_with = np.flatnonzero(piece["mask"].any(axis=1))
        candidates[:int(rows_with[0] + 0.7 * (rows_with[-1] - rows_with[0]))] = False
        if not candidates.any():
            continue
        py, px = np.unravel_index(int(np.argmin(np.where(candidates, luminance, 255))), candidates.shape)
        if any(math.hypot(px - other["px"], py - other["py"]) < 0.1 * frame_w for other in shelters):
            continue
        shelter = {"id": unique(f"{side_name(px)}-shade"), "x": r3(px / (width - 1)), "y": r3(py / (height - 1)),
                   "depth": round(min(0.9, piece["depth"] + 0.2), 2), "px": px, "py": py}
        if kinds:
            shelter["kind"] = kinds[len(shelters) % len(kinds)]
        shelters.append(shelter)
    for shelter in shelters:
        del shelter["px"], shelter["py"]
    missing = [kind for kind in subject.shelter_kinds if kind not in {s.get("kind") for s in shelters}]
    if missing:
        notes.append(f"住みかにする隠れ場所（{', '.join(missing)}）は絵から決められない: 人が置く")

    if not surfaces:
        sand_line("front-sand", front_rows, lambda x, row: 0.15, False)
    # src/core/terrainMotion.test.ts は、どの遮蔽も絵の (0.5, 0.3)（開けた水）と (0.15, 0.99)（手前の底）を覆わないことを確かめている。
    for occluder in occluders:
        polygon = np.array([[p["x"], p["y"]] for p in occluder["polygon"]], np.float32)
        for point in ((0.5, 0.3), (0.15, 0.99)):
            if cv2.pointPolygonTest(polygon, point, False) >= 0:
                notes.append(f"遮蔽 {occluder['id']} が絵の {point} を覆っている: 開けた水や手前の底を隠していないか確かめる（単体テストが落ちる）")
    if not guided and len(occluders) == MAX_OCCLUDERS:
        notes.append(f"遮蔽の候補が上限の {MAX_OCCLUDERS} 個あった: 小さい物体を落としている")
    a.debug = {"solid": solid, "core": core}
    return {
        "structurePoints": structure_points,
        "bubbleSources": [],
        "terrain": {"surfaces": surfaces, "occluders": occluders, "obstacles": obstacles, "shelters": shelters},
    }


# ---------------------------------------------------------------- 確認画像


def depth_color(depth: float) -> tuple[int, int, int]:
    """depth の色。手前（0）が赤、奥（1）が青。"""
    color = cv2.applyColorMap(np.array([[int(255 * (1 - float(np.clip(depth, 0, 1))))]], np.uint8), cv2.COLORMAP_TURBO)[0, 0]
    return int(color[0]), int(color[1]), int(color[2])


def text(image: np.ndarray, label: str, at: tuple[int, int], color=(255, 255, 255), scale=0.5) -> None:
    cv2.putText(image, label, at, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(image, label, at, cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


def draw_overlay(image: np.ndarray, document: dict, frame: tuple[float, float, float, float], scene: dict, title: str) -> np.ndarray:
    """絵に地形を重ねる。面=線（色は depth）、遮蔽=半透明の多角形、回避領域=白い楕円、隠れ場所=紫の×、寄り道先=水色の丸。"""
    height, width = image.shape[:2]
    terrain = document["terrain"]

    def at(point: dict) -> tuple[int, int]:
        return round(point["x"] * (width - 1)), round(point["y"] * (height - 1))

    out = image.copy()
    fill = image.copy()
    for occluder in terrain["occluders"]:
        cv2.fillPoly(fill, [np.array([at(p) for p in occluder["polygon"]], np.int32)], depth_color(occluder["depth"]))
    out = cv2.addWeighted(fill, 0.38, out, 0.62, 0)
    for occluder in terrain["occluders"]:
        points = np.array([at(p) for p in occluder["polygon"]], np.int32)
        cv2.polylines(out, [points], True, depth_color(occluder["depth"]), 2, cv2.LINE_AA)
        top = points[np.argmin(points[:, 1])]
        text(out, f"{occluder['depth']:.2f}", (int(top[0]) - 14, int(top[1]) + 16))
    for obstacle in terrain.get("obstacles", []):
        center = obstacle["center"]
        axes = (round(obstacle["radius"]["x"] * width), round(obstacle["radius"]["y"] * height))
        cv2.ellipse(out, at(center), axes, 0, 0, 360, (255, 255, 255), 2, cv2.LINE_AA)
        text(out, f"{center['depth']:.2f}+-{obstacle['depthRadius']:.2f}", (at(center)[0] - 40, min(height - 6, at(center)[1])))
    for surface in terrain["surfaces"]:
        points = surface["points"]
        for start, end in zip(points, points[1:]):
            cv2.line(out, at(start), at(end), (0, 0, 0), 6, cv2.LINE_AA)
            cv2.line(out, at(start), at(end), depth_color((start["depth"] + end["depth"]) / 2), 3, cv2.LINE_AA)
        for point in points:
            cv2.circle(out, at(point), 4, (255, 255, 255), -1, cv2.LINE_AA)
        text(out, f"{surface['material']} {points[0]['depth']:.2f}", (at(points[0])[0], at(points[0])[1] - 8))
    for shelter in terrain.get("shelters", []):
        cv2.drawMarker(out, at(shelter), (0, 0, 0), cv2.MARKER_TILTED_CROSS, 20, 5, cv2.LINE_AA)
        cv2.drawMarker(out, at(shelter), (255, 0, 255), cv2.MARKER_TILTED_CROSS, 18, 2, cv2.LINE_AA)
        text(out, f"{shelter.get('kind', '-')} {shelter['depth']:.2f}", (at(shelter)[0] + 10, at(shelter)[1] + 4), (255, 160, 255))
    for point in document.get("structurePoints", []):
        cv2.circle(out, at(point), 7, (255, 255, 0), 2, cv2.LINE_AA)
    for point in document.get("bubbleSources", []):
        cv2.circle(out, at(point), 5, (255, 255, 255), 1, cv2.LINE_AA)
    # 見える範囲の外を暗くする。
    x0, y0, x1, y1 = round(frame[0] * width), round(frame[1] * height), round(frame[2] * width), round(frame[3] * height)
    shade = (out * 0.45).astype(np.uint8)
    shade[y0:y1, x0:x1] = out[y0:y1, x0:x1]
    out = shade
    cv2.rectangle(out, (x0, y0), (x1 - 1, y1 - 1), (0, 255, 255), 1)
    water_line = scene.get("waterLine")
    if water_line:
        for key in ("front", "back"):
            row = round(water_line[key] * height)
            cv2.line(out, (x0, row), (x1, row), (255, 255, 0), 1, cv2.LINE_AA)
            text(out, f"waterLine.{key}", (x0 + 6, row - 4), (255, 255, 0), 0.45)
    text(out, title, (x0 + 8, y0 + 22), (255, 255, 255), 0.65)
    return out


def write_overlay(subject: Subject, draft: dict, compare: bool, path: Path) -> None:
    image = cv2.imread(str(subject.image_path), cv2.IMREAD_COLOR)
    scale = min(1.0, 1280 / image.shape[1])
    image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    frame = visible_frame(subject, image.shape[1], image.shape[0])
    panels = [draw_overlay(image, draft, frame, subject.scene, f"draft: {subject.id}")]
    if compare and subject.hand:
        panels.insert(0, draw_overlay(image, subject.hand, frame, subject.scene, f"hand: {subject.id}"))
    sheet = np.vstack(panels) if image.shape[1] >= image.shape[0] else np.hstack(panels)
    cv2.imwrite(str(path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 86])


def write_debug(analysis: Analysis, path: Path) -> None:
    """解析の途中経過。左: 底（青）と物体（赤、太い部分は黄）。右: 奥行きの推定（赤が手前）。"""
    a = analysis
    tint = a.rgb.copy()
    tint[a.floor] = (0.5 * tint[a.floor] + 0.5 * np.array([255, 120, 0])).astype(np.uint8)
    solid = a.debug.get("solid", a.solid)
    tint[solid] = (0.5 * tint[solid] + 0.5 * np.array([0, 0, 255])).astype(np.uint8)
    core = a.debug.get("core")
    if core is not None:
        tint[core] = (0.5 * tint[core] + 0.5 * np.array([0, 220, 255])).astype(np.uint8)
    x0, y0, x1, y1 = a.frame
    cv2.rectangle(tint, (x0, y0), (x1 - 1, y1 - 1), (0, 255, 255), 1)
    near = np.clip(1 - a.u, 0, 1.3) / 1.3
    depth = cv2.applyColorMap((near * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    cv2.imwrite(str(path), np.hstack([tint, depth]), [cv2.IMWRITE_JPEG_QUALITY, 84])


# ---------------------------------------------------------------- 評価


def polygon_mask(shapes: list[list[dict]], size: tuple[int, int]) -> np.ndarray:
    height, width = size
    mask = np.zeros((height, width), np.uint8)
    for polygon in shapes:
        cv2.fillPoly(mask, [np.array([[round(p["x"] * (width - 1)), round(p["y"] * (height - 1))] for p in polygon], np.int32)], 1)
    return mask.astype(bool)


def ellipse_mask(obstacles: list[dict], size: tuple[int, int]) -> np.ndarray:
    height, width = size
    mask = np.zeros((height, width), np.uint8)
    for obstacle in obstacles:
        center = (round(obstacle["center"]["x"] * (width - 1)), round(obstacle["center"]["y"] * (height - 1)))
        axes = (max(1, round(obstacle["radius"]["x"] * width)), max(1, round(obstacle["radius"]["y"] * height)))
        cv2.ellipse(mask, center, axes, 0, 0, 360, 1, -1)
    return mask.astype(bool)


def overlap(a: np.ndarray, b: np.ndarray) -> dict:
    union, both = (a | b).sum(), (a & b).sum()
    return {"iou": float(both / union) if union else None,
            "recall": float(both / a.sum()) if a.sum() else None,
            "precision": float(both / b.sum()) if b.sum() else None}


def line_y(points: list[dict], x: float) -> float | None:
    for start, end in zip(points, points[1:]):
        low, high = min(start["x"], end["x"]), max(start["x"], end["x"])
        if low <= x <= high and high - low > 1e-9:
            t = (x - start["x"]) / (end["x"] - start["x"])
            return start["y"] + (end["y"] - start["y"]) * t
    return None


def line_gap(hand: dict, draft: dict) -> tuple[float, float] | None:
    """2本の面の、x が重なる区間での y の差の平均と、手書きの面の x の範囲のうち重なった割合。"""
    xs = [p["x"] for p in hand["points"]]
    samples = np.linspace(min(xs), max(xs), 25)
    gaps = []
    for x in samples:
        y_hand, y_draft = line_y(hand["points"], x), line_y(draft["points"], x)
        if y_hand is not None and y_draft is not None:
            gaps.append(abs(y_hand - y_draft))
    if not gaps:
        return None
    return float(np.mean(gaps)), len(gaps) / len(samples)


def mean_depth(surface: dict) -> float:
    return float(np.mean([p["depth"] for p in surface["points"]]))


def point_recall(hand: list[dict], draft: list[dict], limit: float, aspect: float) -> tuple[int, int]:
    """手書きの点のうち、下書きの点が近くにあるものの数。距離は画像の横幅を1とする。"""
    hit = 0
    for point in hand:
        if any(math.hypot(point["x"] - other["x"], (point["y"] - other["y"]) / aspect) <= limit for other in draft):
            hit += 1
    return hit, len(hand)


def scene_type(subject: Subject, image_shape: tuple[int, int]) -> str:
    """評価をタイプ別に分けるための分類。手書きの地形と水景の見出しから決める（下書きには使わない）。"""
    terrain = subject.hand["terrain"]
    height, width = image_shape
    if subject.scene.get("waterLine"):
        return "水面の上まで見える（干潟・マングローブ）"
    if height > width:
        return "縦長のクラゲ水槽"
    area = polygon_mask([o["polygon"] for o in terrain["occluders"]], (200, 200)).mean()
    if area < 0.07 and len(terrain.get("obstacles", [])) <= 3 and len(terrain["occluders"]) <= 2 or not terrain["occluders"]:
        return "開けた砂底・泥底"
    materials = [s["material"] for s in terrain["surfaces"] if s["material"] != "sand"]
    woody = sum(1 for m in materials if m in ("wood", "leaf"))
    return "流木・水草が中心" if materials and woody * 2 >= len(materials) else "岩が中心"


def evaluate(subject: Subject, draft: dict, analysis: Analysis) -> dict:
    hand = subject.hand
    size = analysis.disparity.shape
    height, width = size
    aspect = width / height
    x0, y0, x1, y1 = analysis.frame
    inside = np.zeros(size, bool)
    inside[y0:y1, x0:x1] = True
    ht, dt = hand["terrain"], draft["terrain"]
    result: dict = {"id": subject.id, "type": scene_type(subject, size)}
    result["tags"] = [tag for tag, on in (
        ("接写・小型（幅45cm以下）", bool(subject.tank and subject.tank["widthCm"] <= 45)),
        ("暗い水景", float(cv2.cvtColor(analysis.rgb, cv2.COLOR_BGR2GRAY)[y0:y1, x0:x1].mean()) < 62),
    ) if on]

    # 砂の面
    hand_sand = sorted((s for s in ht["surfaces"] if s["material"] == "sand"), key=mean_depth)
    draft_sand = sorted((s for s in dt["surfaces"] if s["material"] == "sand"), key=mean_depth)
    result["sand_count"] = (len(hand_sand), len(draft_sand))
    result["surface_count"] = (len(ht["surfaces"]), len(dt["surfaces"]))
    if hand_sand and draft_sand:
        gap = line_gap(hand_sand[0], draft_sand[0])
        result["front_dy"] = gap[0] if gap else None
        result["front_cover"] = gap[1] if gap else 0.0
        result["front_ddepth"] = abs(mean_depth(hand_sand[0]) - mean_depth(draft_sand[0]))
    matched, depth_errors, gaps = 0, [], []
    for surface in hand_sand:
        best = None
        for other in draft_sand:
            gap = line_gap(surface, other)
            if gap and gap[1] >= 0.3 and (best is None or gap[0] < best[0]):
                best = (gap[0], other)
        if best and best[0] <= 0.03:
            matched += 1
            gaps.append(best[0])
            depth_errors.append(abs(mean_depth(surface) - mean_depth(best[1])))
    result["sand_matched"] = (matched, len(hand_sand))
    result["sand_dy"] = float(np.mean(gaps)) if gaps else None
    result["sand_ddepth"] = float(np.mean(depth_errors)) if depth_errors else None
    # 手書きの砂の点での、奥行きの換算の誤差（面の置き方によらない）。
    errors = []
    u = cv2.medianBlur(analysis.u.astype(np.float32), 5)
    for surface in hand_sand:
        for point in surface["points"]:
            px, py = round(point["x"] * (width - 1)), round(point["y"] * (height - 1))
            errors.append(abs(sand_depth(float(u[py, px])) - point["depth"]))
    result["sand_point_ddepth"] = float(np.mean(errors)) if errors else None

    # 岩・流木の上面
    hand_tops = [s for s in ht["surfaces"] if s["material"] != "sand"]
    draft_tops = [s for s in dt["surfaces"] if s["material"] != "sand"]

    def near(a: dict, b: dict) -> bool:
        distances = []
        for p in a["points"]:
            distances.append(min(math.hypot(p["x"] - q["x"], (p["y"] - q["y"]) / aspect) for q in b["points"]))
        return float(np.mean(distances)) <= 0.05

    found = [(s, next((o for o in draft_tops if near(s, o)), None)) for s in hand_tops]
    result["top_recall"] = (sum(1 for _, o in found if o), len(hand_tops))
    result["top_precision"] = (sum(1 for o in draft_tops if any(near(o, s) for s in hand_tops)), len(draft_tops))
    result["material_match"] = (sum(1 for s, o in found if o and o["material"] == s["material"]), sum(1 for _, o in found if o))

    # 遮蔽
    hand_occ = polygon_mask([o["polygon"] for o in ht["occluders"]], size) & inside
    draft_occ = polygon_mask([o["polygon"] for o in dt["occluders"]], size) & inside
    result["occluder"] = overlap(hand_occ, draft_occ)
    result["occluder_count"] = (len(ht["occluders"]), len(dt["occluders"]))
    result["occluder_area"] = (float(hand_occ.sum() / inside.sum()), float(draft_occ.sum() / inside.sum()))

    def front_depth(occluders: list[dict]) -> np.ndarray:
        depth = np.full(size, np.nan, np.float32)
        for occluder in sorted(occluders, key=lambda o: -o["depth"]):
            depth[polygon_mask([occluder["polygon"]], size)] = occluder["depth"]
        return depth

    both = hand_occ & draft_occ
    if both.any():
        result["occluder_ddepth"] = float(np.abs(front_depth(ht["occluders"]) - front_depth(dt["occluders"]))[both].mean())

    # 回避領域
    hand_obs = ellipse_mask(ht.get("obstacles", []), size) & inside
    draft_obs = ellipse_mask(dt.get("obstacles", []), size) & inside
    result["obstacle"] = overlap(hand_obs, draft_obs)
    result["obstacle_count"] = (len(ht.get("obstacles", [])), len(dt.get("obstacles", [])))

    # 隠れ場所・寄り道先
    result["shelter_recall"] = point_recall(ht.get("shelters", []), dt.get("shelters", []), 0.08, aspect)
    result["shelter_count"] = (len(ht.get("shelters", [])), len(dt.get("shelters", [])))
    hand_kinds = sorted({s["kind"] for s in ht.get("shelters", []) if s.get("kind")})
    draft_kinds = {s["kind"] for s in dt.get("shelters", []) if s.get("kind")}
    result["shelter_kinds"] = (sum(1 for kind in hand_kinds if kind in draft_kinds), len(hand_kinds))
    result["structure_recall"] = point_recall(hand["structurePoints"], draft["structurePoints"], 0.1, aspect)

    # 手書きとの近さの区分（この道具の基準。docs/terrain-drafting.md に書いた）。面と遮蔽だけで決める。
    # 回避領域と隠れ場所は、手書きとの一致が低く、いつも人が見直す前提なので区分に入れない。
    front_ok = result.get("front_dy") is not None and result["front_dy"] <= 0.03 and result.get("front_cover", 0) >= 0.5
    iou = result["occluder"]["iou"] or 0.0
    if not ht["occluders"] and not dt["occluders"]:
        occluder_grade = 2
    else:
        occluder_grade = 2 if iou >= 0.6 else 1 if iou >= 0.3 else 0
    if front_ok and matched == len(hand_sand) and occluder_grade == 2:
        result["verdict"] = "近い"
    elif front_ok and occluder_grade >= 1:
        result["verdict"] = "手直し"
    else:
        result["verdict"] = "大きく違う"
    return result


def match_occluders(subject: Subject, draft: dict, analysis: Analysis) -> dict:
    """遮蔽1つずつの対応。手書きの遮蔽ごとに、いちばん重なる下書きの遮蔽1つとの IoU を取り、0.5 以上を「対応した」と数える。

    evaluate の IoU は遮蔽ぜんぶを1枚に重ねて比べるので、隣り合う石を1枚にまとめた下書きでも高く出る。
    石ごとに分かれているかは、こちらで見る。
    """
    size = analysis.disparity.shape
    x0, y0, x1, y1 = analysis.frame
    inside = np.zeros(size, bool)
    inside[y0:y1, x0:x1] = True
    hand, made = subject.hand["terrain"]["occluders"], draft["terrain"]["occluders"]
    hand_masks = [polygon_mask([o["polygon"]], size) & inside for o in hand]
    made_masks = [polygon_mask([o["polygon"]], size) & inside for o in made]
    hits, scores, depth_gaps = 0, [], []
    for occluder, mask in zip(hand, hand_masks):
        ious = [float((mask & other).sum() / max(1, (mask | other).sum())) for other in made_masks]
        best = int(np.argmax(ious)) if ious else -1
        scores.append(ious[best] if ious else 0.0)
        if ious and ious[best] >= 0.5:
            hits += 1
            depth_gaps.append(abs(occluder["depth"] - made[best]["depth"]))
    return {"hits": hits, "hand": len(hand), "draft": len(made), "iou": float(np.mean(scores)) if scores else None,
            "ddepth": float(np.mean(depth_gaps)) if depth_gaps else None}


def summarize(rows: list[dict]) -> str:
    def avg(values) -> str:
        values = [v for v in values if v is not None]
        return f"{statistics.mean(values):.3f}" if values else "-"

    def ratio(pairs) -> str:
        top, bottom = sum(p[0] for p in pairs), sum(p[1] for p in pairs)
        return f"{top}/{bottom} ({top / bottom:.0%})" if bottom else "-"

    groups: list[tuple[str, list[dict]]] = [("全体", rows)]
    for name in sorted({row["type"] for row in rows}):
        groups.append((name, [row for row in rows if row["type"] == name]))
    for name in sorted({tag for row in rows for tag in row["tags"]}):
        groups.append((f"（再掲）{name}", [row for row in rows if name in row["tags"]]))
    header = ["タイプ", "水景", "手前の砂の線 y の差", "手前の線が取れた", "砂の面の一致", "砂の面 depth の差", "砂の面の本数 手/下",
              "上面の再現", "上面の適合", "遮蔽 IoU", "遮蔽 再現", "遮蔽 適合", "遮蔽 depth の差", "回避 IoU", "回避 再現", "回避 適合",
              "隠れ場所の再現", "隠れ場所の種類", "近い", "手直し", "大きく違う"]
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    for name, group in groups:
        verdicts = [row["verdict"] for row in group]
        cells = [
            name, str(len(group)),
            avg(row.get("front_dy") for row in group),
            ratio([(1 if row.get("front_dy") is not None and row["front_dy"] <= 0.03 and row.get("front_cover", 0) >= 0.5 else 0, 1) for row in group]),
            ratio([row["sand_matched"] for row in group]),
            avg(row.get("sand_ddepth") for row in group),
            f"{statistics.mean(row['sand_count'][0] for row in group):.1f}/{statistics.mean(row['sand_count'][1] for row in group):.1f}",
            ratio([row["top_recall"] for row in group]), ratio([row["top_precision"] for row in group]),
            avg(row["occluder"]["iou"] for row in group), avg(row["occluder"]["recall"] for row in group),
            avg(row["occluder"]["precision"] for row in group), avg(row.get("occluder_ddepth") for row in group),
            avg(row["obstacle"]["iou"] for row in group), avg(row["obstacle"]["recall"] for row in group),
            avg(row["obstacle"]["precision"] for row in group),
            ratio([row["shelter_recall"] for row in group]), ratio([row["shelter_kinds"] for row in group]),
            *(f"{verdicts.count(v)} ({verdicts.count(v) / len(group):.0%})" for v in ("近い", "手直し", "大きく違う")),
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


# ---------------------------------------------------------------- 統計


def polygon_area(polygon: list[dict]) -> float:
    total = 0.0
    for i, point in enumerate(polygon):
        other = polygon[(i + 1) % len(polygon)]
        total += point["x"] * other["y"] - other["x"] * point["y"]
    return abs(total) / 2


def print_stats() -> None:
    documents = {folder.name: read_json(folder / "terrain.json") for folder in sorted(SCENES.iterdir()) if (folder / "terrain.json").exists()}
    terrains = [document["terrain"] for document in documents.values()]

    def quartiles(name: str, values: list[float]) -> None:
        values = sorted(values)
        if not values:
            return
        n = len(values)
        print(f"{name}: n={n} 最小 {values[0]:.3g} / 25% {values[n // 4]:.3g} / 中央 {statistics.median(values):.3g} / "
              f"75% {values[3 * n // 4]:.3g} / 最大 {values[-1]:.3g} / 平均 {statistics.mean(values):.3g}")

    print(f"水景 {len(terrains)}")
    quartiles("面の本数", [len(t["surfaces"]) for t in terrains])
    quartiles("砂の面の本数", [sum(1 for s in t["surfaces"] if s["material"] == "sand") for t in terrains])
    quartiles("面1本の点の数", [len(s["points"]) for t in terrains for s in t["surfaces"]])
    quartiles("面の depth（面ごとの平均）", [mean_depth(s) for t in terrains for s in t["surfaces"]])
    quartiles("砂の面の depth の段の数", [len({round(mean_depth(s), 1) for s in t["surfaces"] if s["material"] == "sand"}) for t in terrains])
    quartiles("遮蔽の数", [len(t["occluders"]) for t in terrains])
    quartiles("遮蔽の面積の合計（絵に対する比率）", [sum(polygon_area(o["polygon"]) for o in t["occluders"]) for t in terrains])
    quartiles("遮蔽1つの頂点の数", [len(o["polygon"]) for t in terrains for o in t["occluders"]])
    quartiles("遮蔽の depth", [o["depth"] for t in terrains for o in t["occluders"]])
    quartiles("回避領域の数", [len(t.get("obstacles", [])) for t in terrains])
    quartiles("回避領域の半径 x", [o["radius"]["x"] for t in terrains for o in t.get("obstacles", [])])
    quartiles("回避領域の半径 y", [o["radius"]["y"] for t in terrains for o in t.get("obstacles", [])])
    quartiles("回避領域の奥行きの半径", [o["depthRadius"] for t in terrains for o in t.get("obstacles", [])])
    quartiles("回避領域の中心の depth", [o["center"]["depth"] for t in terrains for o in t.get("obstacles", [])])
    quartiles("隠れ場所の数", [len(t.get("shelters", [])) for t in terrains])
    quartiles("寄り道先の数", [len(d["structurePoints"]) for d in documents.values()])
    quartiles("泡の出どころの数", [len(d["bubbleSources"]) for d in documents.values()])
    for label, values in (("面の材質", [s["material"] for t in terrains for s in t["surfaces"]]),
                          ("隠れ場所の種類", [s.get("kind", "(なし)") for t in terrains for s in t.get("shelters", [])])):
        counts = {value: values.count(value) for value in sorted(set(values))}
        print(f"{label}: {counts}")
    connected = 0
    for terrain in terrains:
        ends = [{json.dumps(s["points"][0], sort_keys=True), json.dumps(s["points"][-1], sort_keys=True)} for s in terrain["surfaces"]]
        connected += any(ends[i] & ends[j] for i in range(len(ends)) for j in range(i + 1, len(ends)))
    print(f"端点でつながった面がある水景: {connected}/{len(terrains)}")


# ---------------------------------------------------------------- コマンド


def make_draft(subject: Subject, model_name: str) -> tuple[dict, Analysis, float]:
    started = time.time()
    analysis = analyze(subject, model_name)
    draft = draft_terrain(subject, analysis)
    return draft, analysis, time.time() - started


def save_draft(subject: Subject, draft: dict, analysis: Analysis, compare: bool, debug: bool = False, overlay: bool = True) -> Path:
    folder = OUT / subject.id
    folder.mkdir(parents=True, exist_ok=True)
    if debug:
        write_debug(analysis, folder / "debug.jpg")
    (folder / "terrain.json").write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n")
    (folder / "notes.txt").write_text("\n".join(analysis.notes) + ("\n" if analysis.notes else ""))
    if overlay:
        write_overlay(subject, draft, compare, folder / "overlay.jpg")
    return folder


def command_draft(args: argparse.Namespace) -> None:
    if (args.occluders or args.shelters) and len(args.targets) != 1:
        sys.exit("--occluders と --shelters は、水景を1つだけ指定したときに使えます")
    for name in args.targets:
        subject = load_subject(name, args.aspect, args.plate_bottom, args.occluders, args.shelters)
        subject.tops, subject.connect_sand = not args.no_tops, args.connect_sand
        draft, analysis, seconds = make_draft(subject, args.model)
        folder = save_draft(subject, draft, analysis, args.compare, args.debug)
        terrain = draft["terrain"]
        print(f"{subject.id}: 面 {len(terrain['surfaces'])} / 遮蔽 {len(terrain['occluders'])} / 回避 {len(terrain['obstacles'])} / "
              f"隠れ場所 {len(terrain['shelters'])}（{seconds:.1f}秒）-> {folder.relative_to(ROOT)}")
        for note in analysis.notes:
            print(f"  注意: {note}")
        if args.compare and subject.hand:
            row, match = evaluate(subject, draft, analysis), match_occluders(subject, draft, analysis)

            def show(value: float | None) -> str:
                return "-" if value is None else f"{value:.3f}"

            print(f"  手書きとの比較: 遮蔽 手{match['hand']}個/下書き{match['draft']}個、1つずつ対応したもの {match['hits']}/{match['hand']}"
                  f"（その depth の差 {show(match['ddepth'])}）、重ねた面積の IoU {show(row['occluder']['iou'])}"
                  f"（再現 {show(row['occluder']['recall'])} / 適合 {show(row['occluder']['precision'])}）、"
                  f"重なった所の depth の差 {show(row.get('occluder_ddepth'))}、砂の面の一致 {row['sand_matched'][0]}/{row['sand_matched'][1]}")
        if args.write:
            target = SCENES / subject.id / "terrain.json"
            if not target.parent.exists():
                sys.exit(f"--write は既存の水景にだけ使えます: {subject.id}")
            target.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n")
            print(f"  書き込み: {target.relative_to(ROOT)}")


def command_eval(args: argparse.Namespace) -> None:
    names = args.targets or sorted(folder.name for folder in SCENES.iterdir() if (folder / "terrain.json").exists())
    rows, seconds = [], []
    for name in names:
        subject = load_subject(name, None, None)
        if not subject.hand:
            continue
        draft, analysis, elapsed = make_draft(subject, args.model)
        seconds.append(elapsed)
        save_draft(subject, draft, analysis, True, args.debug, overlay=not args.no_overlays)
        row = evaluate(subject, draft, analysis)
        row["notes"] = analysis.notes
        rows.append(row)
        print(f"{name}: {row['verdict']} / 手前の線 {row.get('front_dy')} / 遮蔽 IoU {row['occluder']['iou']} / 回避 再現 {row['obstacle']['recall']}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "eval.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    table = summarize(rows)
    (OUT / "eval.md").write_text(table + "\n")
    print()
    print(table)
    print(f"\n1水景あたり {statistics.mean(seconds):.2f} 秒（奥行きの推定を含む。キャッシュがあれば推定は省く）")
    print(f"-> {(OUT / 'eval.json').relative_to(ROOT)}, {(OUT / 'eval.md').relative_to(ROOT)}")


def main() -> None:
    argv = sys.argv[1:]
    if argv and argv[0] not in ("draft", "evaluate", "stats", "-h", "--help"):
        argv = ["draft", *argv]
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    draft = commands.add_parser("draft", help="下書きと確認画像を作る（既定）")
    draft.add_argument("targets", nargs="+", help="水景の id か画像のパス")
    draft.add_argument("--compare", action="store_true", help="既存の手書きの地形も並べて描き、手書きとの近さの数字を出す")
    draft.add_argument("--write", action="store_true", help="src/content の terrain.json を下書きで書き換える")
    draft.add_argument("--aspect", type=float, help="ガラスの縦横比（幅/高さ）。画像のパスを渡すときや、部屋にまだ置いていない水槽に使う")
    draft.add_argument("--plate-bottom", type=float, help="scene.json の framing.plateBottom を仮に指定する")
    draft.add_argument("--model", choices=sorted(MODELS), default="small")
    draft.add_argument("--debug", action="store_true", help="解析の途中経過（底と物体のマスク、奥行き）を debug.jpg に出す")
    draft.add_argument("--occluders", type=Path, help="遮蔽にする物体を、手前=赤・中=黄・奥=青で塗った版の画像")
    draft.add_argument("--shelters", type=Path, help="隠れ場所にマゼンタの丸を付けた版の画像")
    draft.add_argument("--no-tops", action="store_true", help="岩や流木の上面を面として出さない（面を歩く生き物だけの水槽向け）")
    draft.add_argument("--connect-sand", action="store_true",
                       help="砂の面を段に分け、斜めの道で端点をつなぐ（面を歩く生き物だけの水槽向け）。面の端は体長の半分だけガラスから離す")
    draft.set_defaults(run=command_draft)
    evaluation = commands.add_parser("evaluate", help="既存の手書きの地形と比べる")
    evaluation.add_argument("targets", nargs="*", help="水景の id（省くと全部）")
    evaluation.add_argument("--no-overlays", action="store_true", help="確認画像を出さない")
    evaluation.add_argument("--model", choices=sorted(MODELS), default="small")
    evaluation.add_argument("--debug", action="store_true", help="解析の途中経過を debug.jpg に出す")
    evaluation.set_defaults(run=command_eval)
    stats = commands.add_parser("stats", help="既存の手書きの地形の統計")
    stats.set_defaults(run=lambda _: print_stats())
    args = parser.parse_args(argv)
    args.run(args)


if __name__ == "__main__":
    main()
