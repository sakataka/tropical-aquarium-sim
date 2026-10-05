import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  createDefaultState,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";
import { fishRooms, getRoomForTank } from "./room";
import { getStructurePoints } from "./plateFraming";
import { getSceneById, sceneHeaders as aquariumScenes } from "./sceneCatalog";
import { aquariumTanks, getTankById } from "./tankCatalog";

const asia = getTankById("asia-60")!;
const cube = getTankById("cube-30")!;

describe("tanks", () => {
  test("define seven tanks whose scenes and species exist", () => {
    expect(AQUARIUM_STATE_STORAGE_KEY).toContain(".v5");
    expect(aquariumTanks.map((tank) => tank.id)).toEqual(["asia-60", "amazon-90", "cube-30", "japan-60", "malawi-120", "reef-120", "ancient-180"]);
    const assignedScenes = aquariumTanks.flatMap((tank) => tank.sceneIds);
    expect(new Set(assignedScenes).size).toBe(assignedScenes.length);
    expect([...assignedScenes].sort()).toEqual(aquariumScenes.map((scene) => scene.id).sort());
    for (const tank of aquariumTanks) {
      for (const slot of tank.species) expect(fishCatalog[slot.speciesId]).toBeDefined();
      for (const slot of tank.species) {
        expect(tank.defaultStock.find((entry) => entry.speciesId === slot.speciesId)?.count).toBeGreaterThanOrEqual(1);
      }
      for (const entry of tank.defaultStock) {
        expect(tank.species.map((slot) => slot.speciesId)).toContain(entry.speciesId);
        expect(entry.count).toBeLessThanOrEqual(tank.species.find((slot) => slot.speciesId === entry.speciesId)!.maxCount);
      }
      expect(tank.defaultStock.reduce((sum, entry) => sum + entry.count, 0)).toBeLessThanOrEqual(tank.maxTotalFish);
    }
    // 今の魚種は、どれかひとつの水槽に入れられる。
    const placeable = new Set(aquariumTanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)));
    expect([...placeable].sort()).toEqual(Object.keys(fishCatalog).sort());
  });

  test("place every tank once across the two rooms", () => {
    expect(fishRooms.flatMap((room) => room.tanks.map((item) => item.tankId)).sort())
      .toEqual(aquariumTanks.map((tank) => tank.id).sort());
    expect(fishRooms.map((room) => room.tanks.length)).toEqual([5, 2]);
    for (const { glass } of fishRooms.flatMap((room) => room.tanks)) {
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

  test("places scene structure points through the plate framing, in tank centimetres", () => {
    const scene = getSceneById("driftwood")!;
    const frame = { x: -.1, y: -.2, width: 1.2, height: 1.2 };
    const points = getStructurePoints(asia, scene, frame);
    expect(points[0]!.x).toBeCloseTo((frame.x + scene.structurePoints[0]!.x * frame.width) * asia.widthCm);
    expect(points[0]!.y).toBeCloseTo((frame.y + scene.structurePoints[0]!.y * frame.height) * asia.heightCm);
  });
});

describe("saved state", () => {
  test("carries the saved count of a species moved to another tank, once, without touching chosen counts", () => {
    const saved = createDefaultState(fishCatalog);
    saved.tanks["cube-30"]!.stock = [{ speciesId: "ember-tetra", count: 6 }, { speciesId: "zebra-danio", count: 4 }];
    saved.tanks["asia-60"]!.stock = [{ speciesId: "harlequin-rasbora", count: 10 }];
    const restored = normalizeAquariumPersistedState(JSON.parse(JSON.stringify(saved)), fishCatalog)!;
    expect(restored.tanks["cube-30"]!.stock).toEqual([{ speciesId: "ember-tetra", count: 6 }]);
    expect(restored.tanks["asia-60"]!.stock).toEqual([
      { speciesId: "harlequin-rasbora", count: 10 }, { speciesId: "zebra-danio", count: 4 }]);
    // 移し先ですでに選んである匹数は上書きしない。
    saved.tanks["asia-60"]!.stock = [{ speciesId: "zebra-danio", count: 1 }];
    expect(normalizeAquariumPersistedState(JSON.parse(JSON.stringify(saved)), fishCatalog)!.tanks["asia-60"]!.stock)
      .toEqual([{ speciesId: "zebra-danio", count: 1 }]);
  });

  test("adds the second room to an existing five-tank save, preserving manual changes", () => {
    const old = createDefaultState(fishCatalog);
    delete old.tanks["reef-120"];
    delete old.tanks["ancient-180"];
    old.tanks["asia-60"]!.stock = [];
    old.tanks["japan-60"]!.layout.lighting = "night";
    old.activeTankId = "japan-60";
    old.preferences.soundVolume = .27;
    const restored = normalizeAquariumPersistedState(JSON.parse(JSON.stringify(old)), fishCatalog)!;
    for (const id of Object.keys(old.tanks)) expect(restored.tanks[id]).toEqual(old.tanks[id]);
    expect(restored.activeTankId).toBe(old.activeTankId);
    expect(restored.preferences).toEqual(old.preferences);
    for (const id of ["reef-120", "ancient-180"]) {
      expect(restored.tanks[id]).toEqual(createDefaultState(fishCatalog).tanks[id]);
      expect(getRoomForTank(id).id).toBe("special");
    }
    restored.activeTankId = "ancient-180";
    restored.tanks["reef-120"]!.stock = [];
    expect(normalizeAquariumPersistedState(restored, fishCatalog)).toEqual(restored);
    expect(setStockCount(old.tanks["asia-60"]!.stock, "ocellaris-clownfish", 1, asia, fishCatalog)).toEqual([]);
  });
  test("adds requested species once to the two preview tanks, preserving the other three and manual counts", () => {
    const preview = createDefaultState(fishCatalog);
    preview.tanks["asia-60"]!.stock = [];
    preview.tanks["japan-60"]!.stock = [{ speciesId: "medaka", count: 8 }, { speciesId: "amano-shrimp", count: 3 }];
    preview.tanks["malawi-120"]!.stock = [{ speciesId: "yellow-lab", count: 7 }, { speciesId: "yellow-tail-acei", count: 4 }];
    preview.tanks["japan-60"]!.layout.lighting = "evening";
    const { fiveTankStockVersion: _, ...withoutExpansion } = preview;
    const expanded = normalizeAquariumPersistedState(withoutExpansion, fishCatalog)!;
    for (const id of ["asia-60", "amazon-90", "cube-30"]) expect(expanded.tanks[id]).toEqual(preview.tanks[id]);
    expect(expanded.tanks["japan-60"]!.stock).toEqual([
      ...preview.tanks["japan-60"]!.stock, { speciesId: "japanese-bitterling", count: 4 }, { speciesId: "japanese-loach", count: 2 },
    ]);
    expect(expanded.tanks["malawi-120"]!.stock).toEqual([
      ...preview.tanks["malawi-120"]!.stock, { speciesId: "saulosi", count: 6 }, { speciesId: "rusty-cichlid", count: 3 },
    ]);
    expect(expanded.tanks["japan-60"]!.layout.lighting).toBe("evening");
    expect(expanded.fiveTankStockVersion).toBe(1);
    expanded.tanks["japan-60"]!.stock = [];
    expect(normalizeAquariumPersistedState(expanded, fishCatalog)).toEqual(expanded);
  });

  test("adds two populated tanks to a three-tank save without rearranging existing tanks", () => {
    const previous = createDefaultState(fishCatalog);
    delete previous.tanks["japan-60"];
    delete previous.tanks["malawi-120"];
    previous.activeTankId = "cube-30";
    previous.tanks["asia-60"] = { stock: [], layout: { sceneId: "iwagumi", lighting: "night" } };
    previous.tanks["cube-30"]!.stock = [{ speciesId: "guppy", count: 4 }];
    previous.preferences.soundVolume = 0.27;
    const restored = normalizeAquariumPersistedState(JSON.parse(JSON.stringify(previous)), fishCatalog)!;
    for (const id of ["asia-60", "amazon-90", "cube-30"]) expect(restored.tanks[id]).toEqual(previous.tanks[id]);
    expect(restored.stockArrangementVersion).toBe(previous.stockArrangementVersion);
    expect(restored.activeTankId).toBe("cube-30");
    expect(restored.preferences.soundVolume).toBe(0.27);
    for (const id of ["japan-60", "malawi-120"]) {
      expect(restored.tanks[id]).toEqual(createDefaultState(fishCatalog).tanks[id]);
    }
    expect(normalizeAquariumPersistedState(restored, fishCatalog)).toEqual(restored);
  });

  test.each([undefined, 1, 2])("arranges stock version %s once without replacing scenery or later edits", (previousVersion) => {
    const old = createDefaultState(fishCatalog);
    old.activeTankId = "cube-30";
    old.tanks["asia-60"]!.layout = { sceneId: "iwagumi", lighting: "night" };
    old.tanks["cube-30"]!.layout = { sceneId: "cube-stones", lighting: "evening" };
    old.preferences = { ...old.preferences, soundVolume: 0.25 };
    for (const tank of aquariumTanks) old.tanks[tank.id]!.stock = [];
    const { stockArrangementVersion: _, ...withoutArrangement } = old;
    const arranged = normalizeAquariumPersistedState({ ...withoutArrangement, stockArrangementVersion: previousVersion }, fishCatalog)!;
    expect(arranged.stockArrangementVersion).toBe(3);
    expect(arranged.activeTankId).toBe(old.activeTankId);
    expect(arranged.preferences.soundVolume).toBe(0.25);
    for (const tank of aquariumTanks) {
      expect(arranged.tanks[tank.id]!.stock).toEqual(tank.defaultStock);
      expect(arranged.tanks[tank.id]!.layout).toEqual(old.tanks[tank.id]!.layout);
    }
    arranged.tanks["cube-30"]!.stock = [];
    const reloaded = normalizeAquariumPersistedState(JSON.parse(JSON.stringify(arranged)), fishCatalog)!;
    expect(reloaded.tanks).toEqual(arranged.tanks);
  });

  test("keeps an existing v5 collection unchanged when catalog species are added", () => {
    const state = createDefaultState(fishCatalog);
    state.tanks["cube-30"] = {
      stock: [{ speciesId: "guppy", count: 4 }, { speciesId: "otocinclus", count: 2 }],
      layout: { sceneId: "cube-stones", lighting: "evening" },
    };
    const restored = normalizeAquariumPersistedState(state, fishCatalog)!;
    expect(restored.tanks["cube-30"]).toEqual(state.tanks["cube-30"]);
    const stock = setStockCount(restored.tanks["cube-30"]!.stock, "clown-killifish", 3, cube, fishCatalog);
    expect(stock).toContainEqual({ speciesId: "clown-killifish", count: 3 });
    expect(stock).toContainEqual({ speciesId: "guppy", count: 4 });
  });

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
    expect(migrated.preferences).toEqual({ soundEnabled: false, soundVolume: 0.7 });
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
      stockArrangementVersion: 3,
      activeTankId: "missing",
      tanks: {
        "asia-60": {
          stock: [{ speciesId: "angelfish", count: 2 }, { speciesId: "cherry-barb", count: 99 }],
          layout: { sceneId: "amazon-planted", lighting: "night" },
        },
      },
      preferences: { soundEnabled: true, soundVolume: 0.3 },
    }, fishCatalog)!;
    expect(state.activeTankId).toBe("asia-60");
    expect(state.tanks["asia-60"]).toEqual({
      stock: [{ speciesId: "cherry-barb", count: 10 }],
      layout: { sceneId: "planted", lighting: "night" },
    });
    expect(state.tanks["cube-30"]).toEqual(createDefaultState(fishCatalog).tanks["cube-30"]);
    expect(state.preferences).toEqual({ soundEnabled: false, soundVolume: 0.3 });
  });
});
