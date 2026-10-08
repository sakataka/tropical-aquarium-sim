import { getBodyPlan } from "./bodyPlans";
import { pointInPolygon, insideTerrain } from "./terrainMotion";
import { worldPoint } from "./surfaceMotion";
import { clamp, lerp, smoothstep } from "./math";
import type { AquariumScene, FishInstance, FishSpeciesDefinition, SceneSurface, SurfaceFrame, TankDefinition, Vec2 } from "./types";

type BurrowHome = NonNullable<FishInstance["burrowHome"]>;
type Spot = { position: Vec2; depth: number };

export type BurrowContext = {
  tank: TankDefinition;
  scene?: AquariumScene;
  frame: SurfaceFrame;
  /** 照明に対する活動量（1 が標準）。 */
  activity: number;
  tankmates: FishInstance[];
  catalog: Record<string, FishSpeciesDefinition>;
};

/** 体を出していく速さ・ふつうに引っ込める速さ・驚いて引っ込む速さ（体の割合/秒）。 */
const EMERGE_RATE = 0.08;
const SETTLE_RATE = 0.12;
const RETRACT_RATE = 0.9;
const ALARM_RATE = 3.5;
/** 出している割合の範囲。尾は巣穴に残す。 */
const REACH_RANGE: [number, number] = [0.5, 0.82];
/** 大きな魚が近くにいる間に体を出しておく割合。 */
const WARY_REACH = 0.18;
/** 巣穴の候補を探す間隔 (cm) と、2本の砂の線の間を分ける数。 */
const CANDIDATE_STEP_CM = 3;
const DEPTH_STEPS = 8;
/** 向きをそろえる仲間を数える範囲 (cm)。 */
const COLONY_RADIUS_CM = 90;

/**
 * 巣穴に住む生き物（チンアナゴ）の1ステップ。巣穴の口から動かず、体を出し入れし、ときどき向きを変える。
 * 群れの仲間と同じ向き（流れの来る向き）を向きやすく、大きな魚が近づくと首を引っ込め、暗い間は巣穴にこもる。
 */
export function stepBurrowDweller(fish: FishInstance, species: FishSpeciesDefinition, context: BurrowContext,
  deltaSec: number): FishInstance {
  const sceneId = context.scene?.id ?? "";
  const rng = createRng(fish.seed);
  let seed = fish.seed;
  const random = () => {
    const next = rng();
    seed = next.seed;
    return next.value;
  };
  const awake = smoothstep(0.3, 0.9, context.activity);
  // 生まれたときは、すでに巣穴から体を出している（展示室に入ったときに、みな砂の中から出始めない）。
  const reach = lerp(...REACH_RANGE, random());
  const home: BurrowHome = fish.burrowHome?.sceneId === sceneId ? { ...fish.burrowHome }
    : { ...chooseBurrow(fish, context), emerge: fish.burrowHome?.emerge ?? reach * awake, reach,
      reachSec: lerp(4, 12, random()), hideSec: 0, turnSec: lerp(2, 10, random()) };
  const mouth = burrowPosition(home, context);

  home.reachSec -= deltaSec;
  if (home.reachSec <= 0) {
    home.reach = lerp(...REACH_RANGE, random());
    home.reachSec = lerp(5, 15, random()) * fish.personality.restfulness;
  }
  // 大きな魚が巣穴の上を通るときは、首を低くしてやり過ごし、通り過ぎてからも少し待つ。
  if (threatened(fish, species, home, mouth, context)) home.hideSec = Math.max(home.hideSec, 1 + random());
  const alarmed = (fish.alarmSec ?? 0) > 0;
  home.hideSec = Math.max(0, home.hideSec - deltaSec);
  const target = home.hideSec > 0 ? (alarmed ? 0 : Math.min(WARY_REACH, home.reach * awake)) : home.reach * awake;
  const rate = home.emerge < target ? EMERGE_RATE * fish.personality.pace
    : alarmed ? ALARM_RATE : home.hideSec > 0 ? RETRACT_RATE : SETTLE_RATE;
  home.emerge = home.emerge < target ? Math.min(target, home.emerge + rate * deltaSec)
    : Math.max(target, home.emerge - rate * deltaSec);

  let facing = fish.facing;
  home.turnSec -= deltaSec;
  if (home.turnSec <= 0) {
    const majority = colonyFacing(fish, mouth, context) ?? (random() < 0.5 ? -1 : 1);
    // 群れと逆を向いた個体は、餌を追って振り向いただけなので、すぐに群れの向きへ戻る。
    facing = random() < 0.85 ? majority : majority === 1 ? -1 : 1;
    home.turnSec = facing === majority ? lerp(8, 24, random()) : lerp(2, 6, random());
  }
  return {
    ...fish,
    position: mouth.position,
    depth: mouth.depth,
    velocity: { x: 0, y: 0 },
    facing,
    burrowHome: home,
    behaviorMode: home.emerge < 0.05 ? "rest" : "forage",
    behaviorTimeRemainingSec: 0,
    surfaceMotion: undefined,
    terrainGoal: undefined,
    terrainRoute: undefined,
    contact: undefined,
    target: undefined,
    alarmSec: alarmed ? Math.max(0, fish.alarmSec! - deltaSec) || undefined : undefined,
    seed,
  };
}

