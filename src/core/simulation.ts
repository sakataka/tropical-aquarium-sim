import type {
  FeedingEvent,
  FishInstance,
  FishTargetKind,
  FishSpeciesDefinition,
  SimulationInput,
  SimulationOutput,
  TankDefinition,
  Vec2,
} from "./types";

const TWO_PI = Math.PI * 2;
const FOOD_ATTRACTION_RADIUS_CM = 28;
const STRUCTURE_X_RATIOS = [0.14, 0.84];

type TargetChoice = {
  position: Vec2;
  kind: FishTargetKind;
};

export function stepSimulation(input: SimulationInput): SimulationOutput {
  const deltaSec = Math.max(0, Math.min(input.deltaSec, 0.25));
  const nextFish = input.fish.map((fish) => {
    const species = input.species[fish.speciesId];

    if (!species) {
      return fish;
    }

    return stepFish({
      fish,
      allFish: input.fish,
      species,
      speciesById: input.species,
      tank: input.tank,
      deltaSec,
      feeding: input.feeding,
    });
  });

  return {
    fish: nextFish,
  };
}

function stepFish(params: {
  fish: FishInstance;
  allFish: FishInstance[];
  species: FishSpeciesDefinition;
  speciesById: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  deltaSec: number;
  feeding?: SimulationInput["feeding"];
}): FishInstance {
  const rng = createStepRng(params.fish.seed);
  let nextSeed = params.fish.seed;
  const random = () => {
    const result = rng();
    nextSeed = result.seed;
    return result.value;
  };

  const behavior = chooseBehavior({
    fish: params.fish,
    species: params.species,
    tank: params.tank,
    deltaSec: params.deltaSec,
    feeding: params.feeding,
    random,
  });

  const desiredVelocity = getDesiredVelocity({
    fish: params.fish,
    species: params.species,
    allFish: params.allFish,
    speciesById: params.speciesById,
    tank: params.tank,
    behaviorMode: behavior.behaviorMode,
    target: behavior.target,
    targetKind: behavior.targetKind,
    feeding: params.feeding,
    random,
  });

  const velocity = resolveVelocity(
    params.fish.velocity,
    desiredVelocity,
    behavior.behaviorMode,
    params.species.turnRateRadPerSec,
    params.deltaSec,
    params.species.motion.coastDragPerSec,
  );

  const position = keepInTank(
    add(params.fish.position, scale(velocity, params.deltaSec)),
    params.tank,
  );

  return {
    ...params.fish,
    position,
    velocity,
    facing: velocity.x < -0.01 ? -1 : velocity.x > 0.01 ? 1 : params.fish.facing,
    behaviorMode: behavior.behaviorMode,
    behaviorTimeRemainingSec: behavior.behaviorTimeRemainingSec,
    target: behavior.target,
    targetKind: behavior.targetKind,
    hunger: clamp(
      params.feeding
        ? params.fish.hunger - params.feeding.strength * params.deltaSec * 0.35
        : params.fish.hunger + params.deltaSec * 0.01,
      0,
      1,
    ),
    seed: nextSeed,
  };
}

