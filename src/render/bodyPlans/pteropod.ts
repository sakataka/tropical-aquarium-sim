import { smoothstep } from "../../core/math";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

/** 翼足の付け根から先へ、羽ばたきが遅れて伝わる量（ラジアン）。先ほど遅れてしなる。 */
const SPAN_LAG = 0.9;
/** 翼足を打つ前後で、正面から見た翼足が縮んで見える最大の割合。 */
const MAX_FORESHORTEN = 0.42;
/** 翼足の先が上下へ振れる最大の角度。 */
const MAX_SWING_RAD = 0.32;
/** 付け根の重みが0から1へ上がる幅（画像の横幅に対する比率）。体の縁を巻き込まないよう狭くする。 */
const ROOT_RAMP = 0.045;
/** 翼足の上端・下端の外へ、重みが0へ下がる幅（画像の高さに対する比率）。 */
const BAND_FALLOFF = 0.05;

// クリオネは体を立てた正面の画像（頭が上、翼足が左右）。翼足（swim.wings）は体の前後へ打つので、
// 正面からは、打ち終わりに縮んで見え、打つ途中で大きく広がって見える。先は付け根より遅れてしなり、
// 上下にも振れて、先が小さな8の字を描く。羽ばたきの位相はシミュレーション（fish.pulsePhase）と共有し、
// 逃げるときに速くなる。尾は2回の打ちに合わせてかすかに揺れる。
function deformPteropod(mesh: BodyMesh, { fish, deltaSec }: DeformFrame) {
  const { positions, base, width, height, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const wings = swim.wings ?? { rootX: 0.12, y: 0.33, top: 0.23, bottom: 0.5 };
  const stroke = (fish.pulsePhase ?? 0) * Math.PI * 2;
  const centerX = width / 2;
  const hingeY = wings.y * height;
  const rootPx = wings.rootX * width;
  const reach = Math.max(1e-3, centerX - rootPx);
  // 尾が始まる高さ。翼足の下端より下を尾として、先ほど大きく揺らす。
  const tailTop = Math.min(0.95, wings.bottom + 0.1);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const row = Math.floor(index / VERTICES_X);
    const v = row / (verticesY - 1);
    const baseX = base[index * 2]!;
    const baseY = base[index * 2 + 1]!;
    const offsetX = baseX - centerX;
    const side = Math.sign(offsetX) || 1;
    const outward = Math.abs(offsetX) - rootPx;
    let x = baseX;
    let y = baseY;
    const weight = smoothstep(0, ROOT_RAMP * width, outward) *
      smoothstep(wings.top - BAND_FALLOFF, wings.top, v) * (1 - smoothstep(wings.bottom, wings.bottom + BAND_FALLOFF, v));
    if (weight > 0) {
      const span = Math.min(1, Math.max(0, outward / reach));
      const beat = stroke - span * SPAN_LAG;
      // 付け根から見た位置（外向きを正）を、縮めてから回す。
      const along = outward * (1 - MAX_FORESHORTEN * Math.sin(beat) ** 2);
      const rise = baseY - hingeY;
      const swing = MAX_SWING_RAD * Math.cos(beat) * (0.4 + 0.6 * span);
      const outX = along * Math.cos(swing) + rise * Math.sin(swing);
      const outY = rise * Math.cos(swing) - along * Math.sin(swing);
      x = baseX + (centerX + side * (rootPx + outX) - baseX) * weight;
      y = baseY + (hingeY + outY - baseY) * weight;
    }
    if (v > tailTop) {
      const tail = (v - tailTop) / (1 - tailTop);
      x += Math.sin(stroke * 2 - tail * 1.5 + motion.detailPhase) * width * 0.018 * tail * tail;
    }
    positions[index * 2] = x;
    positions[index * 2 + 1] = y;
  }
}

// 翼足の上下の縁を滑らかに曲げるため、縦の分割を細かくする。
export const pteropodRenderer: BodyPlanRenderer = { verticesY: 24, deform: deformPteropod };
