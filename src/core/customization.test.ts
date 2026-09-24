import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  createDefaultState,
  getStructurePoints,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";
import { fishRoom } from "./room";
import { aquariumScenes, getSceneById } from "./sceneCatalog";
import { aquariumTanks, getTankById } from "./tankCatalog";

const asia = getTankById("asia-60")!;
const cube = getTankById("cube-30")!;

describe("tanks", () => {
  test("define three tanks whose scenes and species exist", () => {
    expect(AQUARIUM_STATE_STORAGE_KEY).toContain(".v5");
    expect(aquariumTanks.map((tank) => tank.id)).toEqual(["asia-60", "amazon-90", "cube-30"]);
    const assignedScenes = aquariumTanks.flatMap((tank) => tank.sceneIds);
    expect(new Set(assignedScenes).size).toBe(assignedScenes.length);
    expect([...assignedScenes].sort()).toEqual(aquariumScenes.map((scene) => scene.id).sort());
    for (const tank of aquariumTanks) {
      for (const slot of tank.species) expect(fishCatalog[slot.speciesId]).toBeDefined();
      for (const entry of tank.defaultStock) {
        expect(tank.species.map((slot) => slot.speciesId)).toContain(entry.speciesId);
      }
    }
    // 今の魚種は、どれかひとつの水槽に入れられる。
    const placeable = new Set(aquariumTanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)));
    expect([...placeable].sort()).toEqual(Object.keys(fishCatalog).sort());
  });

  test("place every tank once in the fish room", () => {
    expect(fishRoom.tanks.map((item) => item.tankId).sort())
      .toEqual(aquariumTanks.map((tank) => tank.id).sort());
    for (const { glass } of fishRoom.tanks) {
      expect(glass.x + glass.width).toBeLessThanOrEqual(1);
      expect(glass.y + glass.height).toBeLessThanOrEqual(1);
    }
  });

  test("only accept species the tank allows, up to its limits", () => {
    expect(setStockCount([], "guppy", 3, asia, fishCatalog)).toEqual([]);
    expect(setStockCount([], "guppy", 99, cube, fishCatalog))
      .toEqual([{ speciesId: "guppy", count: 6 }]);
    let stock = setStockCount([], "white-cloud-minnow", 10, cube, fishCatalog);
    stock = setStockCount(stock, "guppy", 6, cube, fishCatalog);
    stock = setStockCount(stock, "platy", 4, cube, fishCatalog);
    expect(stock.reduce((sum, entry) => sum + entry.count, 0)).toBe(cube.maxTotalFish);
  });

  test("scales scene structure points to the tank size", () => {
    const scene = getSceneById("driftwood")!;
    const points = getStructurePoints(asia, { sceneId: scene.id, lighting: "natural" });
    expect(points[0]!.x).toBeCloseTo(scene.structurePoints[0]!.x * asia.widthCm);
    expect(points[0]!.y).toBeCloseTo(scene.structurePoints[0]!.y * asia.heightCm);
  });
});

describe("saved state", () => {
  test("moves a v4 single tank into the tanks that allow each species", () => {
    const migrated = migrateLegacyAquariumState({
      version: 4,
      customization: {
        stock: [
          { speciesId: "neon-tetra", count: 8 },
          { speciesId: "harlequin-rasbora", count: 5 },
          { speciesId: "guppy", count: 2 },
        ],
        layout: { sceneId: "iwagumi", lighting: "night" },
      },
      preferences: { soundEnabled: true, soundVolume: 0.7 },
    }, fishCatalog)!;
    expect(migrated.version).toBe(5);
    expect(migrated.activeTankId).toBe("asia-60");
    expect(migrated.tanks["asia-60"]).toEqual({
      stock: [{ speciesId: "harlequin-rasbora", count: 5 }],
      layout: { sceneId: "iwagumi", lighting: "night" },
    });
    expect(migrated.tanks["amazon-90"]!.stock).toEqual([{ speciesId: "neon-tetra", count: 8 }]);
    expect(migrated.tanks["cube-30"]!.stock).toEqual([{ speciesId: "guppy", count: 2 }]);
    expect(migrated.preferences).toEqual({ soundEnabled: true, soundVolume: 0.7 });
  });

  test("keeps v1-v3 migration paths", () => {
    const v3 = migrateLegacyAquariumState({
      version: 3,
      customization: {
        stock: [{ speciesId: "corydoras", count: 3 }],
        layout: { themeId: "driftwood", lighting: "evening", slots: {} },
      },
    }, fishCatalog)!;
    expect(v3.tanks["asia-60"]!.layout).toEqual({ sceneId: "driftwood", lighting: "evening" });
    expect(v3.tanks["amazon-90"]!.stock).toEqual([{ speciesId: "corydoras", count: 3 }]);
    expect(JSON.stringify(v3)).not.toMatch(/slots|themeId/);

    const v1 = migrateLegacyAquariumState({
      stock: [{ speciesId: "guppy", count: 4 }],
      environment: { backgroundStyle: "bright", lighting: "night" },
    }, fishCatalog)!;
    expect(v1.tanks["asia-60"]!.layout).toEqual({ sceneId: "iwagumi", lighting: "night" });
    expect(v1.tanks["cube-30"]!.stock).toEqual([{ speciesId: "guppy", count: 4 }]);
  });

  test("recovers malformed v5 data per tank", () => {
    expect(normalizeAquariumPersistedState({ version: 5 }, fishCatalog)).toBeUndefined();
    const state = normalizeAquariumPersistedState({
      version: 5,
      activeTankId: "missing",
      tanks: {
        "asia-60": {
          stock: [{ speciesId: "angelfish", count: 2 }, { speciesId: "cherry-barb", count: 99 }],
          layout: { sceneId: "amazon-planted", lighting: "night" },
        },
      },
      preferences: { soundEnabled: "yes" },
    }, fishCatalog)!;
    expect(state.activeTankId).toBe("asia-60");
    expect(state.tanks["asia-60"]).toEqual({
      stock: [{ speciesId: "cherry-barb", count: 10 }],
      layout: { sceneId: "planted", lighting: "night" },
    });
    expect(state.tanks["cube-30"]).toEqual(createDefaultState(fishCatalog).tanks["cube-30"]);
    expect(state.preferences.soundEnabled).toBe(false);
  });
});