function chooseBehavior(params: {
  fish: FishInstance;
  species: FishSpeciesDefinition;
  tank: TankDefinition;
  deltaSec: number;
  feeding?: SimulationInput["feeding"];
  random: () => number;
}): Pick<FishInstance, "behaviorMode" | "behaviorTimeRemainingSec" | "target" | "targetKind"> {
  if (
    params.feeding &&
    params.fish.hunger > 0.15 &&
    isFoodNearby(params.fish, params.feeding, params.species)
  ) {
    return {
      behaviorMode: "feed",
      behaviorTimeRemainingSec: randomBetween(
        params.species.motion.feedDurationSecMin,
        params.species.motion.feedDurationSecMax,
        params.random,
      ),
      target: params.feeding.position,
      targetKind: "feed",
    };
  }

  const remaining = params.fish.behaviorTimeRemainingSec - params.deltaSec;

  if (remaining > 0) {
    if (params.fish.behaviorMode === "feed") {
      const nextTarget = chooseTarget(params.fish, params.species, params.tank, params.random);

      return {
        behaviorMode: "coast",
        behaviorTimeRemainingSec: remaining,
        target: nextTarget.position,
        targetKind: nextTarget.kind,
      };
    }

    return {
      behaviorMode: params.fish.behaviorMode,
      behaviorTimeRemainingSec: remaining,
      target: params.fish.target,
      targetKind: params.fish.targetKind ?? "openWater",
    };
  }

  const shouldPause =
    params.random() < params.species.stopProbabilityPerSec * params.deltaSec;

  if (shouldPause) {
    return {
      behaviorMode: "pause",
      behaviorTimeRemainingSec: randomBetween(
        params.species.motion.pauseDurationSecMin,
        params.species.motion.pauseDurationSecMax,
        params.random,
      ),
      target: params.fish.target,
      targetKind: params.fish.targetKind ?? "openWater",
    };
  }

  if (params.fish.behaviorMode === "kick") {
    return {
      behaviorMode: "coast",
      behaviorTimeRemainingSec:
        params.species.motion.kickIntervalSecMin +
        params.random() *
          (params.species.motion.kickIntervalSecMax -
            params.species.motion.kickIntervalSecMin),
      target: params.fish.target,
      targetKind: params.fish.targetKind ?? "openWater",
    };
  }

  const nextTarget = chooseTarget(params.fish, params.species, params.tank, params.random);

  return {
    behaviorMode: "kick",
    behaviorTimeRemainingSec: params.species.motion.kickDurationSec,
    target: nextTarget.position,
    targetKind: nextTarget.kind,
  };
}

function getDesiredVelocity(params: {
  fish: FishInstance;
  species: FishSpeciesDefinition;
  allFish: FishInstance[];
  speciesById: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  behaviorMode: FishInstance["behaviorMode"];
  target?: Vec2;
  targetKind?: FishTargetKind;
  feeding?: SimulationInput["feeding"];
  random: () => number;
}): Vec2 {
  if (params.behaviorMode === "pause") {
    return scale(params.fish.velocity, 0.18);
  }

  const target =
    params.behaviorMode === "feed" && params.feeding
      ? params.feeding.position
      : params.target ??
        chooseTarget(params.fish, params.species, params.tank, params.random).position;

  const targetPull = normalize(subtract(target, params.fish.position));
  const sideways = { x: -targetPull.y, y: targetPull.x };
  const wanderWave =
    Math.sin(params.fish.seed * 0.013 + params.fish.behaviorTimeRemainingSec * 5.2) *
    params.species.motion.wanderStrength;
  const wander = scale(sideways, wanderWave * 0.26);
  const schooling = getSchoolingVector(
    params.fish,
    params.allFish,
    params.species,
    params.speciesById,
  );
  const boundary = getBoundaryVector(params.fish.position, params.tank, params.species);
  const boundaryPressure = clamp(length(boundary) / 4, 0, 0.85);
  const zone = getPreferredZoneVector(params.fish.position, params.tank, params.species);
  const structurePatrol = getStructurePatrolVector(
    params.fish.position,
    params.tank,
    params.species,
    params.targetKind ?? params.fish.targetKind ?? "openWater",
  );
  const feedPull =
    params.behaviorMode === "feed"
      ? 1 + params.species.behavior.foodResponsiveness * 0.8
      : 0.86;

  const direction = normalize(
    addMany(
      scale(targetPull, feedPull * (1 - boundaryPressure)),
      scale(wander, (params.behaviorMode === "feed" ? 0.1 : 0.55) * (1 - boundaryPressure)),
      schooling,
      zone,
      structurePatrol,
      boundary,
    ),
  );
  const depthSlowdown = 1 - params.fish.depth * 0.16;
  const bodyVariance = clamp(params.fish.bodyLengthVariance, 0.9, 1.1);
  const speed = getModeSpeed(params.behaviorMode, params.species) * depthSlowdown * bodyVariance;

  return scale(direction, speed);
}

