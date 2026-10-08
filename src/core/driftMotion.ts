import { findHabit } from "./habits";
import { worldPoint } from "./surfaceMotion";
import { constrainTerrainStep } from "./terrainMotion";
import type { AquariumScene, FishInstance, FishSpeciesDefinition, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { getWaterColumn, waterCeilingCm, waterY } from "./waterColumn";
import { clamp, lerp, normalize } from "./math";

/** 画像のうち傘（拍動する部分）の範囲。画像の上端を0、下端を1とする比率。 */
export const DEFAULT_BELL = { top: 0, bottom: 0.35 } as const;

/** 傘が縮む拍の割合。残りの時間でゆっくり開く。 */
const CONTRACTION_SHARE = 0.32;
/** 1拍の推力の平均（下の pulseThrust を1拍で平均した値）。 */
const MEAN_THRUST = CONTRACTION_SHARE * 2 / Math.PI;
/** 拍動による速さの立ち上がりと減衰 (1/秒)。小さいほど拍のあとも長く進む。 */
const WATER_DRAG = 1.6;
/** 傘を下にして暮らす種が、底へ沈む速さ (cm/秒)。 */
const SINK_CM_PER_SEC = 1.2;
/** 進む向きへ傾く最大の角度。 */
const MAX_TILT_RAD = 0.42;

/** 傘の縮み具合（0 = 開いている、1 = 最も縮んでいる）。素早く縮み、ゆっくり開く。 */
export function bellContraction(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  if (p < CONTRACTION_SHARE) return Math.sin((p / CONTRACTION_SHARE) * Math.PI / 2);
  const relax = (p - CONTRACTION_SHARE) / (1 - CONTRACTION_SHARE);
  return (1 - relax) ** 2;
}

/** 縮む間だけ水を押し出す推力（0〜1）。 */
function pulseThrust(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  return p < CONTRACTION_SHARE ? Math.sin((p / CONTRACTION_SHARE) * Math.PI) : 0;
}

export function getBell(species: FishSpeciesDefinition) {
  return species.swim?.bell ?? DEFAULT_BELL;
}

/** 傘が画像の下側にある（サカサクラゲのように傘を下にして底で暮らす）。 */
export function isBellDown(species: FishSpeciesDefinition): boolean {
  const bell = getBell(species);
  return bell.top + bell.bottom > 1;
}

export type DriftContext = {
  tank: TankDefinition;
  scene?: AquariumScene;
  frame: SurfaceFrame;
  activity: number;
  /** 同じ水槽のすべての生き物と、その種。重なりを避けるのに使う。 */
  tankmates: FishInstance[];
  catalog: Record<string, FishSpeciesDefinition>;
};

/**
 * 漂う生き物（クラゲ）の1歩。傘を縮める拍で傘の向きへ進み、開く間は水の抵抗で減速しながらゆっくり沈む。
 * 向きは変えず（画像を反転しない）、行き先の方へ傘を少し傾ける。上へ行くときは強く、下へ行くときは弱く拍動する。
 * 傘を下にして暮らす種は、底に伏せたまま拍動し、ときどき少しだけ場所を移す。
 */
export function stepDrifter(fish: FishInstance, species: FishSpeciesDefinition, context: DriftContext,
  deltaSec: number): FishInstance {
  const { tank, activity } = context;
  const water = getWaterColumn(tank, context.scene, context.frame);
  let seed = fish.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bodyLength = species.realBodyLengthCm * fish.bodyLengthVariance;
  const cruise = species.ecology.speedBodyLengthsPerSec.cruise * species.realBodyLengthCm * fish.personality.pace;
  const range = verticalRange(fish, species, tank, water);
  const xRange = horizontalRange(fish, species, tank);
  const swim = species.swim ?? {};
  const pulsing = (swim.tailSweepRad ?? 0.12) > 0;
  const pulseHz = (swim.tailBeatHz ?? 0.8) * fish.personality.pace * lerp(0.55, 1, clamp(activity, 0, 1));
  const pulsePhase = ((fish.pulsePhase ?? random()) + deltaSec * pulseHz) % 1;

  if (isBellDown(species)) return stepBottomPulser(fish, species, context, deltaSec, range, xRange, pulsePhase, random, () => seed);

  // 底で休む習性のあるもの（メンダコ）は、ときどき底に降りて体を広げて伏せ、しばらくしてまた泳ぎ出す。
  const rest = findHabit(species, "bottomRest");
  if (rest && fish.targetKind === "rest") {
    const remaining = fish.behaviorTimeRemainingSec - deltaSec;
    if (remaining > 0) {
      return settle(fish, species, context, deltaSec, range, xRange, remaining,
        ((fish.pulsePhase ?? 0) + deltaSec * RESTING_PULSE_HZ) % 1, () => seed);
    }
    fish = { ...fish, targetKind: "openWater", target: undefined, legTimeSec: undefined };
  } else if (rest && fish.position.y > lerp(range.min, range.max, 0.6) &&
    random() < rest.chancePerMin / 60 * deltaSec * fish.personality.restfulness / Math.max(activity, 0.3)) {
    const duration = lerp(rest.durationSec[0], rest.durationSec[1], random()) * fish.personality.restfulness;
    return settle(fish, species, context, deltaSec, range, xRange, duration, pulsePhase, () => seed);
  }

  // 行き先は生活層の中で選び、着いたか長く向かい続けたら選び直す。
  let target = fish.target;
  let legTimeSec = (fish.legTimeSec ?? 0) + deltaSec;
  const reached = target && Math.hypot(target.x - fish.position.x, target.y - fish.position.y) < Math.max(2.5, bodyLength * 0.6);
  if (!target || reached || legTimeSec > (fish.habitTimeSec ?? 30)) {
    const zone = species.preferredZone;
    target = {
      x: clamp(lerp(tank.widthCm * zone.minX, tank.widthCm * zone.maxX, random()), xRange.min, xRange.max),
      y: clamp(waterY(water, lerp(zone.minY, zone.maxY, random()), fish.depth), range.min, range.max),
    };
    legTimeSec = 0;
    fish = { ...fish, habitTimeSec: lerp(18, 40, random()) };
  }
  const direction = normalize({ x: target.x - fish.position.x, y: target.y - fish.position.y });
  // 上へ向かうほど強く拍動し、下へ向かうときは拍を弱めて沈む。真横なら浮きも沈みもしない。
  const sink = 0.35;
  const effort = pulsing ? clamp(sink - direction.y * 0.8, 0.1, 1.15) : 1;
  const tiltTarget = clamp(direction.x * MAX_TILT_RAD * 1.3, -MAX_TILT_RAD, MAX_TILT_RAD);
  const tilt = (fish.tilt ?? 0) + (tiltTarget - (fish.tilt ?? 0)) * (1 - Math.exp(-0.5 * deltaSec));
  const axis = { x: Math.sin(tilt), y: -Math.cos(tilt) };
  // クシクラゲのように拍動しないものは、繊毛で一定の速さのまま進む。
  const boost = pulsing ? pulseThrust(pulsePhase) / MEAN_THRUST : 1;
  const thrust = pulsing ? cruise * effort * boost : cruise * 0.6;
  const steer = pulsing ? { x: direction.x * cruise * 0.25, y: sink * cruise } : { x: direction.x * cruise * 0.4, y: direction.y * cruise * 0.6 };
  const crowd = crowding(fish, species, context);
  const desired = {
    x: axis.x * thrust * (pulsing ? 1 : 0.3) + steer.x + crowd.x * cruise,
    y: (pulsing ? axis.y * thrust : 0) + steer.y + crowd.y * cruise,
  };
  const response = 1 - Math.exp(-WATER_DRAG * deltaSec);
  let velocity = {
    x: fish.velocity.x + (desired.x - fish.velocity.x) * response,
    y: fish.velocity.y + (desired.y - fish.velocity.y) * response,
  };
  // 拍の山でも、種の最大の速さ（burst）を超えない。
  const top = species.ecology.speedBodyLengthsPerSec.burst * species.realBodyLengthCm * fish.personality.pace;
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > top) velocity = { x: velocity.x * top / speed, y: velocity.y * top / speed };
  let position = {
    x: clamp(fish.position.x + velocity.x * deltaSec, xRange.min, xRange.max),
    y: clamp(fish.position.y + velocity.y * deltaSec, range.min, range.max),
  };
  if (context.scene?.terrain && deltaSec > 0) {
    position = constrainTerrainStep(fish.position, position, fish.depth, { scene: context.scene, tank, species, frame: context.frame });
  }
  if (deltaSec > 0) velocity = { x: (position.x - fish.position.x) / deltaSec, y: (position.y - fish.position.y) / deltaSec };

  // 奥行きもゆっくり漂う。
  let depthMotion = fish.depthMotion;
  let timer = (depthMotion?.remainingSec ?? 0) - deltaSec;
  let depthTarget = depthMotion?.target ?? fish.depth;
  if (timer <= 0) {
    const [minDepth, maxDepth] = species.ecology.depthRange;
    depthTarget = lerp(minDepth, maxDepth, random());
    timer = lerp(15, 35, random());
  }
  const depthStep = cruise * 0.15 / tank.depthCm * deltaSec;
  const depth = fish.depth + clamp(depthTarget - fish.depth, -depthStep, depthStep);
  depthMotion = { target: depthTarget, velocity: 0, remainingSec: timer };

  return {
    ...fish, position, velocity, depth, depthMotion, target, legTimeSec, pulsePhase, tilt,
    targetKind: "openWater", behaviorMode: "coast", behaviorTimeRemainingSec: 1,
    surfaceMotion: undefined, contact: undefined, alarmSec: undefined, seed,
  };
}