/** 巣穴の口の位置 (cm) と奥行き。 */
export function burrowPosition(home: BurrowHome, context: Pick<BurrowContext, "tank" | "scene" | "frame">): Spot {
  const { tank } = context;
  if (!context.scene) return { position: { x: home.x * tank.widthCm, y: home.y * tank.heightCm }, depth: home.depth };
  const point = worldPoint({ x: home.x, y: home.y, depth: home.depth }, tank, context.frame);
  return { position: { x: point.x, y: point.y }, depth: point.depth };
}

/** 体を立てた画像の高さに当たる実寸 (cm)。realBodyLengthCm は画像の横幅に当たる。 */
export function uprightLengthCm(species: FishSpeciesDefinition, fish: FishInstance): number {
  const bounds = species.sourceBodyBounds;
  return species.realBodyLengthCm * bounds.height / bounds.width * fish.bodyLengthVariance;
}

function threatened(fish: FishInstance, species: FishSpeciesDefinition, home: BurrowHome, mouth: Spot,
  context: BurrowContext): boolean {
  const exposed = Math.max(home.emerge, 0.3) * uprightLengthCm(species, fish);
  return context.tankmates.some((other) => {
    if (other.speciesId === fish.speciesId || other.id === fish.id || other.behaviorMode === "rest") return false;
    const otherSpecies = context.catalog[other.speciesId];
    if (!otherSpecies || getBodyPlan(otherSpecies).burrowDwelling || getBodyPlan(otherSpecies).drifts) return false;
    // 自分よりずっと小さな魚には反応しない。
    const size = otherSpecies.realBodyLengthCm * other.bodyLengthVariance;
    if (size < species.realBodyLengthCm * 1.5) return false;
    // 近くで止まっている魚には慣れていて、泳いで近づいてくる魚にだけ反応する。
    const cruise = otherSpecies.realBodyLengthCm * otherSpecies.ecology.speedBodyLengthsPerSec.cruise;
    if (Math.hypot(other.velocity.x, other.velocity.y) < cruise * 0.4) return false;
    // 体を出している高さの中を、体の近くまで来たときだけ。
    const reach = size * 0.25 + 3;
    return Math.abs(other.position.x - mouth.position.x) < reach &&
      other.position.y > mouth.position.y - exposed - 4 && other.position.y < mouth.position.y + 4 &&
      Math.abs(other.depth - mouth.depth) * context.tank.depthCm < size * 0.25 + 4;
  });
}

// 群れは流れの来る向きへそろって顔を向ける。近くの仲間が向いている向き（仲間がいなければ undefined）。
function colonyFacing(fish: FishInstance, mouth: Spot, context: BurrowContext): -1 | 1 | undefined {
  let sum = 0;
  for (const other of context.tankmates) {
    if (other.id === fish.id || !other.burrowHome) continue;
    const otherSpecies = context.catalog[other.speciesId];
    if (!otherSpecies || !getBodyPlan(otherSpecies).burrowDwelling) continue;
    if (Math.hypot(other.position.x - mouth.position.x, (other.depth - mouth.depth) * context.tank.depthCm) > COLONY_RADIUS_CM) continue;
    sum += other.facing;
  }
  return sum === 0 ? undefined : sum > 0 ? 1 : -1;
}

/**
 * 巣穴の口を選ぶ。砂の面と、手前と奥の砂の面の間の砂地から、地形と遮蔽物を避けた点を候補にし、
 * 広く開けた所を群れの中心にして、仲間と間隔をあけて近い順に並べる。
 * すでに巣穴を持つ仲間は動かさず、まだ持たない仲間は id の順に同じ手順で選ぶので、同じステップで選んでも重ならない。
 */