function chooseTarget(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  tank: TankDefinition,
  random: () => number,
): TargetChoice {
  const zone = species.preferredZone;
  const currentXRatio = fish.position.x / tank.widthCm;
  const nearVerticalGlass =
    fish.position.x < tank.safeMarginCm * 2.8 ||
    fish.position.x > tank.widthCm - tank.safeMarginCm * 2.8;
  const nearHorizontalGlass =
    fish.position.y < tank.safeMarginCm * 2.4 ||
    fish.position.y > tank.heightCm - tank.safeMarginCm * 2.4;
  const shouldCruiseEdge =
    (nearVerticalGlass || nearHorizontalGlass) &&
    random() < species.behavior.edgeCruiseChance;
  if (shouldCruiseEdge) {
    return chooseEdgeCruiseTarget(fish, species, tank, random);
  }

  const shouldVisitSurface = random() < species.behavior.surfaceVisitChance;
  if (shouldVisitSurface) {
    return {
      kind: "surfaceVisit",
      position: {
        x: tank.widthCm * lerp(zone.minX, zone.maxX, random()),
        y: tank.heightCm * lerp(0.04, Math.min(0.16, zone.minY + 0.08), random()),
      },
    };
  }

  const shouldContinuePatrol =
    fish.targetKind === "structure" &&
    random() < species.behavior.structurePatrolStrength * 0.35;
  const shouldVisitStructure =
    shouldContinuePatrol || random() < species.behavior.structureAffinity;
  const xRatio = shouldVisitStructure
    ? STRUCTURE_X_RATIOS[random() < 0.5 ? 0 : 1] + lerp(-0.06, 0.06, random())
    : undefined;
  const yMin = Math.max(0.03, zone.minY - species.behavior.surfaceAffinity * 0.08);
  const yMax = Math.min(0.94, zone.maxY - species.behavior.surfaceAffinity * 0.16);
  const preferOppositeSide =
    fish.position.x < tank.safeMarginCm * 2 ||
    fish.position.x > tank.widthCm - tank.safeMarginCm * 2 ||
    random() < 0.45;

  return {
    kind: shouldVisitStructure ? "structure" : "openWater",
    position: {
      x: tank.widthCm *
        (xRatio !== undefined
          ? clamp(xRatio, zone.minX, zone.maxX)
          : preferOppositeSide
          ? currentXRatio < 0.5
            ? lerp(0.54, zone.maxX, random())
            : lerp(zone.minX, 0.46, random())
          : lerp(zone.minX, zone.maxX, random())),
      y: tank.heightCm * lerp(yMin, yMax, random()),
    },
  };
}

function chooseEdgeCruiseTarget(
  fish: FishInstance,
  species: FishSpeciesDefinition,
  tank: TankDefinition,
  random: () => number,
): TargetChoice {
  const zone = species.preferredZone;
  const xRatio = fish.position.x / tank.widthCm;
  const yRatio = fish.position.y / tank.heightCm;
  const followLeftOrRight =
    xRatio < 0.2 || xRatio > 0.8 || random() < 0.55;

  if (followLeftOrRight) {
    return {
      kind: "edgeCruise",
      position: {
        x: tank.widthCm * (xRatio < 0.5 ? lerp(0.1, 0.2, random()) : lerp(0.8, 0.9, random())),
        y: tank.heightCm * clamp(
          yRatio + (random() < 0.5 ? -1 : 1) * lerp(0.16, 0.34, random()),
          zone.minY,
          zone.maxY,
        ),
      },
    };
  }

  return {
    kind: "edgeCruise",
    position: {
      x: tank.widthCm * lerp(zone.minX, zone.maxX, random()),
      y: tank.heightCm * (yRatio < 0.5 ? lerp(0.1, 0.2, random()) : lerp(0.8, 0.9, random())),
    },
  };
}

function getModeSpeed(
  behaviorMode: FishInstance["behaviorMode"],
  species: FishSpeciesDefinition,
): number {
  if (behaviorMode === "feed") {
    return species.burstSpeedCmPerSec * species.motion.feedSpeedMultiplier;
  }
  if (behaviorMode === "kick") {
    return species.burstSpeedCmPerSec;
  }
  return species.cruisingSpeedCmPerSec;
}

function isFoodNearby(
  fish: FishInstance,
  feeding: FeedingEvent,
  species: FishSpeciesDefinition,
): boolean {
  const responseMultiplier = lerp(0.55, 1.35, species.behavior.foodResponsiveness);

  return length(subtract(feeding.position, fish.position)) <=
    FOOD_ATTRACTION_RADIUS_CM * responseMultiplier;
}

