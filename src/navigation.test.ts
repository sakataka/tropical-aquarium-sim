import { afterEach, describe, expect, test } from "bun:test";
import { AQUARIUM_STATE_STORAGE_KEY, createDefaultState } from "./core/customization";
import { buildings, defaultBuilding, getHallOfTank, getTankSummary } from "./core/museum";
import { loadInitialState, searchForPhase, type Phase } from "./navigation";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
function stubWindow(value: unknown) { Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value }); }

function openLocation(search: string, saved: string | null = null) {
  stubWindow({
    location: { search },
    localStorage: { getItem: (key: string) => key === AQUARIUM_STATE_STORAGE_KEY ? saved : null },
  });
  return loadInitialState();
}

describe("navigation URLs", () => {
  test("maps stable screens to their existing query format", () => {
    const otherBuilding = buildings.find((building) => building.id !== defaultBuilding.id)!;
    expect(searchForPhase({ kind: "map" }, "asia-60", null)).toBe("");
    expect(searchForPhase({ kind: "map", buildingId: defaultBuilding.id }, "asia-60", null)).toBe("");
    expect(searchForPhase({ kind: "map", buildingId: otherBuilding.id }, "asia-60", null)).toBe(`?building=${otherBuilding.id}`);
    expect(searchForPhase({ kind: "map", floorId: "rivers", buildingId: otherBuilding.id }, "asia-60", null)).toBe("?floor=rivers");
    expect(searchForPhase({ kind: "room" }, "asia-60", null)).toBe(`?hall=${getHallOfTank("asia-60").id}`);
    expect(searchForPhase({ kind: "tank" }, "asia-60", null)).toBe("?tank=asia-60");
  });

  const transitions: Phase[] = [
    { kind: "toTank", tankReady: false },
    { kind: "toTank", tankReady: true },
    { kind: "toRoom", returningFrom: "asia-60", roomReady: false },
    { kind: "toRoom", returningFrom: "asia-60", roomReady: true },
    { kind: "leaveTank", to: "cube-30", direction: "next" },
    { kind: "switchTank", direction: "previous", tankReady: false },
    { kind: "switchTank", direction: "previous", tankReady: true },
  ];
  test.each(transitions)("keeps the URL during $kind transitions", (phase) => {
    expect(searchForPhase(phase, "asia-60", null)).toBeNull();
    expect(searchForPhase(phase, "asia-60", { speciesId: null })).toBe("?zukan");
    expect(searchForPhase(phase, "asia-60", { speciesId: "neon-tetra" })).toBe("?zukan=neon-tetra");
  });
});

describe("initial navigation and saved state", () => {
  test("opens the map while restoring the last tank and saved preferences", () => {
    const saved = { ...createDefaultState(), activeTankId: "reef-120", preferences: { soundEnabled: true, soundVolume: 0.27 } };
    const initial = openLocation("", JSON.stringify(saved));
    expect(initial.phase).toEqual({ kind: "map" });
    expect(initial.state.activeTankId).toBe("reef-120");
    expect(initial.state.preferences).toEqual({ soundEnabled: false, soundVolume: 0.27 });
    expect(initial.restored).toBe(true);
  });

  test.each([null, "{broken", JSON.stringify({ version: 4 })])("falls back for missing or malformed storage: %s", (saved) => {
    const initial = openLocation("", saved);
    expect(initial.state).toEqual(createDefaultState());
    expect(initial.phase.kind).toBe("map");
    expect(initial.restored).toBe(false);
  });

  test("continues to honor a direct tank link when storage is unavailable", () => {
    stubWindow({
      location: { search: "?tank=reef-120" },
      localStorage: { getItem: () => { throw new Error("storage unavailable"); } },
    });
    const initial = loadInitialState();
    expect(initial.state.activeTankId).toBe("reef-120");
    expect(initial.phase).toEqual({ kind: "tank" });
    expect(initial.restored).toBe(false);
  });

  test("gives the guide priority over underlying screen parameters", () => {
    const initial = openLocation("?zukan=neon-tetra&tank=reef-120&hall=amazon&floor=rivers");
    expect(initial.phase).toEqual({ kind: "map" });
    expect(initial.zukan).toEqual({ speciesId: "neon-tetra" });
    expect(openLocation("?zukan").zukan).toEqual({ speciesId: null });
  });

  test("gives explicit tanks priority over halls, floors, and saved selection", () => {
    const saved = JSON.stringify({ ...createDefaultState(), activeTankId: "cube-30" });
    const initial = openLocation("?tank=reef-120&hall=amazon&floor=rivers", saved);
    expect(initial.state.activeTankId).toBe("reef-120");
    expect(initial.phase).toEqual({ kind: "tank" });
  });

  test("resolves theme links and defers applying the scene until the hall loads", () => {
    const sceneId = getTankSummary("asia-60")!.sceneIds[1]!;
    const initial = openLocation(`?theme=${sceneId}`);
    expect(initial.state.activeTankId).toBe("asia-60");
    expect(initial.phase).toEqual({ kind: "tank" });
    expect(initial.pendingScene).toEqual({ tankId: "asia-60", sceneId });
    expect(initial.state.tanks).toEqual({});
  });

  test("keeps a saved tank in the requested hall and selects the first tank otherwise", () => {
    const hall = getHallOfTank("asia-60");
    const lastTank = hall.tankIds[1]!;
    const initial = openLocation(`?hall=${hall.id}`, JSON.stringify({ ...createDefaultState(), activeTankId: lastTank }));
    expect(initial.state.activeTankId).toBe(lastTank);
    expect(initial.phase).toEqual({ kind: "room" });
    const anotherHall = getHallOfTank("reef-120");
    expect(openLocation(`?hall=${anotherHall.id}`).state.activeTankId).toBe(anotherHall.tankIds[0]);
  });

  test("resolves valid map parameters and discards unknown destinations", () => {
    const building = buildings.find((item) => item.id !== defaultBuilding.id)!;
    expect(openLocation(`?building=${building.id}`).phase).toEqual({ kind: "map", buildingId: building.id });
    expect(openLocation("?floor=rivers").phase).toEqual({ kind: "map", floorId: "rivers" });
    const initial = openLocation("?tank=unknown&theme=unknown&hall=unknown&floor=unknown&building=unknown");
    expect(initial.phase).toEqual({ kind: "map" });
    expect(initial.state).toEqual(createDefaultState());
    expect(initial.pendingScene).toBeUndefined();
  });
});
