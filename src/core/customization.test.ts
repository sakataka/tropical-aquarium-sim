import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";
import { aquariumScenes } from "./sceneCatalog";

describe("aquarium customization", () => {
  test("discovers one-plate scenes from scene folders", () => {
    expect(AQUARIUM_STATE_STORAGE_KEY).toContain(".v4");
    expect(aquariumScenes.map((scene) => scene.id))
      .toEqual(["planted", "driftwood", "root-driftwood", "iwagumi"]);
    for (const scene of aquariumScenes) {
      expect(scene.structurePoints.length).toBeGreaterThan(0);
      expect(scene.bubbleSources.length).toBeGreaterThan(0);
    }
  });

  test("enforces per-species and whole-tank limits", () => {
    let stock = setStockCount([], "neon-tetra", 99, fishCatalog);
    expect(stock).toEqual([{ speciesId: "neon-tetra", count: MAX_FISH_PER_SPECIES }]);
    stock = setStockCount(stock, "guppy", 12, fishCatalog);
    stock = setStockCount(stock, "platy", 12, fishCatalog);
    expect(stock.reduce((sum, item) => sum + item.count, 0)).toBeLessThanOrEqual(MAX_TOTAL_FISH);
    expect(setStockCount([{ speciesId: "neon-tetra", count: 1 }], "neon-tetra", 0, fishCatalog))
      .toEqual([]);
  });

  test("migrates v2 counts, sound, lighting and legacy background to v4", () => {
    const migrated = migrateLegacyAquariumState({
      version: 2,
      customization: {
        stock: [{ speciesId: "neon-tetra", count: 8 }],
        environment: { backgroundStyle: "deep", lighting: "evening" },
      },
      preferences: { soundEnabled: true, soundVolume: 0.7, tankName: "old" },
      residents: [{ id: "old-id", nickname: "Blue", hunger: 0.2, favorite: true }],
    }, fishCatalog)!;
    expect(migrated.version).toBe(4);
    expect(migrated.customization.stock).toEqual([{ speciesId: "neon-tetra", count: 8 }]);
    expect(migrated.customization.layout.sceneId).toBe("driftwood");
    expect(migrated.customization.layout.lighting).toBe("evening");
    expect(migrated.preferences).toEqual({ soundEnabled: true, soundVolume: 0.7 });
    expect(JSON.stringify(migrated)).not.toMatch(/nickname|hunger|favorite|tankName|old-id/);
  });

  test("migrates a v3 slot layout to the matching scene", () => {
    const migrated = migrateLegacyAquariumState({
      version: 3,
      customization: {
        stock: [{ speciesId: "corydoras", count: 3 }],
        layout: {
          themeId: "iwagumi",
          backgroundId: "iwagumi-water",
          substrateId: "cool-gravel",
          lighting: "evening",
          slots: { "mid-left": { assetId: "seiryu-stones", flipped: false } },
        },
      },
      preferences: { soundEnabled: false, soundVolume: 0.3 },
    }, fishCatalog)!;
    expect(migrated.customization.layout).toEqual({ sceneId: "iwagumi", lighting: "evening" });
    expect(JSON.stringify(migrated)).not.toMatch(/slots|backgroundId|substrateId/);
  });

  test("keeps the v1 migration path and recovers malformed v4 data", () => {
    const v1 = migrateLegacyAquariumState({
      stock: [{ speciesId: "guppy", count: 4 }],
      environment: { backgroundStyle: "bright", lighting: "night" },
    }, fishCatalog)!;
    expect(v1.customization.layout.sceneId).toBe("iwagumi");
    expect(v1.customization.layout.lighting).toBe("night");
    expect(v1.customization.stock).toEqual([{ speciesId: "guppy", count: 4 }]);
    expect(normalizeAquariumPersistedState({ version: 4, nope: true }, fishCatalog))
      .toBeUndefined();
    expect(normalizeAquariumPersistedState({
      version: 4,
      customization: { stock: [], layout: { sceneId: "missing", lighting: "night" } },
      preferences: { soundEnabled: false, soundVolume: 0.4 },
    }, fishCatalog)?.customization.layout.sceneId).toBe("planted");
  });
});
