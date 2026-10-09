import { clamp, smoothstep } from "../../core/math";
import type { Vec2 } from "../../core/types";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame, type SwimStyle } from "./types";

/**
 * 斜め上から見た画像を、底すれすれの目線の水景になじませるため、接地点を中心に縦に縮める割合。
 * 縮めないと殻の上面が見えすぎて、底から浮いて見える。
 */
const VIEW_FLATTEN = 0.85;
/** 叩かれて棘を震わせる拍 (Hz)。 */
const BRISTLE_HZ = 2.2;

const DEFAULT_RADIAL = { x: 0.5, y: 0.45, radius: 0.15, reach: 0.45 };

function radialOf(swim: SwimStyle) {
  return swim.radial ?? DEFAULT_RADIAL;
}

// ウニは斜め上から見た画像（殻から棘が四方へ伸びる）。殻は動かさず、棘を付け根（殻の縁）を軸にゆるやかに揺らす。
// 揺れは殻の周りを巡る波で、隣り合う棘が少しずつずれて傾く。這う間は、下側の棘を歩みに合わせて前後に動かす
// （管足と棘で体を運ぶ）。叩かれると（alarmSec）、棘を細かく震わせる。前後がないので画像を反転しない。
// swim.tailSweepRad が棘の振れ角、swim.tailBeatHz が揺れの拍、swim.waveCount が殻の周りに並ぶ揺れの波の数。
function deformUrchin(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, verticesY, swim, motion } = mesh;
  const radial = radialOf(swim);
  motion.clockSec += deltaSec;
  const ease = (current: number, target: number, rise: number, fall: number) =>
    current + (target - current) * (1 - Math.exp(-(target > current ? rise : fall) * deltaSec));
  motion.stepBlend = ease(motion.stepBlend, speed > 0.01 ? 1 : 0, 0.8, 0.8);
  motion.flick = ease(motion.flick, (fish.alarmSec ?? 0) > 0 ? 1 : 0, 6, 0.8);
  motion.stridePhase = (motion.stridePhase + deltaSec * 0.5 * Math.PI * 2 * motion.stepBlend) % (Math.PI * 200);
  const t = motion.clockSec * swim.tailBeatHz * Math.PI * 2;
  const bristle = motion.clockSec * BRISTLE_HZ * Math.PI * 2;
  const centerX = radial.x * width;
  const centerY = radial.y * height;
  const testRadius = radial.radius * width;
  const spineLength = Math.max(1e-6, radial.reach * width - testRadius);
  const footY = swim.footAnchor.y * height;
  const amplitude = swim.tailSweepRad;
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    const dx = bx - centerX;
    const dy = by - centerY;
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    // 殻の縁より外が棘。付け根はほとんど動かさず、先ほど大きく振れる。
    const spine = smoothstep(testRadius * 0.9, testRadius * 1.3, r) *
      (0.35 + 0.65 * clamp((r - testRadius) / spineLength, 0, 1));
    let swing = amplitude * (0.6 * Math.sin(t + swim.waveCount * theta + motion.detailPhase) +
      0.4 * Math.sin(t * 0.63 - 2 * theta + motion.detailPhase * 1.9));
    // 下側（手前と底に着く側）の棘は、這う間に歩みに合わせて動く。
    const lower = smoothstep(-0.2, 0.7, Math.sin(theta));
    swing += amplitude * 1.2 * motion.stepBlend * lower * Math.sin(motion.stridePhase + 3 * theta);
    swing += amplitude * 0.9 * motion.flick * Math.sin(bristle + 5 * theta + motion.detailPhase);
    const angle = swing * spine;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = centerX + dx * cos - dy * sin;
    const y = centerY + dx * sin + dy * cos;
    positions[index * 2] = x;
    positions[index * 2 + 1] = footY + (y - footY) * VIEW_FLATTEN;
  }
}

/** 殻が底に着く点。棘が揺れても、立ち止まっても動かさない。 */
function urchinPivot({ width, height, swim }: { width: number; height: number; swim: SwimStyle }): Vec2 {
  return { x: swim.footAnchor.x * width, y: swim.footAnchor.y * height };
}

export const urchinRenderer: BodyPlanRenderer = {
  verticesY: 21,
  deform: deformUrchin,
  pitchScale: 0,
  surfaceTilt: 0.3,
  pivot: urchinPivot,
};
