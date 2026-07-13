import { afterEach, describe, expect, it, vi } from "vitest";
import { aquariumPresets, DEFAULT_CUSTOMIZATION } from "./customization";
import {
  createFishFromStock,
  getMatchingPresetId,
  getStockCount,
  hydrateFishResidents,
  reconcileFishStock,
  toFishResidents,
} from "./fishPopulation";

describe("fish population helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates stable species counts from stock entries", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const fish = createFishFromStock([
      { speciesId: "neon-tetra", count: 2 },
      { speciesId: "corydoras", count: 1 },
    ]);

    expect(fish.map((item) => item.speciesId)).toEqual([
      "neon-tetra",
      "neon-tetra",
      "corydoras",
    ]);
    expect(fish.map((item) => item.targetKind)).toEqual([
      "openWater",
      "openWater",
      "openWater",
    ]);
    expect(fish[0].seed).toBe(1000);
    expect(fish[1].seed).toBe(8919);
    expect(fish[2].seed).toBe(1000 + 7 * 7919);
  });

  it("reconciles stock changes by keeping existing fish before adding new ones", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = createFishFromStock([
      { speciesId: "neon-tetra", count: 2 },
      { speciesId: "corydoras", count: 1 },
    ]);

    const next = reconcileFishStock(initial, [
      { speciesId: "neon-tetra", count: 1 },
      { speciesId: "corydoras", count: 2 },
    ]);

    expect(next).toHaveLength(3);
    expect(next[0]).toBe(initial[0]);
    expect(next[1]).toBe(initial[2]);
    expect(next[2].speciesId).toBe("corydoras");
    expect(next[2].id).not.toBe(initial[2].id);
  });

  it("restores the same resident identity and applies gentle offline hunger", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const initial = createFishFromStock([
      { speciesId: "neon-tetra", count: 1 },
    ]);
    initial[0].nickname = "ルリ";
    initial[0].favorite = true;
    initial[0].hunger = 0.4;

    const restored = hydrateFishResidents(
      toFishResidents(initial),
      [{ speciesId: "neon-tetra", count: 1 }],
      12 * 3_600_000,
      1_700_043_200_000,
    );

    expect(restored[0].id).toBe(initial[0].id);
    expect(restored[0].nickname).toBe("ルリ");
    expect(restored[0].favorite).toBe(true);
    expect(restored[0].bodyLengthVariance).toBe(initial[0].bodyLengthVariance);
    expect(restored[0].hunger).toBeCloseTo(0.58);
  });

  it("matches presets by stock and environment regardless of stock order", () => {
    expect(getMatchingPresetId(aquariumPresets, DEFAULT_CUSTOMIZATION)).toBe("community");
    expect(
      getMatchingPresetId(aquariumPresets, {
        ...DEFAULT_CUSTOMIZATION,
        stock: [...DEFAULT_CUSTOMIZATION.stock].reverse(),
      }),
    ).toBe("community");
  });

  it("returns zero for missing stock counts", () => {
    expect(getStockCount(DEFAULT_CUSTOMIZATION.stock, "neon-tetra")).toBe(3);
    expect(getStockCount(DEFAULT_CUSTOMIZATION.stock, "missing")).toBe(0);
  });
});
