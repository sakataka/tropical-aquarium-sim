import type {
  ActivityPeriod,
  AquariumScene,
  FishHabit,
  FishInstance,
  FishSpeciesDefinition,
  LightingId,
  SimulationInput,
  SimulationOutput,
  SwimGait,
  SurfaceFrame,
  TankDefinition,
  Vec2,
} from "./types";
import { getBodyPlan } from "./bodyPlans";
import { stepBurrowDweller } from "./burrowMotion";
import { stepDrifter } from "./driftMotion";
import { breathIntervalSec, findHabit } from "./habits";
import { getStructurePoints } from "./plateFraming";
import { stepWalker } from "./breathTrip";
import { FULL_SURFACE_FRAME, worldPoint } from "./surfaceMotion";
import { chooseTerrainGoal, constrainTerrainDepth, constrainTerrainStep, findHomeShelter, insideTerrain, resolveTerrainGoal, routeTerrainTarget, terrainAvoidance } from "./terrainMotion";
import { getWaterColumn, waterCeilingCm, waterY, type WaterColumn } from "./waterColumn";
import { add, addMany, clamp, length, lerp, normalize, scale, subtract } from "./math";

const FORWARD_TARGET_CHANCE = 0.86;
const FACING_THRESHOLD_CM_PER_SEC = 0.3;
const WALL_AVOIDANCE_STRENGTH = 4;
const ZONE_HOLD_STRENGTH = 1.1;
/** 前後どちらへも泳ぐ生き物（イカ）が、後ろ向きに進み続けたら向きを変えるまでの秒数。 */
const REVERSE_TURN_SEC = 3;

type GaitProfile = {
  kickDurationSec: number;
  kickIntervalSec: [number, number];
  pauseSec: [number, number];
  dragPerSec: number;
  /** キック中の速度を巡航速度と瞬発速度のどこに置くか。 */
  kickBlend: number;
};

// 泳ぎ方ごとのリズム。魚種ごとの違いは速度・休む割合・群れ方で出す。
const GAITS: Record<SwimGait, GaitProfile> = {
  burstCoast: { kickDurationSec: 0.28, kickIntervalSec: [0.8, 2.2], pauseSec: [0.6, 2], dragPerSec: 0.6, kickBlend: 0.35 },
  steady: { kickDurationSec: 0.7, kickIntervalSec: [0.4, 1.2], pauseSec: [0.5, 1.5], dragPerSec: 0.25, kickBlend: 0.2 },
  glide: { kickDurationSec: 0.6, kickIntervalSec: [2.5, 6], pauseSec: [2, 6], dragPerSec: 0.2, kickBlend: 0.25 },
  undulate: { kickDurationSec: 1.2, kickIntervalSec: [0.3, 0.9], pauseSec: [1, 3], dragPerSec: 0.4, kickBlend: 0.15 },
};

const ACTIVITY_BY_LIGHT: Record<ActivityPeriod, Record<LightingId, number>> = {
  diurnal: { natural: 1, cool: 1, evening: 0.7, night: 0.3 },
  crepuscular: { natural: 0.75, cool: 0.75, evening: 1.1, night: 0.8 },
  nocturnal: { natural: 0.3, cool: 0.3, evening: 0.9, night: 1.1 },
};

/** 照明（昼・夕・夜）に対する魚種の活動量。1 が標準。 */
function getActivityLevel(species: FishSpeciesDefinition, lighting: LightingId): number {
  return ACTIVITY_BY_LIGHT[species.ecology.activityPeriod][lighting];
}

export function stepSimulation(input: SimulationInput): SimulationOutput {
  const deltaSec = clamp(input.deltaSec, 0, 0.25);
  const groups = groupBySpecies(input.fish);
  const lighting = input.lighting ?? "natural";
  const frame = input.surfaceFrame ?? FULL_SURFACE_FRAME;
  const structurePoints = input.structurePoints ??
    (input.scene ? getStructurePoints(input.tank, input.scene, frame) : []);
  const water = getWaterColumn(input.tank, input.scene, frame);
  const walkers = input.fish.flatMap((fish) => {
    const species = input.species[fish.speciesId];
    return species && getBodyPlan(species).walksOnSurfaces && fish.surfaceMotion
      ? [{ id: fish.id, position: fish.position, depth: fish.depth, bodyLengthCm: species.realBodyLengthCm }] : [];
  });
  return {
    fish: input.fish.map((fish) => {
      const species = input.species[fish.speciesId];
      if (!species) return fish;
      if (getBodyPlan(species).drifts) {
        return stepDrifter(fish, species, { tank: input.tank, scene: input.scene, frame, activity: getActivityLevel(species, lighting),
          tankmates: input.fish, catalog: input.species }, deltaSec);
      }
      if (getBodyPlan(species).burrowDwelling) {
        return stepBurrowDweller(fish, species, { tank: input.tank, scene: input.scene, frame,
          activity: getActivityLevel(species, lighting), tankmates: input.fish, catalog: input.species }, deltaSec);
      }
      if (getBodyPlan(species).walksOnSurfaces && input.scene?.terrain) {
        return stepWalker(fish, species, input.tank, input.scene,
          frame, deltaSec, getActivityLevel(species, lighting), walkers);
      }
      // 生まれたばかりの魚（まだ一度も動いていない）は、水槽全体に対する高さを水の部分へ当て直す。
      if (fish.legTimeSec === undefined) fish = placeInWater(fish, input.tank, water);
      return stepFish({
        fish: fish.surfaceMotion ? { ...fish, surfaceMotion: undefined, target: undefined,
          targetKind: "openWater", behaviorMode: "coast", behaviorTimeRemainingSec: 0 } : fish,
        species,
        school: groups.get(fish.speciesId) ?? [],
        tankmates: input.fish,
        catalog: input.species,
        tank: input.tank,
        water,
        structurePoints,
        scene: input.scene,
        frame,
        activity: getActivityLevel(species, lighting),
        deltaSec,
      });
    }),
  };
}

