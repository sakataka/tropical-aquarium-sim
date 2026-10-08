import { clamp, smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

/** 1歩の間に脚が地面に着いている割合。ゆっくり歩く両生類は、着いている間が長い。 */
const DUTY = 0.65;
/** 脚を前後へ振る角度 (rad)。 */
const LEG_SWING_RAD = 0.32;
/** 泳ぐときに脚を後ろへ流す角度 (rad)。メッシュが粗いので、大きくたたむと足先が伸びて見える。 */
const LEG_FOLD_RAD = 0.3;
/** 歩幅（体長に対する割合）。歩く速さを歩幅で割って、脚を運ぶ速さにする。 */
const STRIDE_BODY_LENGTHS = 0.3;

// 両生類（オオサンショウウオ、イモリ）は真横の画像（頭が左）で、swim.legs に脚の付け根と足先を書く。
// 歩くときは、手前の前脚と奥の後脚、奥の前脚と手前の後脚を組にして半拍ずらして運ぶ（対角の組）。
// 脚は付け根を軸に、着いている間はゆっくり後ろへ、浮かせている間は素早く前へ振り、尾は歩みに合わせて左右へ揺れる
// （真横からは尾が縮んで見える）。泳ぐときは脚を後ろへたたみ、体と尾をくねらせる。休むときは脇腹がかすかに膨らむ。
function deformWalker(mesh: BodyMesh, { fish, speed, deltaSec, bodyLengthCm }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const swimming = !fish.surfaceMotion;
  const walking = !swimming && speed > 0.04;
  const response = 1 - Math.exp(-4 * deltaSec);
  motion.swimBlend += ((swimming ? 1 : 0) - motion.swimBlend) * response;
  motion.stepBlend += ((walking ? 1 : 0) - motion.stepBlend) * response;
  if (walking) {
    const strideHz = Math.min(3, speed / Math.max(0.1, bodyLengthCm * STRIDE_BODY_LENGTHS));
    motion.stridePhase = (motion.stridePhase + deltaSec * strideHz * Math.PI * 2) % (Math.PI * 200);
  }
  const step = motion.stepBlend * (1 - motion.swimBlend);
  const t = motion.clockSec;
  const tailStart = swim.bodyWaveStart;
  const breathe = Math.sin(t * Math.PI * 2 * 0.16 + motion.detailPhase) * height * 0.006 * (1 - step);
  const bob = Math.sin(motion.stridePhase * 2) * height * 0.008 * step;

  // 体の各列の向き。歩くときは尾だけが揺れ、泳ぐときは体の前寄りから尾までくねる。
  const columnStep = width / (VERTICES_X - 1);
  const columnX = new Float32Array(VERTICES_X);
  const columnY = new Float32Array(VERTICES_X);
  let projectedX = 0;
  for (let column = 0; column < VERTICES_X; column += 1) {
    const u = column / (VERTICES_X - 1);
    const tail = smoothstep(tailStart - 0.1, 1, u) ** 1.4;
    const body = smoothstep(0.15, 1, u) ** 1.5;
    const sway = 0.4 * step * tail * Math.sin(motion.stridePhase - (u - tailStart) * 5);
    const wave = motion.amplitude * motion.swimBlend * body * Math.sin(motion.phase - u * swim.waveCount * Math.PI * 2);
    const angle = sway + wave;
    if (column > 0) projectedX += columnStep * Math.cos(angle);
    columnX[column] = projectedX;
    columnY[column] = height * (swim.verticalFlex * (body * motion.swimBlend + tail * step * 0.5) *
      Math.sin(motion.phase - u * swim.waveCount * Math.PI * 2));
  }

  const legs = swim.legs ?? [];
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const row = Math.floor(index / VERTICES_X);
    const u = column / (VERTICES_X - 1);
    const v = row / (verticesY - 1);
    let x = columnX[column]!;
    let y = base[index * 2 + 1]! + columnY[column]! + bob;
    // 脇腹（体の下半分）の呼吸。
    y += breathe * smoothstep(0.35, 0.6, v) * (1 - smoothstep(0.75, 0.9, v)) * (1 - smoothstep(tailStart - 0.1, tailStart + 0.1, u));
    // 脚どうしの範囲が重なるところは、各脚の動きを重みで平均し、足しすぎない（手前と奥の脚が重なる前脚など）。
    let legX = 0, legY = 0, total = 0;
    for (const leg of legs) {
      // 付け根から足先までのどこにいるか。付け根の近くはあまり曲げず、先ほど大きく動かす。
      const along = (v - leg.y) / (leg.footY - leg.y);
      if (along <= 0) continue;
      const centerU = leg.x + (leg.footX - leg.x) * clamp(along, 0, 1);
      const across = Math.abs(u - centerU) / leg.width;
      const weight = smoothstep(0, 0.45, along) * (1 - smoothstep(0.55, 1.1, across));
      if (weight <= 0) continue;
      // 着いている間は前から後ろへ一定の速さで、浮かせている間は前へ戻しながら持ち上げる。
      const cycle = ((motion.stridePhase / (Math.PI * 2) + leg.beat * 0.5) % 1 + 1) % 1;
      let swing: number;
      let lift = 0;
      if (cycle < DUTY) swing = 1 - 2 * cycle / DUTY;
      else {
        const q = (cycle - DUTY) / (1 - DUTY);
        swing = -1 + 2 * smoothstep(0, 1, q);
        lift = Math.sin(Math.PI * q);
      }
      // 正の角度で足先が前（左）へ出る。泳ぐ間は後ろへたたむ。
      const angle = (LEG_SWING_RAD * swing * step - LEG_FOLD_RAD * motion.swimBlend) * weight;
      const rx = u * width - leg.x * width;
      const ry = v * height - leg.y * height;
      legX += weight * (rx * (Math.cos(angle) - 1) - ry * Math.sin(angle));
      legY += weight * (rx * Math.sin(angle) + ry * (Math.cos(angle) - 1) - lift * step * weight * height * 0.05);
      total += weight;
    }
    if (total > 0) {
      x += legX / total;
      y += legY / total;
    }
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = y;
  }
}

// 4本の脚を別々に曲げるため、縦の分割を細かくする。
export const walkerRenderer: BodyPlanRenderer = { verticesY: 14, deform: deformWalker };
