import { describe, expect, it } from "vitest";
import { parseFishSpeciesDefinition } from "./schema";

const validSpecies = {
  id: "valid-fish",
  displayName: "Valid Fish",
  realBodyLengthCm: 4,
  sideImage: "./side.png",
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
});
