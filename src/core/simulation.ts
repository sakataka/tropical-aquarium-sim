import type {
  FishInstance,
  FishSpeciesDefinition,
  SimulationInput,
  SimulationOutput,
  TankDefinition,
  Vec2,
} from "./types";

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
      const choice = chooseTarget(fish, species, tank, structurePoints, random);
      target = choice.position;
      targetKind = choice.kind;
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
    facing: velocity.x < -0.01 ? -1 : velocity.x > 0.01 ? 1 : fish.facing,
    behaviorMode: mode,
    behaviorTimeRemainingSec: remaining,
    target,
    targetKind,
    seed,
  };
}

function chooseTarget(
  fish: FishInstance,
  species: FishSpeciesDefinition,
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
  if (
    structurePoints.length > 0 &&
    random() < species.behavior.structureAffinity
  ) {
    const point = structurePoints[Math.floor(random() * structurePoints.length)]!;
    return {
      kind: "structure",
      position: {
        x: clamp(point.x + lerp(-5, 5, random()), tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
        y: clamp(point.y + lerp(-4, 3, random()), tank.safeMarginCm, tank.heightCm - tank.safeMarginCm),
      },
    };
  }
  return {
    kind: "openWater",
    position: {
      x: tank.widthCm * lerp(zone.minX, zone.maxX, random()),
      y: tank.heightCm * lerp(zone.minY, zone.maxY, random()),
    },
  };
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
  const flock = schoolingVector(fish, school, species);
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
    ? species.burstSpeedCmPerSec * 0.68
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
