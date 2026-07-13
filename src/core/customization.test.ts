import { describe, expect, it } from "vitest";
import { fishCatalog } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumPresets,
  getPresetById,
  normalizeAquariumCustomization,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";

describe("aquarium customization", () => {
  it("exposes stable built-in presets and storage key", () => {
    expect(CUSTOMIZATION_STORAGE_KEY).toBe("tropical-aquarium.customization.v1");
    expect(AQUARIUM_STATE_STORAGE_KEY).toBe("tropical-aquarium.state.v2");
    expect(getPresetById("community")?.displayName).toBe("コミュニティ水槽");
    expect(aquariumPresets.map((preset) => preset.id)).toEqual([
      "community",
      "school",
      "calm",
    ]);
    expect(aquariumPresets[0].stock).toEqual(
      expect.arrayContaining([
        { speciesId: "platy", count: 2 },
        { speciesId: "kuhli-loach", count: 1 },
        { speciesId: "white-cloud-minnow", count: 1 },
        { speciesId: "cherry-barb", count: 1 },
      ]),
    );
    expect(aquariumPresets[0].stock.reduce((sum, entry) => sum + entry.count, 0))
      .toBe(18);
  });

  it("normalizes versioned aquarium state without accepting unknown residents", () => {
    const normalized = normalizeAquariumPersistedState(
      {
        version: 2,
        customization: DEFAULT_CUSTOMIZATION,
        residents: [
          {
            id: "resident-1",
            speciesId: "neon-tetra",
            arrivedAtMs: 1_700_000_000_000,
            favorite: true,
            bodyLengthVariance: 1,
            hunger: 1.4,
            seed: 42,
          },
          {
            id: "unknown-1",
            speciesId: "unknown",
            arrivedAtMs: 1_700_000_000_000,
            favorite: false,
            bodyLengthVariance: 1,
            hunger: 0.5,
            seed: 43,
          },
        ],
        preferences: {
          tankName: " 木漏れ日の水槽 ",
          createdAtMs: 1_700_000_000_000,
          lastSeenAtMs: 1_700_000_000_000,
          lightingMode: "auto",
          soundEnabled: false,
          soundVolume: 2,
        },
      },
      fishCatalog,
    );

    expect(normalized?.residents).toHaveLength(1);
    expect(normalized?.residents[0].hunger).toBe(1);
    expect(normalized?.preferences.tankName).toBe("木漏れ日の水槽");
    expect(normalized?.preferences.soundVolume).toBe(1);
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
      expect.arrayContaining([
        { speciesId: "neon-tetra", count: 3 },
        { speciesId: "white-cloud-minnow", count: 1 },
        { speciesId: "cherry-barb", count: 1 },
      ]),
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
