import { getBodyPlan } from "./bodyPlans";
import { findHabit } from "./habits";
import type {
  AquariumScene, FishInstance, FishSpeciesDefinition, SceneSurface, SurfaceFrame,
  SurfacePoint, TankDefinition,
} from "./types";

export const FULL_SURFACE_FRAME: SurfaceFrame = { x: 0, y: 0, width: 1, height: 1 };

export function worldPoint(point: SurfacePoint, tank: TankDefinition, frame: SurfaceFrame): SurfacePoint {
  return {
    x: (frame.x + point.x * frame.width) * tank.widthCm,
    y: (frame.y + point.y * frame.height) * tank.heightCm,
    depth: point.depth,
  };
}

// 前後の移動距離も水槽の実寸で数える。奥へ進むだけで速く歩かない。
function segmentLength(a: SurfacePoint, b: SurfacePoint, tank: TankDefinition): number {
  return Math.hypot(b.x - a.x, b.y - a.y, (b.depth - a.depth) * tank.depthCm);
}

export function sampleSurface(surface: SceneSurface, progress: number, tank: TankDefinition,
  frame = FULL_SURFACE_FRAME) {
  const points = surface.points.map((point) => worldPoint(point, tank, frame));
  const lengths = points.slice(1).map((point, i) => segmentLength(points[i]!, point, tank));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  let i = 0;
  while (i < lengths.length - 1 && distance > lengths[i]!) distance -= lengths[i++]!;
  const a = points[i]!;
  const b = points[i + 1]!;
  const t = Math.min(1, distance / lengths[i]!);
  return {
    position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    depth: a.depth + (b.depth - a.depth) * t,
    // ガラスに対する比率で保存し、描画時に画面の縦横比へ変換する。
    angle: Math.atan2((b.y - a.y) / tank.heightCm, (b.x - a.x) / tank.widthCm),
    length: total,
  };
}

function connected(a: SurfacePoint, b: SurfacePoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) < 0.00001;
}

/** cover で切り取られる経路も、ガラス内に見える連続区間だけを歩く。 */
export function visibleSurfaceIntervals(surface: SceneSurface, tank: TankDefinition, frame: SurfaceFrame) {
  const points = surface.points.map((p) => worldPoint(p, tank, frame));
  const lengths = points.slice(1).map((p, i) => segmentLength(points[i]!, p, tank));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const intervals: { from: number; to: number }[] = [];
  let traveled = 0;
  const margin = tank.safeMarginCm + 1e-6;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i]!, b = points[i + 1]!;
    let low = 0, high = 1;
    for (const [start, change, maximum] of [[a.x, b.x - a.x, tank.widthCm], [a.y, b.y - a.y, tank.heightCm]]) {
      if (Math.abs(change!) < 1e-12) { if (start! < margin || start! > maximum! - margin) high = -1; }
      else {
        const t1 = (margin - start!) / change!, t2 = (maximum! - margin - start!) / change!;
        low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
      }
    }
    if (high > low) {
      const from = (traveled + lengths[i]! * low) / total, to = (traveled + lengths[i]! * high) / total;
      const last = intervals[intervals.length - 1];
      if (last && Math.abs(last.to - from) < 1e-9) last.to = to; else intervals.push({ from, to });
    }
    traveled += lengths[i]!;
  }
  return intervals;
}

/** 同じ水槽で面を歩くほかの生き物。前をふさがれたら引き返すのに使う。 */
export type SurfaceNeighbor = { id: string; position: { x: number; y: number }; depth: number; bodyLengthCm: number };

