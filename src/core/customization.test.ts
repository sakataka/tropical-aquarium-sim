import { testFiles } from "./testFiles";
import { describe, expect, test } from "bun:test";
import { fishCatalog, getLoadedTanks, getSceneById, getTankById } from "./catalog";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  createDefaultState,
  getDefaultLayout,
  normalizeAquariumPersistedState,
  normalizeHallCustomizations,
  setStockCount,
} from "./customization";
import { defaultTankId, getHallLayout, halls as fishRooms } from "./museum";
import { getStructurePoints } from "./plateFraming";

const aquariumTanks = getLoadedTanks();
const sceneFolders = Object.keys(testFiles("../content/environment/scenes/*/scene.json", import.meta.url))
  .map((path) => path.split("/").slice(-2)[0]!);
const asia = getTankById("asia-60")!;
const cube = getTankById("cube-30")!;

describe("tanks", () => {
  test("define tanks whose scenes and species exist, keeping the first seven tank ids", () => {
    expect(AQUARIUM_STATE_STORAGE_KEY).toContain(".v5");
    // 保存データは水槽IDで持つので、最初の7水槽のIDは変えない。
    expect(aquariumTanks.map((tank) => tank.id)).toEqual(expect.arrayContaining(["asia-60", "amazon-90", "cube-30", "japan-60", "malawi-120", "reef-120", "ancient-180"]));
    const assignedScenes = aquariumTanks.flatMap((tank) => tank.sceneIds);
    expect(new Set(assignedScenes).size).toBe(assignedScenes.length);
    expect([...assignedScenes].sort()).toEqual([...sceneFolders].sort());
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

  test("place every tank once across the halls, at most six to a hall", () => {
    expect(fishRooms.flatMap((room) => room.tankIds).sort())
      .toEqual(aquariumTanks.map((tank) => tank.id).sort());
    for (const room of fishRooms) expect(room.tankIds.length, room.id).toBeLessThanOrEqual(6);
    for (const { glass } of fishRooms.flatMap((room) => getHallLayout(room.id)!.tanks)) {
      expect(glass.x + glass.width).toBeLessThanOrEqual(1);
      expect(glass.y + glass.height).toBeLessThanOrEqual(1);
    }
  });

  test("only accept species the tank allows, up to its limits", () => {
    expect(setStockCount([], "guppy", 3, asia)).toEqual([]);
    expect(setStockCount([], "guppy", 99, cube))
      .toEqual([{ speciesId: "guppy", count: 6 }]);
    let stock = setStockCount([], "white-cloud-minnow", 10, cube);
    stock = setStockCount(stock, "guppy", 6, cube);
    stock = setStockCount(stock, "platy", 4, cube);
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
  const roundTrip = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

  test("starts empty and fills a hall's tanks with their default stock and scene when the hall is loaded", () => {
    const state = createDefaultState();
    expect(state.activeTankId).toBe(defaultTankId);
    expect(state.tanks).toEqual({});
    const tanks = normalizeHallCustomizations(state.tanks, [asia, cube]);
    expect(Object.keys(tanks).sort()).toEqual(["asia-60", "cube-30"]);
    for (const tank of [asia, cube]) {
      expect(tanks[tank.id]).toEqual({ stock: tank.defaultStock, layout: getDefaultLayout(tank) });
    }
  });

  test("keeps saved settings of tanks in halls not yet loaded, and checks their stock when the hall loads", () => {
    const saved = {
      version: 5,
      activeTankId: "reef-120",
      tanks: {
        "cube-30": { stock: [{ speciesId: "guppy", count: 4 }], layout: { sceneId: "cube-stones", lighting: "evening" as const } },
        "reef-120": { stock: [], layout: { sceneId: "missing", lighting: "night" } },
        "removed-tank": { stock: [], layout: { sceneId: "planted", lighting: "night" } },
      },
      preferences: { soundEnabled: true, soundVolume: 0.27 },
    };
    const restored = normalizeAquariumPersistedState(roundTrip(saved))!;
    expect(restored.activeTankId).toBe("reef-120");
    expect(Object.keys(restored.tanks).sort()).toEqual(["cube-30", "reef-120"]);
    expect(restored.tanks["cube-30"]).toEqual(saved.tanks["cube-30"]);
    // 選べない水景は、水槽の最初の水景に戻す。照明は選んだものを残す。
    const reef = getTankById("reef-120")!;
    expect(restored.tanks["reef-120"]!.layout).toEqual({ sceneId: reef.sceneIds[0], lighting: "night" });
    expect(restored.preferences).toEqual({ soundEnabled: false, soundVolume: 0.27 });
    // 読み直しても変わらない。展示室を読んでも、選んだ匹数（空の水槽も）を残す。
    expect(normalizeAquariumPersistedState(roundTrip(restored))).toEqual(restored);
    const loaded = normalizeHallCustomizations(restored.tanks, [cube, reef]);
    expect(loaded["cube-30"]).toEqual(saved.tanks["cube-30"]);
    expect(loaded["reef-120"]!.stock).toEqual([]);
  });

  test("keeps a saved collection unchanged when species are added to the tank", () => {
    const saved = {
      "cube-30": {
        stock: [{ speciesId: "guppy", count: 4 }, { speciesId: "otocinclus", count: 2 }],
        layout: { sceneId: "cube-stones", lighting: "evening" as const },
      },
    };
    const restored = normalizeHallCustomizations(saved, [cube]);
    expect(restored["cube-30"]).toEqual(saved["cube-30"]);
    const stock = setStockCount(restored["cube-30"]!.stock, "clown-killifish", 3, cube);
    expect(stock).toContainEqual({ speciesId: "clown-killifish", count: 3 });
    expect(stock).toContainEqual({ speciesId: "guppy", count: 4 });
  });

  test("recovers malformed data per tank", () => {
    expect(normalizeAquariumPersistedState({ version: 5 })).toBeUndefined();
    expect(normalizeAquariumPersistedState({ version: 4, activeTankId: "asia-60", tanks: {} })).toBeUndefined();
    const state = normalizeAquariumPersistedState({
      version: 5,
      activeTankId: "missing",
      tanks: {
        "asia-60": {
          stock: [{ speciesId: "angelfish", count: 2 }, { speciesId: "cherry-barb", count: 99 }, "broken"],
          layout: { sceneId: "amazon-planted", lighting: "night" },
        },
        "cube-30": "broken",
      },
      preferences: { soundEnabled: true, soundVolume: 3 },
    })!;
    expect(state.activeTankId).toBe(defaultTankId);
    expect(state.tanks["cube-30"]).toBeUndefined();
    expect(state.preferences).toEqual({ soundEnabled: false, soundVolume: 1 });
    const loaded = normalizeHallCustomizations(state.tanks, [asia, cube]);
    expect(loaded["asia-60"]).toEqual({
      stock: [{ speciesId: "cherry-barb", count: 10 }],
      layout: { sceneId: asia.sceneIds[0], lighting: "night" },
    });
    expect(loaded["cube-30"]).toEqual({ stock: cube.defaultStock, layout: getDefaultLayout(cube) });
  });
});