function chooseBurrow(fish: FishInstance, context: BurrowContext): Pick<BurrowHome, "sceneId" | "x" | "y" | "depth"> {
  const { tank, scene, frame } = context;
  const species = context.catalog[fish.speciesId]!;
  const sceneId = scene?.id ?? "";
  const toHome = (spot: Spot) => scene
    ? { sceneId, x: (spot.position.x / tank.widthCm - frame.x) / frame.width,
      y: (spot.position.y / tank.heightCm - frame.y) / frame.height, depth: spot.depth }
    : { sceneId, x: spot.position.x / tank.widthCm, y: spot.position.y / tank.heightCm, depth: spot.depth };
  const candidates = burrowCandidates(species, context);
  if (candidates.length === 0) {
    const floor = { position: { x: clamp(fish.position.x, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
      y: tank.heightCm - tank.safeMarginCm }, depth: fish.depth };
    return toHome(floor);
  }
  const center = colonyCenter(candidates, species, context);
  const occupied: Spot[] = [];
  for (const other of context.tankmates) {
    if (other.id === fish.id || other.burrowHome?.sceneId !== sceneId) continue;
    const otherSpecies = context.catalog[other.speciesId];
    if (otherSpecies && getBodyPlan(otherSpecies).burrowDwelling) occupied.push(burrowPosition(other.burrowHome, context));
  }
  const waiting = context.tankmates.filter((other) => other.id !== fish.id && other.burrowHome?.sceneId !== sceneId &&
    context.catalog[other.speciesId] && getBodyPlan(context.catalog[other.speciesId]!).burrowDwelling && other.id < fish.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const gap = (a: Spot, b: Spot) => Math.hypot(a.position.x - b.position.x, (a.depth - b.depth) * tank.depthCm);
  const pick = (subject: FishInstance) => {
    const subjectSpecies = context.catalog[subject.speciesId]!;
    const spacing = subjectSpecies.ecology.social.spacingBodyLengths * subjectSpecies.realBodyLengthCm;
    let best: Spot | undefined;
    let bestScore = Infinity;
    let fallback = candidates[0]!;
    let fallbackGap = -Infinity;
    for (const spot of candidates) {
      const nearest = occupied.reduce((min, other) => Math.min(min, gap(spot, other)), Infinity);
      if (nearest > fallbackGap) { fallbackGap = nearest; fallback = spot; }
      if (nearest < spacing) continue;
      const score = gap(spot, center);
      if (score < bestScore) { bestScore = score; best = spot; }
    }
    const chosen = best ?? fallback;
    occupied.push(chosen);
    return chosen;
  };
  for (const other of waiting) pick(other);
  return toHome(pick(fish));
}

function burrowCandidates(species: FishSpeciesDefinition, context: BurrowContext): Spot[] {
  const { tank, scene, frame } = context;
  if (!scene?.terrain) return [];
  const sands = scene.terrain.surfaces.filter((surface) => surface.material === "sand");
  const terrain = { scene, tank, frame, species };
  const occluders = scene.terrain.occluders.map((occluder) => ({ depth: occluder.depth,
    polygon: occluder.polygon.map((point) => worldPoint({ ...point, depth: 0 }, tank, frame)) }));
  const [minDepth, maxDepth] = species.ecology.depthRange;
  const margin = tank.safeMarginCm + species.realBodyLengthCm * 0.6;
  const spots: Spot[] = [];
  for (let x = margin; x <= tank.widthCm - margin; x += CANDIDATE_STEP_CM) {
    const hits = sands.flatMap((surface) => sandAt(surface, x, context)).sort((a, b) => a.depth - b.depth);
    const layers = hits.length === 1 ? [hits[0]!]
      : hits.slice(1).flatMap((back, i) => Array.from({ length: DEPTH_STEPS + 1 }, (_, step) => {
        const front = hits[i]!, f = step / DEPTH_STEPS;
        return { position: { x, y: lerp(front.position.y, back.position.y, f) }, depth: lerp(front.depth, back.depth, f) };
      }));
    for (const spot of layers) {
      if (spot.depth < minDepth || spot.depth > maxDepth) continue;
      if (spot.position.y < tank.safeMarginCm || spot.position.y > tank.heightCm - tank.safeMarginCm) continue;
      if (insideTerrain(spot.position, spot.depth, terrain)) continue;
      if (occluders.some((occluder) => occluder.depth < spot.depth && pointInPolygon(spot.position, occluder.polygon))) continue;
      spots.push(spot);
    }
  }
  return spots;
}

// 砂の面の線が x を通る点。
function sandAt(surface: SceneSurface, x: number, context: Pick<BurrowContext, "tank" | "frame">): Spot[] {
  const points = surface.points.map((point) => worldPoint(point, context.tank, context.frame));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
    if (x < low || x > high || high - low < 1e-9) continue;
    const t = (x - a.x) / (b.x - a.x);
    return [{ position: { x, y: lerp(a.y, b.y, t) }, depth: lerp(a.depth, b.depth, t) }];
  }
  return [];
}

// 岩や水槽の端から最も離れた、開けた砂地。同じくらい開けていれば、水槽の中央と、生活層の奥行きの中ほどに近い所。
function colonyCenter(candidates: Spot[], species: FishSpeciesDefinition, context: BurrowContext): Spot {
  const { tank, scene, frame } = context;
  const [minDepth, maxDepth] = species.ecology.depthRange;
  const midDepth = (minDepth + maxDepth) / 2;
  const openness = (spot: Spot) => {
    for (const radius of [60, 40, 25, 12]) {
      const edge = Math.min(spot.position.x, tank.widthCm - spot.position.x);
      const wide = { ...species, realBodyLengthCm: radius * 5 };
      if (edge > radius && !(scene && insideTerrain(spot.position, spot.depth, { scene, tank, frame, species: wide }))) return radius;
    }
    return 0;
  };
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const spot of candidates) {
    const score = openness(spot) - Math.abs(spot.position.x - tank.widthCm / 2) * 0.05 -
      Math.abs(spot.depth - midDepth) * tank.depthCm * 0.05;
    if (score > bestScore) { bestScore = score; best = spot; }
  }
  return best;
}

function createRng(initialSeed: number): () => { value: number; seed: number } {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return { value: seed / 4294967296, seed };
  };
}