/** 底で休む間の、ゆっくりした拍動 (Hz)。 */
const RESTING_PULSE_HZ = 0.12;

/** 底に降りて伏せる。休む残り秒数は behaviorTimeRemainingSec に持つ。 */
function settle(fish: FishInstance, species: FishSpeciesDefinition, context: DriftContext, deltaSec: number,
  range: { min: number; max: number }, xRange: { min: number; max: number }, remainingSec: number, pulsePhase: number,
  currentSeed: () => number): FishInstance {
  const x = clamp(fish.position.x, xRange.min, xRange.max);
  const y = fish.position.y + clamp((restingY(fish, species, context, range, x) - fish.position.y) * (1 - Math.exp(-2 * deltaSec)),
    -SINK_CM_PER_SEC * deltaSec, SINK_CM_PER_SEC * deltaSec);
  return {
    ...fish, position: { x, y }, velocity: { x: 0, y: deltaSec > 0 ? (y - fish.position.y) / deltaSec : 0 },
    pulsePhase, tilt: (fish.tilt ?? 0) * Math.exp(-2 * deltaSec), target: undefined,
    targetKind: "rest", behaviorMode: "rest", behaviorTimeRemainingSec: remainingSec,
    surfaceMotion: undefined, contact: undefined, alarmSec: undefined, seed: currentSeed(),
  };
}

