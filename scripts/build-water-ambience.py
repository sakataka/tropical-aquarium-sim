# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2", "soundfile>=0.13", "scipy>=1.14"]
# ///
"""SFX Forge で生成した水音から、途切れずに回せる環境音ループを作る。

生成AIは1本4秒ほどしか作れず、どの素材も後半2秒ほどで減衰する。減衰まで含めて
つなぐと数秒ごとに音量がうねるので、各素材の音量が安定した前半だけを切り出し、
音量をそろえてからクロスフェードで長くつなぐ。水の流れと泡は別々に並べて重ね、
同じ並びがすぐ繰り返さないようにする。AACはデコーダーによって先頭に無音が
入るので、ループの前後に同じ波形を余白として足し、再生側は余白を除いた区間だけを回す。

    bun run --cwd ~/Documents/sfx-forge sfx build "$PWD/scripts/water-ambience.sfx.json" --out "$PWD/tmp/water-sfx"
    uv run scripts/build-water-ambience.py
"""

import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "tmp" / "water-sfx"
OUT_DIR = ROOT / "src" / "content" / "audio"
LOOP_SEC = 40.0
CROSSFADE_SEC = 0.5
MIN_PIECE_SEC = 1.6
STEADY_DROP_DB = 3.0  # 冒頭の音量からこれ以上下がったら減衰が始まったとみなす
BUBBLE_GAIN_DB = -9.0  # 泡は流れの下に薄く敷く
LOWPASS_HZ = 7000  # 高域のシャリつきを抑えて、部屋で聞こえる距離感にする
TARGET_RMS_DB = -24.0
PAD_SEC = 0.25
RATE = 48000  # SFX Forge の出力。AAC へは ffmpeg で 44.1kHz にする
FADE = int(CROSSFADE_SEC * RATE)


def rms_db(x: np.ndarray) -> float:
    return 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-12)


def steady_part(path: Path) -> np.ndarray | None:
    data, rate = sf.read(path, dtype="float64")
    if data.ndim > 1:
        data = data.mean(axis=1)
    assert rate == RATE, f"{path.name}: {rate}Hz"
    window = int(0.25 * rate)
    levels = [rms_db(data[i:i + window]) for i in range(0, len(data) - window, window)]
    reference = np.median(levels[:4])
    end = next((i for i, level in enumerate(levels) if level < reference - STEADY_DROP_DB), len(levels))
    part = data[: end * window]
    if len(part) < MIN_PIECE_SEC * rate:
        return None
    return part / np.sqrt(np.mean(part**2))


def load_pieces(prefix: str) -> list[np.ndarray]:
    pieces = [p for p in (steady_part(path) for path in sorted(SOURCE_DIR.glob(f"{prefix}_*.wav"))) if p is not None]
    print(f"{prefix}: {len(pieces)} pieces, {[round(len(p) / RATE, 2) for p in pieces]}s")
    return pieces


def plan(pieces: list[np.ndarray], total: int, rng: np.random.Generator) -> list[int] | None:
    """素材の並び順を決める。最後の素材は total を越えた分が先頭の素材とちょうど
    クロスフェードの長さだけ重なるよう切り詰めるので、切り詰め後も両端のフェードが
    収まる長さになる並びだけを採る。"""
    order: list[int] = []
    start = 0
    while True:
        bag = list(rng.permutation(len(pieces)))
        if order and bag[0] == order[-1]:
            bag.append(bag.pop(0))
        for index in bag:
            remaining = total - start + FADE
            if remaining <= len(pieces[index]):
                return order + [index] if remaining >= 2 * FADE else None
            order.append(index)
            start += len(pieces[index]) - FADE


def layer(pieces: list[np.ndarray], total: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    order = None
    while order is None:
        order = plan(pieces, total, rng)
    curve = np.sin(np.linspace(0, np.pi / 2, FADE))  # 等パワーのクロスフェード
    loop = np.zeros(total)
    start = 0
    for index in order:
        shaped = pieces[index][: total - start + FADE].copy()
        shaped[:FADE] *= curve
        shaped[-FADE:] *= curve[::-1]
        # 最後の素材は先頭へ回り込み、ループの継ぎ目もクロスフェードになる
        np.add.at(loop, np.arange(start, start + len(shaped)) % total, shaped)
        start += len(shaped) - FADE
    return loop


total = int(LOOP_SEC * RATE)
flow = layer(load_pieces("water_flow"), total, seed=7)
bubbles = layer(load_pieces("air_bubbles"), total, seed=11)
bubbles *= np.sqrt(np.mean(flow**2)) / np.sqrt(np.mean(bubbles**2)) * 10 ** (BUBBLE_GAIN_DB / 20)
loop = flow + bubbles
# 円環のままフィルターをかけ、継ぎ目に過渡が出ないようにする
sos = butter(4, LOWPASS_HZ, btype="low", fs=RATE, output="sos")
margin = RATE
loop = sosfiltfilt(sos, np.concatenate([loop[-margin:], loop, loop[:margin]]))[margin:-margin]
loop *= 10 ** (TARGET_RMS_DB / 20) / np.sqrt(np.mean(loop**2))
peak = np.max(np.abs(loop))
if peak > 0.9:
    loop *= 0.9 / peak

pad = int(PAD_SEC * RATE)
padded = np.concatenate([loop[-pad:], loop, loop[:pad]])

OUT_DIR.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / "loop.wav"
    sf.write(wav, padded, RATE, subtype="PCM_16")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
        "-ar", "44100", "-ac", "1", "-c:a", "aac", "-b:a", "80k",
        str(OUT_DIR / "water-ambience.m4a"),
    ], check=True)
(OUT_DIR / "water-ambience.json").write_text(json.dumps({
    "padSec": PAD_SEC,
    "loopSec": round(len(loop) / RATE, 6),
}, indent=2) + "\n")
print(f"loop {len(loop) / RATE:.2f}s → {OUT_DIR / 'water-ambience.m4a'}")