function getSchoolingVector(
  fish: FishInstance,
  allFish: FishInstance[],
  species: FishSpeciesDefinition,
  speciesById: Record<string, FishSpeciesDefinition>,
): Vec2 {
  if (!species.schooling.enabled || species.schooling.strength <= 0) {
    return { x: 0, y: 0 };
  }

  const neighbors = allFish.filter((candidate) => {
    if (candidate.id === fish.id || candidate.speciesId !== fish.speciesId) {
      return false;
    }

    const candidateSpecies = speciesById[candidate.speciesId];
    const distance = length(subtract(candidate.position, fish.position));

    return Boolean(candidateSpecies) && distance <= species.schooling.radiusCm;
  });

  if (neighbors.length === 0) {
    return { x: 0, y: 0 };
  }

  const personalSpaceCm = species.realBodyLengthCm * species.behavior.separationBodyLengths;
  const alignmentRadiusCm = species.realBodyLengthCm * species.behavior.alignmentBodyLengths;
  const attractionRadiusCm = Math.min(
    species.schooling.radiusCm,
    species.realBodyLengthCm * species.behavior.attractionBodyLengths,
  );
  let separation = { x: 0, y: 0 };
  let separationWeight = 0;
  let alignment = { x: 0, y: 0 };
  let alignmentWeight = 0;
  let attraction = { x: 0, y: 0 };
  let attractionWeight = 0;

  for (const neighbor of neighbors) {
    const offset = subtract(neighbor.position, fish.position);
    const distance = Math.max(0.001, length(offset));
    const directionToNeighbor = scale(offset, 1 / distance);

    if (distance < personalSpaceCm) {
      const weight = 1 - distance / personalSpaceCm;
      separation = add(separation, scale(directionToNeighbor, -weight));
      separationWeight += weight;
      continue;
    }

    if (distance < alignmentRadiusCm) {
      const weight = 1 - Math.abs(distance - personalSpaceCm) / alignmentRadiusCm;
      alignment = add(alignment, scale(normalize(neighbor.velocity), Math.max(0, weight)));
      alignmentWeight += Math.max(0, weight);
      continue;
    }

    const weight = clamp(
      (distance - alignmentRadiusCm) /
        Math.max(0.001, attractionRadiusCm - alignmentRadiusCm),
      0,
      1,
    );
    attraction = add(attraction, scale(directionToNeighbor, weight));
    attractionWeight += weight;
  }

  return addMany(
    scale(
      normalize(separation),
      species.schooling.strength *
        species.behavior.separationStrength *
        2.8 *
        Math.min(1, separationWeight),
    ),
    scale(
      normalize(alignment),
      species.schooling.strength *
        species.behavior.alignmentStrength *
        0.55 *
        Math.min(1, alignmentWeight),
    ),
    scale(
      normalize(attraction),
      species.schooling.strength *
        species.behavior.attractionStrength *
        0.7 *
        Math.min(1, attractionWeight),
    ),
  );
}

function getPreferredZoneVector(
  position: Vec2,
  tank: TankDefinition,
  species: FishSpeciesDefinition,
): Vec2 {
  const zone = species.preferredZone;
  const xRatio = position.x / tank.widthCm;
  const yRatio = position.y / tank.heightCm;
  const nearest = {
    x: tank.widthCm * clamp(xRatio, zone.minX, zone.maxX),
    y: tank.heightCm * clamp(yRatio, zone.minY, zone.maxY),
  };
  const distanceFromZone = subtract(nearest, position);

  if (length(distanceFromZone) <= 0.001) {
    return { x: 0, y: 0 };
  }

  return scale(
    normalize(distanceFromZone),
    species.behavior.zoneHoldStrength * clamp(length(distanceFromZone) / 12, 0, 1),
  );
}

