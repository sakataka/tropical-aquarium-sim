import { clamp } from "../../core/math";
import type { Vec2 } from "../../core/types";
import { VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame, type SwimStyle } from "./types";

/**
 * 真上から見た画像を、斜め上から見下ろした姿に見せるため、体の面の奥行きを縦に縮める割合（見下ろす角度の正弦）。
 * 腕の先を持ち上げる高さは、その余弦の割合で画面の上へ出る。
 */
const VIEW_FLATTEN = 0.5;
const VIEW_LIFT = Math.sqrt(1 - VIEW_FLATTEN ** 2);
/** 腕のうち、先を持ち上げて反らせる部分の始まり（盤の縁から腕の先までの割合）。 */
const CURL_START = 0.4;
/** 位置に置く点を、盤の中心から見下ろした姿の手前へずらす割合（腕の先までの距離に対する比率）。 */
const PIVOT_FORWARD = 0.6;
/** 這う間に体の面の中で回る速さの上限（ラジアン/秒）と、回る向きが入れ替わる速さ。 */
const SPIN_RATE = 0.02;
const SPIN_DRIFT_HZ = 0.008;

const DEFAULT_RADIAL = { x: 0.5, y: 0.5, radius: 0.1, reach: 0.45 };

function radialOf(swim: SwimStyle) {
  return swim.radial ?? DEFAULT_RADIAL;
}

// ヒトデは真上から見た画像（盤の中心から腕が放射状に伸びる）。管足で面の上を滑るように這い、体は曲げない。
// 這う間は進む側の腕の先を持ち上げて探り（腕の先の眼と管足で周りを確かめる）、ほかの腕の先もゆっくり持ち上げては下ろす。
// 前後がないので画像を反転せず、這う間に体の面の中で少しずつ向きが変わる。餌を食べるときは盤を少し盛り上げ、腕の先を下ろす。
// swim.tailSweepRad が腕の先を反らせる角度、swim.tailBeatHz が探る拍、swim.waveCount が体の周りに並ぶ持ち上げの波の数、
// swim.verticalFlex が腕を体の面の中でしならせる量（柔らかい腕のサンフラワーシースターは大きい）。
function deformSeaStar(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, verticesY, swim, motion } = mesh;
  const radial = radialOf(swim);
  motion.clockSec += deltaSec;
  const ease = (current: number, target: number, rate: number) => current + (target - current) * (1 - Math.exp(-rate * deltaSec));
  const walking = speed > 0.01;
  motion.stepBlend = ease(motion.stepBlend, walking ? 1 : 0, 0.8);
  motion.lift = ease(motion.lift, fish.behaviorMode === "forage" ? 1 : 0, 0.5);
  const resting = fish.behaviorMode === "rest" ? 1 : 0;
  // 這う間だけ、回る向きをゆっくり入れ替えながら少しずつ回る。
  motion.spin = (motion.spin ?? 0) +
    deltaSec * SPIN_RATE * motion.stepBlend * Math.sin(motion.clockSec * SPIN_DRIFT_HZ * Math.PI * 2 + motion.detailPhase);
  const spin = motion.spin;
  const cosSpin = Math.cos(spin);
  const sinSpin = Math.sin(spin);
  // 進む向きを、回った体の面の中の角度に直す。向き（yaw）は折り返すときにばねで回るので、持ち上げる腕も滑らかに移る
  // （yaw 0 は左、π は右へ進む）。
  const heading = Math.PI - motion.yaw - spin;
  const t = motion.clockSec * swim.tailBeatHz * Math.PI * 2;
  const centerX = radial.x * width;
  const centerY = radial.y * height;
  const discRadius = radial.radius * width;
  const armLength = Math.max(1e-6, radial.reach * width - discRadius);
  const curlStart = armLength * CURL_START;
  // 休む間は腕の先をほとんど動かさず、食べる間は下ろす。
  const searching = (1 - motion.lift * 0.8) * (1 - resting * 0.6);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    const dx = bx - centerX;
    const dy = by - centerY;
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    const along = Math.max(0, r - discRadius);
    const tip = clamp(along / armLength, 0, 1.4);
    // 進む側の腕ほど先を高く持ち上げ、ほかの腕の先は体の周りを巡る波でゆっくり上下する。
    const lead = Math.max(0, Math.cos(theta - heading)) ** 2;
    const wave = 0.5 + 0.5 * Math.sin(t + swim.waveCount * theta + motion.detailPhase);
    const curl = swim.tailSweepRad * searching * (motion.stepBlend * (0.3 + 0.7 * lead) + 0.45 * wave);
    // 腕は盤の縁から CURL_START までまっすぐで、そこから先ほど反る（曲がりが一様な弧）。
    const bend = Math.max(0, along - curlStart);
    const k = curl / Math.max(1e-6, armLength - curlStart);
    let lift = 0;
    let radius = r;
    if (bend > 0 && Math.abs(k) > 1e-6) {
      lift = (1 - Math.cos(k * bend)) / k;
      radius = r - bend + Math.sin(k * bend) / k;
    }
    // 柔らかい腕は、体の面の中でもゆっくりしなる。
    const sway = swim.verticalFlex * tip * tip * Math.sin(t * 0.7 + 2 * theta + motion.detailPhase * 1.7);
    // 食べる間は盤を少し盛り上げる。
    lift += motion.lift * discRadius * 0.12 * Math.max(0, 1 - r / (discRadius * 1.6));
    const angle = theta + sway;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const rotatedX = x * cosSpin - y * sinSpin;
    const rotatedY = x * sinSpin + y * cosSpin;
    positions[index * 2] = centerX + rotatedX;
    positions[index * 2 + 1] = centerY + rotatedY * VIEW_FLATTEN - lift * VIEW_LIFT;
  }
}

/** 盤の中心の、見下ろした姿で手前寄りの点。手前の砂の面でも、手前の腕がガラスの下端で切れにくい。 */
function seaStarPivot({ width, height, swim }: { width: number; height: number; swim: SwimStyle }): Vec2 {
  const radial = radialOf(swim);
  return { x: radial.x * width, y: radial.y * height + radial.reach * width * VIEW_FLATTEN * PIVOT_FORWARD };
}

export const seaStarRenderer: BodyPlanRenderer = {
  verticesY: 21,
  deform: deformSeaStar,
  pitchScale: 0,
  surfaceTilt: 0.3,
  pivot: seaStarPivot,
};
