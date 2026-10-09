import { clamp } from "../../core/math";
import type { Vec2 } from "../../core/types";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame, type SwimStyle } from "./types";

/**
 * 真上から見た画像を、斜め上から見下ろした姿に見せるため、体の左右の幅を縦に縮める割合（エイと同じ考え方）。
 * カエルは体が厚いので、エイより少し浅く見下ろす。
 */
const VIEW_FLATTEN = 0.5;
/** 後脚を伸ばしきるまでの秒数（蹴り）と、伸ばしたまま滑る秒数。 */
const POWER_SEC = 0.16;
const GLIDE_SEC = 0.45;
/** 蹴りを続ける間（息継ぎや逃げる途中）に、次の蹴りを始める間隔。 */
const STROKE_PERIOD_SEC = 0.75;
/** 滑ったあとに後脚をたたむ深さ（-1 で最もたたむ）。 */
const RECOVERED_STROKE = -0.85;

/**
 * 後脚の骨（腿・脛・足）の向き。体の中心線から外側を上（負）にした角度 (rad) で、後ろ（尾の側）が0。
 * 伸ばしきると両脚がそろって後ろへ伸び、足の水かきが少し外へ開く。たたむと膝が前の外側へ出て、足先が体の脇へ戻る。
 */
const HIND_EXTENDED = [0.06, 0.02, -0.18];
const HIND_FLEXED = [-1.65, 0.5, -0.45];
/** 前脚の骨（上腕・前腕）を、画像の姿勢から回す角度 (rad)。蹴る間は体へ寄せ、たたむ間は少し開く。 */
const FORE_EXTENDED = [0.4, -0.3];
const FORE_FLEXED = [-0.3, 0.3];

type Bone = { start: Vec2; length: number; angle: number; side: number; limb: number; index: number };
type Rig = { bones: Bone[]; limbs: { kind: "hind" | "fore"; side: number; joints: Vec2[] }[]; weights: Float32Array };

// 画像ごとに、脚の骨と各頂点の重みを一度だけ求める。
const rigs = new WeakMap<Float32Array, Rig>();

/** 体の中心線から外側を上にした向きの角度。side は中心線より上の脚が -1、下の脚が 1。 */
function canonicalAngle(dx: number, dy: number, side: number) {
  return Math.atan2(-side * dy, dx);
}

function convexHull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vec2[]) => {
    const hull: Vec2[] = [];
    for (const point of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0) hull.pop();
      hull.push(point);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function segmentDistance(point: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** 凸多角形の内側なら0、外側なら縁までの距離。 */
function hullDistance(point: Vec2, hull: Vec2[]) {
  let inside = true;
  let nearest = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!, b = hull[(i + 1) % hull.length]!;
    if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) inside = false;
    nearest = Math.min(nearest, segmentDistance(point, a, b));
  }
  return inside ? 0 : nearest;
}