/**
 * 底に伏せたときの傘の中心の高さ (cm)。水景に砂の面があれば、奥の個体ほど奥の砂（画面では上）に伏せる。
 */
function restingY(fish: FishInstance, species: FishSpeciesDefinition, context: DriftContext,
  range: { min: number; max: number }, x: number): number {
  const floor = context.scene?.terrain ? floorY(context.scene, context.tank, context.frame, x, fish.depth) : undefined;
  const bounds = species.sourceBodyBounds;
  const below = species.realBodyLengthCm * fish.bodyLengthVariance * bounds.height / bounds.width * (1 - bellCenter(species));
  return floor === undefined ? range.max : clamp(floor - below, range.min, range.max);
}

function stepBottomPulser(fish: FishInstance, species: FishSpeciesDefinition, context: DriftContext,
  deltaSec: number, range: { min: number; max: number }, xRange: { min: number; max: number }, pulsePhase: number, random: () => number,
  currentSeed: () => number): FishInstance {
  const { tank } = context;
  const bodyLength = species.realBodyLengthCm * fish.bodyLengthVariance;
  const cruise = species.ecology.speedBodyLengthsPerSec.cruise * species.realBodyLengthCm;
  const rest = findHabit(species, "bottomRest");
  // 底に伏せたまま拍動する。ときどき傘の縁で少しだけ這うように場所を移す。
  const restY = (x: number) => restingY(fish, species, context, range, x);
  let target = fish.target ?? { x: fish.position.x, y: restY(fish.position.x) };
  let habitTimeSec = (fish.habitTimeSec ?? lerp(rest?.durationSec[0] ?? 60, rest?.durationSec[1] ?? 240, random())) - deltaSec;
  if (habitTimeSec <= 0) {
    const zone = species.preferredZone;
    const step = bodyLength * lerp(0.5, 1.5, random()) * (random() < 0.5 ? -1 : 1);
    const x = clamp(clamp(fish.position.x + step, tank.widthCm * zone.minX, tank.widthCm * zone.maxX), xRange.min, xRange.max);
    target = { x, y: restY(x) };
    habitTimeSec = lerp(rest?.durationSec[0] ?? 60, rest?.durationSec[1] ?? 240, random());
  }
  const dx = target.x - fish.position.x;
  const crowd = crowding(fish, species, context);
  const vx = clamp(dx * 0.5 + crowd.x * cruise, -cruise, cruise);
  const position = {
    x: clamp(fish.position.x + vx * deltaSec, xRange.min, xRange.max),
    // 水中に生まれたときは、ゆっくり沈んで底に伏せる。
    y: fish.position.y + clamp((restY(fish.position.x) - fish.position.y) * (1 - Math.exp(-2 * deltaSec)), -SINK_CM_PER_SEC * deltaSec, SINK_CM_PER_SEC * deltaSec),
  };
  return {
    ...fish, position, velocity: { x: vx, y: 0 }, target, habitTimeSec, pulsePhase, tilt: 0,
    targetKind: "rest", behaviorMode: "rest", behaviorTimeRemainingSec: 1,
    surfaceMotion: undefined, contact: undefined, alarmSec: undefined, seed: currentSeed(),
  };
}

