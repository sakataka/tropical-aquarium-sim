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

/** 表面を歩く生き物だけに使う。経路は水景の情報で、魚種名による分岐を持たない。 */
export function stepSurfaceWalker(fish: FishInstance, species: FishSpeciesDefinition,
  tank: TankDefinition, scene: AquariumScene, frame: SurfaceFrame, deltaSec: number,
  activity: number): FishInstance {
  const surfaces = scene.terrain!.surfaces;
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
  const before = sampleSurface(surface, motion.progress, tank, frame);
  const wasPaused = motion.pauseSec > 0;
  motion.pauseSec = Math.max(0, motion.pauseSec - deltaSec);
  if (!wasPaused && deltaSec > 0) {
    const speed = species.realBodyLengthCm * species.ecology.speedBodyLengthsPerSec.cruise *
      (0.45 + 0.55 * Math.min(activity, 1.1));
    motion.progress += motion.direction * speed * deltaSec / before.length;
    if (motion.progress < 0 || motion.progress > 1) {
      const atEnd = motion.direction === 1;
      const endpoint = surface.points[atEnd ? surface.points.length - 1 : 0]!;
      const candidates = surfaces.flatMap<{ surface: SceneSurface; direction: -1 | 1 }>((candidate) => {
        if (candidate.id === surface!.id) return [];
        if (connected(endpoint, candidate.points[0]!)) return [{ surface: candidate, direction: 1 as const }];
        if (connected(endpoint, candidate.points[candidate.points.length - 1]!))
          return [{ surface: candidate, direction: -1 as const }];
        return [];
      });
      const excessCm = Math.abs(motion.progress - (atEnd ? 1 : 0)) * before.length;
      const next = candidates[Math.floor(random() * candidates.length)];
      if (next) {
        surface = next.surface;
        motion.surfaceId = surface.id;
        motion.direction = next.direction;
      } else motion.direction = atEnd ? -1 : 1;
      const length = sampleSurface(surface, 0, tank, frame).length;
      motion.progress = motion.direction === 1 ? excessCm / length : 1 - excessCm / length;
      motion.progress = Math.max(0, Math.min(1, motion.progress));
    }
    const grazing = species.ecology.habits.find((habit) => habit.type === "grazing");
    const rest = species.ecology.habits.find((habit) => habit.type === "bottomRest");
    const grazingChance = (grazing?.chancePerMin ?? 0) * activity;
    const restChance = (rest?.chancePerMin ?? 0) / Math.max(activity, 0.3);
    if (random() < (grazingChance + restChance) * deltaSec / 60) {
      motion.grazing = random() * (grazingChance + restChance) < grazingChance;
      const range = (motion.grazing ? grazing : rest)?.durationSec ?? [6, 12];
      motion.pauseSec = range[0] + random() * (range[1] - range[0]);
    }
  }
  const sampled = sampleSurface(surface, motion.progress, tank, frame);
  motion.angle = sampled.angle;
  const velocity = wasPaused || deltaSec === 0 ? { x: 0, y: 0 } : {
    x: (sampled.position.x - before.position.x) / deltaSec,
    y: (sampled.position.y - before.position.y) / deltaSec,
  };
  // 経路の折返しでも、速度のしきい値に依存せず体を進行方向へ向ける。
  const facing = Math.cos(sampled.angle) * motion.direction >= 0 ? 1 : -1;
  return {
    ...fish, position: sampled.position, depth: sampled.depth, velocity, facing,
    surfaceMotion: motion, target: undefined, targetKind: "openWater",
    behaviorMode: motion.pauseSec > 0 ? (motion.grazing ? "forage" : "rest") : "coast",
    behaviorTimeRemainingSec: motion.pauseSec, posture: "level", seed,
  };
}
