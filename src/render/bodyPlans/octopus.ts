import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

// タコは斜め上から見た画像で、胴（外套膜）が口より右上にあり、腕が口（swim.mouthAnchor）から四方へ広がる。
// 腕は口を中心に少しずつ回して、根元から先へうねらせる（隣り合う腕で拍をずらす）。
// 這うときは大きく速くうねらせて腕を伸び縮みさせ、休むときは先だけをゆっくり動かす。胴は呼吸でかすかに膨らむ。
// 驚いて噴射するときは、胴を少しすぼめ、腕をそろえて胴と逆の側（左）へなびかせる。
function deformOctopus(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const jetting = Boolean(fish.surfaceMotion?.flee);
  const crawling = !jetting && speed > 0.04;
  const writheHz = crawling ? Math.min(1.2, 0.45 + speed * 0.05) : 0.15;
  motion.stridePhase = (motion.stridePhase + deltaSec * writheHz * Math.PI * 2) % (Math.PI * 200);
  // 噴射の構えは一気に取り、着いたあとはゆっくり腕を広げ直す。
  const jetTarget = jetting ? 1 : 0;
  motion.flick += (jetTarget - motion.flick) * (1 - Math.exp(-(jetTarget ? 14 : 1.2) * deltaSec));
  const swirl = (crawling ? 0.14 : 0.05) * (1 - motion.flick);
  const t = motion.clockSec;
  const breathe = Math.sin(t * Math.PI * 2 * 0.22 + motion.detailPhase) * 0.012;
  const hubX = swim.mouthAnchor.x * width;
  const hubY = swim.mouthAnchor.y * height;
  const reach = width * 0.5;
  const bob = crawling ? Math.sin(motion.stridePhase * 2) * height * 0.006 : 0;
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const baseX = base[index * 2]!;
    const baseY = base[index * 2 + 1]!;
    const rx = baseX - hubX;
    const ry = baseY - hubY;
    const r = Math.hypot(rx, ry) / reach;
    const theta = Math.atan2(ry, rx);
    // 胴は口より上で右側。腕は口から離れるほど大きく動く。
    const mantle = smoothstep(0, 0.12, -ry / height) * smoothstep(-0.02, 0.12, rx / width);
    const arm = smoothstep(0.12, 0.55, r) * (1 - mantle);
    let dx = 0;
    let dy = bob * (1 - arm);
    // うねり: 口のまわりの小さな回転。根元から先へ波が伝わり、先ほど大きい。
    const angle = swirl * arm * Math.sin(motion.stridePhase - r * 5 + theta * 3 + motion.detailPhase);
    dx += rx * (Math.cos(angle) - 1) - ry * Math.sin(angle);
    dy += rx * Math.sin(angle) + ry * (Math.cos(angle) - 1);
    // 這うときは、腕を交互に伸ばしては縮める。
    if (crawling) {
      const stretch = 0.05 * arm * Math.sin(motion.stridePhase + theta * 2);
      dx += rx * stretch;
      dy += ry * stretch;
    }
    // 胴の呼吸。噴射では水を押し出してすぼまる。
    const swell = (breathe - motion.flick * 0.06) * mantle;
    dx += rx * swell;
    dy += ry * swell;
    // 噴射: 腕を口の高さへそろえ、左へなびかせる。
    if (motion.flick > 0.01) {
      dy -= ry * 0.6 * motion.flick * arm;
      dx -= motion.flick * arm * (width * 0.1 * r + Math.max(0, rx) * 0.5);
    }
    const x = baseX + dx;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = baseY + dy;
  }
}

// 四方へ広がる腕を滑らかに曲げるため、縦の分割を細かくする。
export const octopusRenderer: BodyPlanRenderer = { verticesY: 18, deform: deformOctopus };
