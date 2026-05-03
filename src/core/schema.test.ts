import { describe, expect, it } from "vitest";
import { parseFishSpeciesDefinition } from "./schema";

const validSpecies = {
  id: "valid-fish",
  displayName: "Valid Fish",
  realBodyLengthCm: 4,
  sideImage: "./side.png",
  animation: {
    framePattern: "./swim/frame-*.png",
    framesPerSecond: 8,
  },
  sourceBodyBounds: {
    x: 10,
    y: 12,
    width: 80,
    height: 24,
  },
  cruisingSpeedCmPerSec: 4,
  burstSpeedCmPerSec: 10,
  turnRateRadPerSec: 4,
  stopProbabilityPerSec: 0.1,
  motion: {
    kickIntervalSecMin: 0.8,
    kickIntervalSecMax: 1.8,
    kickDurationSec: 0.22,
    pauseDurationSecMin: 0.8,
    pauseDurationSecMax: 1.8,
    feedDurationSecMin: 0.5,
    feedDurationSecMax: 1.2,
    feedSpeedMultiplier: 0.75,
    coastDragPerSec: 0.4,
    wanderStrength: 0.25,
  },
  preferredZone: {
    minX: 0.1,
    maxX: 0.9,
    minY: 0.2,
    maxY: 0.8,
  },
  schooling: {
    enabled: true,
    radiusCm: 10,
    strength: 0.2,
  },
  behavior: {
    separationBodyLengths: 1.4,
    alignmentBodyLengths: 3,
    attractionBodyLengths: 6,
    separationStrength: 1.2,
    alignmentStrength: 0.8,
    attractionStrength: 0.7,
    wallAvoidanceStrength: 3.2,
    edgeCruiseChance: 0.15,
    structureAffinity: 0.4,
    surfaceAffinity: 0.2,
    zoneHoldStrength: 0.8,
    surfaceVisitChance: 0.05,
    foodResponsiveness: 0.65,
    tapResponsiveness: 0.7,
    tapResponse: "flee",
    tapSurfaceBias: 0.2,
    tapStructureBias: 0.3,
    structurePatrolStrength: 0.35,
  },
};

describe("fish species schema", () => {
  it("accepts a valid species definition", () => {
    expect(parseFishSpeciesDefinition(validSpecies).id).toBe("valid-fish");
  });

  it("requires sourceBodyBounds", () => {
    const { sourceBodyBounds, ...withoutBounds } = validSpecies;

    expect(() => parseFishSpeciesDefinition(withoutBounds)).toThrow();
    expect(sourceBodyBounds.width).toBe(80);
  });

  it("requires behavior controls for target selection", () => {
    const invalidSpecies = {
      ...validSpecies,
      behavior: {
        ...validSpecies.behavior,
        zoneHoldStrength: undefined,
      },
    };

    expect(() => parseFishSpeciesDefinition(invalidSpecies)).toThrow();
  });

  it("requires motion durations for species-specific state timing", () => {
    const invalidSpecies = {
      ...validSpecies,
      motion: {
        ...validSpecies.motion,
        pauseDurationSecMax: undefined,
      },
    };

    expect(() => parseFishSpeciesDefinition(invalidSpecies)).toThrow();
  });
});
