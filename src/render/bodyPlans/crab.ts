import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// カニは斜め前から見た画像で、甲の下から脚が左右へ広がり、前の下寄りに左右のはさみがある。
// 歩くときは隣り合う脚を交互に上げ下ろしして横へ進み、体が小さく上下する。
// ついばむときは左右のはさみを交互に口へ運ぶ。驚くと、はさみを振り上げて横へ走る。
function deformCrab(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion } = mesh;
  motion.clockSec += deltaSec;
  const walking = speed > 0.04;
  const fleeing = Boolean(fish.surfaceMotion?.flee);
  const picking = fish.behaviorMode === "forage";
  const strideHz = fleeing ? 7 : walking ? Math.min(4.5, 1.8 + speed * 5) : 0.4;
  motion.stridePhase = (motion.stridePhase + deltaSec * strideHz * Math.PI * 2) % (Math.PI * 200);
  // 驚いたときのはさみの振り上げ。逃げ終えたあとも少しの間は構えたまま、ゆっくり下ろす。
  const alarmTarget = fleeing ? 1 : 0;
  motion.flick += (alarmTarget - motion.flick) * (1 - Math.exp(-(alarmTarget ? 20 : 1.5) * deltaSec));
  const legAmplitude = fleeing ? 0.016 : walking ? 0.012 : 0.002;
  const t = motion.clockSec;
  const bob = (walking ? Math.sin(motion.stridePhase * 2) * height * 0.005 : 0) +
    Math.sin(t * 1.3 + motion.detailPhase) * height * 0.002;
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const row = Math.floor(index / VERTICES_X);
    const u = column / (VERTICES_X - 1);
    const v = row / (verticesY - 1);
    let dx = 0;
    let dy = bob * (1 - smoothstep(0.7, 1, v));
    // 脚先（画像の下側）。隣り合う脚が逆の拍になるよう、横の位置で位相をずらす。
    const leg = smoothstep(0.5, 0.95, v);
    const legPhase = motion.stridePhase + u * Math.PI * 9;
    dx += Math.sin(legPhase) * width * legAmplitude * leg;
    dy -= Math.max(0, Math.sin(legPhase + 1.3)) * height * legAmplitude * 2.2 * leg;
    // はさみ（前の下寄り）。ついばむときは左右を交互に、驚いたときは両方を振り上げる。
    const claw = smoothstep(0.42, 0.62, v) * (1 - smoothstep(0.9, 1, v)) * (1 - smoothstep(0.42, 0.6, u));
    if (claw > 0) {
      if (picking) dy -= Math.max(0, Math.sin(t * Math.PI * 2 * 1.3 + u * 14)) * height * 0.035 * claw;
      dy -= motion.flick * height * 0.07 * claw;
      dx -= motion.flick * width * 0.01 * claw;
    }
    const x = base[index * 2]! + dx;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = base[index * 2 + 1]! + dy;
  }
}

// 脚とはさみを別々に動かすため、縦の分割を細かくする。
export const crabRenderer: BodyPlanRenderer = { verticesY: 10, deform: deformCrab };
