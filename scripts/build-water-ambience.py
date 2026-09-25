# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2", "soundfile>=0.13"]
# ///
"""SFX Forge で生成した水音から、途切れずに回せる環境音ループを作る。

生成AIは1本5秒ほどしか作れないため、フィルターの水音を数本つなぎ、最後を先頭へ
重ねて一周させる。AACはデコーダーによって先頭に無音が入るので、ループの前後に
同じ波形を余白として足し、再生側は余白を除いた区間だけを回す。

    bun run --cwd ~/Documents/sfx-forge sfx build "$PWD/scripts/water-ambience.sfx.json" --out "$PWD/tmp/water-sfx"
    uv run scripts/build-water-ambience.py
"""

import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "tmp" / "water-sfx"
OUT_DIR = ROOT / "src" / "content" / "audio"
PIECES = ["filter_trickle_1.wav", "filter_trickle_2.wav", "filter_trickle_3.wav"]
PIECE_SEC = 4.0  # 生成音の最後は減衰するので、安定した前半だけ使う
CROSSFADE_SEC = 0.6
PAD_SEC = 0.25
TARGET_RMS_DB = -22.0


def load(name: str) -> tuple[np.ndarray, int]:
    data, rate = sf.read(SOURCE_DIR / name, dtype="float64")
    if data.ndim > 1:
        data = data.mean(axis=1)
    return data[: int(PIECE_SEC * rate)], rate


pieces, rates = zip(*(load(name) for name in PIECES))
rate = rates[0]
fade = int(CROSSFADE_SEC * rate)
curve = np.sin(np.linspace(0, np.pi / 2, fade))  # 等パワーのクロスフェード
step = [len(piece) - fade for piece in pieces]
loop = np.zeros(sum(step))
start = 0
for piece in pieces:
    shaped = piece.copy()
    shaped[:fade] *= curve
    shaped[-fade:] *= curve[::-1]
    indices = np.arange(start, start + len(shaped)) % len(loop)
    np.add.at(loop, indices, shaped)
    start += len(piece) - fade

loop *= 10 ** (TARGET_RMS_DB / 20) / np.sqrt(np.mean(loop**2))
pad = int(PAD_SEC * rate)
padded = np.concatenate([loop[-pad:], loop, loop[:pad]])

OUT_DIR.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / "loop.wav"
    sf.write(wav, padded, rate, subtype="PCM_16")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
        "-ar", "44100", "-ac", "1", "-c:a", "aac", "-b:a", "80k",
        str(OUT_DIR / "water-ambience.m4a"),
    ], check=True)
(OUT_DIR / "water-ambience.json").write_text(json.dumps({
    "padSec": PAD_SEC,
    "loopSec": round(len(loop) / rate, 6),
}, indent=2) + "\n")
print(f"loop {len(loop) / rate:.2f}s → {OUT_DIR / 'water-ambience.m4a'}")
