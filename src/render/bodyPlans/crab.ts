import { clamp, smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame, type SwimStyle } from "./types";

/** 脚を広げた幅に対する一歩の長さ。体格の違うカニも、移動距離に合う周期で歩く。 */
const STRIDE_BODY_LENGTHS = 0.12;
const DUTY = 0.7;
// 画像の脚位置がまだない草案にも、甲全体を波打たせず、脚の範囲だけを動かす。
const DEFAULT_LEGS: NonNullable<SwimStyle["legs"]> = [
  { x: .38, y: .3, knee: { x: .2, y: .16 }, footX: .02, footY: .3, width: .035, beat: 0 },
  { x: .36, y: .38, knee: { x: .16, y: .35 }, footX: .02, footY: .56, width: .035, beat: 1 },
  { x: .34, y: .46, knee: { x: .13, y: .48 }, footX: .1, footY: .76, width: .04, beat: 0 },
  { x: .66, y: .38, knee: { x: .84, y: .3 }, footX: .98, footY: .54, width: .035, beat: 1 },
  { x: .66, y: .46, knee: { x: .86, y: .48 }, footX: .97, footY: .8, width: .035, beat: 0 },
  { x: .64, y: .54, knee: { x: .76, y: .7 }, footX: .62, footY: .98, width: .04, beat: 1 },
];

// メッシュと脚の配置が変わらない間は、画像内の脚の範囲を一度だけ測る。
// 毎フレームは脚ごとの小さな移動を重ねるだけにする。
const rigCache = new WeakMap<Float32Array, { legs: NonNullable<SwimStyle["legs"]>; weights: Float32Array[] }>();
function legWeights(mesh: BodyMesh, legs: NonNullable<SwimStyle["legs"]>): Float32Array[] {
  const cached = rigCache.get(mesh.base);
  if (cached?.legs === legs) return cached.weights;
  const weights = legs.map((leg) => {
    const root = { x: leg.x * mesh.width, y: leg.y * mesh.height };
    const foot = { x: leg.footX * mesh.width, y: leg.footY * mesh.height };
    const knee = leg.knee ? { x: leg.knee.x * mesh.width, y: leg.knee.y * mesh.height }
      : { x: (root.x + foot.x) / 2, y: (root.y + foot.y) / 2 };
    const points = [root, knee, foot];
    const lengths = [Math.hypot(knee.x - root.x, knee.y - root.y), Math.hypot(foot.x - knee.x, foot.y - knee.y)];
    const total = Math.max(1e-6, lengths[0]! + lengths[1]!);
    const weights = new Float32Array(mesh.base.length / 2);
    for (let i = 0; i < weights.length; i++) {
      const x = mesh.base[i * 2]!, y = mesh.base[i * 2 + 1]!;
      let distance = Infinity, along = 0, traveled = 0;
      for (let segment = 0; segment < 2; segment++) {
        const a = points[segment]!, b = points[segment + 1]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy), 0, 1);
        const gap = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
        if (gap < distance) { distance = gap; along = (traveled + t * lengths[segment]!) / total; }
        traveled += lengths[segment]!;
      }
      const radius = leg.width * mesh.width;
      weights[i] = (1 - smoothstep(radius * .55, radius * 1.25, distance)) * smoothstep(.08, .75, along);
    }
    return weights;
  });
  rigCache.set(mesh.base, { legs, weights });
  return weights;
}

