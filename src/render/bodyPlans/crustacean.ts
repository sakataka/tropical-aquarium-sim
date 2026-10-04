import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// エビは尾を振らない。脚を前から後ろへ波のように運んで歩き、触角をゆっくり揺らし、
// 底や水草をついばむときは頭を小刻みに下げる。速く進むときは腹の遊泳肢で泳ぎ、腹が小さくしなる。
function deformCrustacean(mesh: BodyMesh, { fish, speed, deltaSec, bottomY }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion } = mesh;
  motion.clockSec += deltaSec;
  // kick は通常移動のリズムでも発生する。底にいる間は加速中も脚で歩く。
  const swimming = !fish.surfaceMotion && fish.position.y < bottomY - 0.6 && speed > 0.04;
  const picking = fish.behaviorMode === "forage";
  const walking = !swimming && speed > 0.04;
  const strideHz = swimming ? 5.5 : walking ? Math.min(4, 1.6 + speed * 6) : 0.5;
  motion.stridePhase = (motion.stridePhase + deltaSec * strideHz * Math.PI * 2) % (Math.PI * 200);
  // 驚いたエビは腹を一気に丸めて尾で水を打ち、少し浮いて後ろへ跳ぶ。脚はたたむ。
  const flickTarget = fish.surfaceMotion?.flee ? 1 : 0;
  motion.flick += (flickTarget - motion.flick) * (1 - Math.exp(-(flickTarget ? 30 : 6) * deltaSec));
  const legAmplitude = (swimming ? 0.006 : walking ? 0.014 : 0.003) * (1 - motion.flick);
  const bob = (walking ? Math.sin(motion.stridePhase * 2) * height * 0.006 : 0) - motion.flick * height * 0.22;
  const head = mesh.swim.headStart;
  const t = motion.clockSec;
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const row = Math.floor(index / VERTICES_X);
    const u = column / (VERTICES_X - 1);
    const v = row / (verticesY - 1);
    let dx = 0;
    let dy = bob;
    // 脚（体の下側）を、前の脚から順に少し遅れて動かす。
    const leg = smoothstep(0.55, 0.95, v) * smoothstep(head, head + 0.08, u) * (1 - smoothstep(0.62, 0.8, u));
    dx += Math.sin(motion.stridePhase - u * 14) * width * legAmplitude * leg;
    dy += Math.max(0, Math.sin(motion.stridePhase - u * 14 + 1.2)) * height * legAmplitude * 1.4 * leg;
    // 触角は根元から先へ向かって大きく、ゆっくり揺れる。
    if (head > 0 && u < head) {
      const reach = ((head - u) / head) ** 1.4;
      dy += (Math.sin(t * 1.6 + u * 7 + motion.detailPhase) * 0.05 + Math.sin(t * 3.7 + u * 13) * 0.015) * height * reach;
      dx += Math.sin(t * 1.1 + motion.detailPhase) * width * 0.012 * reach;
    }
    // ついばむときは、頭先を小刻みに下げる。
    if (picking) {
      const front = smoothstep(head + 0.22, head, u);
      dy += Math.max(0, Math.sin(t * Math.PI * 2 * 2.4)) * height * 0.028 * front;
    }
    if (motion.flick > 0.01) {
      const abdomen = smoothstep(0.5, 1, u) ** 1.5;
      dy += motion.flick * height * 0.3 * abdomen;
      dx -= motion.flick * width * 0.05 * abdomen;
    }
    // 泳ぐときは腹の後ろ半分が遊泳肢の拍に合わせて小さくしなる。
    if (swimming) {
      const abdomen = smoothstep(0.55, 1, u);
      dy += Math.sin(motion.stridePhase * 0.5 - u * 3) * height * 0.02 * abdomen;
    }
    const x = base[index * 2]! + dx;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = base[index * 2 + 1]! + dy;
  }
}

// 脚と触角を別々に動かすため、縦の分割を細かくする。
export const crustaceanRenderer: BodyPlanRenderer = { verticesY: 10, deform: deformCrustacean };
