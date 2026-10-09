import { clamp, smoothstep } from "../../core/math";
import type { Vec2 } from "../../core/types";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame, type SwimStyle } from "./types";

/** 這う拍で、頭と足の前が前へ伸びる量（画像の横幅に対する比率）。足の後ろは半分だけ遅れて縮む。 */
const STRETCH = 0.025;
/** 殻へ引っ込めた軟体を集める位置。殻の楕円の中心から縁までのうち、この割合の所（縁より少し内側）。 */
const RETRACT_TO_RIM = 0.92;
/** 驚いたときに触角・鰓を縮める割合。 */
const FEELER_SHRINK = { tentacle: 0.85, rhinophore: 0.8, gill: 0.75 } as const;
/** 殻のないウミウシが驚いて体を縮める割合（長さ）と、丸まって高くなる割合。 */
const SLUG_CONTRACT = 0.12;
const SLUG_ROUND = 0.08;
/** 触角を揺らす拍 (Hz)。 */
const FEELER_HZ = 0.35;
/** ついばむ（歯舌で面を削る）拍 (Hz)。 */
const RASP_HZ = 1.1;

type Ellipse = { x: number; y: number; rx: number; ry: number };

/** 殻の楕円のうち、点が最も内側にあるもの（正規化した距離 d が1未満なら殻の中）。 */
function nearestShell(x: number, y: number, shells: Ellipse[]): { shell?: Ellipse; d: number } {
  let best: Ellipse | undefined;
  let d = Infinity;
  for (const shell of shells) {
    const distance = Math.hypot((x - shell.x) / shell.rx, (y - shell.y) / shell.ry);
    if (distance < d) {
      d = distance;
      best = shell;
    }
  }
  return { shell: best, d };
}

