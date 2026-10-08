import { clamp, smoothstep } from "../../core/math";
import type { Vec2 } from "../../core/types";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

/** 体の下半分を流れの下手へ傾け、首を流れの来る向き（顔の向き）へ曲げる角度 (rad)。問いかけの「?」の形になる。 */
const LEAN_RAD = 0.12;
const CURL_RAD = 0.2;
/** 流れに揺られる角度 (rad) と速さ (rad/秒)。 */
const SWAY_RAD = 0.06;
const SWAY_SPEED = 1.1;
/** 首を突き出してプランクトンをついばむ角度 (rad) と、ついばむかどうかを決める区切りの秒数。 */
const STRIKE_RAD = 0.35;
const STRIKE_WINDOW_SEC = 3.2;
/** 体の曲がりを積分する分割数。 */
const CURVE_STEPS = 24;
const DEFAULT_SPINE: Vec2[] = [{ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.6 }, { x: 0.5, y: 1 }];

// チンアナゴは体を立てた真横の画像（頭が上で左向き）。巣穴の口（メッシュの下端の中央）から、体の中心線（swim.spine）に
// 沿って体を伸ばし、出している長さ（シミュレーションの burrowHome.emerge）より下は巣穴の中として砂の線へ潰して隠す。
// 体の下半分は流れの下手へ傾き、首は顔の向きへ曲がり、流れに揺られ、ときどき首を突き出してついばむ。
// 画像の首の付け根（spine の最初の点）より上の頭と曲がった首は、形を保ったまま首の向きに合わせて回す。
// 向きを変えるときは、巣穴の口を軸に縦の軸で回る（反転の途中で細くなる）。
function deformGardenEel(mesh: BodyMesh, { fish, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const spine = (swim.spine ?? DEFAULT_SPINE).map((point) => ({ x: point.x * width, y: point.y * height }));
  const segments = spine.slice(1).map((point, i) => {
    const from = spine[i]!;
    const length = Math.hypot(point.x - from.x, point.y - from.y);
    return { from, length, tx: (point.x - from.x) / length, ty: (point.y - from.y) / length };
  });
  const starts: number[] = [];
  let bodyLength = 0;
  for (const segment of segments) { starts.push(bodyLength); bodyLength += segment.length; }
  const headLength = spine[0]!.y;
  const emerge = clamp(fish.burrowHome?.emerge ?? 0.7, 0, 1);
  // 首の付け根が巣穴の口から出ている長さ（負なら首は砂の中で、頭だけが出ている）。
  const neck = emerge * (bodyLength + headLength) - headLength;
  const exposed = Math.max(0, neck);
  const t = motion.clockSec;
  const bend = clamp(exposed / (bodyLength * 0.4), 0, 1);
  const strike = strikeEnvelope(t, motion.detailPhase) * smoothstep(0.3, 0.5, emerge);
  const drift = Math.sin(t * 0.23 + motion.detailPhase * 2) * 0.03;
  const angleAt = (q: number) => bend * (-LEAN_RAD + (LEAN_RAD + CURL_RAD) * q * q) + drift +
    SWAY_RAD * q * Math.sin(t * SWAY_SPEED + motion.detailPhase - q * 1.6) + STRIKE_RAD * strike * q * q * q;
  // 巣穴の口から上へ、角度（縦から顔の向きへ傾く向きが正）を積分して体の線を作る。
  const origin = { x: pivotX, y: height };
  const curveX = new Float32Array(CURVE_STEPS + 1);
  const curveY = new Float32Array(CURVE_STEPS + 1);
  const curveAngle = new Float32Array(CURVE_STEPS + 1);
  curveX[0] = origin.x;
  curveY[0] = origin.y;
  curveAngle[0] = angleAt(0);
  const step = exposed / CURVE_STEPS;
  for (let k = 1; k <= CURVE_STEPS; k += 1) {
    const middle = angleAt((k - 0.5) / CURVE_STEPS);
    curveX[k] = curveX[k - 1]! - Math.sin(middle) * step;
    curveY[k] = curveY[k - 1]! - Math.cos(middle) * step;
    curveAngle[k] = angleAt(k / CURVE_STEPS);
  }
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    // 画像の中心線に対する位置: 首の付け根から尾へ測った長さ s（頭は負）と、中心線から右への距離 n。
    let segment = 0;
    while (segment < segments.length - 1 && by > spine[segment + 1]!.y) segment += 1;
    const { from, tx, ty } = segments[segment]!;
    const along = (bx - from.x) * tx + (by - from.y) * ty;
    const s = by < spine[0]!.y ? along : starts[segment]! + along;
    const n = (bx - from.x) * ty - (by - from.y) * tx;
    const h = exposed - s + Math.min(0, neck);
    let x: number;
    let y: number;
    if (h <= 0) {
      // 巣穴の中: 砂の線へ潰して見せない。
      x = origin.x + n * Math.cos(curveAngle[0]!);
      y = origin.y;
    } else {
      const position = Math.min(h, exposed) / Math.max(step, 1e-6);
      const k = Math.min(CURVE_STEPS - 1, Math.floor(position));
      const f = Math.min(1, position - k);
      const angle = exposed > 0 ? curveAngle[k]! + (curveAngle[k + 1]! - curveAngle[k]!) * f : curveAngle[0]!;
      const beyond = Math.max(0, h - exposed);
      // 首の付け根より先（頭）は、首の向きのまままっすぐ伸ばす。
      const cx = exposed > 0 ? curveX[k]! + (curveX[k + 1]! - curveX[k]!) * f : origin.x;
      const cy = exposed > 0 ? curveY[k]! + (curveY[k + 1]! - curveY[k]!) * f : origin.y;
      x = cx - Math.sin(angle) * beyond + n * Math.cos(angle);
      y = cy - Math.cos(angle) * beyond - n * Math.sin(angle);
      // 頭を砂へ沈めるときは、砂の線より下を潰す。
      if (y > origin.y) y = origin.y;
    }
    positions[index * 2] = origin.x + (x - origin.x) * profile;
    positions[index * 2 + 1] = y;
  }
}

// 区切りの秒数ごとに半分ほどの確率で、どこか1回首を突き出す（素早く突き出し、ゆっくり戻す）。
function strikeEnvelope(clockSec: number, detailPhase: number): number {
  const shifted = clockSec + detailPhase * 5;
  const window = Math.floor(shifted / STRIKE_WINDOW_SEC);
  const hash = fract(Math.sin(window * 12.9898 + detailPhase * 78.233) * 43758.5453);
  if (hash > 0.5) return 0;
  const local = shifted - window * STRIKE_WINDOW_SEC - hash * 2 * (STRIKE_WINDOW_SEC - 1.2);
  if (local < 0 || local > 0.8) return 0;
  return local < 0.12 ? local / 0.12 : 1 - smoothstep(0.12, 0.8, local);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

// 体が長いので、縦の分割を細かくする。位置は巣穴の口（メッシュの下端の中央）で、体を出し入れしても回っても動かない。
export const gardenEelRenderer: BodyPlanRenderer = {
  verticesY: 64,
  deform: deformGardenEel,
  pitchScale: 0,
  pivot: ({ width, height }) => ({ x: width * 0.5, y: height }),
};
