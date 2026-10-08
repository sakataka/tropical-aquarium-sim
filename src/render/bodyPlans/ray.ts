import { clamp, smoothstep } from "../../core/math";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer } from "./types";

/**
 * 真上から見た画像を、斜め上から見下ろした円盤に見せるため、体盤の面の奥行きを縦に縮める割合
 * （見下ろす角度の正弦）。ひれの上下の動きは、その余弦の割合で画面の上下に出る。
 */
const VIEW_FLATTEN = 0.42;
const VIEW_LIFT = Math.sqrt(1 - VIEW_FLATTEN ** 2);
/** 体盤の中心線から、ひれとして動かない胴の幅（体盤の半幅に対する割合）。 */
const CORE_FRACTION = 0.24;

// エイは真上から見た画像（頭が左、尾が右）。左右へ広がる胸びれの縁を、頭から尾へ波打たせて進む。
// 波の数（swim.waveCount）が多いほど波打ち（アカエイ）、少ないほど羽ばたき（マンタ）に近づく。
// swim.bodyWaveStart が体盤の後端（尾の付け根）、swim.footAnchor が体盤の中心（回る中心）。
// 向きを変えるときは画像を反転せず、体盤の面の中で回る（半ばでは頭がガラスの手前か奥を向く）。
function deformRay(mesh: BodyMesh) {
  const { positions, base, width, height, verticesY, swim, motion } = mesh;
  const tailStart = swim.bodyWaveStart;
  const centerX = swim.footAnchor.x * width;
  const axisY = swim.footAnchor.y * height;
  const halfSpan = height / 2;
  const coreSpan = halfSpan * CORE_FRACTION;
  // 個体ごとに、頭を手前へ回すか奥へ回すかを決めておく。
  const turnSign = motion.detailPhase > Math.PI ? 1 : -1;
  const turn = motion.yaw * turnSign;
  const cosTurn = Math.cos(turn);
  const sinTurn = Math.sin(turn);
  // 曲がる間は、回る内側へ体盤を少し傾ける。
  const roll = clamp(motion.yawVelocity * 0.03 * turnSign, -0.22, 0.22);
  const tailX = tailStart * width;
  const tailSway = Math.sin(motion.phase * 0.5 + motion.detailPhase) * 0.05 + Math.sin(motion.phase) * 0.02;
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const u = column / (VERTICES_X - 1);
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    let lateral = by - axisY;
    let lift = 0;
    // 吻の先と尾ではひれが小さく、体盤の後ろ寄りほど大きく動く。
    const along = smoothstep(0, tailStart * 0.4, u) * (1 - smoothstep(tailStart - 0.02, tailStart + 0.05, u));
    const reach = Math.abs(lateral) - coreSpan;
    if (reach > 0 && along > 0) {
      const fin = reach / (halfSpan - coreSpan);
      const wave = Math.sin(motion.phase - (u / tailStart) * swim.waveCount * Math.PI * 2);
      // 付け根から縁へ向かうほど曲がりが増す（縁がしなる）。
      const angle = motion.amplitude * along * wave * Math.sqrt(Math.min(1, fin));
      lift = reach * Math.sin(angle);
      lateral = Math.sign(lateral) * (coreSpan + reach * Math.cos(angle));
    }
    if (u > tailStart) {
      // 尾は付け根を軸に、体盤の面の中でゆっくり揺れる。
      const distance = bx - tailX;
      lateral += distance * tailSway * smoothstep(tailStart, 1, u);
      lift += distance * 0.03 * Math.sin(motion.phase - swim.waveCount * Math.PI * 2 - (u - tailStart) * 4);
    }
    lift += lateral * Math.sin(roll);
    const x = bx - centerX;
    const rotatedX = x * cosTurn - lateral * sinTurn;
    const rotatedY = x * sinTurn + lateral * cosTurn;
    positions[index * 2] = centerX + rotatedX;
    positions[index * 2 + 1] = axisY + rotatedY * VIEW_FLATTEN - lift * VIEW_LIFT;
  }
}

export const rayRenderer: BodyPlanRenderer = {
  verticesY: 11,
  deform: deformRay,
  pitchScale: 0.35,
  // 体盤の中心の真下の、手前の縁を位置にする。底に伏せても泳いでも体盤がガラスの下端で切れず、回っても位置がずれない。
  pivot: ({ width, height, swim }) => ({ x: swim.footAnchor.x * width, y: swim.footAnchor.y * height + height / 2 * VIEW_FLATTEN }),
};
