import { describe, expect, it } from "vitest";
import { fishCatalog } from "./catalog";
import { stepSimulation } from "./simulation";
import { TANK_60CM } from "./tank";
import type { FishInstance, FishSpeciesDefinition } from "./types";

const species: FishSpeciesDefinition = {
  id: "test-fish",
  displayName: "Test Fish",
  realBodyLengthCm: 4,
  sideImage: "./side.png",
  animation: {
    framePattern: "./swim/frame-*.png",
    framesPerSecond: 8,
  },
  sourceBodyBounds: {
    x: 0,
    y: 0,
    width: 100,
    height: 32,
  },
  cruisingSpeedCmPerSec: 4,
  burstSpeedCmPerSec: 12,
  turnRateRadPerSec: 12,
  stopProbabilityPerSec: 0,
  motion: {
    kickIntervalSecMin: 0.8,
    kickIntervalSecMax: 1.6,
    kickDurationSec: 0.2,
    pauseDurationSecMin: 0.8,
    pauseDurationSecMax: 1.8,
    feedDurationSecMin: 0.5,
    feedDurationSecMax: 1.2,
    feedSpeedMultiplier: 0.75,
    coastDragPerSec: 0.35,
    wanderStrength: 0.25,
  },
  preferredZone: {
    minX: 0.2,
    maxX: 0.8,
    minY: 0.2,
    maxY: 0.8,
  },
  schooling: {
    enabled: true,
    radiusCm: 12,
    strength: 0.2,
  },
  behavior: {
    separationBodyLengths: 1.4,
    alignmentBodyLengths: 3,
    attractionBodyLengths: 6,
    separationStrength: 1.2,
    alignmentStrength: 0.8,
    attractionStrength: 0.7,
    wallAvoidanceStrength: 4,
    edgeCruiseChance: 0.12,
    structureAffinity: 0.25,
    surfaceAffinity: 0.15,
    zoneHoldStrength: 0.8,
    surfaceVisitChance: 0.05,
    foodResponsiveness: 0.65,
    structurePatrolStrength: 0.35,
  },
};

function createFish(overrides: Partial<FishInstance> = {}): FishInstance {
  const definition = overrides.speciesId ? fishCatalog[overrides.speciesId] ?? species : species;

  return {
    id: "fish-1",
    speciesId: definition.id,
    position: {
      x: 30,
      y: 20,
    },
    velocity: {
      x: 1,
      y: 0,
    },
    facing: 1,
    depth: 0.5,
    bodyLengthVariance: 1,
    behaviorMode: "coast",
    behaviorTimeRemainingSec: 0,
    targetKind: "openWater",
    hunger: 0.8,
    seed: 123,
    ...overrides,
  };
}