/**
 * 傘の中心が動ける高さ (cm)。傘の上端が水面から出ず、触手の先が底へ埋まりすぎないようにする。
 * 水槽が小さく収まらないときは、中ほどに置く。
 */
function verticalRange(fish: FishInstance, species: FishSpeciesDefinition, tank: TankDefinition,
  water: ReturnType<typeof getWaterColumn>): { min: number; max: number } {
  const bounds = species.sourceBodyBounds;
  const heightCm = species.realBodyLengthCm * fish.bodyLengthVariance * bounds.height / bounds.width;
  const center = bellCenter(species);
  const min = waterCeilingCm(water, tank, fish.depth) + heightCm * center * 0.9;
  const bottom = tank.heightCm - tank.safeMarginCm;
  // 触手の垂れる種は、触手の先が少し底に隠れるところまで下りてよい。触手のないもの（メンダコ）は体の下端まで。
  const tentacles = !isBellDown(species) && getBell(species).bottom < 0.9;
  const max = bottom - heightCm * (1 - center) * (tentacles ? 0.6 : 1);
  return min <= max ? { min, max } : { min: (min + max) / 2, max: (min + max) / 2 };
}

function bellCenter(species: FishSpeciesDefinition) {
  const bell = getBell(species);
  return (bell.top + bell.bottom) / 2;
}

/** 水景の面（砂底など）の、x の位置と奥行き depth での高さ (cm)。奥行きの近い2本の面の間を補う。 */
function floorY(scene: AquariumScene, tank: TankDefinition, frame: SurfaceFrame, x: number, depth: number): number | undefined {
  const lines: { depth: number; y: number }[] = [];
  for (const surface of scene.terrain.surfaces) {
    const points = surface.points.map((point) => worldPoint(point, tank, frame));
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!, b = points[i + 1]!;
      if ((x - a.x) * (x - b.x) > 0 || a.x === b.x) continue;
      const t = (x - a.x) / (b.x - a.x);
      lines.push({ depth: lerp(a.depth, b.depth, t), y: lerp(a.y, b.y, t) });
      break;
    }
  }
  if (!lines.length) return undefined;
  lines.sort((a, b) => a.depth - b.depth);
  const after = lines.findIndex((line) => line.depth >= depth);
  if (after <= 0) return lines[after === 0 ? 0 : lines.length - 1]!.y;
  const a = lines[after - 1]!, b = lines[after]!;
  return lerp(a.y, b.y, (depth - a.depth) / Math.max(1e-6, b.depth - a.depth));
}

/**
 * 傘の中心が動ける左右の範囲 (cm)。大きなクラゲの傘や触手がガラスの端で切れないよう、体の幅の半分ほどを空ける。
 * 生まれた位置が範囲の外なら、少しずつ内へ戻る（1歩で跳ばない）。
 */
function horizontalRange(fish: FishInstance, species: FishSpeciesDefinition, tank: TankDefinition) {
  const half = species.realBodyLengthCm * fish.bodyLengthVariance * 0.45;
  const min = Math.max(tank.safeMarginCm, half);
  const max = Math.min(tank.widthCm - tank.safeMarginCm, tank.widthCm - half);
  const inner = min <= max ? { min, max } : { min: tank.widthCm / 2, max: tank.widthCm / 2 };
  return { min: Math.min(inner.min, fish.position.x), max: Math.max(inner.max, fish.position.x) };
}

/** ほかの個体と傘が重ならないよう、近い相手から離れる向き（長さはおよそ0〜1）。 */
function crowding(fish: FishInstance, species: FishSpeciesDefinition, context: DriftContext): Vec2 {
  let x = 0;
  let y = 0;
  for (const other of context.tankmates) {
    if (other.id === fish.id) continue;
    const otherLength = context.catalog[other.speciesId]?.realBodyLengthCm;
    if (!otherLength) continue;
    const reach = (species.realBodyLengthCm + otherLength) * 0.55;
    const dx = fish.position.x - other.position.x;
    const dy = fish.position.y - other.position.y;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
    const gap = Math.hypot(dx, dy, (fish.depth - other.depth) * context.tank.depthCm);
    if (gap >= reach || gap < 1e-6) continue;
    const push = (1 - gap / reach) / Math.max(Math.hypot(dx, dy), 0.2);
    x += dx * push;
    y += dy * push;
  }
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}