function buildRig(mesh: BodyMesh): Rig {
  const { base, width, height, verticesY, swim } = mesh;
  const axisY = swim.footAnchor.y * height;
  const toPixels = (point: Vec2) => ({ x: point.x * width, y: point.y * height });
  const limbs = (swim.limbs ?? []).map((limb) => {
    const joints = limb.joints.map(toPixels);
    return { kind: limb.kind, side: Math.sign(joints[0]!.y - axisY) || 1, joints };
  });
  const bones: Bone[] = limbs.flatMap((limb, limbIndex) => limb.joints.slice(0, -1).map((start, index) => {
    const end = limb.joints[index + 1]!;
    return { start, length: Math.hypot(end.x - start.x, end.y - start.y),
      angle: canonicalAngle(end.x - start.x, end.y - start.y, limb.side), side: limb.side, limb: limbIndex, index };
  }));
  // 胴は、吻の先・脚の付け根・総排泄口（swim.bodyWaveStart）を囲む凸多角形。
  const hull = convexHull([
    toPixels(swim.mouthAnchor),
    { x: swim.bodyWaveStart * width, y: axisY },
    ...limbs.map((limb) => limb.joints[0]!),
  ]);
  // 胴と各骨からの距離で重みを決める（近いほど強く従う）。関節の近くは隣り合う骨の動きが混ざり、つながったまま曲がる。
  const softness = width * 0.015;
  const count = VERTICES_X * verticesY;
  const stride = bones.length + 1;
  const weights = new Float32Array(count * stride);
  for (let vertex = 0; vertex < count; vertex++) {
    const point = { x: base[vertex * 2]!, y: base[vertex * 2 + 1]! };
    const raw = [hullDistance(point, hull), ...bones.map((bone) => {
      const joints = limbs[bone.limb]!.joints;
      return segmentDistance(point, joints[bone.index]!, joints[bone.index + 1]!);
    })].map((distance) => 1 / (distance * distance + softness * softness) ** 2);
    const total = raw.reduce((sum, value) => sum + value, 0);
    raw.forEach((value, index) => { weights[vertex * stride + index] = value / total; });
  }
  return { bones, limbs, weights };
}

/** 後脚の伸び（stroke）に合わせた、骨の向き。-1〜0 はたたんだ姿勢から画像の姿勢へ、0〜1 は画像の姿勢から伸ばしきった姿勢へ。 */
function poseAngle(bone: Bone, kind: "hind" | "fore", stroke: number) {
  if (kind === "fore") {
    const target = stroke >= 0 ? FORE_EXTENDED[bone.index]! : FORE_FLEXED[bone.index]!;
    return bone.angle + target * Math.abs(stroke);
  }
  const target = stroke >= 0 ? HIND_EXTENDED[bone.index]! : HIND_FLEXED[bone.index]!;
  const difference = Math.atan2(Math.sin(target - bone.angle), Math.cos(target - bone.angle));
  return bone.angle + difference * Math.abs(stroke);
}

/** 蹴り・滑り・たたむの拍を進める。蹴り始めは、シミュレーションが蹴る拍（kick）に入った瞬間。 */
function advanceStroke(mesh: BodyMesh, { fish, deltaSec }: DeformFrame) {
  const { motion } = mesh;
  const kicking = fish.behaviorMode === "kick";
  let strokeSec = (motion.strokeSec ?? 9) + deltaSec;
  if (kicking && (!motion.kicking || strokeSec > STROKE_PERIOD_SEC)) strokeSec = 0;
  motion.kicking = kicking;
  motion.strokeSec = strokeSec;
  let target: number;
  let rate: number;
  if (strokeSec < POWER_SEC) [target, rate] = [1, 22];
  else if (strokeSec < POWER_SEC + GLIDE_SEC) [target, rate] = [1, 8];
  // 底で休む間は、脚を画像の姿勢（ゆるく広げた姿勢）へゆっくり戻す。
  else if (fish.behaviorMode === "rest") [target, rate] = [0, 1.5];
  else [target, rate] = [RECOVERED_STROKE, 3.5];
  const stroke = motion.stroke ?? 0;
  motion.stroke = stroke + (target - stroke) * (1 - Math.exp(-rate * deltaSec));
  return motion.stroke;
}