describe("stepSimulation", () => {
  it("keeps fish inside the tank bounds", () => {
    const result = stepSimulation({
      tank: TANK_60CM,
      species: {
        [species.id]: species,
      },
      fish: [
        createFish({
          position: {
            x: 0,
            y: 0,
          },
        }),
      ],
      deltaSec: 1,
    });

    expect(result.fish[0].position.x).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
    expect(result.fish[0].position.y).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
  });

  it("switches hungry fish into feed behavior when food is present", () => {
    const result = stepSimulation({
      tank: TANK_60CM,
      species: {
        [species.id]: species,
      },
      fish: [createFish()],
      deltaSec: 1 / 60,
      feeding: {
        position: TANK_60CM.feedPoint,
        strength: 1,
      },
    });

    expect(result.fish[0].behaviorMode).toBe("feed");
    expect(result.fish[0].targetKind).toBe("feed");
    expect(result.fish[0].hunger).toBeLessThan(0.8);
  });

  it("separates schooling fish that are too close", () => {
    const initialFish = [
      createFish({
        id: "left",
        position: { x: 30, y: 18 },
        velocity: { x: 0.1, y: 0 },
        target: { x: 42, y: 18 },
      }),
      createFish({
        id: "right",
        position: { x: 31, y: 18 },
        velocity: { x: 0.1, y: 0 },
        target: { x: 42, y: 18 },
      }),
    ];
    const result = runSteps(initialFish, 30);
    const initialDistance = initialFish[1].position.x - initialFish[0].position.x;
    const nextDistance = result[1].position.x - result[0].position.x;

    expect(nextDistance).toBeGreaterThan(initialDistance);
  });

  it("keeps schooling fish from drifting too far apart inside their attraction radius", () => {
    const initialFish = [
      createFish({
        id: "left",
        position: { x: 24, y: 18 },
        velocity: { x: 0.1, y: 0 },
        target: { x: 12, y: 18 },
      }),
      createFish({
        id: "right",
        position: { x: 36, y: 18 },
        velocity: { x: -0.1, y: 0 },
        target: { x: 48, y: 18 },
      }),
    ];
    const result = runSteps(initialFish, 45);
    const initialDistance = initialFish[1].position.x - initialFish[0].position.x;
    const nextDistance = result[1].position.x - result[0].position.x;

    expect(nextDistance).toBeLessThan(initialDistance + 4);
  });

  it("steers away before fish reach the tank glass", () => {
    const initialX = TANK_60CM.safeMarginCm + 0.5;
    const result = runSteps([
      createFish({
        position: { x: initialX, y: 18 },
        velocity: { x: -3, y: 0 },
        target: { x: 1, y: 18 },
      }),
    ], 30);

    expect(result[0].position.x).toBeGreaterThan(initialX);
    expect(result[0].targetKind).not.toBe("feed");
  });

  it("pulls bottom dwellers back toward the lower tank zone", () => {
    const corydoras = fishCatalog.corydoras;
    const fish = createFish({
      speciesId: corydoras.id,
      position: { x: 30, y: 22 },
      velocity: { x: 0.2, y: 0 },
      target: { x: 42, y: 22 },
      targetKind: "openWater",
    });
    const result = runSteps([fish], 40, {
      [corydoras.id]: corydoras,
    });

    expect(result[0].position.y).toBeGreaterThan(fish.position.y);
  });

  it("can choose species-driven surface visit targets without adding a behavior mode", () => {
    const surfaceCorydoras: FishSpeciesDefinition = {
      ...fishCatalog.corydoras,
      behavior: {
        ...fishCatalog.corydoras.behavior,
        edgeCruiseChance: 0,
        surfaceVisitChance: 1,
        structureAffinity: 0,
      },
    };
    const result = stepSimulation({
      tank: TANK_60CM,
      species: {
        [surfaceCorydoras.id]: surfaceCorydoras,
      },
      fish: [
        createFish({
          speciesId: surfaceCorydoras.id,
          position: { x: 30, y: 34 },
          behaviorMode: "coast",
          behaviorTimeRemainingSec: 0,
        }),
      ],
      deltaSec: 1 / 30,
    });

    expect(result.fish[0].behaviorMode).toBe("kick");
    expect(result.fish[0].targetKind).toBe("surfaceVisit");
    expect(result.fish[0].target?.y).toBeLessThan(TANK_60CM.heightCm * 0.18);
  });

  it("lets upper-level species bias new targets toward the surface", () => {
    const surfaceGuppy: FishSpeciesDefinition = {
      ...fishCatalog.guppy,
      behavior: {
        ...fishCatalog.guppy.behavior,
        edgeCruiseChance: 0,
        surfaceVisitChance: 1,
        structureAffinity: 0,
      },
    };
    const result = stepSimulation({
      tank: TANK_60CM,
      species: {
        [surfaceGuppy.id]: surfaceGuppy,
      },
      fish: [
        createFish({
          speciesId: surfaceGuppy.id,
          position: { x: 30, y: 20 },
          behaviorMode: "coast",
          behaviorTimeRemainingSec: 0,
        }),
      ],
      deltaSec: 1 / 30,
    });

    expect(result.fish[0].targetKind).toBe("surfaceVisit");
    expect(result.fish[0].target?.y).toBeLessThan(TANK_60CM.heightCm * 0.18);
  });

  it("uses food responsiveness when deciding whether fish enter feed behavior", () => {
    const lowResponseSpecies: FishSpeciesDefinition = {
      ...species,
      behavior: {
        ...species.behavior,
        foodResponsiveness: 0,
      },
    };
    const highResponseSpecies: FishSpeciesDefinition = {
      ...species,
      id: "high-response",
      behavior: {
        ...species.behavior,
        foodResponsiveness: 1,
      },
    };
    const feeding = {
      position: { x: 30, y: 20 },
      strength: 1,
    };
    const distantFish = createFish({
      position: { x: 30, y: 52 },
      target: { x: 30, y: 52 },
    });
    const lowResult = stepSimulation({
      tank: TANK_60CM,
      species: {
        [lowResponseSpecies.id]: lowResponseSpecies,
      },
      fish: [distantFish],
      deltaSec: 1 / 30,
      feeding,
    });
    const highResult = stepSimulation({
      tank: TANK_60CM,
      species: {
        [highResponseSpecies.id]: highResponseSpecies,
      },
      fish: [
        {
          ...distantFish,
          speciesId: highResponseSpecies.id,
        },
      ],
      deltaSec: 1 / 30,
      feeding,
    });

    expect(lowResult.fish[0].behaviorMode).not.toBe("feed");
    expect(highResult.fish[0].behaviorMode).toBe("feed");
    expect(highResult.fish[0].targetKind).toBe("feed");
  });
});

function runSteps(
  initialFish: FishInstance[],
  steps: number,
  speciesById: Record<string, FishSpeciesDefinition> = {
    [species.id]: species,
  },
): FishInstance[] {
  let fish = initialFish;
  for (let i = 0; i < steps; i += 1) {
    fish = stepSimulation({
      tank: TANK_60CM,
      species: speciesById,
      fish,
      deltaSec: 1 / 30,
    }).fish;
  }

  return fish;
}
