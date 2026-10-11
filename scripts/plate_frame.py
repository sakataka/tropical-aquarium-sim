"""水景の絵（plate.webp）のうち、前面ガラスに映る範囲を求める。

scripts/draft-terrain.py と scripts/tank-view.py が同じ計算を使うための共通の部品。
式は src/core/plateFraming.ts の framePlate、src/core/room.ts の glassAspect・windowOverscan と同じ
（ずれると、確認画像の地形が画面と合わなくなる）。標準ライブラリだけで動く。
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROOMS = ROOT / "src" / "content" / "room"


def tank_glass(tank: dict) -> tuple[float, tuple[float, float]]:
    """水槽の前面ガラスの縦横比（幅 / 高さ）と、側面ガラスまで含めた切り抜きが前面ガラスの何倍か。

    展示室の絵のガラスの位置から決める。どの展示室にも置かれていない水槽は、水槽の寸法の比を返す。
    """
    aspect: float | None = None
    overscan = (1.0, 1.0)
    for room_path in sorted(ROOMS.glob("*.json")):
        room = json.loads(room_path.read_text())
        for placement in room["tanks"]:
            if placement["tankId"] == tank["id"]:
                glass, window = placement["glass"], placement["window"]
                aspect = glass["width"] * room["aspectRatio"] / glass["height"]
                overscan = (window["width"] / glass["width"], window["height"] / glass["height"])
    if aspect is None:
        aspect = tank["widthCm"] / tank["heightCm"]
    return aspect, overscan


def plate_rect(aspect: float, overscan: tuple[float, float], plate_bottom: float,
               width: int, height: int) -> tuple[float, float, float, float]:
    """絵を cover で敷いたときの矩形（x, y, 幅, 高さ）。ガラスの高さを1、幅を aspect とした座標。"""
    scale = max(aspect * overscan[0] / width, overscan[1] / height)
    plate_w, plate_h = width * scale, height * scale
    x = (aspect - plate_w) / 2
    anchor = min(1.0, max(1 / plate_h, plate_bottom))
    y = 1 - anchor * plate_h
    return x, y, plate_w, plate_h


def visible_frame(aspect: float, overscan: tuple[float, float], plate_bottom: float,
                  width: int, height: int) -> tuple[float, float, float, float]:
    """前面ガラスに映る範囲（絵に対する比率の x0, y0, x1, y1）。"""
    x, y, plate_w, plate_h = plate_rect(aspect, overscan, plate_bottom, width, height)
    return (max(0.0, -x / plate_w), max(0.0, -y / plate_h), min(1.0, (aspect - x) / plate_w), min(1.0, (1 - y) / plate_h))


def surface_frame(aspect: float, overscan: tuple[float, float], plate_bottom: float,
                  width: int, height: int) -> dict:
    """絵の矩形を前面ガラスに対する比率で表したもの（src/core の SurfaceFrame。getRenderedSurfaceFrame と同じ値）。"""
    x, y, plate_w, plate_h = plate_rect(aspect, overscan, plate_bottom, width, height)
    return {"x": x / aspect, "y": y, "width": plate_w / aspect, "height": plate_h}