// カエルは真上から見た画像（頭が左）で、swim.limbs に脚の関節を書く。
// 後脚は腿・脛・足の3本の骨で、伸び（stroke）に合わせて付け根から順に向きを変え（順運動学）、各頂点は近い骨の動きを重みで混ぜて従う。
// 蹴ると両脚がそろって後ろへ伸びきり、しばらく伸ばしたまま滑り、膝を前へ出してたたみ、次の蹴りに備える。前脚は蹴る間に体へ寄せる。
// 向きを変えるときは画像を反転せず、体の中心（swim.footAnchor）を軸に体の面の中で回る（エイと同じ）。
function deformFrog(mesh: BodyMesh, frame: DeformFrame) {
  const { positions, base, width, height, verticesY, swim, motion } = mesh;
  let rig = rigs.get(base);
  if (!rig) {
    rig = buildRig(mesh);
    rigs.set(base, rig);
  }
  const stroke = advanceStroke(mesh, frame);
  // 各骨の新しい付け根と、画像の姿勢からの回転。
  const moved = rig.bones.map(() => ({ x: 0, y: 0, rotation: 0 }));
  rig.limbs.forEach((limb, limbIndex) => {
    let joint = { ...limb.joints[0]! };
    rig.bones.forEach((bone, boneIndex) => {
      if (bone.limb !== limbIndex) return;
      const angle = poseAngle(bone, limb.kind, stroke);
      moved[boneIndex] = { x: joint.x, y: joint.y, rotation: -bone.side * (angle - bone.angle) };
      joint = { x: joint.x + Math.cos(angle) * bone.length, y: joint.y - bone.side * Math.sin(angle) * bone.length };
    });
  });

  const centerX = swim.footAnchor.x * width;
  const axisY = swim.footAnchor.y * height;
  // 個体ごとに、頭を手前へ回すか奥へ回すかを決めておく。
  const turnSign = motion.detailPhase > Math.PI ? 1 : -1;
  const turn = motion.yaw * turnSign;
  const cosTurn = Math.cos(turn), sinTurn = Math.sin(turn);
  // 休む間は、のどと脇腹がかすかに膨らむ。
  const breathe = 1 + Math.sin(motion.clockSec * Math.PI * 2 * 0.5 + motion.detailPhase) * 0.012 *
    (frame.fish.behaviorMode === "rest" ? 1 : 0.3);
  motion.clockSec += frame.deltaSec;
  const stride = rig.bones.length + 1;
  for (let vertex = 0; vertex < VERTICES_X * verticesY; vertex++) {
    const bx = base[vertex * 2]!, by = base[vertex * 2 + 1]!;
    let x = bx * rig.weights[vertex * stride]!;
    let y = (axisY + (by - axisY) * breathe) * rig.weights[vertex * stride]!;
    rig.bones.forEach((bone, boneIndex) => {
      const weight = rig.weights[vertex * stride + boneIndex + 1]!;
      if (weight < 1e-4) return;
      const { x: jx, y: jy, rotation } = moved[boneIndex]!;
      const dx = bx - bone.start.x, dy = by - bone.start.y;
      const cos = Math.cos(rotation), sin = Math.sin(rotation);
      x += weight * (jx + dx * cos - dy * sin);
      y += weight * (jy + dx * sin + dy * cos);
    });
    const along = x - centerX, lateral = y - axisY;
    positions[vertex * 2] = centerX + along * cosTurn - lateral * sinTurn;
    positions[vertex * 2 + 1] = axisY + (along * sinTurn + lateral * cosTurn) * VIEW_FLATTEN;
  }
}

export const frogRenderer: BodyPlanRenderer = {
  // 細い脚を関節で曲げるため、縦の分割を細かくする。
  verticesY: 22,
  deform: deformFrog,
  pitchScale: 0.7,
  // 体の中心の真下の、見下ろした姿の手前の縁を位置にする。底に伏せても脚がガラスの下端で切れず、回っても位置がずれない。
  pivot: ({ width, height, swim }: { width: number; height: number; swim: SwimStyle }) =>
    ({ x: swim.footAnchor.x * width, y: swim.footAnchor.y * height + height / 2 * VIEW_FLATTEN }),
};

/** 試験用。伸び（stroke）を直接決めて変形する。 */
export function deformFrogAt(mesh: BodyMesh, frame: DeformFrame, stroke: number) {
  mesh.motion.stroke = stroke;
  mesh.motion.strokeSec = 99;
  deformFrog(mesh, { ...frame, deltaSec: 0, fish: { ...frame.fish, behaviorMode: "rest" } });
}