// カニの斜めから見た画像を、脚の付け根・関節・先端に沿って変形する。
// 接地中は後ろへ運び、浮かせている間に前へ戻す。隣り合う脚は半拍ずらす。
function deformCrab(mesh: BodyMesh, { fish, speed, deltaSec, bodyLengthCm }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  const surface = fish.surfaceMotion;
  const fleeing = Boolean(surface?.flee);
  // 奥へ進む区間は画面のxy速度が小さくても歩行中。休み・採餌は脚を下ろす。
  // grazing は採餌の休止が明けても残るので、休みの残り時間で判定する。
  const walking = fleeing || (surface ? surface.pauseSec === 0
    : fish.behaviorMode !== "rest" && fish.behaviorMode !== "forage" && speed > 0);
  const picking = fish.behaviorMode === "forage";
  const travelSpeed = surface?.speedCmPerSec ?? speed;
  const normalLimit = Math.min(1, swim.tailBeatHz * 1.5);
  const targetHz = walking ? Math.min(fleeing ? 1.8 : normalLimit,
    travelSpeed / Math.max(.1, bodyLengthCm * STRIDE_BODY_LENGTHS)) : 0;
  const response = 1 - Math.exp(-3 * deltaSec);
  const previousStep = motion.stepBlend, previousHz = motion.strideHz ?? 0;
  motion.clockSec += deltaSec;
  motion.stepBlend += ((walking ? 1 : 0) - motion.stepBlend) * (1 - Math.exp(-2 * deltaSec));
  motion.strideHz = (motion.strideHz ?? 0) + (targetHz - (motion.strideHz ?? 0)) * response;
  const direction = Math.sign(fish.velocity.x) || motion.strideDirection || 1;
  motion.strideDirection = (motion.strideDirection ?? direction) +
    (direction - (motion.strideDirection ?? direction)) * response;
  motion.stridePhase = (motion.stridePhase + deltaSec * Math.PI *
    (previousHz * previousStep + motion.strideHz * motion.stepBlend)) % (Math.PI * 200);
  motion.flick += ((fleeing ? 1 : 0) - motion.flick) * (1 - Math.exp(-(fleeing ? 5 : 1.5) * deltaSec));
  motion.lift += ((picking ? 1 : 0) - motion.lift) * response;

  const legs = swim.legs ?? DEFAULT_LEGS;
  const weights = legWeights(mesh, legs);
  const profile = profileWidth(motion.yaw);
  // 細い脚を囲むメッシュを折り返さない、小さな振幅で運ぶ。
  const stride = width * (.012 + .004 * motion.flick) * motion.stepBlend;
  const steps = legs.map((leg) => {
    const cycle = (motion.stridePhase / (Math.PI * 2) + leg.beat * .5) % 1;
    // 離地と接地の両端で速度を0にし、折れた正弦波のような跳ねを作らない。
    const swing = cycle < DUTY ? 1 - 2 * smoothstep(0, DUTY, cycle)
      : -1 + 2 * smoothstep(DUTY, 1, cycle);
    const lift = cycle < DUTY ? 0 : Math.sin(Math.PI * (cycle - DUTY) / (1 - DUTY)) ** 2;
    // 世界の横歩きの向きを、画像を反転する前の座標に戻す。
    return { x: swing * stride * motion.strideDirection! * Math.sign(profile), y: -lift * height * .02 * motion.stepBlend };
  });
  const t = motion.clockSec;
  const bob = Math.sin(motion.stridePhase) * height * .0015 * motion.stepBlend +
    Math.sin(t * .8 + motion.detailPhase) * height * .0007;
  for (let index = 0; index < VERTICES_X * verticesY; index++) {
    const u = index % VERTICES_X / (VERTICES_X - 1);
    const v = Math.floor(index / VERTICES_X) / (verticesY - 1);
    let dx = 0, dy = 0, total = 0;
    for (let leg = 0; leg < legs.length; leg++) {
      const weight = weights[leg]![index]!;
      dx += weight * steps[leg]!.x;
      dy += weight * steps[leg]!.y;
      total += weight;
    }
    dx /= Math.max(1, total); dy /= Math.max(1, total);
    dy += bob * (1 - smoothstep(.7, 1, v));
    // 採餌のはさみもゆっくり動かし、採餌をやめるときは元の姿勢へ戻す。
    const claw = smoothstep(.42, .62, v) * (1 - smoothstep(.9, 1, v)) * (1 - smoothstep(.42, .6, u));
    const pick = ((1 + Math.sin(t * Math.PI * 2 * .35 + u * Math.PI * 2)) / 2) ** 2;
    dy -= (pick * height * .025 * motion.lift + motion.flick * height * .055) * claw;
    dx -= motion.flick * width * .008 * claw;
    positions[index * 2] = pivotX + (base[index * 2]! + dx - pivotX) * profile;
    positions[index * 2 + 1] = base[index * 2 + 1]! + dy;
  }
}

export const crabRenderer: BodyPlanRenderer = {
  verticesY: 16,
  deform: deformCrab,
  // 動く足先を接地点にすると甲まで揺れる。脚の間の固定点を面の位置に合わせる。
  pivot: ({ width, height, swim }) => ({ x: swim.footAnchor.x * width, y: swim.footAnchor.y * height }),
};
