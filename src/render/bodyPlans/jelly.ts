import { bellContraction, DEFAULT_BELL } from "../../core/driftMotion";
import { smoothstep } from "../../core/math";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// クラゲは傘を上にした真横の画像（サカサクラゲは傘が下）。傘の範囲は swim.bell。
// 拍動の位相はシミュレーション（fish.pulsePhase）と共有し、傘が縮む拍に合わせて進む。
// 傘は縁ほど強く内へすぼまって少し背が伸び、触手と口腕は少し遅れてすぼまりながら、根元から先へ波打ってなびく。
// swim.tailSweepRad は傘の縮み具合（0 なら拍動しない。クシクラゲ）、swim.waveCount は触手の波の数。
function deformJelly(mesh: BodyMesh, { fish, deltaSec }: DeformFrame) {
  const { positions, base, width, height, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const bell = swim.bell ?? DEFAULT_BELL;
  const bellDown = bell.top + bell.bottom > 1;
  const squeeze = swim.tailSweepRad;
  const phase = fish.pulsePhase ?? 0;
  // 傘の縮みは見て分かるよう、tailSweepRad の1.5倍にする（縁が最も強くすぼまる）。
  const contraction = bellContraction(phase) * squeeze * 1.5;
  // 触手は傘より少し遅れてすぼまる。
  const lagged = bellContraction(phase - 0.12) * squeeze * 1.5;
  const t = motion.clockSec;
  const centerX = width / 2;
  // 傘から最も遠い触手の先までの長さ（画像の高さに対する比率）。
  const reach = Math.max(1e-3, bellDown ? bell.top : 1 - bell.bottom);
  // 拍動しないもの（クシクラゲ）は、体全体がゆっくり揺らぐ。
  const sway = squeeze === 0 ? Math.sin(t * 0.7 + motion.detailPhase) * 0.012 : 0;
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const row = Math.floor(index / VERTICES_X);
    const v = row / (verticesY - 1);
    const baseX = base[index * 2]!;
    const baseY = base[index * 2 + 1]!;
    const offsetX = baseX - centerX;
    let dx = 0;
    let dy = 0;
    // 傘の中での位置（0 = 頂、1 = 縁）。傘より外は触手で、傘からの離れ具合 along を使う。
    const inBell = v >= bell.top && v <= bell.bottom;
    const rim = bellDown ? 1 - smoothstep(bell.top, bell.bottom, v) : smoothstep(bell.top, bell.bottom, v);
    const along = bellDown ? clamp01((bell.top - v) / reach) : clamp01((v - bell.bottom) / reach);
    if (inBell) {
      dx -= offsetX * contraction * (0.35 + 0.65 * rim);
      // 縮むと傘の背が伸びる（縁が頂から離れる）。
      const apexY = (bellDown ? bell.bottom : bell.top) * height;
      dy += (baseY - apexY) * contraction * 0.3 * rim;
    } else {
      const rimShift = (bellDown ? -1 : 1) * (bell.bottom - bell.top) * height * contraction * 0.3;
      dx -= offsetX * lagged * 0.7 * (1 - along * 0.6);
      dy += rimShift * (1 - along * 0.5);
      // 根元から先へ伝わる波。先ほど大きく揺れる。
      const wave = Math.sin(along * swim.waveCount * Math.PI * 2 - t * 1.4 + motion.detailPhase + column * 0.05);
      dx += wave * width * 0.03 * along;
      // 拍のあとに触手が少しだけ縮む。
      dy -= (bellDown ? -1 : 1) * lagged * height * 0.04 * along;
    }
    dx += offsetX * sway;
    positions[index * 2] = baseX + dx;
    positions[index * 2 + 1] = baseY + dy;
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

// 触手を滑らかに波打たせるため、縦の分割を細かくする。
export const jellyRenderer: BodyPlanRenderer = { verticesY: 16, deform: deformJelly };
