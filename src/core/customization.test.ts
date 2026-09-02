import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumThemes,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";
import { DECOR_SLOT_IDS, decorAssets, decorAssetsById } from "./environmentCatalog";

describe("aquarium customization", () => {
  test("defines three complete themes and sixteen assets", () => {
    expect(AQUARIUM_STATE_STORAGE_KEY).toContain(".v3");
    expect(aquariumThemes.map((theme) => theme.id))
      .toEqual(["planted", "driftwood", "iwagumi"]);
    expect(decorAssets).toHaveLength(16);
    for (const theme of aquariumThemes) {
      expect(Object.keys(theme.layout.slots).sort()).toEqual([...DECOR_SLOT_IDS].sort());
      for (const [slotId, placement] of Object.entries(theme.layout.slots)) {
        if (!placement) continue;
        expect(decorAssetsById[placement.assetId].allowedSlots).toContain(slotId);
      }
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

  test("migrates v2 counts, sound, lighting and legacy background to v3", () => {
    const migrated = migrateLegacyAquariumState({
      version: 2,
      customization: {
        stock: [{ speciesId: "neon-tetra", count: 8 }],
        environment: { backgroundStyle: "deep", lighting: "evening" },
      },
      preferences: { soundEnabled: true, soundVolume: 0.7, tankName: "old" },
      residents: [{ id: "old-id", nickname: "Blue", hunger: 0.2, favorite: true }],
    }, fishCatalog)!;
    expect(migrated.version).toBe(3);
    expect(migrated.customization.stock).toEqual([{ speciesId: "neon-tetra", count: 8 }]);
    expect(migrated.customization.layout.themeId).toBe("driftwood");
    expect(migrated.customization.layout.lighting).toBe("evening");
    expect(migrated.preferences).toEqual({ soundEnabled: true, soundVolume: 0.7 });
    expect(JSON.stringify(migrated)).not.toMatch(/nickname|hunger|favorite|tankName|old-id/);
  });

  test("keeps the v1 migration path and recovers malformed v3 data", () => {
    const v1 = migrateLegacyAquariumState({
      stock: [{ speciesId: "guppy", count: 4 }],
      environment: { backgroundStyle: "bright", lighting: "night" },
    }, fishCatalog)!;
    expect(v1.customization.layout.themeId).toBe("iwagumi");
    expect(v1.customization.layout.lighting).toBe("night");
    expect(v1.customization.stock).toEqual([{ speciesId: "guppy", count: 4 }]);
    expect(normalizeAquariumPersistedState({ version: 3, nope: true }, fishCatalog))
      .toBeUndefined();
  });
});