type StepContext = {
  fish: FishInstance;
  species: FishSpeciesDefinition;
  school: FishInstance[];
  /** 同じ水槽のすべての生き物。ほかの種との間合いに使う。 */
  tankmates: FishInstance[];
  catalog: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  water: WaterColumn;
  structurePoints: Vec2[];
  scene?: AquariumScene;
  frame: SurfaceFrame;
  activity: number;
  deltaSec: number;
};

function placeInWater(fish: FishInstance, tank: TankDefinition, water: WaterColumn): FishInstance {
  const place = (point: Vec2) => ({ x: point.x, y: waterY(water, point.y / tank.heightCm, fish.depth) });
  return { ...fish, position: place(fish.position), target: fish.target && place(fish.target) };
}

/** 住みかを持つ魚の、住みかの位置と離れる範囲 (cm)。 */
type HomeRange = { position: Vec2; rangeCm: number };

function stepFish(context: StepContext): FishInstance {
  if (context.fish.terrainGoal && context.fish.terrainGoal.sceneId !== context.scene?.id) {
    context = { ...context, fish: { ...context.fish, terrainGoal: undefined, target: undefined,
      targetKind: "openWater", behaviorMode: "coast", behaviorTimeRemainingSec: 0, habitTimeSec: undefined, terrainRoute: undefined } };
  }
  const { fish, species, school, tank, water, structurePoints, activity, deltaSec } = context;
  const personality = fish.personality;
  const terrain = context.scene?.terrain ? { scene: context.scene, tank, species, frame: context.frame } : undefined;
  const rng = createRng(fish.seed);
  let seed = fish.seed;
  const random = () => {
    const value = rng();
    seed = value.seed;
    return value.value;
  };
  const gait = GAITS[species.ecology.gait];
  const bodyLength = species.realBodyLengthCm;
  let mode = fish.behaviorMode;
  let remaining = fish.behaviorTimeRemainingSec - deltaSec;
  let target = fish.target;
  let targetKind: NonNullable<FishInstance["targetKind"]> = fish.targetKind ?? "openWater";
  let legTimeSec = (fish.legTimeSec ?? 0) + deltaSec;
  let habitTimeSec = fish.habitTimeSec === undefined ? undefined : fish.habitTimeSec - deltaSec;
  let followId = fish.followId;
  const alarmSec = Math.max(0, (fish.alarmSec ?? 0) - deltaSec);
  let terrainGoal = fish.terrainGoal;
  let homeDepth = fish.homeDepth;
  let goalPoint = terrain && terrainGoal ? resolveTerrainGoal(terrainGoal, terrain) : undefined;
  if (goalPoint) target = goalPoint.position;
  const airBreathing = findHabit(species, "airBreathing");
  const homeHabit = findHabit(species, "homeShelter");
  const homeShelter = homeHabit && terrain ? findHomeShelter(fish, terrain.scene, homeHabit.kind) : undefined;
  const home: HomeRange | undefined = homeHabit && homeShelter && terrain
    ? { position: worldPoint(homeShelter, tank, terrain.frame), rangeCm: homeHabit.rangeBodyLengths * bodyLength }
    : undefined;
  const isFree = (point: Vec2) => !terrain || !insideTerrain(point, fish.depth, terrain);
  let nextBreathSec = airBreathing
    ? (fish.nextBreathSec ?? breathIntervalSec(airBreathing, random) * random()) - deltaSec
    : undefined;

  const startOpenWater = () => {
    mode = "coast";
    remaining = lerp(gait.kickIntervalSec[0], gait.kickIntervalSec[1], random()) * 0.5 * personality.restfulness;
    const choice = chooseTarget(fish, species, school, tank, water, structurePoints, random, home, isFree, activity);
    target = choice.position;
    targetKind = choice.kind;
    legTimeSec = 0;
    habitTimeSec = undefined;
    followId = undefined;
    terrainGoal = undefined;
    goalPoint = undefined;
  };

  // 1. 進行中の習性行動を進める。
  // 逃げる先も細かく判定する。大きな生き物は体長の0.8倍の手前で「着いた」とみなすと、逃げ始めてすぐに止まってしまう。
  const precise = targetKind === "rest" || targetKind === "hide" || targetKind === "forage" || targetKind === "home" ||
    targetKind === "flee";
  const reached = target !== undefined && (goalPoint
    ? length(subtract(target, fish.position)) < Math.max(.12, bodyLength * .06)
    : hasReachedTarget(fish, target, species, precise)) &&
    (!goalPoint || Math.abs(goalPoint.depth - fish.depth) * tank.depthCm < Math.max(.08, bodyLength * .04));
  // 隠れ場所への入口が塞がれた場合も、目的地を選び直せるようにする。
  if (terrainGoal && mode !== "rest" && mode !== "forage" && legTimeSec > 90) startOpenWater();
  switch (targetKind) {
    case "rest":
    case "hide":
      if (mode === "rest") {
        const stillHiding = targetKind === "hide" && activity < 0.6;
        // 昼間の長い休止時間を夜へ持ち越さず、明かりが変わったら出口へ泳ぎ出す。
        if (targetKind === "hide" && !stillHiding) { startOpenWater(); break; }
        if ((habitTimeSec ?? 0) <= 0 && !stillHiding) startOpenWater();
        else if ((habitTimeSec ?? 0) <= 0) habitTimeSec = drawHabitDuration(species, "hideByDay", random) * personality.restfulness;
      } else if (reached) {
        mode = "rest";
        habitTimeSec = drawHabitDuration(species, targetKind === "hide" ? "hideByDay" : "bottomRest", random) * personality.restfulness;
      }
      break;
    case "home":
      // 住みかに入ってしばらく休み、また近くを泳ぎ始める。
      if (mode === "rest") {
        if ((habitTimeSec ?? 0) <= 0) startOpenWater();
      } else if (reached) {
        mode = "rest";
        // 驚いて逃げ込んだ物陰からは、しばらく様子をうかがってから出る。
        const [min, max] = homeHabit?.visitDurationSec ?? [6, 14];
        habitTimeSec = lerp(min, max, random()) * personality.restfulness * (alarmSec > 0 ? 1.6 : 1);
      }
      break;
    case "flee":
      // 瞬発で逃げ切ったら、また普段の泳ぎへ戻る。
      if ((habitTimeSec ?? 0) <= 0 || reached) startOpenWater();
      break;
    case "forage":
      if (mode === "forage") {
        if ((habitTimeSec ?? 0) <= 0) startOpenWater();
      } else if (reached) {
        mode = "forage";
        habitTimeSec = drawHabitDuration(species, "grazing", random);
      }
      break;
    case "surfaceVisit":
      if (target && fish.position.y <= target.y + 0.8) {
        // 水面で空気を吸ったら、少し前へ進みながら元の層へ戻る。
        const zone = species.preferredZone;
        target = {
          x: clamp(fish.position.x + fish.facing * lerp(2, 6, random()), tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
          y: waterY(water, lerp(zone.minY, zone.maxY, 0.4 + random() * 0.6), fish.depth),
        };
        targetKind = "descend";
        if (airBreathing?.style === "rise") {
          mode = "pause";
          remaining = lerp(0.8, 1.6, random());
        }
        nextBreathSec = airBreathing ? breathIntervalSec(airBreathing, random) : undefined;
      }
      break;
    case "descend":
      if (reached) startOpenWater();
      break;
    case "follow": {
      const leader = school.find((other) => other.id === followId);
      if (!leader || (habitTimeSec ?? 0) <= 0) {
        startOpenWater();
      } else {
        const leaderHeading = normalize(leader.velocity);
        target = keepInTank(subtract(leader.position, scale(leaderHeading, bodyLength * 1.1)), tank,
          waterCeilingCm(water, tank, fish.depth));
      }
      break;
    }
    default:
      // 目的地に着いたら、通り過ぎて引き返す前に次の目的地へ切り替える。
      if (reached) {
        const choice = chooseTarget(fish, species, school, tank, water, structurePoints, random, home, isFree, activity);
        target = choice.position;
        targetKind = choice.kind;
        legTimeSec = 0;
      }
  }

  // 2. 自由に泳いでいるときだけ、魚種固有の習性を始める。
  // 警戒している間は、採餌や寄り道を始めない。
  if ((targetKind === "openWater" || targetKind === "structure") && mode !== "rest" && mode !== "forage" && alarmSec <= 0) {
    const habit = pickHabit(context, random, nextBreathSec);
    if (habit) {
      target = habit.target;
      targetKind = habit.kind;
      legTimeSec = 0;
      habitTimeSec = habit.durationSec;
      followId = habit.followId;
      terrainGoal = habit.terrainGoal;
      goalPoint = terrain && terrainGoal ? resolveTerrainGoal(terrainGoal, terrain) : undefined;
      if (terrainGoal) homeDepth ??= fish.depth;
      if (habit.kind === "surfaceVisit" || habit.kind === "follow") {
        mode = "kick";
        remaining = gait.kickDurationSec;
      }
    }
  }

  // 3. キック・惰性・停止のリズム。
  if ((mode === "kick" || mode === "coast" || mode === "pause") && remaining <= 0) {
    // 息継ぎ・追いかけ・休み場所への移動と、水の外の巣穴から水へ戻る間は、途中で止まらずに向かう。
    const inTrip = (targetKind !== "openWater" && targetKind !== "structure") ||
      (!terrainGoal && fish.position.y < waterCeilingCm(water, tank, fish.depth));
    if (mode === "kick") {
      mode = "coast";
      remaining = lerp(gait.kickIntervalSec[0], gait.kickIntervalSec[1], random()) * (inTrip ? 0.3 : 1);
    } else if (!inTrip && random() < clamp((species.ecology.restFraction * 1.6 * personality.restfulness) / Math.max(activity, 0.2), 0, 0.9)) {
      mode = "pause";
      remaining = lerp(gait.pauseSec[0], gait.pauseSec[1], random()) * personality.restfulness * (activity < 0.6 ? 2 : 1);
    } else {
      mode = "kick";
      remaining = gait.kickDurationSec;
      // 目的地はキックごとに選び直さず、着いたか長く向かい続けたときだけ変える。
      if ((targetKind === "openWater" || targetKind === "structure") &&
        (!target || legTimeSec > getLegLimitSec(targetKind, random))) {
        const choice = chooseTarget(fish, species, school, tank, water, structurePoints, random, home, isFree, activity);
        target = choice.position;
        targetKind = choice.kind;
        legTimeSec = 0;
      }
    }
  }

  const navigation = terrain && target && mode !== "rest" && mode !== "forage"
    ? routeTerrainTarget(fish, target, terrain) : { target, route: undefined };
  const desired = getDesiredVelocity({ ...context, mode, target: navigation.target, targetKind });
  let velocity = steerVelocity(
    fish.velocity,
    desired,
    // 驚いたときは C 字に体を曲げて一気に向きを変える。
    species.ecology.turnRateRadPerSec * personality.responsiveness *
      (targetKind === "flee" ? 3 : targetKind === "surfaceVisit" || alarmSec > 0 ? 1.6 : 1),
    gait.dragPerSec,
    mode,
    deltaSec,
  );
  // 水面より上へは出ない。巣穴など地形の目的地へ向かう間と、そこから水へ戻る間は、上がらないだけにする。
  const ceiling = terrainGoal ? tank.safeMarginCm : Math.min(fish.position.y, waterCeilingCm(water, tank, fish.depth));
  let position = keepInTank(add(fish.position, scale(velocity, deltaSec)), tank, ceiling);
  let route = navigation.route;
  let depth = fish.depth;
  let depthMotion = fish.depthMotion;
  if (terrain && deltaSec > 0) {
    const proposed = position;
    // 岩を水面より優先する。水面のすぐ下まで岩があるところでは、押し上げられた分だけ水面へ出てよい。
    position = keepInTank(constrainTerrainStep(fish.position, position, depth, terrain), tank);
    // 衝突後も岩へ押す速度を残さない。初期配置の補正は移動速度として扱わない。
    if (!insideTerrain(fish.position, depth, terrain) && length(subtract(position, proposed)) > 1e-8) {
      velocity = scale(subtract(position, fish.position), 1 / deltaSec);
    }
    let timer = (depthMotion?.remainingSec ?? 0) - deltaSec;
    let wander = depthMotion?.target ?? depth;
    if (timer <= 0) {
      const [minDepth, maxDepth] = species.ecology.depthRange;
      wander = lerp(minDepth, maxDepth, random());
      timer = lerp(8, 22, random());
    }
    // 群れの前後方向も近くの仲間へ緩く寄せる。習性行動の目的地を優先する。
    const neighbors = school.filter((other) => other.id !== fish.id && !other.terrainGoal &&
      length(subtract(other.position, fish.position)) < getSchoolRadiusCm(species) * personality.sociability);
    const cohesion = Math.min(.9, species.ecology.social.cohesion * .65 * personality.sociability);
    const schoolDepth = neighbors.length ? neighbors.reduce((sum, f) => sum + f.depth, 0) / neighbors.length : wander;
    const depthTarget = goalPoint?.depth ?? homeDepth ?? lerp(wander, schoolDepth, cohesion);
    const cruise = bodyLength * species.ecology.speedBodyLengthsPerSec.cruise * personality.pace;
    const limit = cruise * (goalPoint || homeDepth !== undefined ? .65 : .2) / tank.depthCm;
    const active = mode === "rest" || mode === "pause" || mode === "forage" ? .25 : activity;
    const desiredDepthVelocity = clamp((depthTarget - depth) * .8, -limit, limit) * (goalPoint ? 1 : active);
    const depthVelocity = (depthMotion?.velocity ?? 0) + (desiredDepthVelocity - (depthMotion?.velocity ?? 0)) * (1 - Math.exp(-2 * personality.responsiveness * deltaSec));
    const candidateDepth = depth + clamp(depthVelocity * deltaSec, -Math.abs(depthTarget - depth), Math.abs(depthTarget - depth));
    const [minDepth, maxDepth] = species.ecology.depthRange;
    const boundedDepth = goalPoint || homeDepth !== undefined ? clamp(candidateDepth, 0, 1)
      : clamp(candidateDepth, minDepth, maxDepth);
    depth = constrainTerrainDepth(position, depth, boundedDepth, terrain, !terrainGoal);
    depthMotion = { target: wander, velocity: Math.abs(depth - candidateDepth) > 1e-9 ? 0 : depthVelocity, remainingSec: timer };
  } else if (!terrain && homeDepth !== undefined) {
    const step = bodyLength * species.ecology.speedBodyLengthsPerSec.cruise * .65 * deltaSec / tank.depthCm;
    depth += clamp(homeDepth - depth, -step, step);
  }
  if (!terrainGoal && homeDepth !== undefined && Math.abs(depth - homeDepth) < .0001) homeDepth = undefined;
  // 岩と壁の狭いすき間で回り込めずに止まったら、反対側から回り、普段の泳ぎなら行き先も選び直す。
  if (route && (mode === "kick" || mode === "coast") && deltaSec > 0) {
    const slow = length(subtract(position, fish.position)) / deltaSec < Math.max(0.05, bodyLength * 0.02);
    const stuckSec = slow ? (route.stuckSec ?? 0) + deltaSec : 0;
    if (stuckSec > 0.6) {
      route = { ...route, side: route.side === 1 ? -1 : 1, stuckSec: 0 };
      if (targetKind === "openWater" || targetKind === "structure") legTimeSec = Number.POSITIVE_INFINITY;
    } else route = { ...route, stuckSec };
  }
  let contact = fish.contact;
  if (goalPoint?.angle !== undefined && (targetKind === "forage" || targetKind === "rest")) {
    const gap = Math.hypot(length(subtract(position, goalPoint.position)), (depth - goalPoint.depth) * tank.depthCm);
    const weight = clamp(1 - gap / Math.max(.3, bodyLength * .65), 0, 1);
    contact = { angle: goalPoint.angle, kind: targetKind === "forage" ? "mouth" : "belly",
      weight: (contact?.weight ?? 0) + (weight - (contact?.weight ?? 0)) * (1 - Math.exp(-4 * deltaSec)) };
  } else if (contact) {
    const weight = contact.weight * Math.exp(-3 * deltaSec);
    contact = weight > .001 ? { ...contact, weight } : undefined;
  }

  return {
    ...fish,
    position,
    velocity,
    depth,
    terrainGoal,
    homeDepth,
    depthMotion: terrain ? depthMotion : undefined,
    terrainRoute: route,
    contact,
    facing: getBodyPlan(species).sideways ? fish.facing
      : getBodyPlan(species).reverses ? reversingFacing(fish.facing, velocity, legTimeSec, targetKind)
      : terrainGoal?.facing && contact && contact.weight > .5 ? terrainGoal.facing : velocity.x < -FACING_THRESHOLD_CM_PER_SEC
      ? -1
      : velocity.x > FACING_THRESHOLD_CM_PER_SEC ? 1 : fish.facing,
    behaviorMode: mode,
    behaviorTimeRemainingSec: remaining,
    target,
    targetKind,
    legTimeSec,
    habitTimeSec,
    followId,
    nextBreathSec,
    alarmSec: alarmSec > 0 ? alarmSec : undefined,
    posture: getPosture(species, tank, position, mode),
    seed,
  };
}

// イカは体の向きを保ったまま後ろへも進む。同じ目的地へ後ろ向きにしばらく進んだときだけ向きを変える。
// 驚いて噴射で飛び退く間は向きを変えない。
function reversingFacing(facing: -1 | 1, velocity: Vec2, legTimeSec: number,
  targetKind: NonNullable<FishInstance["targetKind"]>): -1 | 1 {
  const backward = velocity.x * facing < -FACING_THRESHOLD_CM_PER_SEC;
  return backward && targetKind !== "flee" && legTimeSec > REVERSE_TURN_SEC ? (facing === 1 ? -1 : 1) : facing;
}

type HabitStart = {
  kind: NonNullable<FishInstance["targetKind"]>;
  target: Vec2;
  durationSec?: number;
  followId?: string;
  terrainGoal?: FishInstance["terrainGoal"];
};

function pickHabit(
  context: StepContext,
  random: () => number,
  nextBreathSec: number | undefined,
): HabitStart | undefined {
  const { fish, species, school, tank, water, structurePoints, activity, deltaSec } = context;
  const bottomY = tank.heightCm - tank.safeMarginCm;
  const ceiling = waterCeilingCm(water, tank, fish.depth);
  const perStep = (chancePerMin: number) => random() < (chancePerMin / 60) * deltaSec;
  const homeKind = findHabit(species, "homeShelter")?.kind;
  const terrainHabit = (kind: "hide" | "rest" | "forage"): HabitStart | undefined => {
    if (!context.scene?.terrain) return undefined;
    const terrain = { scene: context.scene, tank, species, frame: context.frame };
    const goal = chooseTerrainGoal(kind, fish, terrain, random, homeKind);
    const point = goal && resolveTerrainGoal(goal, terrain);
    return point ? { kind, target: point.position, terrainGoal: goal } : undefined;
  };

  for (const habit of species.ecology.habits) {
    switch (habit.type) {
      case "airBreathing":
        if (nextBreathSec !== undefined && nextBreathSec <= 0) {
          return {
            kind: "surfaceVisit",
            target: {
              x: keepX(fish.position.x + fish.facing * lerp(1, 4, random()), tank),
              y: ceiling + 0.3,
            },
          };
        }
        break;
      case "hideByDay":
        // 明るい間は物陰の底へ潜り込み、仲間と身を寄せて休む。
        if (activity < 0.6 && perStep(30)) {
          const terrain = terrainHabit("hide");
          if (terrain) return terrain;
          const anchor = structurePoints.length > 0
            ? structurePoints[Math.floor(random() * structurePoints.length)]!
            : { x: fish.position.x < tank.widthCm / 2 ? tank.widthCm * 0.12 : tank.widthCm * 0.88, y: bottomY };
          return {
            kind: "hide",
            target: { x: keepX(anchor.x + lerp(-6, 6, random()), tank), y: bottomY },
          };
        }
        break;
      case "bottomRest": {
        const nearBottom = fish.position.y > waterY(water, 0.72, fish.depth);
        if (nearBottom && perStep(habit.chancePerMin * fish.personality.restfulness / Math.max(activity, 0.3))) {
          const terrain = terrainHabit("rest");
          if (terrain) return terrain;
          return {
            kind: "rest",
            target: { x: keepX(fish.position.x + fish.facing * lerp(0.5, 3, random()), tank), y: bottomY },
          };
        }
        break;
      }
      case "grazing":
        if (perStep(habit.chancePerMin * activity * fish.personality.exploration)) {
          const terrain = terrainHabit("forage");
          if (terrain) return terrain;
          const onStructure = structurePoints.length > 0 && random() < 0.6;
          const point = onStructure
            ? structurePoints[Math.floor(random() * structurePoints.length)]!
            : { x: fish.position.x + fish.facing * lerp(3, 10, random()), y: bottomY - 0.5 };
          return {
            kind: "forage",
            target: {
              x: keepX(point.x + lerp(-4, 4, random()), tank),
              y: getBodyPlan(species).bottomDweller
                ? bottomY
                : clamp(point.y + lerp(-2, 2, random()), ceiling, bottomY),
            },
          };
        }
        break;
      case "follow":
        if (perStep(habit.chancePerMin * activity * fish.personality.sociability)) {
          const leader = findNearest(fish, school, species.realBodyLengthCm * 12);
          if (leader) {
            return {
              kind: "follow",
              target: leader.position,
              durationSec: lerp(habit.durationSec[0], habit.durationSec[1], random()),
              followId: leader.id,
            };
          }
        }
        break;
      case "homeShelter":
        // 明るい間も、ときどき住みかへ戻って身を寄せる。暗いときほど戻りやすい。
        if (perStep(habit.visitChancePerMin * (activity < 0.6 ? 2 : 1))) {
          const terrain = terrainHabit("hide");
          if (terrain) return { ...terrain, kind: "home" };
        }
        break;
      case "bottomForage":
        break;
    }
  }
  return undefined;
}

function chooseTarget(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
  tank: TankDefinition,
  water: WaterColumn,
  structurePoints: Vec2[],
  random: () => number,
  home?: HomeRange,
  isFree: (point: Vec2) => boolean = () => true,
  activity = 1,
): { position: Vec2; kind: "openWater" | "structure" } {
  const zoneMinY = Math.max(waterCeilingCm(water, tank, fish.depth), waterY(water, species.preferredZone.minY, fish.depth));
  const zoneMaxY = Math.min(tank.heightCm - tank.safeMarginCm, waterY(water, species.preferredZone.maxY, fish.depth));
  // 住みかを持つ魚は、住みかを中心にした範囲の中で泳ぐ先を選ぶ（岩の内側は避ける）。
  if (home && !getBodyPlan(species).bottomDweller) {
    let position = home.position;
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = home.rangeCm * Math.sqrt(random());
      position = {
        x: clamp(home.position.x + Math.cos(angle) * radius, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
        // 住みかの真下へは潜り込まず、少し上の水中を中心にする。
        y: clamp(home.position.y - home.rangeCm * 0.2 + Math.sin(angle) * radius * 0.6, zoneMinY, zoneMaxY),
      };
      if (isFree(position)) break;
    }
    return { kind: "openWater", position };
  }
  const point = structurePoints.length > 0
    ? structurePoints[Math.floor(random() * structurePoints.length)]!
    : undefined;
  // 背後の構造物へは、わざわざ引き返してまでは寄りにくい。
  const behind = point !== undefined && (point.x - fish.position.x) * fish.facing < -3;
  // 底を歩くエビは、水中の構造物の中心へ向かって浮き上がらない。
  if (getBodyPlan(species).bottomDweller) {
    return {
      kind: "openWater",
      position: { ...chooseOpenWaterTarget(fish, fish.facing, species, tank, water, random), y: tank.heightCm - tank.safeMarginCm },
    };
  }
  if (point && random() < Math.min(1, species.ecology.structureAffinity * fish.personality.exploration) * (behind ? 0.3 : 1)) {
    return {
      kind: "structure",
      position: {
        x: clamp(point.x + lerp(-5, 5, random()), tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
        // 日常の寄り道でも上層魚・底魚の生活層を保つ。息継ぎなどは別の習性行動で扱う。
        y: clamp(point.y + lerp(-4, 3, random()), zoneMinY, zoneMaxY),
      },
    };
  }
  const heading = getSchoolHeading(fish, species, school);
  return {
    kind: "openWater",
    position: chooseOpenWaterTarget(fish, heading, species, tank, water, random, activity),
  };
}

// 昼行性の中層・下層の魚は、暗い間は生活層の下寄りへ沈んで静かに過ごす。水面に暮らす魚はそのまま。
const NIGHT_SETTLE_ACTIVITY = 0.5;
function getActiveZone(species: FishSpeciesDefinition, activity: number) {
  const zone = species.preferredZone;
  if (activity >= NIGHT_SETTLE_ACTIVITY || zone.maxY <= 0.4) return zone;
  return { ...zone, minY: lerp(zone.minY, zone.maxY, 0.55), maxY: Math.min(0.9, zone.maxY + 0.1) };
}

// 水槽の魚は同じ向きへしばらく泳ぎ、前が詰まったところで折り返す。
function chooseOpenWaterTarget(
  fish: FishInstance,
  heading: -1 | 1,
  species: FishSpeciesDefinition,
  tank: TankDefinition,
  water: WaterColumn,
  random: () => number,
  activity = 1,
): Vec2 {
  const zone = getActiveZone(species, activity);
  const minX = tank.widthCm * zone.minX;
  const maxX = tank.widthCm * zone.maxX;
  const minY = waterY(water, zone.minY, fish.depth);
  const maxY = waterY(water, zone.maxY, fish.depth);
  const room = heading === 1 ? maxX - fish.position.x : fish.position.x - minX;
  const minLeg = Math.max(species.realBodyLengthCm * 2, tank.widthCm * 0.15);
  const keepGoing = room > minLeg && random() < FORWARD_TARGET_CHANCE;
  const direction = keepGoing ? heading : -heading;
  const available = keepGoing
    ? room
    : heading === 1 ? fish.position.x - minX : maxX - fish.position.x;
  const distance = Math.min(available, lerp(minLeg, tank.widthCm * 0.6, random()));
  return {
    x: clamp(fish.position.x + direction * distance, minX, maxX),
    y: clamp(fish.position.y + lerp(-0.16, 0.16, random()) * (tank.heightCm - water.topCm(fish.depth)) * fish.personality.exploration,
      minY, maxY),
  };
}

// 向きのそろった群れを作る魚は、近くの仲間が向かう方向を自分の進行方向として扱う。
function getSchoolHeading(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
): -1 | 1 {
  const social = species.ecology.social;
  if (social.grouping === "solitary" || social.polarization < 0.5) return fish.facing;
  const radius = getSchoolRadiusCm(species) * fish.personality.sociability;
  let sumX = 0;
  for (const other of school) {
    if (other.id === fish.id) continue;
    if (length(subtract(other.position, fish.position)) > radius) continue;
    sumX += other.velocity.x;
  }
  if (Math.abs(sumX) < FACING_THRESHOLD_CM_PER_SEC) return fish.facing;
  return sumX > 0 ? 1 : -1;
}

function getDesiredVelocity(context: StepContext & {
  mode: FishInstance["behaviorMode"];
  target: Vec2 | undefined;
  targetKind: NonNullable<FishInstance["targetKind"]>;
}): Vec2 {
  const { fish, species, school, tank, water, activity, mode, target, targetKind } = context;
  if (mode === "pause") return scale(fish.velocity, 0.12);
  if (mode === "rest" && !fish.terrainGoal) return { x: 0, y: 0 };

  const bodyLength = species.realBodyLengthCm;
  const speeds = species.ecology.speedBodyLengthsPerSec;
  const cruise = speeds.cruise * bodyLength;
  const burst = speeds.burst * bodyLength;
  const pace = 0.45 + 0.55 * Math.min(activity, 1.1);

  if (mode === "forage" || mode === "rest") {
    // 接地点へゆっくり収束し、休止に入った瞬間の慣性で面から離れない。
    const toTarget = target ? subtract(target, fish.position) : { x: 0, y: 0 };
    const creep = fish.terrainGoal ? Math.min(length(toTarget) * 2, bodyLength * 0.2)
      : Math.min(length(toTarget), bodyLength * .12);
    return scale(normalize(toTarget), creep);
  }

  const inHabit = targetKind !== "openWater" && targetKind !== "structure";
  const targetDirection = normalize(subtract(target ?? tankCenter(tank), fish.position));
  const bodyPlan = getBodyPlan(species);
  // 水の外にある巣穴などへ向かう間は、水面で押し戻さない。
  const boundary = boundaryVector(fish.position, tank, fish.terrainGoal ? 0 : water.topCm(fish.depth),
    targetKind === "surfaceVisit" || species.preferredZone.maxY <= 0.25,
    bodyPlan.bottomDweller);
  const zone = inHabit || bodyPlan.bottomDweller ? { x: 0, y: 0 }
    : zoneVector(fish.position, fish.depth, water, species, activity);
  const rawFlock = inHabit ? { x: 0, y: 0 } : schoolingVector(fish, school, species, tank);
  // 群れの引力で後ろ向きに引き戻されると、頻繁に向きが入れ替わってしまう。
  const flock = rawFlock.x * fish.facing < 0
    ? { x: rawFlock.x * 0.2, y: rawFlock.y }
    : rawFlock;
  const structureBias = targetKind === "structure" ? species.ecology.structureAffinity * 0.35 : 0;
  const avoidance = context.scene?.terrain ? terrainAvoidance(fish,
    { scene: context.scene, tank, species, frame: context.frame }) : { x: 0, y: 0 };
  // 岩の近くや回り込みの最中は、狭い隙間で押し合って止まらないよう、ほかの種との間合いを取らない。
  const nearRock = fish.terrainRoute !== undefined || avoidance.x !== 0 || avoidance.y !== 0;
  const direction = normalize(addMany(
    scale(targetDirection, 0.9 + structureBias + (inHabit ? 0.8 : 0)),
    boundary,
    zone,
    flock,
    avoidance,
    // 住みかや物陰へ向かう途中も、ほかの種の体の上を素通りしないよう弱めに間合いを取る。
    nearRock ? { x: 0, y: 0 } : scale(crowdingVector(fish, species, context.tankmates, context.catalog, tank), inHabit ? 0.5 : 1),
  ));

  const kickSpeed = cruise + (burst - cruise) * GAITS[species.ecology.gait].kickBlend;
  let speed = mode === "kick" && bodyPlan.tailKick ? kickSpeed : cruise;
  if (targetKind === "surfaceVisit") {
    const style = findHabit(species, "airBreathing")?.style;
    speed = style === "dash" ? burst * 0.8 : cruise * 1.3;
  } else if (targetKind === "follow") {
    speed = kickSpeed * 1.2;
  } else if (targetKind === "rest" || targetKind === "hide") {
    speed = cruise * 0.8;
  } else if (targetKind === "home") {
    // 住みかへは短く素早く戻る（ハタタテハゼが巣穴へ、クマノミがイソギンチャクへ）。驚いたときはさらに速い。
    speed = (fish.alarmSec ?? 0) > 0 ? Math.max(kickSpeed, burst * 0.8) : kickSpeed;
  } else if (targetKind === "flee") {
    speed = burst;
  }
  if (fish.terrainGoal && target && !fish.terrainRoute) {
    speed = Math.min(speed, Math.max(.04, length(subtract(target, fish.position)) * 1.4));
  }
  const tripPace = targetKind === "surfaceVisit" || targetKind === "flee" || (fish.alarmSec ?? 0) > 0 ? 1 : pace;
  let desiredSpeed = speed * tripPace * (1 - fish.depth * 0.1) * fish.personality.pace;
  // 仲間の実際の速さにも少し合わせる。停止した仲間へ全員が失速するのは避ける。
  const social = species.ecology.social;
  if (!inHabit && social.grouping !== "solitary" && social.polarization > 0) {
    const nearby = school.filter((other) => other.id !== fish.id &&
      (other.behaviorMode === "coast" || other.behaviorMode === "kick") &&
      Math.hypot(length(subtract(other.position, fish.position)), (other.depth - fish.depth) * tank.depthCm)
        < getSchoolRadiusCm(species) * fish.personality.sociability);
    if (nearby.length) {
      const sharedSpeed = nearby.reduce((sum, other) => sum + length(other.velocity), 0) / nearby.length;
      desiredSpeed = lerp(desiredSpeed, clamp(sharedSpeed, desiredSpeed * .8, desiredSpeed * 1.2),
        Math.min(.4, social.polarization * .3 * fish.personality.sociability));
    }
  }
  return scale(direction, desiredSpeed);
}

function schoolingVector(
  fish: FishInstance,
  school: FishInstance[],
  species: FishSpeciesDefinition,
  tank: TankDefinition,
): Vec2 {
  const social = species.ecology.social;
  if (social.grouping === "solitary" || social.cohesion <= 0 || school.length < 2) {
    return { x: 0, y: 0 };
  }
  const radius = getSchoolRadiusCm(species) * fish.personality.sociability;
  // 警戒すると群れは間隔を詰めてまとまる。
  const alarmed = (fish.alarmSec ?? 0) > 0 || school.some((other) => (other.alarmSec ?? 0) > 0);
  const spacing = social.spacingBodyLengths * species.realBodyLengthCm * fish.personality.personalSpace * (alarmed ? 0.7 : 1);
  const tighten = alarmed ? 1.8 : 1;
  let center = { x: 0, y: 0 };
  let alignment = { x: 0, y: 0 };
  let separation = { x: 0, y: 0 };
  let count = 0;
  for (const other of school) {
    if (other.id === fish.id || other.behaviorMode === "rest") continue;
    const delta = subtract(other.position, fish.position);
    const distance = Math.hypot(length(delta), (other.depth - fish.depth) * tank.depthCm);
    if (distance > radius) continue;
    center = add(center, other.position);
    alignment = add(alignment, other.velocity);
    if (distance < spacing) {
      separation = add(separation, scale(normalize(delta), -1 / Math.max(distance, 0.2)));
    }
    count += 1;
  }
  if (count === 0) return { x: 0, y: 0 };
  center = scale(center, 1 / count);
  return addMany(
    scale(normalize(subtract(center, fish.position)), social.cohesion * 0.4 * fish.personality.sociability * tighten),
    scale(normalize(alignment), social.polarization * 0.4 * fish.personality.sociability),
    scale(normalize(separation), 0.7),
  );
}

// ほかの種とは体が重ならない程度の間合いを取る。小さい魚ほど大きい魚に道を譲る。
// 同じ種の間隔は群れの計算（schoolingVector）が受け持つ。
function crowdingVector(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  tankmates: FishInstance[],
  catalog: Record<string, FishSpeciesDefinition>,
  tank: TankDefinition,
): Vec2 {
  let x = 0;
  let y = 0;
  for (const other of tankmates) {
    if (other.speciesId === fish.speciesId) continue;
    const otherLength = catalog[other.speciesId]?.realBodyLengthCm;
    if (!otherLength) continue;
    const reach = (species.realBodyLengthCm + otherLength) * 0.5;
    const dx = fish.position.x - other.position.x;
    const dy = fish.position.y - other.position.y;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
    const distance = Math.hypot(dx, dy, (fish.depth - other.depth) * tank.depthCm);
    if (distance >= reach || distance < 1e-6) continue;
    const yieldShare = otherLength / (species.realBodyLengthCm + otherLength);
    const push = (1 - distance / reach) * yieldShare * 2.4 / Math.max(Math.hypot(dx, dy), 0.2);
    x += dx * push;
    // 上下へよけるほうが自然なので、縦の成分を少し強める。
    y += dy * push * 1.3;
  }
  return { x, y };
}

function boundaryVector(position: Vec2, tank: TankDefinition, surfaceCm: number, allowSurface: boolean,
  allowBottom = false): Vec2 {
  const margin = tank.safeMarginCm * 3.2;
  const strength = WALL_AVOIDANCE_STRENGTH * 0.16;
  return {
    x: position.x < margin
      ? (margin - position.x) * strength
      : position.x > tank.widthCm - margin
        ? -(position.x - (tank.widthCm - margin)) * strength
        : 0,
    y: position.y < surfaceCm + margin && !allowSurface
      ? (surfaceCm + margin - position.y) * strength
      : position.y > tank.heightCm - margin && !allowBottom
        ? -(position.y - (tank.heightCm - margin)) * strength * 0.3
        : 0,
  };
}

function zoneVector(
  position: Vec2,
  depth: number,
  water: WaterColumn,
  species: FishSpeciesDefinition,
  activity: number,
): Vec2 {
  const active = getActiveZone(species, activity);
  const minY = waterY(water, active.minY, depth);
  const maxY = waterY(water, active.maxY, depth);
  const y = position.y < minY ? minY - position.y : position.y > maxY ? maxY - position.y : 0;
  return { x: 0, y: y * ZONE_HOLD_STRENGTH * 0.18 };
}

function steerVelocity(
  current: Vec2,
  desired: Vec2,
  turnRate: number,
  drag: number,
  mode: FishInstance["behaviorMode"],
  deltaSec: number,
): Vec2 {
  const response = 1 - Math.exp(-turnRate * deltaSec);
  const blended = {
    x: current.x + (desired.x - current.x) * response,
    y: current.y + (desired.y - current.y) * response,
  };
  const damping = mode === "rest"
    ? Math.exp(-6 * deltaSec)
    : mode === "pause" ? Math.exp(-4.8 * deltaSec) : Math.exp(-drag * deltaSec * 0.2);
  return scale(blended, damping);
}

function getPosture(
  species: FishSpeciesDefinition,
  tank: TankDefinition,
  position: Vec2,
  mode: FishInstance["behaviorMode"],
): FishInstance["posture"] {
  if (mode === "forage") return "noseDown";
  // 底を探る魚は、底近くでは頭を下げて砂を探る。
  if (mode !== "rest" && findHabit(species, "bottomForage") && position.y > tank.heightCm * 0.82) {
    return "noseDown";
  }
  return "level";
}

function drawHabitDuration(
  species: FishSpeciesDefinition,
  type: "bottomRest" | "hideByDay" | "grazing",
  random: () => number,
): number {
  const habit = findHabit(species, type);
  const range = habit && "durationSec" in habit ? habit.durationSec : [3, 8] as const;
  return lerp(range[0], range[1], random());
}

function getSchoolRadiusCm(species: FishSpeciesDefinition): number {
  return Math.max(6, species.ecology.social.spacingBodyLengths * species.realBodyLengthCm * 5);
}

function getLegLimitSec(targetKind: "openWater" | "structure", random: () => number): number {
  // 群れに引っ張られて目的地に届かない場合でも、いずれは選び直す。
  return targetKind === "structure" ? lerp(10, 22, random()) : lerp(14, 28, random());
}

function hasReachedTarget(
  fish: FishInstance,
  target: Vec2,
  species: FishSpeciesDefinition,
  precise = false,
): boolean {
  const tolerance = precise
    ? Math.max(1.2, species.realBodyLengthCm * 0.25)
    : Math.max(2.5, species.realBodyLengthCm * 0.8);
  return length(subtract(target, fish.position)) < tolerance;
}

function findNearest(fish: FishInstance, school: FishInstance[], maxDistance: number) {
  let nearest: FishInstance | undefined;
  let best = maxDistance;
  for (const other of school) {
    if (other.id === fish.id || other.behaviorMode === "rest") continue;
    const distance = length(subtract(other.position, fish.position));
    if (distance < best) {
      best = distance;
      nearest = other;
    }
  }
  return nearest;
}

function keepInTank(position: Vec2, tank: TankDefinition, ceilingCm = tank.safeMarginCm): Vec2 {
  return {
    x: clamp(position.x, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
    y: clamp(position.y, Math.max(tank.safeMarginCm, ceilingCm), tank.heightCm - tank.safeMarginCm),
  };
}

function keepX(x: number, tank: TankDefinition): number {
  return clamp(x, tank.safeMarginCm * 2, tank.widthCm - tank.safeMarginCm * 2);
}

function groupBySpecies(fish: FishInstance[]): Map<string, FishInstance[]> {
  const groups = new Map<string, FishInstance[]>();
  for (const item of fish) {
    const group = groups.get(item.speciesId) ?? [];
    group.push(item);
    groups.set(item.speciesId, group);
  }
  return groups;
}

function createRng(initialSeed: number): () => { value: number; seed: number } {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return { value: seed / 4294967296, seed };
  };
}

function tankCenter(tank: TankDefinition): Vec2 {
  return { x: tank.widthCm / 2, y: tank.heightCm / 2 };
}