/** 表面を歩く生き物だけに使う。経路は水景の情報で、魚種名による分岐を持たない。 */
export function stepSurfaceWalker(fish: FishInstance, species: FishSpeciesDefinition,
  tank: TankDefinition, scene: AquariumScene, frame: SurfaceFrame, deltaSec: number,
  activity: number, neighbors: SurfaceNeighbor[] = []): FishInstance {
  const visible = scene.terrain!.surfaces.map((surface) => ({ surface, intervals: visibleSurfaceIntervals(surface, tank, frame) }))
    .filter((item) => item.intervals.length > 0);
  const surfaces = visible.map((item) => item.surface);
  if (surfaces.length === 0) return { ...fish, surfaceMotion: undefined, velocity: { x: 0, y: 0 },
    position: { x: Math.max(tank.safeMarginCm, Math.min(tank.widthCm - tank.safeMarginCm, fish.position.x)),
      y: Math.max(tank.safeMarginCm, Math.min(tank.heightCm - tank.safeMarginCm, fish.position.y)) } };
  let seed = fish.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let motion = fish.surfaceMotion;
  let surface = motion?.sceneId === scene.id
    ? surfaces.find((item) => item.id === motion!.surfaceId) : undefined;
  if (!surface || !motion) {
    // 最初は複数の面に散らす。水景の切替時も、旧経路を引き継がない。
    surface = surfaces[Math.floor(random() * surfaces.length)]!;
    motion = {
      sceneId: scene.id, surfaceId: surface.id, progress: 0.15 + random() * 0.7,
      direction: fish.facing, pauseSec: random() * 4, grazing: false, angle: 0,
    };
  } else motion = { ...motion };
  const intervals = visible.find((item) => item.surface.id === surface!.id)!.intervals;
  const interval = intervals.reduce((best, item) => {
    const gap = (range: typeof item) => Math.max(range.from - motion!.progress, motion!.progress - range.to, 0);
    return gap(item) < gap(best) ? item : best;
  });
  motion.progress = Math.max(interval.from, Math.min(interval.to, motion.progress));
  const before = sampleSurface(surface, motion.progress, tank, frame);
  // 面の端を越えたら、端点でつながった面へ移る。つながった面がなければ、bounce なら引き返し、そうでなければ端で止まる。
  const crossEnd = (bounce: boolean) => {
    const atEnd = motion!.direction === 1;
    const endpoint = surface!.points[atEnd ? surface!.points.length - 1 : 0]!;
    const candidates = surfaces.flatMap<{ surface: SceneSurface; direction: -1 | 1 }>((candidate) => {
      if (candidate.id === surface!.id) return [];
      const intervals = visible.find((item) => item.surface.id === candidate.id)!.intervals;
      if (connected(endpoint, candidate.points[0]!) && intervals[0]!.from < 1e-9)
        return [{ surface: candidate, direction: 1 as const }];
      if (connected(endpoint, candidate.points[candidate.points.length - 1]!) && intervals[intervals.length - 1]!.to > 1 - 1e-9)
        return [{ surface: candidate, direction: -1 as const }];
      return [];
    });
    const excessCm = Math.abs(motion!.progress - (atEnd ? 1 : 0)) * before.length;
    const next = candidates[Math.floor(random() * candidates.length)];
    if (!next && !bounce) {
      motion!.progress = atEnd ? 1 : 0;
      return;
    }
    if (next) {
      surface = next.surface;
      motion!.surfaceId = surface.id;
      motion!.direction = next.direction;
    } else motion!.direction = atEnd ? -1 : 1;
    const length = sampleSurface(surface!, 0, tank, frame).length;
    motion!.progress = motion!.direction === 1 ? excessCm / length : 1 - excessCm / length;
    motion!.progress = Math.max(0, Math.min(1, motion!.progress));
  };
  if (motion.flee) {
    // 尾を打って後ろ向きに跳ね退く（タコは噴射で飛び退き、両生類は頭を先に這って離れる）。経路の外へは出ず、跳び終えたらしばらく固まる。
    const flee = { ...motion.flee, remainingSec: motion.flee.remainingSec - deltaSec };
    // タコの噴射と両生類の這い逃げは種の最大の速さで。大きな生き物が水槽の端まで一気に飛ばないようにする。
    const burst = species.ecology.speedBodyLengthsPerSec.burst;
    const style = getBodyPlan(species).startle;
    const speed = species.realBodyLengthCm * (style === "jet" || style === "crawl" ? burst : Math.max(6, burst));
    // 噴射の途中で面の端に着いたら、つながった面へ乗り移って逃げ続ける。
    motion.direction = flee.direction;
    motion.progress += flee.direction * speed * deltaSec / before.length;
    if ((motion.progress < interval.from && interval.from > 1e-9) || (motion.progress > interval.to && interval.to < 1 - 1e-9)) {
      motion.progress = Math.max(interval.from, Math.min(interval.to, motion.progress));
    } else if (motion.progress < 0 || motion.progress > 1) {
      crossEnd(false);
      flee.direction = motion.direction;
    }
    motion.flee = flee.remainingSec > 0 ? flee : undefined;
    const sampled = sampleSurface(surface, motion.progress, tank, frame);
    motion.speedCmPerSec = deltaSec > 0 ? Math.hypot(sampled.position.x - before.position.x,
      sampled.position.y - before.position.y, (sampled.depth - before.depth) * tank.depthCm) / deltaSec : 0;
    motion.angle = sampled.angle;
    if (!motion.flee) {
      motion.pauseSec = 1.2 + random() * 1.8;
      // 逃げ終えたら、逃げている間の向きのまま歩き出す（その場で振り返らない）。
      motion.direction = Math.cos(sampled.angle) * flee.facing >= 0 ? 1 : -1;
    }
    return {
      ...fish, position: sampled.position, depth: sampled.depth, facing: flee.facing,
      velocity: deltaSec > 0 ? { x: (sampled.position.x - before.position.x) / deltaSec,
        y: (sampled.position.y - before.position.y) / deltaSec } : { x: 0, y: 0 },
      surfaceMotion: motion, behaviorMode: "kick", behaviorTimeRemainingSec: 0, seed,
    };
  }
  const sideways = getBodyPlan(species).sideways;
  let facing = fish.facing;
  const wasPaused = motion.pauseSec > 0;
  motion.pauseSec = Math.max(0, motion.pauseSec - deltaSec);
  if (motion.pauseSec === 0) motion.burrowed = undefined;
  // 近い奥行きで、進む先に別の個体が近すぎるときは、重ならないよう少し立ち止まって引き返す。
  // 近くにいる個体を先に絞り、いるときだけ進む向きを調べる（エビの多い水槽でも軽く保つ）。
  const close = wasPaused || deltaSec === 0 ? [] : neighbors.filter((other) => other.id !== fish.id &&
    Math.abs(other.depth - before.depth) <= .35 &&
    Math.abs(other.position.x - before.position.x) < (species.realBodyLengthCm + other.bodyLengthCm) * .35);
  if (close.length > 0) {
    const ahead = sampleSurface(surface, Math.max(0, Math.min(1, motion.progress + motion.direction * .01)), tank, frame);
    const heading = Math.sign(ahead.position.x - before.position.x);
    if (heading !== 0 && close.some((other) => Math.sign(other.position.x - before.position.x) === heading)) {
      motion.direction = motion.direction === 1 ? -1 : 1;
      motion.pauseSec = .4 + random() * 1.2;
      motion.grazing = false;
    }
  }
  if (!wasPaused && motion.pauseSec === 0 && deltaSec > 0) {
    const speed = species.realBodyLengthCm * species.ecology.speedBodyLengthsPerSec.cruise * fish.personality.pace *
      (0.45 + 0.55 * Math.min(activity, 1.1));
    motion.progress += motion.direction * speed * deltaSec / before.length;
    if (motion.progress < interval.from && interval.from > 1e-9) {
      motion.progress = Math.min(interval.to, interval.from + (interval.from - motion.progress));
      motion.direction = 1;
    } else if (motion.progress > interval.to && interval.to < 1 - 1e-9) {
      motion.progress = Math.max(interval.from, interval.to - (motion.progress - interval.to));
      motion.direction = -1;
    }
    if (motion.progress < 0 || motion.progress > 1) crossEnd(true);
    const grazing = findHabit(species, "grazing");
    const rest = findHabit(species, "bottomRest");
    // 砂に潜るのは、砂の面で立ち止まったときだけ。
    const burrow = surface.material === "sand" ? findHabit(species, "burrow") : undefined;
    const grazingChance = (grazing?.chancePerMin ?? 0) * activity * fish.personality.exploration;
    const restChance = (rest?.chancePerMin ?? 0) * fish.personality.restfulness / Math.max(activity, 0.3);
    const burrowChance = (burrow?.chancePerMin ?? 0) * fish.personality.restfulness / Math.max(activity, 0.3);
    const chance = grazingChance + restChance + burrowChance;
    if (random() < chance * deltaSec / 60) {
      const pick = random() * chance;
      motion.grazing = pick < grazingChance;
      motion.burrowed = pick >= grazingChance + restChance || undefined;
      const range = (motion.grazing ? grazing : motion.burrowed ? burrow : rest)?.durationSec ?? [6, 12];
      motion.pauseSec = (range[0] + random() * (range[1] - range[0])) * (motion.grazing ? 1 : fish.personality.restfulness);
      // 横歩きの生き物は、立ち止まったときにときどき向きを変える。
      if (sideways && random() < 0.3) facing = facing === 1 ? -1 : 1;
    }
  }
  const sampled = sampleSurface(surface, motion.progress, tank, frame);
  motion.angle = sampled.angle;
  motion.speedCmPerSec = wasPaused || deltaSec === 0 ? 0 : Math.hypot(sampled.position.x - before.position.x,
    sampled.position.y - before.position.y, (sampled.depth - before.depth) * tank.depthCm) / deltaSec;
  const velocity = wasPaused || deltaSec === 0 ? { x: 0, y: 0 } : {
    x: (sampled.position.x - before.position.x) / deltaSec,
    y: (sampled.position.y - before.position.y) / deltaSec,
  };
  // 経路の折返しでも、速度のしきい値に依存せず体を進行方向へ向ける。横歩きの生き物は向きを保つ。
  if (!sideways) facing = Math.cos(sampled.angle) * motion.direction >= 0 ? 1 : -1;
  const alarmSec = Math.max(0, (fish.alarmSec ?? 0) - deltaSec);
  return {
    ...fish, position: sampled.position, depth: sampled.depth, velocity, facing,
    alarmSec: alarmSec > 0 ? alarmSec : undefined,
    terrainGoal: undefined, terrainRoute: undefined, depthMotion: undefined, contact: undefined, homeDepth: undefined,
    surfaceMotion: motion, target: undefined, targetKind: "openWater",
    behaviorMode: motion.pauseSec > 0 ? (motion.grazing ? "forage" : "rest") : "coast",
    behaviorTimeRemainingSec: motion.pauseSec, posture: "level", seed,
  };
}
