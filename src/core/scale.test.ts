import { describe, expect, test } from "bun:test";
import { fishCatalog } from "./catalog";
import { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";

describe("fish scale", () => {
  test("matches shrimp body length without counting its long antennae", () => {
    const species = fishCatalog["amano-shrimp"];
    const scale = getBaseSpriteScale({ viewportWidthPx: 1200, tankWidthCm: 60, species });
    const bodyWidth = species.sourceBodyBounds.width * (1 - species.swim!.headStart!);
    expect(bodyWidth * scale).toBeCloseTo(80);
  });
  test("maps real body length to the 60cm tank width", () => {
    expect(getTargetBodyLengthPx({ viewportWidthPx: 1200, tankWidthCm: 60, realBodyLengthCm: 3 }))
      .toBe(60);
  });

  test("uses source body bounds and restrained depth variance", () => {
    const species = fishCatalog["neon-tetra"];
    const base = getBaseSpriteScale({ viewportWidthPx: 1200, tankWidthCm: 60, species });
    const near = getFishSpriteScale({
      viewportWidthPx: 1200, tankWidthCm: 60, species, bodyLengthVariance: 1, depth: 0,
    });
    const far = getFishSpriteScale({
      viewportWidthPx: 1200, tankWidthCm: 60, species, bodyLengthVariance: 1, depth: 1,
    });
    expect(base).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(far);
    expect(near / far).toBeLessThan(1.2);
  });
});
