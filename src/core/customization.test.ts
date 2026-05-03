import { describe, expect, it } from "vitest";
import { fishCatalog } from "./catalog";
import {
  CUSTOMIZATION_STORAGE_KEY,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumPresets,
  getPresetById,
  normalizeAquariumCustomization,
  setStockCount,
} from "./customization";

describe("aquarium customization", () => {
  it("exposes stable built-in presets and storage key", () => {
    expect(CUSTOMIZATION_STORAGE_KEY).toBe("tropical-aquarium.customization.v1");
    expect(getPresetById("community")?.displayName).toBe("コミュニティ水槽");
    expect(aquariumPresets.map((preset) => preset.id)).toEqual([
      "community",
      "school",
      "calm",
    ]);
  });

  it("normalizes missing and invalid saved data to the default preset", () => {
    const normalized = normalizeAquariumCustomization(
      {
        stock: [
          { speciesId: "unknown", count: 7 },
          { speciesId: "neon-tetra", count: 3 },
        ],
        environment: {
          lighting: "broken",
        },
      },
      fishCatalog,
    );

    expect(normalized.stock).toEqual(
      expect.arrayContaining([{ speciesId: "neon-tetra", count: 4 }]),
    );
    expect(normalized.environment.lighting).toBe("natural");
  });

  it("clamps species counts and total fish count", () => {
    const normalized = normalizeAquariumCustomization(
      {
        stock: [
          { speciesId: "neon-tetra", count: 99 },
          { speciesId: "harlequin-rasbora", count: 12 },
          { speciesId: "corydoras", count: 12 },
          { speciesId: "guppy", count: 12 },
        ],
        environment: {
          backgroundStyle: "deep",
          rearPlants: "full",
          foregroundPlants: "subtle",
          plantDensity: "high",
          lighting: "night",
        },
      },
      fishCatalog,
    );

    expect(normalized.stock.find((entry) => entry.speciesId === "neon-tetra")?.count)
      .toBe(MAX_FISH_PER_SPECIES);
    expect(normalized.stock.reduce((sum, entry) => sum + entry.count, 0))
      .toBe(MAX_TOTAL_FISH);
  });

  it("updates one species count without dropping the rest of the stock", () => {
    const stock = setStockCount(
      [
        { speciesId: "neon-tetra", count: 4 },
        { speciesId: "corydoras", count: 2 },
      ],
      "corydoras",
      5,
      fishCatalog,
    );

    expect(stock).toEqual(
      expect.arrayContaining([
        { speciesId: "neon-tetra", count: 4 },
        { speciesId: "corydoras", count: 5 },
      ]),
    );
  });
});
