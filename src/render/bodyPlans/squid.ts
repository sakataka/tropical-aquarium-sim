import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// イカ・オウムガイは真横の画像で、腕が左、胴が右。腕の付け根は swim.headStart、体の中心線の高さは swim.mouthAnchor.y。
// ひれ（swim.bodyWaveStart より右の、胴の上下の縁）を拍（swim.tailBeatHz）に合わせて後ろへ波打たせる。
// swim.waveCount がひれの波の数、swim.verticalFlex が振れ幅（ひれのないオウムガイは bodyWaveStart を1にする）。
// 腕は根元から先へゆっくり揺らす。驚いて噴射するときは、胴を細くすぼめ（swim.tailSweepRad）、腕をそろえてなびかせる。
function deformSquid(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const { headStart, bodyWaveStart, waveCount, verticalFlex, tailSweepRad } = swim;
  // ひれは止まって漂う間も小さく動かし続け、進むほど速く打つ。
  const finHz = swim.tailBeatHz * (0.6 + Math.min(0.8, speed * 0.08));
  motion.phase = (motion.phase + deltaSec * finHz * Math.PI * 2) % (Math.PI * 200);
  const jetTarget = fish.targetKind === "flee" ? 1 : 0;
  motion.flick += (jetTarget - motion.flick) * (1 - Math.exp(-(jetTarget ? 12 : 1.5) * deltaSec));
  // 噴射の間は、胴を何度か強くすぼめて水を押し出す。
  const jetPulse = motion.flick * (0.6 + 0.4 * Math.sin(motion.clockSec * Math.PI * 2 * 2.5));
  const t = motion.clockSec;
  const centerY = swim.mouthAnchor.y * height;
  const finSpan = Math.max(1e-3, 1 - bodyWaveStart);
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const u = column / (VERTICES_X - 1);
    const baseX = base[index * 2]!;
    const baseY = base[index * 2 + 1]!;
    const offset = (baseY - centerY) / height;
    let dx = 0;
    let dy = 0;
    // ひれ: 胴の上下の縁ほど大きく、前から後ろへ波を送る。
    if (u > bodyWaveStart) {
      const fin = smoothstep(bodyWaveStart, bodyWaveStart + 0.08, u) * smoothstep(0.08, 0.4, Math.abs(offset));
      const wave = Math.sin(motion.phase - ((u - bodyWaveStart) / finSpan) * waveCount * Math.PI * 2);
      dy += wave * verticalFlex * height * fin * (1 - motion.flick * 0.7);
    }
    // 腕: 根元から先へ揺れ、ゆっくり開いては閉じる。噴射では中心線へそろえて後ろへなびかせる。
    if (u < headStart) {
      const reach = ((headStart - u) / headStart) ** 1.3;
      dy += (Math.sin(t * 1.2 - u * 8 + motion.detailPhase) * 0.025 + Math.sin(t * 2.9 - u * 15) * 0.006) * height * reach *
        (1 - motion.flick);
      dy += (baseY - centerY) * (0.06 * Math.sin(t * 0.7 + motion.detailPhase) - 0.55 * motion.flick) * reach;
      dx -= motion.flick * width * 0.05 * reach;
    }
    // 胴: 噴射で細くすぼめる。
    const mantle = smoothstep(headStart, headStart + 0.1, u);
    dy -= (baseY - centerY) * tailSweepRad * jetPulse * mantle;
    const x = baseX + dx;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = baseY + dy;
  }
}

// ひれの縁と腕を別々に動かすため、縦の分割を細かくする。
export const squidRenderer: BodyPlanRenderer = { verticesY: 14, deform: deformSquid };
