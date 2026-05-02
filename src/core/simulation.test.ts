import { describe, expect, it } from "vitest";
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
};

function createFish(overrides: Partial<FishInstance> = {}): FishInstance {
  return {
    id: "fish-1",
    speciesId: species.id,
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
  });
});

function runSteps(initialFish: FishInstance[], steps: number): FishInstance[] {
  let fish = initialFish;
  for (let i = 0; i < steps; i += 1) {
    fish = stepSimulation({
      tank: TANK_60CM,
      species: {
        [species.id]: species,
      },
      fish,
      deltaSec: 1 / 30,
    }).fish;
  }

  return fish;
}
