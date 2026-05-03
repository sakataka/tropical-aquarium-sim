import { describe, expect, it } from "vitest";
import { TANK_60CM } from "./tank";
import {
  applyBodyLengthVariance,
  applyDepthScale,
  getBaseSpriteScale,
  getFishSpriteScale,
  getTargetBodyLengthPx,
} from "./scale";
import type { FishSpeciesDefinition } from "./types";

const species: FishSpeciesDefinition = {
  id: "test-fish",
  displayName: "Test Fish",
  realBodyLengthCm: 6,
  sideImage: "./side.png",
  sourceBodyBounds: {
    x: 0,
    y: 0,
    width: 120,
    height: 40,
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

describe("scale helpers", () => {
  it("maps real body length to viewport pixels through tank width", () => {
    expect(
      getTargetBodyLengthPx({
        viewportWidthPx: 600,
        tankWidthCm: TANK_60CM.widthCm,
        realBodyLengthCm: 6,
      }),
    ).toBe(60);
  });

  it("calculates sprite scale from source body bounds width", () => {
    expect(
      getBaseSpriteScale({
        viewportWidthPx: 600,
        tankWidthCm: TANK_60CM.widthCm,
        species,
      }),
    ).toBe(0.5);
  });

  it("keeps variance and depth compensation weak", () => {
    expect(applyBodyLengthVariance(1, 2)).toBe(1.15);
    expect(applyDepthScale(1, 1)).toBeCloseTo(0.94);
  });

  it("combines body variance and depth while clamping unsafe inputs", () => {
    expect(
      getFishSpriteScale({
        viewportWidthPx: 600,
        tankWidthCm: TANK_60CM.widthCm,
        species,
        bodyLengthVariance: 2,
        depth: -1,
      }),
    ).toBeCloseTo(0.5 * 1.15 * 1.04);
  });
});
