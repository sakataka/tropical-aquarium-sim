import type {
  ActivityPeriod,
  FishHabit,
  FishHabitType,
  FishInstance,
  FishSpeciesDefinition,
  LightingId,
  SimulationInput,
  SimulationOutput,
  SwimGait,
  TankDefinition,
  Vec2,
} from "./types";

const FORWARD_TARGET_CHANCE = 0.86;
const FACING_THRESHOLD_CM_PER_SEC = 0.3;
const WALL_AVOIDANCE_STRENGTH = 4;
const ZONE_HOLD_STRENGTH = 1.1;

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
export function getActivityLevel(species: FishSpeciesDefinition, lighting: LightingId): number {
  return ACTIVITY_BY_LIGHT[species.ecology.activityPeriod][lighting];
}

export function stepSimulation(input: SimulationInput): SimulationOutput {
  const deltaSec = clamp(input.deltaSec, 0, 0.25);
  const groups = groupBySpecies(input.fish);
  const lighting = input.lighting ?? "natural";
  return {
    fish: input.fish.map((fish) => {
      const species = input.species[fish.speciesId];
      if (!species) return fish;
      return stepFish({
        fish,
        species,
        school: groups.get(fish.speciesId) ?? [],
        tank: input.tank,
        structurePoints: input.structurePoints,
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
  tank: TankDefinition;
  structurePoints: Vec2[];
  activity: number;
  deltaSec: number;
};

function stepFish(context: StepContext): FishInstance {
  const { fish, species, school, tank, structurePoints, activity, deltaSec } = context;
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
  const airBreathing = findHabit(species, "airBreathing");
  let nextBreathSec = airBreathing
    ? (fish.nextBreathSec ?? getBreathIntervalSec(airBreathing, random) * random()) - deltaSec
    : undefined;

  const startOpenWater = () => {
    mode = "coast";
    remaining = lerp(gait.kickIntervalSec[0], gait.kickIntervalSec[1], random()) * 0.5;
    const choice = chooseTarget(fish, species, school, tank, structurePoints, random);
    target = choice.position;
    targetKind = choice.kind;
    legTimeSec = 0;
    habitTimeSec = undefined;
    followId = undefined;
  };

  // 1. 進行中の習性行動を進める。
  const precise = targetKind === "rest" || targetKind === "hide" || targetKind === "forage";
  const reached = target !== undefined && hasReachedTarget(fish, target, species, precise);
  switch (targetKind) {
    case "rest":
    case "hide":
      if (mode === "rest") {
        const stillHiding = targetKind === "hide" && activity < 0.6;
        if ((habitTimeSec ?? 0) <= 0 && !stillHiding) startOpenWater();
        else if ((habitTimeSec ?? 0) <= 0) habitTimeSec = drawHabitDuration(species, "hideByDay", random);
      } else if (reached) {
        mode = "rest";
        habitTimeSec = drawHabitDuration(species, targetKind === "hide" ? "hideByDay" : "bottomRest", random);
      }
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
          y: tank.heightCm * lerp(zone.minY, zone.maxY, 0.4 + random() * 0.6),
        };
        targetKind = "descend";
        if (airBreathing?.style === "rise") {
          mode = "pause";
          remaining = lerp(0.8, 1.6, random());
        }
        nextBreathSec = airBreathing ? getBreathIntervalSec(airBreathing, random) : undefined;
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
        target = keepInTank(subtract(leader.position, scale(leaderHeading, bodyLength * 1.1)), tank);
      }
      break;
    }
    default:
      // 目的地に着いたら、通り過ぎて引き返す前に次の目的地へ切り替える。
      if (reached) {
        const choice = chooseTarget(fish, species, school, tank, structurePoints, random);
        target = choice.position;
        targetKind = choice.kind;
        legTimeSec = 0;
      }
  }

  // 2. 自由に泳いでいるときだけ、魚種固有の習性を始める。
  if ((targetKind === "openWater" || targetKind === "structure") && mode !== "rest" && mode !== "forage") {
    const habit = pickHabit(context, random, nextBreathSec);
    if (habit) {
      target = habit.target;
      targetKind = habit.kind;
      legTimeSec = 0;
      habitTimeSec = habit.durationSec;
      followId = habit.followId;
      if (habit.kind === "surfaceVisit" || habit.kind === "follow") {
        mode = "kick";
        remaining = gait.kickDurationSec;
      }
    }
  }

  // 3. キック・惰性・停止のリズム。
  if ((mode === "kick" || mode === "coast" || mode === "pause") && remaining <= 0) {
    // 息継ぎ・追いかけ・休み場所への移動は、途中で止まらずに向かう。
    const inTrip = targetKind !== "openWater" && targetKind !== "structure";
    if (mode === "kick") {
      mode = "coast";
      remaining = lerp(gait.kickIntervalSec[0], gait.kickIntervalSec[1], random()) * (inTrip ? 0.3 : 1);
    } else if (!inTrip && random() < clamp((species.ecology.restFraction * 1.6) / Math.max(activity, 0.2), 0, 0.9)) {
      mode = "pause";
      remaining = lerp(gait.pauseSec[0], gait.pauseSec[1], random()) * (activity < 0.6 ? 2 : 1);
    } else {
      mode = "kick";
      remaining = gait.kickDurationSec;
      // 目的地はキックごとに選び直さず、着いたか長く向かい続けたときだけ変える。
      if ((targetKind === "openWater" || targetKind === "structure") &&
        (!target || legTimeSec > getLegLimitSec(targetKind, random))) {
        const choice = chooseTarget(fish, species, school, tank, structurePoints, random);
        target = choice.position;
        targetKind = choice.kind;
        legTimeSec = 0;
      }
    }
  }

  const desired = getDesiredVelocity({ ...context, mode, target, targetKind });
  const velocity = steerVelocity(
    fish.velocity,
    desired,
    species.ecology.turnRateRadPerSec * (targetKind === "surfaceVisit" ? 1.6 : 1),
    gait.dragPerSec,
    mode,
    deltaSec,
  );
  const position = keepInTank(add(fish.position, scale(velocity, deltaSec)), tank);

  return {
    ...fish,
    position,
    velocity,
    facing: velocity.x < -FACING_THRESHOLD_CM_PER_SEC
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
    posture: getPosture(species, tank, position, mode),
    seed,
  };
}

type HabitStart = {
  kind: NonNullable<FishInstance["targetKind"]>;
  target: Vec2;
  durationSec?: number;
  followId?: string;
};

function pickHabit(
  context: StepContext,
  random: () => number,
  nextBreathSec: number | undefined,
): HabitStart | undefined {
  const { fish, species, school, tank, structurePoints, activity, deltaSec } = context;
  const bottomY = tank.heightCm - tank.safeMarginCm;
  const perStep = (chancePerMin: number) => random() < (chancePerMin / 60) * deltaSec;

  for (const habit of species.ecology.habits) {
    switch (habit.type) {
      case "airBreathing":
        if (nextBreathSec !== undefined && nextBreathSec <= 0) {
          return {
            kind: "surfaceVisit",
            target: {
              x: keepX(fish.position.x + fish.facing * lerp(1, 4, random()), tank),
              y: tank.safeMarginCm + 0.3,
            },
          };
        }
        break;
      case "hideByDay":
        // 明るい間は物陰の底へ潜り込み、仲間と身を寄せて休む。
        if (activity < 0.6 && perStep(30)) {
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
        const nearBottom = fish.position.y > tank.heightCm * 0.72;
        if (nearBottom && perStep(habit.chancePerMin / Math.max(activity, 0.3))) {
          return {
            kind: "rest",
            target: { x: keepX(fish.position.x + fish.facing * lerp(0.5, 3, random()), tank), y: bottomY },
          };
        }
        break;
      }
      case "grazing":
        if (perStep(habit.chancePerMin * activity)) {
          const onStructure = structurePoints.length > 0 && random() < 0.6;
          const point = onStructure
            ? structurePoints[Math.floor(random() * structurePoints.length)]!
            : { x: fish.position.x + fish.facing * lerp(3, 10, random()), y: bottomY - 0.5 };
          return {
            kind: "forage",
            target: {
              x: keepX(point.x + lerp(-4, 4, random()), tank),
              y: clamp(point.y + lerp(-2, 2, random()), tank.safeMarginCm, bottomY),
            },
          };
        }
        break;
      case "follow":
        if (perStep(habit.chancePerMin * activity)) {
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
  structurePoints: Vec2[],
  random: () => number,
): { position: Vec2; kind: "openWater" | "structure" } {
  const point = structurePoints.length > 0
    ? structurePoints[Math.floor(random() * structurePoints.length)]!
    : undefined;
  // 背後の構造物へは、わざわざ引き返してまでは寄りにくい。
  const behind = point !== undefined && (point.x - fish.position.x) * fish.facing < -3;
  if (point && random() < species.ecology.structureAffinity * (behind ? 0.3 : 1)) {
    return {
      kind: "structure",
      position: {
        x: clamp(point.x + lerp(-5, 5, random()), tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
        y: clamp(point.y + lerp(-4, 3, random()), tank.safeMarginCm, tank.heightCm - tank.safeMarginCm),
      },
    };
  }
  const heading = getSchoolHeading(fish, species, school);
  return {
    kind: "openWater",
    position: chooseOpenWaterTarget(fish, heading, species, tank, random),
  };
}

// 水槽の魚は同じ向きへしばらく泳ぎ、前が詰まったところで折り返す。
function chooseOpenWaterTarget(
  fish: FishInstance,
  heading: -1 | 1,
  species: FishSpeciesDefinition,
  tank: TankDefinition,
  random: () => number,
): Vec2 {
  const zone = species.preferredZone;
  const minX = tank.widthCm * zone.minX;
  const maxX = tank.widthCm * zone.maxX;
  const minY = tank.heightCm * zone.minY;
  const maxY = tank.heightCm * zone.maxY;
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
    y: clamp(fish.position.y + lerp(-0.16, 0.16, random()) * tank.heightCm, minY, maxY),
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
  const radius = getSchoolRadiusCm(species);
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
  const { fish, species, school, tank, activity, mode, target, targetKind } = context;
  if (mode === "pause" || mode === "rest") return scale(fish.velocity, mode === "rest" ? 0 : 0.12);

  const bodyLength = species.realBodyLengthCm;
  const speeds = species.ecology.speedBodyLengthsPerSec;
  const cruise = speeds.cruise * bodyLength;
  const burst = speeds.burst * bodyLength;
  const pace = 0.45 + 0.55 * Math.min(activity, 1.1);

  if (mode === "forage") {
    // ついばむ間は、目的地のまわりをごく小さく探る。
    const toTarget = target ? subtract(target, fish.position) : { x: 0, y: 0 };
    const creep = Math.min(length(toTarget), bodyLength * 0.12);
    return scale(normalize(toTarget), creep);
  }

  const inHabit = targetKind !== "openWater" && targetKind !== "structure";
  const targetDirection = normalize(subtract(target ?? tankCenter(tank), fish.position));
  const boundary = boundaryVector(fish.position, tank, targetKind === "surfaceVisit");
  const zone = inHabit ? { x: 0, y: 0 } : zoneVector(fish.position, tank, species);
  const rawFlock = inHabit ? { x: 0, y: 0 } : schoolingVector(fish, school, species);
  // 群れの引力で後ろ向きに引き戻されると、頻繁に向きが入れ替わってしまう。
  const flock = rawFlock.x * fish.facing < 0
    ? { x: rawFlock.x * 0.2, y: rawFlock.y }
    : rawFlock;
  const structureBias = targetKind === "structure" ? species.ecology.structureAffinity * 0.35 : 0;
  const direction = normalize(addMany(
    scale(targetDirection, 0.9 + structureBias + (inHabit ? 0.8 : 0)),
    boundary,
    zone,
    flock,
  ));

  const kickSpeed = cruise + (burst - cruise) * GAITS[species.ecology.gait].kickBlend;
  let speed = mode === "kick" ? kickSpeed : cruise;
  if (targetKind === "surfaceVisit") {
    const style = findHabit(species, "airBreathing")?.style;
    speed = style === "dash" ? burst * 0.8 : cruise * 1.3;
  } else if (targetKind === "follow") {
    speed = kickSpeed * 1.2;
  } else if (targetKind === "rest" || targetKind === "hide") {
    speed = cruise * 0.8;
  }
  const tripPace = targetKind === "surfaceVisit" ? 1 : pace;
  return scale(direction, speed * tripPace * (1 - fish.depth * 0.1));
}

function schoolingVector(
  fish: FishInstance,
  school: FishInstance[],
  species: FishSpeciesDefinition,
): Vec2 {
  const social = species.ecology.social;
  if (social.grouping === "solitary" || social.cohesion <= 0 || school.length < 2) {
    return { x: 0, y: 0 };
  }
  const radius = getSchoolRadiusCm(species);
  const spacing = social.spacingBodyLengths * species.realBodyLengthCm;
  let center = { x: 0, y: 0 };
  let alignment = { x: 0, y: 0 };
  let separation = { x: 0, y: 0 };
  let count = 0;
  for (const other of school) {
    if (other.id === fish.id || other.behaviorMode === "rest") continue;
    const delta = subtract(other.position, fish.position);
    const distance = length(delta);
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
    scale(normalize(subtract(center, fish.position)), social.cohesion * 0.4),
    scale(normalize(alignment), social.polarization * 0.4),
    scale(normalize(separation), 0.7),
  );
}

function boundaryVector(position: Vec2, tank: TankDefinition, allowSurface: boolean): Vec2 {
  const margin = tank.safeMarginCm * 3.2;
  const strength = WALL_AVOIDANCE_STRENGTH * 0.16;
  return {
    x: position.x < margin
      ? (margin - position.x) * strength
      : position.x > tank.widthCm - margin
        ? -(position.x - (tank.widthCm - margin)) * strength
        : 0,
    y: position.y < margin && !allowSurface
      ? (margin - position.y) * strength
      : position.y > tank.heightCm - margin
        ? -(position.y - (tank.heightCm - margin)) * strength * 0.3
        : 0,
  };
}

function zoneVector(
  position: Vec2,
  tank: TankDefinition,
  species: FishSpeciesDefinition,
): Vec2 {
  const minY = tank.heightCm * species.preferredZone.minY;
  const maxY = tank.heightCm * species.preferredZone.maxY;
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

function findHabit<T extends FishHabitType>(
  species: FishSpeciesDefinition,
  type: T,
): Extract<FishHabit, { type: T }> | undefined {
  return species.ecology.habits.find((habit) => habit.type === type) as
    Extract<FishHabit, { type: T }> | undefined;
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

function getBreathIntervalSec(
  habit: Extract<FishHabit, { type: "airBreathing" }>,
  random: () => number,
): number {
  const perHour = lerp(habit.breathsPerHour[0], habit.breathsPerHour[1], random());
  return 3600 / Math.max(perHour, 0.1);
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

function keepInTank(position: Vec2, tank: TankDefinition): Vec2 {
  return {
    x: clamp(position.x, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
    y: clamp(position.y, tank.safeMarginCm, tank.heightCm - tank.safeMarginCm),
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
function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function subtract(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(value: Vec2, amount: number): Vec2 { return { x: value.x * amount, y: value.y * amount }; }
function addMany(...values: Vec2[]): Vec2 { return values.reduce(add, { x: 0, y: 0 }); }
function length(value: Vec2): number { return Math.hypot(value.x, value.y); }
function normalize(value: Vec2): Vec2 {
  const magnitude = length(value);
  return magnitude > 0.0001 ? scale(value, 1 / magnitude) : { x: 0, y: 0 };
}
function lerp(from: number, to: number, amount: number): number { return from + (to - from) * amount; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
