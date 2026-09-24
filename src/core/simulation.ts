import type {
  FishInstance,
  FishSpeciesDefinition,
  SimulationInput,
  SimulationOutput,
  TankDefinition,
  Vec2,
} from "./types";

const FORWARD_TARGET_CHANCE = 0.86;
const FACING_THRESHOLD_CM_PER_SEC = 0.3;
const KICK_SPEED_RATIO = 0.5;

export function stepSimulation(input: SimulationInput): SimulationOutput {
  const deltaSec = clamp(input.deltaSec, 0, 0.25);
  const groups = groupBySpecies(input.fish);
  return {
    fish: input.fish.map((fish) => {
      const species = input.species[fish.speciesId];
      if (!species) return fish;
      return stepFish(
        fish,
        species,
        groups.get(fish.speciesId) ?? [],
        input.tank,
        input.structurePoints,
        deltaSec,
      );
    }),
  };
}

function stepFish(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
  tank: TankDefinition,
  structurePoints: Vec2[],
  deltaSec: number,
): FishInstance {
  const rng = createRng(fish.seed);
  let seed = fish.seed;
  const random = () => {
    const value = rng();
    seed = value.seed;
    return value.value;
  };
  let mode = fish.behaviorMode;
  let remaining = fish.behaviorTimeRemainingSec - deltaSec;
  let target = fish.target;
  let targetKind: NonNullable<FishInstance["targetKind"]> = fish.targetKind ?? "openWater";
  let legTimeSec = (fish.legTimeSec ?? 0) + deltaSec;

  // 目的地に着いたら、通り過ぎて引き返す前に次の目的地へ切り替える。
  if (target && hasReachedTarget(fish, target, species)) {
    const choice = chooseTarget(fish, species, school, tank, structurePoints, random);
    target = choice.position;
    targetKind = choice.kind;
    legTimeSec = 0;
  }

  if (remaining <= 0) {
    if (mode === "kick") {
      mode = "coast";
      remaining = lerp(
        species.motion.kickIntervalSecMin,
        species.motion.kickIntervalSecMax,
        random(),
      );
    } else if (random() < species.stopProbabilityPerSec * 2.4) {
      mode = "pause";
      remaining = lerp(
        species.motion.pauseDurationSecMin,
        species.motion.pauseDurationSecMax,
        random(),
      );
    } else {
      mode = "kick";
      remaining = species.motion.kickDurationSec;
      // 目的地はキックごとに選び直さず、着いたか長く向かい続けたときだけ変える。
      if (!target || hasReachedTarget(fish, target, species) || legTimeSec > getLegLimitSec(fish, random)) {
        const choice = chooseTarget(fish, species, school, tank, structurePoints, random);
        target = choice.position;
        targetKind = choice.kind;
        legTimeSec = 0;
      }
    }
  }

  const desired = getDesiredVelocity(
    fish,
    species,
    school,
    tank,
    target,
    targetKind,
    mode,
  );
  const velocity = steerVelocity(
    fish.velocity,
    desired,
    species.turnRateRadPerSec,
    species.motion.coastDragPerSec,
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
    seed,
  };
}

