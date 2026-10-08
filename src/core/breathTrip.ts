import { breathIntervalSec, findHabit } from "./habits";
import { clamp, lerp } from "./math";
import { stepSurfaceWalker, type SurfaceNeighbor } from "./surfaceMotion";
import { insideTerrain } from "./terrainMotion";
import type { AquariumScene, FishInstance, FishSpeciesDefinition, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { getWaterColumn, waterCeilingCm } from "./waterColumn";

type BreathTrip = NonNullable<FishInstance["breathTrip"]>;

/** 水面で息を吸う秒数。 */
const BREATHE_SEC: [number, number] = [1, 2.2];
/** 息継ぎに上がれなかったとき、次に試すまでの秒数。 */
const RETRY_SEC: [number, number] = [2, 5];
/** 沈むときは上がるときよりゆっくり。 */
const SINK_PACE = 0.75;
/** 道のりのうち、面から離れきるまで（戻るときは面に着き始めてから）の割合。描画の接地をここで緩める。 */
const CONTACT_SPAN = 0.3;

/**
 * 面を歩く生き物（両生類）を1歩進める。息継ぎの習性（airBreathing）があれば、間隔が来たときに
 * 面を離れて水面へ泳ぎ上がり、息を吸ってから元の点へ戻って歩き続ける。
 */
export function stepWalker(fish: FishInstance, species: FishSpeciesDefinition, tank: TankDefinition,
  scene: AquariumScene, frame: SurfaceFrame, deltaSec: number, activity: number,
  neighbors: SurfaceNeighbor[]): FishInstance {
  if (fish.breathTrip) {
    if (fish.breathTrip.sceneId === scene.id) return stepBreathTrip(fish, species, deltaSec);
    // 水景が替わったら、歩く経路ごと置き直す。
    fish = { ...fish, breathTrip: undefined, contact: undefined };
  }
  const habit = findHabit(species, "airBreathing");
  if (!habit || deltaSec === 0) return stepSurfaceWalker(fish, species, tank, scene, frame, deltaSec, activity, neighbors);
  let seed = fish.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const nextBreathSec = (fish.nextBreathSec ?? breathIntervalSec(habit, random) * random()) - deltaSec;
  const motion = fish.surfaceMotion;
  // 息継ぎを始める刻みは歩かずに、今いる点から上がり始める（坂の途中でも奥行きが飛ばない）。
  const trip = nextBreathSec <= 0 && motion?.sceneId === scene.id && !motion.flee
    ? planBreathTrip(fish, species, tank, scene, frame, random) : undefined;
  if (!trip) {
    const walked = stepSurfaceWalker({ ...fish, seed }, species, tank, scene, frame, deltaSec, activity, neighbors);
    return { ...walked, nextBreathSec: nextBreathSec > 0 ? nextBreathSec : lerp(RETRY_SEC[0], RETRY_SEC[1], random()) };
  }
  return {
    ...fish, surfaceMotion: undefined, breathTrip: trip, velocity: { x: 0, y: 0 },
    facing: trip.apex.x > trip.perch.x ? 1 : -1,
    contact: { angle: trip.resume.angle, kind: "belly", weight: 1 },
    targetKind: "surfaceVisit", behaviorMode: "kick", behaviorTimeRemainingSec: 0,
    nextBreathSec: breathIntervalSec(habit, random), seed,
  };
}

/**
 * 今いる点から水面へ上がる道筋を決める。体の向きの前へ斜めに上がり、前が壁や岩でふさがっていれば後ろへ。
 * 長い体で真上へ立ち上がるようには上がらない。帰りも同じ道筋を通るので、道筋のどこにも岩がないことを先に確かめる。
 * 上がれなければ undefined（歩いて場所を変えてから、また試す）。
 */
export function planBreathTrip(fish: FishInstance, species: FishSpeciesDefinition, tank: TankDefinition,
  scene: AquariumScene, frame: SurfaceFrame, random: () => number): BreathTrip | undefined {
  if (!fish.surfaceMotion) return undefined;
  const water = getWaterColumn(tank, scene, frame);
  const bodyLength = species.realBodyLengthCm;
  // 体を水平に戻したときに、鼻先が水面に届く高さ。
  const apexY = waterCeilingCm(water, tank, fish.depth) + bodyLength * 0.06;
  const rise = fish.position.y - apexY;
  if (rise < bodyLength * 0.3) return undefined;
  const context = { tank, scene, frame, species };
  const margin = tank.safeMarginCm * 2;
  const clear = (apex: Vec2) => {
    const steps = Math.ceil(Math.hypot(apex.x - fish.position.x, apex.y - fish.position.y) / 1.5);
    for (let i = 0; i <= steps; i++) {
      const point = { x: lerp(fish.position.x, apex.x, i / steps), y: lerp(fish.position.y, apex.y, i / steps) };
      if (insideTerrain(point, fish.depth, context)) return false;
    }
    return true;
  };
  // 斜め35〜48°ほどで上がる。
  const run = rise * lerp(0.9, 1.4, random());
  for (const side of [fish.facing, -fish.facing]) {
    const x = fish.position.x + side * run;
    if (x < margin || x > tank.widthCm - margin) continue;
    const apex = { x, y: apexY };
    if (!clear(apex)) continue;
    return {
      sceneId: scene.id, phase: "rise", perch: { ...fish.position }, apex, progress: 0,
      breatheSec: lerp(BREATHE_SEC[0], BREATHE_SEC[1], random()), resume: fish.surfaceMotion,
    };
  }
  return undefined;
}

// 道筋に沿って、動き出しと着く前はゆっくり進む。
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function stepBreathTrip(fish: FishInstance, species: FishSpeciesDefinition, deltaSec: number): FishInstance {
  const trip = { ...fish.breathTrip! };
  const distance = Math.hypot(trip.apex.x - trip.perch.x, trip.apex.y - trip.perch.y);
  const { cruise, burst } = species.ecology.speedBodyLengthsPerSec;
  // ならした速さ。ease の最大の速さはこの1.5倍なので、瞬発の速さを超えない。
  const speed = species.realBodyLengthCm * Math.min(cruise * 2.5, burst * 0.6) * fish.personality.pace;
  const rate = speed / Math.max(distance, 1e-6);
  if (trip.phase === "rise") {
    trip.progress = Math.min(1, trip.progress + rate * deltaSec);
    if (trip.progress >= 1) trip.phase = "breathe";
  } else if (trip.phase === "breathe") {
    trip.breatheSec -= deltaSec;
    if (trip.breatheSec <= 0) trip.phase = "sink";
  } else {
    trip.progress = Math.max(0, trip.progress - rate * SINK_PACE * deltaSec);
  }
  const along = ease(trip.progress);
  const position = { x: lerp(trip.perch.x, trip.apex.x, along), y: lerp(trip.perch.y, trip.apex.y, along) };
  const velocity = deltaSec > 0
    ? { x: (position.x - fish.position.x) / deltaSec, y: (position.y - fish.position.y) / deltaSec }
    : { x: 0, y: 0 };
  // 上がるときは水面の点へ、沈むときは元の点へ頭を向ける（水面で向き直る）。
  const facing: -1 | 1 = (trip.phase === "sink") === (trip.apex.x > trip.perch.x) ? -1 : 1;
  const contact = { angle: trip.resume.angle, kind: "belly" as const,
    weight: clamp(1 - along / CONTACT_SPAN, 0, 1) };
  if (trip.phase === "sink" && trip.progress <= 0) {
    // 元の点に戻ったら、沈んできた向きのまま歩き出す（その場で振り返らない）。
    const direction: -1 | 1 = Math.cos(trip.resume.angle) * facing >= 0 ? 1 : -1;
    return {
      ...fish, position, velocity, facing, breathTrip: undefined, contact: undefined,
      surfaceMotion: { ...trip.resume, direction, flee: undefined, pauseSec: Math.max(trip.resume.pauseSec, 0.6) },
      targetKind: "openWater", behaviorMode: "rest", behaviorTimeRemainingSec: 0,
    };
  }
  return {
    ...fish, position, velocity, facing, breathTrip: trip, contact,
    targetKind: trip.phase === "sink" ? "descend" : "surfaceVisit",
    behaviorMode: trip.phase === "breathe" ? "pause" : "kick", behaviorTimeRemainingSec: 0,
  };
}