// 巻貝・ウミウシは斜め上から見た画像（頭が左）。巻貝は殻（swim.shell の楕円の和）を動かさず、殻の外の軟体（頭と足）を
// 這う拍（swim.tailBeatHz）に合わせて伸び縮みさせる。頭と足の前が前へ伸び、足の後ろが遅れて縮み、殻は足の上でかすかに揺れる。
// 触角（swim.feelers）は付け根を軸に、先ほど大きく曲げて揺らす（swim.tailSweepRad が振れ角）。足の下の縁は、頭から尾へ
// 送る波（swim.waveCount 個、振れ幅 swim.verticalFlex）でかすかに波打つ。殻のないウミウシは体全体が軟体で、外套膜の縁が波打つ。
// ついばむ間（forage）は頭を面へ下げて歯舌で削る拍を付け、触角の先を下ろす。
// 叩かれると（alarmSec）、触角を縮め、軟体を殻の縁の内側へ集めて殻へ引っ込み、殻を面まで下ろす。構えを解くとゆっくり体を出す。
// ウミウシは触角と鰓を縮め、体を短く丸める。
function deformGastropod(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, swim, motion } = mesh;
  motion.clockSec += deltaSec;
  const ease = (current: number, target: number, rise: number, fall: number) =>
    current + (target - current) * (1 - Math.exp(-(target > current ? rise : fall) * deltaSec));
  motion.stepBlend = ease(motion.stepBlend, speed > 0.005 ? 1 : 0, 1.5, 1);
  // 叩かれると素早く引っ込み、構えを解くと数秒かけて体を出す。
  motion.flick = ease(motion.flick, (fish.alarmSec ?? 0) > 0 ? 1 : 0, 5, 0.6);
  motion.lift = ease(motion.lift, fish.behaviorMode === "forage" ? 1 : 0, 1.2, 1.5);
  motion.stridePhase = (motion.stridePhase + deltaSec * swim.tailBeatHz * Math.PI * 2 * motion.stepBlend) % (Math.PI * 200);
  const t = motion.clockSec;
  const shells = (swim.shell ?? []).map((shell) => ({
    x: shell.x * width, y: shell.y * height, rx: shell.rx * width, ry: shell.ry * height,
  }));
  const footX = swim.footAnchor.x * width;
  const footY = swim.footAnchor.y * height;
  const retract = motion.flick;
  // 触角は体より先に縮み、体を出しきってから伸びる。
  const feelerRetract = clamp(retract * 1.6, 0, 1);
  const elongation = 0.5 + 0.5 * Math.sin(motion.stridePhase);
  const stretch = STRETCH * width * motion.stepBlend * (1 - retract);
  const lag = motion.stridePhase - 0.8;
  const shellDx = stretch * 0.25 * Math.sin(lag);
  const shellDy = -height * 0.004 * motion.stepBlend * Math.max(0, Math.sin(lag));
  const shellBottom = Math.max(...shells.map((shell) => shell.y + shell.ry));
  const drop = shells.length > 0 ? Math.max(0, footY - shellBottom) * retract : 0;
  const rasp = height * motion.lift * (0.025 + 0.008 * Math.sin(t * RASP_HZ * Math.PI * 2 + motion.detailPhase));
  const ripple = swim.verticalFlex * height * (0.4 + 0.6 * motion.stepBlend) * (1 - retract);
  const ripplePhase = t * swim.tailBeatHz * 1.3 * Math.PI * 2;
  const omega = FEELER_HZ * Math.PI * 2;
  const feelers = (swim.feelers ?? []).map((feeler, index) => {
    const bx = feeler.base.x * width, by = feeler.base.y * height;
    const dx = feeler.tip.x * width - bx, dy = feeler.tip.y * height - by;
    const length = Math.hypot(dx, dy);
    const phase = index * 1.7 + motion.detailPhase;
    const sway = Math.sin(t * omega + phase) * 0.7 + Math.sin(t * omega * 1.73 + phase * 2.1) * 0.3;
    const amplitude = swim.tailSweepRad * (feeler.kind === "tentacle" ? 0.45 + 0.55 * motion.stepBlend
      : feeler.kind === "rhinophore" ? 0.4 : 0.3);
    // ついばむ間は、頭の触角の先を面へ下ろす（左を向いた触角を反時計回りに回す）。
    const lower = feeler.kind === "tentacle" ? -0.25 * motion.lift : 0;
    const pulse = feeler.kind === "gill" ? 1 + 0.05 * Math.sin(t * 0.25 * Math.PI * 2 + phase) : 1;
    return {
      bx, by, ux: dx / length, uy: dy / length, length, half: feeler.width * width,
      angle: amplitude * sway + lower,
      shrink: (1 - FEELER_SHRINK[feeler.kind] * feelerRetract) * pulse,
    };
  });
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    const near = shells.length > 0 ? nearestShell(bx, by, shells) : { shell: undefined, d: Infinity };
    const shellWeight = 1 - smoothstep(0.98, 1.1, near.d);
    const soft = 1 - shellWeight;
    const front = clamp((footX - bx) / Math.max(1e-6, footX), 0, 1);
    const rear = clamp((bx - footX) / Math.max(1e-6, width - footX), 0, 1);
    let x = bx + soft * stretch * (-elongation * front + 0.5 * (1 - elongation) * rear);
    let y = by + soft * smoothstep(0.3, 1, front) * rasp;
    const lower = smoothstep(footY - 0.3 * height, footY - 0.05 * height, by);
    y += soft * lower * ripple * Math.sin(Math.PI * 2 * swim.waveCount * (bx / width) - ripplePhase);
    // 触角・鰓は付け根を軸に、先ほど大きく回して曲げ、驚くと付け根へ縮める。範囲が重なる所は重みで平均する。
    let weightSum = 0, moveX = 0, moveY = 0;
    for (const feeler of feelers) {
      const rx = bx - feeler.bx, ry = by - feeler.by;
      const along = (rx * feeler.ux + ry * feeler.uy) / feeler.length;
      const across = Math.abs(rx * feeler.uy - ry * feeler.ux);
      const weight = (1 - smoothstep(feeler.half, feeler.half * 2, across)) * smoothstep(-0.15, 0.2, along) * soft;
      if (weight <= 0) continue;
      const angle = feeler.angle * clamp(along, 0, 1.2);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      moveX += weight * ((rx * cos - ry * sin) * feeler.shrink - rx);
      moveY += weight * ((rx * sin + ry * cos) * feeler.shrink - ry);
      weightSum += weight;
    }
    if (weightSum > 0) {
      const norm = Math.max(1, weightSum);
      x += moveX / norm;
      y += moveY / norm;
    }
    x += shellWeight * shellDx;
    y += shellWeight * shellDy;
    if (near.shell) {
      // 殻の外の軟体は、殻の縁の内側へ集めて引っ込める。殻は面まで下ろす。
      const shell = near.shell;
      const scale = near.d > RETRACT_TO_RIM ? RETRACT_TO_RIM / near.d : 1;
      const targetX = shell.x + (bx - shell.x) * scale + shellDx;
      const targetY = shell.y + (by - shell.y) * scale;
      x += (targetX - x) * retract * soft;
      y += (targetY - y) * retract * soft + drop;
    } else {
      // 殻のないウミウシは、体を短く丸める。
      x = footX + (x - footX) * (1 - SLUG_CONTRACT * retract);
      y = footY + (y - footY) * (1 + SLUG_ROUND * retract);
    }
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = y;
  }
}

/** 足の裏が面に着く点。這っても、殻に引っ込んでも動かさない。 */
function gastropodPivot({ width, height, swim }: { width: number; height: number; swim: SwimStyle }): Vec2 {
  return { x: swim.footAnchor.x * width, y: swim.footAnchor.y * height };
}

export const gastropodRenderer: BodyPlanRenderer = {
  verticesY: 16,
  deform: deformGastropod,
  pitchScale: 0,
  surfaceTilt: 0.6,
  pivot: gastropodPivot,
};