function chooseTarget(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
  tank: TankDefinition,
  structurePoints: Vec2[],
  random: () => number,
): { position: Vec2; kind: NonNullable<FishInstance["targetKind"]> } {
  const zone = species.preferredZone;
  const nearEdge =
    fish.position.x < tank.safeMarginCm * 2.8 ||
    fish.position.x > tank.widthCm - tank.safeMarginCm * 2.8;
  if (nearEdge && random() < species.behavior.edgeCruiseChance) {
    return {
      kind: "edgeCruise",
      position: {
        x: fish.position.x < tank.widthCm / 2
          ? tank.safeMarginCm * 1.5
          : tank.widthCm - tank.safeMarginCm * 1.5,
        y: tank.heightCm * lerp(zone.minY, zone.maxY, random()),
      },
    };
  }
  if (random() < species.behavior.surfaceVisitChance) {
    return {
      kind: "surfaceVisit",
      position: {
        x: tank.widthCm * lerp(zone.minX, zone.maxX, random()),
        y: tank.heightCm * Math.min(0.16, zone.minY + 0.04),
      },
    };
  }
  const point = structurePoints.length > 0
    ? structurePoints[Math.floor(random() * structurePoints.length)]!
    : undefined;
  // 背後の構造物へは、わざわざ引き返してまでは寄りにくい。
  const behind = point !== undefined && (point.x - fish.position.x) * fish.facing < -3;
  if (
    point &&
    random() < species.behavior.structureAffinity * (behind ? 0.3 : 1)
  ) {
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

// 群れの魚は、近くの仲間がそろって向かう方向を自分の進行方向として扱う。
function getSchoolHeading(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
): -1 | 1 {
  if (!species.schooling.enabled) return fish.facing;
  let sumX = 0;
  for (const other of school) {
    if (other.id === fish.id) continue;
    if (length(subtract(other.position, fish.position)) > species.schooling.radiusCm) continue;
    sumX += other.velocity.x;
  }
  if (Math.abs(sumX) < FACING_THRESHOLD_CM_PER_SEC) return fish.facing;
  return sumX > 0 ? 1 : -1;
}

function hasReachedTarget(fish: FishInstance, target: Vec2, species: FishSpeciesDefinition): boolean {
  return length(subtract(target, fish.position)) < Math.max(2.5, species.realBodyLengthCm * 0.8);
}

function getLegLimitSec(fish: FishInstance, random: () => number): number {
  // 群れに引っ張られて目的地に届かない場合でも、いずれは選び直す。
  return fish.targetKind === "structure" ? lerp(10, 22, random()) : lerp(14, 28, random());
}

function getDesiredVelocity(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  school: FishInstance[],
  tank: TankDefinition,
  target: Vec2 | undefined,
  targetKind: FishInstance["targetKind"],
  mode: FishInstance["behaviorMode"],
): Vec2 {
  if (mode === "pause") return scale(fish.velocity, 0.12);
  const targetDirection = normalize(subtract(target ?? tankCenter(tank), fish.position));
  const boundary = boundaryVector(fish.position, tank, species.behavior.wallAvoidanceStrength);
  const zone = zoneVector(fish.position, tank, species);
  const rawFlock = schoolingVector(fish, school, species);
  // 群れの引力で後ろ向きに引き戻されると、頻繁に向きが入れ替わってしまう。
  const flock = rawFlock.x * fish.facing < 0
    ? { x: rawFlock.x * 0.2, y: rawFlock.y }
    : rawFlock;
  const structureBias = targetKind === "structure"
    ? species.behavior.structurePatrolStrength
    : 0;
  const direction = normalize(addMany(
    scale(targetDirection, 0.9 + structureBias * 0.35),
    boundary,
    zone,
    flock,
  ));
  const speed = mode === "kick"
    ? species.burstSpeedCmPerSec * KICK_SPEED_RATIO
    : species.cruisingSpeedCmPerSec;
  return scale(direction, speed * (1 - fish.depth * 0.14));
}

function schoolingVector(
  fish: FishInstance,
  school: FishInstance[],
  species: FishSpeciesDefinition,
): Vec2 {
  if (!species.schooling.enabled || school.length < 2) return { x: 0, y: 0 };
  let center = { x: 0, y: 0 };
  let alignment = { x: 0, y: 0 };
  let separation = { x: 0, y: 0 };
  let count = 0;
  for (const other of school) {
    if (other.id === fish.id) continue;
    const delta = subtract(other.position, fish.position);
    const distance = length(delta);
    if (distance > species.schooling.radiusCm) continue;
    center = add(center, other.position);
    alignment = add(alignment, other.velocity);
    if (distance < species.realBodyLengthCm * species.behavior.separationBodyLengths) {
      separation = add(separation, scale(normalize(delta), -1 / Math.max(distance, 0.2)));
    }
    count += 1;
  }
  if (count === 0) return { x: 0, y: 0 };
  center = scale(center, 1 / count);
  alignment = scale(alignment, 1 / count);
  return addMany(
    scale(normalize(subtract(center, fish.position)), species.behavior.attractionStrength * 0.32),
    scale(normalize(alignment), species.behavior.alignmentStrength * 0.28),
    scale(normalize(separation), species.behavior.separationStrength * 0.52),
  );
}

function boundaryVector(position: Vec2, tank: TankDefinition, strength: number): Vec2 {
  const margin = tank.safeMarginCm * 3.2;
  return {
    x: position.x < margin
      ? (margin - position.x) * strength * 0.16
      : position.x > tank.widthCm - margin
        ? -(position.x - (tank.widthCm - margin)) * strength * 0.16
        : 0,
    y: position.y < margin
      ? (margin - position.y) * strength * 0.16
      : position.y > tank.heightCm - margin
        ? -(position.y - (tank.heightCm - margin)) * strength * 0.16
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
  return { x: 0, y: y * species.behavior.zoneHoldStrength * 0.18 };
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
  const damping = mode === "pause" ? Math.exp(-4.8 * deltaSec) : Math.exp(-drag * deltaSec * 0.2);
  return scale(blended, damping);
}

function keepInTank(position: Vec2, tank: TankDefinition): Vec2 {
  return {
    x: clamp(position.x, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
    y: clamp(position.y, tank.safeMarginCm, tank.heightCm - tank.safeMarginCm),
  };
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
