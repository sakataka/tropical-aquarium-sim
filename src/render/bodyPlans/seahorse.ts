import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// タツノオトシゴ・シードラゴン。体を曲げず、小さな背びれと胸びれ（swim.fins）を細かく震わせて進む。
// タツノオトシゴは体を立てた画像で、swim.tailStartY より下の尾をゆっくり揺らす。尾で海草につかまって
// 休んでいる間は、尾の先を支点に体全体が水に揺られる。
// シードラゴンは真横の画像（頭が左）で、swim.bodyWaveStart より右の尾をゆっくり上下にくねらせ、
// 体の中心線（swim.mouthAnchor.y）から離れた葉のような皮弁を、水になびくように揺らす（振れ幅は swim.verticalFlex）。
// swim.tailBeatHz はひれの震え、swim.tailSweepRad は尾の揺れの大きさ。
function deformSeahorse(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  // 止まっている間もひれは小さく動かし続け、進むほど速く震わせる。
  const finHz = swim.tailBeatHz * (0.5 + Math.min(0.7, speed * 0.25));
  motion.phase = (motion.phase + deltaSec * finHz * Math.PI * 2) % (Math.PI * 200);
  const t = motion.clockSec;
  const fins = swim.fins ?? [];
  const upright = swim.tailStartY !== undefined;
  const tailStart = upright ? swim.tailStartY! : swim.bodyWaveStart;
  const tailSpan = Math.max(1e-3, 1 - tailStart);
  // 尾でつかまって休む間（タツノオトシゴ）は、尾の先を支点に体が揺られる。
  const holding = upright && fish.behaviorMode === "rest" ? 1 : 0;
  motion.flick += (holding - motion.flick) * (1 - Math.exp(-1.5 * deltaSec));
  const centerY = swim.mouthAnchor.y * height;
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const row = Math.floor(index / VERTICES_X);
    const u = column / (VERTICES_X - 1);
    const v = row / (verticesY - 1);
    const baseX = base[index * 2]!;
    const baseY = base[index * 2 + 1]!;
    let dx = 0;
    let dy = 0;
    // ひれ: 付け根から縁へ波を送るように細かく震わせる。
    for (const fin of fins) {
      const fx = (u - fin.x) * width;
      const fy = (v - fin.y) * height;
      const reach = fin.radius * width;
      const distance = Math.hypot(fx, fy);
      if (distance >= reach) continue;
      const weight = 1 - smoothstep(reach * 0.35, reach, distance);
      const wave = Math.sin(motion.phase - (distance / reach) * Math.PI * 1.5);
      dx += wave * reach * 0.12 * weight;
      dy += Math.cos(motion.phase * 0.5 + distance / reach * 2) * reach * 0.06 * weight;
    }
    if (upright) {
      // 尾: 下へ行くほど大きく、ゆっくり左右へ揺れる。
      const along = Math.max(0, (v - tailStart) / tailSpan);
      const tailWave = Math.sin(t * 0.8 + motion.detailPhase - along * 2.2);
      dx += tailWave * swim.tailSweepRad * width * along ** 1.5 * (1 - motion.flick);
      // つかまっている間: 尾の先を支点に、上ほど大きく揺られる。
      const sway = Math.sin(t * 0.55 + motion.detailPhase) * 0.6 + Math.sin(t * 1.3 + motion.detailPhase * 2) * 0.4;
      dx += sway * swim.tailSweepRad * 0.8 * width * (1 - v) * motion.flick;
    } else {
      // 尾: 先ほど大きく、ゆっくり上下にくねる。
      const along = Math.max(0, (u - tailStart) / tailSpan);
      dy += Math.sin(t * 0.6 + motion.detailPhase - along * 2.5) * swim.tailSweepRad * height * along ** 1.5;
      // 皮弁: 体の中心線から離れるほど、水になびいて揺れる。
      const offset = (baseY - centerY) / height;
      const leaf = smoothstep(0.08, 0.45, Math.abs(offset));
      dy += Math.sin(t * 0.9 + motion.detailPhase - u * 4 - offset * 3) * swim.verticalFlex * height * leaf;
      dx += Math.sin(t * 0.7 + motion.detailPhase * 1.7 - offset * 5) * swim.verticalFlex * width * 0.4 * leaf;
    }
    const x = baseX + dx;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = baseY + dy;
  }
}

// ひれの範囲は小さいので、縦の分割を細かくする。体を曲げないので、上下に向かっても大きくは傾かない。
export const seahorseRenderer: BodyPlanRenderer = { verticesY: 20, deform: deformSeahorse, pitchScale: 0.3 };
