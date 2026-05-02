import type {
  FeedingEvent,
  FishInstance,
  FishSpeciesDefinition,
  SimulationInput,
  SimulationOutput,
  TankDefinition,
  Vec2,
} from "./types";

const TWO_PI = Math.PI * 2;
const FOOD_ATTRACTION_RADIUS_CM = 28;

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
}): Pick<FishInstance, "behaviorMode" | "behaviorTimeRemainingSec" | "target"> {
  if (params.feeding && params.fish.hunger > 0.15 && isFoodNearby(params.fish, params.feeding)) {
    return {
      behaviorMode: "feed",
      behaviorTimeRemainingSec: 0.7 + params.random() * 1.1,
      target: params.feeding.position,
    };
  }

  const remaining = params.fish.behaviorTimeRemainingSec - params.deltaSec;

  if (remaining > 0) {
    return {
      behaviorMode: params.fish.behaviorMode === "feed" ? "coast" : params.fish.behaviorMode,
      behaviorTimeRemainingSec: remaining,
      target: params.fish.target,
    };
  }

  const shouldPause =
    params.random() < params.species.stopProbabilityPerSec * params.deltaSec;

  if (shouldPause) {
    return {
      behaviorMode: "pause",
      behaviorTimeRemainingSec: 0.9 + params.random() * 2.4,
      target: params.fish.target,
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
    };
  }

  return {
    behaviorMode: "kick",
    behaviorTimeRemainingSec: params.species.motion.kickDurationSec,
    target: chooseTarget(params.fish, params.species, params.tank, params.random),
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
  feeding?: SimulationInput["feeding"];
  random: () => number;
}): Vec2 {
  if (params.behaviorMode === "pause") {
    return scale(params.fish.velocity, 0.18);
  }

  const target =
    params.behaviorMode === "feed" && params.feeding
      ? params.feeding.position
      : params.target ?? chooseTarget(params.fish, params.species, params.tank, params.random);

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
  const boundary = getBoundaryVector(params.fish.position, params.tank);

  const direction = normalize(
    addMany(
      scale(targetPull, params.behaviorMode === "feed" ? 1.35 : 0.86),
      scale(wander, params.behaviorMode === "feed" ? 0.1 : 0.55),
      schooling,
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
): Vec2 {
  const zone = species.preferredZone;
  const currentXRatio = fish.position.x / tank.widthCm;
  const preferOppositeSide =
    fish.position.x < tank.safeMarginCm * 2 ||
    fish.position.x > tank.widthCm - tank.safeMarginCm * 2 ||
    random() < 0.45;

  return {
    x: tank.widthCm *
      (preferOppositeSide
        ? currentXRatio < 0.5
          ? lerp(0.54, zone.maxX, random())
          : lerp(zone.minX, 0.46, random())
        : lerp(zone.minX, zone.maxX, random())),
    y: tank.heightCm * lerp(zone.minY, zone.maxY, random()),
  };
}

function getModeSpeed(
  behaviorMode: FishInstance["behaviorMode"],
  species: FishSpeciesDefinition,
): number {
  if (behaviorMode === "feed") {
    return species.burstSpeedCmPerSec * 0.72;
  }
  if (behaviorMode === "kick") {
    return species.burstSpeedCmPerSec;
  }
  return species.cruisingSpeedCmPerSec;
}

function isFoodNearby(fish: FishInstance, feeding: FeedingEvent): boolean {
  return length(subtract(feeding.position, fish.position)) <= FOOD_ATTRACTION_RADIUS_CM;
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

  const center = scale(
    addMany(...neighbors.map((neighbor) => neighbor.position)),
    1 / neighbors.length,
  );
  const alignment = scale(
    addMany(...neighbors.map((neighbor) => normalize(neighbor.velocity))),
    1 / neighbors.length,
  );

  return add(
    scale(normalize(subtract(center, fish.position)), species.schooling.strength * 0.45),
    scale(alignment, species.schooling.strength * 0.35),
  );
}

function getBoundaryVector(position: Vec2, tank: TankDefinition): Vec2 {
  const margin = tank.safeMarginCm;
  const right = tank.widthCm - margin;
  const bottom = tank.heightCm - margin;

  return {
    x:
      position.x < margin
        ? 1
        : position.x > right
          ? -1
          : 0,
    y:
      position.y < margin
        ? 1
        : position.y > bottom
          ? -1
          : 0,
  };
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