function getStructurePatrolVector(
  position: Vec2,
  tank: TankDefinition,
  species: FishSpeciesDefinition,
  targetKind: FishTargetKind,
): Vec2 {
  if (targetKind !== "structure" || species.behavior.structurePatrolStrength <= 0) {
    return { x: 0, y: 0 };
  }

  const nearestStructureRatio = STRUCTURE_X_RATIOS.reduce((nearest, current) => {
    return Math.abs(position.x / tank.widthCm - current) <
      Math.abs(position.x / tank.widthCm - nearest)
      ? current
      : nearest;
  }, STRUCTURE_X_RATIOS[0]);
  const structurePosition = {
    x: tank.widthCm * nearestStructureRatio,
    y: tank.heightCm * clamp(
      position.y / tank.heightCm,
      species.preferredZone.minY,
      species.preferredZone.maxY,
    ),
  };

  return scale(
    normalize(subtract(structurePosition, position)),
    species.behavior.structurePatrolStrength * 0.55,
  );
}

function getBoundaryVector(position: Vec2, tank: TankDefinition, species?: FishSpeciesDefinition): Vec2 {
  const margin = tank.safeMarginCm;
  const right = tank.widthCm - margin;
  const bottom = tank.heightCm - margin;
  const softZone = margin * 2.6;
  const leftPressure = clamp((softZone - (position.x - margin)) / softZone, 0, 1);
  const rightPressure = clamp((softZone - (right - position.x)) / softZone, 0, 1);
  const topPressure = clamp((softZone - (position.y - margin)) / softZone, 0, 1);
  const bottomPressure = clamp((softZone - (bottom - position.y)) / softZone, 0, 1);

  return scale(normalize({
    x: leftPressure - rightPressure,
    y: topPressure - bottomPressure,
  }), species?.behavior.wallAvoidanceStrength ?? 4);
}

function resolveVelocity(
  current: Vec2,
  desired: Vec2,
  behaviorMode: FishInstance["behaviorMode"],
  turnRateRadPerSec: number,
  deltaSec: number,
  coastDragPerSec: number,
): Vec2 {
  if (behaviorMode === "pause") {
    return scale(current, Math.max(0, 1 - deltaSec * 2.8));
  }

  if (behaviorMode === "coast") {
    const steered = steerVelocity(current, desired, turnRateRadPerSec * 0.22, deltaSec);
    return scale(steered, Math.max(0.58, 1 - coastDragPerSec * deltaSec));
  }

  const accelerationBlend = behaviorMode === "feed" ? 0.08 : 0.16;
  const steered = steerVelocity(current, desired, turnRateRadPerSec, deltaSec);
  return add(scale(current, 1 - accelerationBlend), scale(steered, accelerationBlend));
}

function steerVelocity(
  current: Vec2,
  desired: Vec2,
  turnRateRadPerSec: number,
  deltaSec: number,
): Vec2 {
  if (length(current) <= 0.001 || length(desired) <= 0.001) {
    return desired;
  }

  const currentAngle = Math.atan2(current.y, current.x);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  const maxTurn = turnRateRadPerSec * deltaSec;
  const nextAngle = currentAngle + clampAngle(desiredAngle - currentAngle, maxTurn);
  const speed = length(desired);

  return {
    x: Math.cos(nextAngle) * speed,
    y: Math.sin(nextAngle) * speed,
  };
}

function keepInTank(position: Vec2, tank: TankDefinition): Vec2 {
  return {
    x: clamp(position.x, tank.safeMarginCm, tank.widthCm - tank.safeMarginCm),
    y: clamp(position.y, tank.safeMarginCm, tank.heightCm - tank.safeMarginCm),
  };
}

function createStepRng(seed: number): () => { value: number; seed: number } {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return {
      value: state / 0xffffffff,
      seed: state,
    };
  };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function addMany(...vectors: Vec2[]): Vec2 {
  return vectors.reduce<Vec2>((sum, vector) => add(sum, vector), { x: 0, y: 0 });
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function scale(vector: Vec2, amount: number): Vec2 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
  };
}

function normalize(vector: Vec2): Vec2 {
  const vectorLength = length(vector);

  if (vectorLength <= 0.0001) {
    return { x: 0, y: 0 };
  }

  return scale(vector, 1 / vectorLength);
}

function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampAngle(angle: number, maxAbs: number): number {
  let normalized = angle;

  while (normalized > Math.PI) normalized -= TWO_PI;
  while (normalized < -Math.PI) normalized += TWO_PI;

  return clamp(normalized, -maxAbs, maxAbs);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function randomBetween(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}
