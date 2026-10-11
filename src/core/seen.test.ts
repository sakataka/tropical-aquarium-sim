import { describe, expect, test } from "vitest";
import { getLoadedTanks } from "./catalog";
import { tankSummaries } from "./museum";
import {
  SEEN_STORAGE_KEY,
  countUnseenTanks,
  getUnseenSpecies,
  loadSeenState,
  loadTankSpecies,
  markTankSeen,
  normalizeSeenState,
  saveSeenState,
} from "./seen";

const tankSpecies = { river: ["ayu", "dace"], pond: ["medaka"], reef: ["clownfish", "tang"] };

/** 保存先の代わり。 */
function memoryStorage(initial?: string) {
  const items = new Map<string, string>(initial === undefined ? [] : [[SEEN_STORAGE_KEY, initial]]);
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

describe("unseen tanks and species", () => {
  test("a tank never visited is new with all its species, and a species added later is new on its own", () => {
    const unseen = getUnseenSpecies(tankSpecies, { river: ["ayu"], pond: ["medaka"] });
    expect(unseen).toEqual({ river: ["dace"], reef: ["clownfish", "tang"] });
    // 既読は水槽ごとに数える。別の水槽で見た種でも、この水槽では未読。
    expect(getUnseenSpecies({ river: ["ayu"], pond: ["ayu"] }, { river: ["ayu"] })).toEqual({ pond: ["ayu"] });
  });

  test("halls, floors and buildings count the new tanks below them", () => {
    const unseen = getUnseenSpecies(tankSpecies, { pond: ["medaka"] });
    expect(countUnseenTanks(["river", "pond", "reef"], unseen)).toBe(2);
    expect(countUnseenTanks(["pond"], unseen)).toBe(0);
    // 水槽ごとの種の並びを読めるまでは、印を出さない。
    expect(countUnseenTanks(["river", "pond", "reef"], undefined)).toBe(0);
  });

  test("entering a tank marks its current species as seen and leaves the other tanks new", () => {
    const seen = markTankSeen({ pond: ["medaka"] }, "river", tankSpecies.river);
    expect(seen).toEqual({ pond: ["medaka"], river: ["ayu", "dace"] });
    expect(getUnseenSpecies(tankSpecies, seen)).toEqual({ reef: ["clownfish", "tang"] });
    // もう未読のない水槽に入り直しても、状態は変わらない（保存し直さない）。
    expect(markTankSeen(seen, "river", tankSpecies.river)).toBe(seen);
    // 水槽から外れた種の既読は残り、戻ってきても未読にならない。
    const later = markTankSeen(seen, "river", ["ayu", "char"]);
    expect(later.river).toEqual(["ayu", "dace", "char"]);
    expect(getUnseenSpecies({ river: ["ayu", "dace", "char"] }, later)).toEqual({});
  });

  test("a tank with no species is still recorded once visited", () => {
    const seen = markTankSeen({}, "empty", []);
    expect(seen).toEqual({ empty: [] });
    expect(markTankSeen(seen, "empty", [])).toBe(seen);
  });
});

describe("saved seen state", () => {
  const baseline = { river: ["ayu", "dace"] };

  test("saved state round-trips, and without one the baseline is used", () => {
    const storage = memoryStorage();
    expect(loadSeenState(storage, baseline)).toBe(baseline);
    const seen = markTankSeen(baseline, "pond", tankSpecies.pond);
    saveSeenState(storage, seen);
    expect(JSON.parse(storage.items.get(SEEN_STORAGE_KEY)!)).toEqual({ river: ["ayu", "dace"], pond: ["medaka"] });
    expect(loadSeenState(storage, baseline)).toEqual(seen);
  });

  test("broken or unavailable storage starts from the baseline without throwing", () => {
    expect(loadSeenState(memoryStorage("{not json"), baseline)).toBe(baseline);
    expect(loadSeenState(memoryStorage("[]"), baseline)).toBe(baseline);
    expect(loadSeenState(memoryStorage("null"), baseline)).toBe(baseline);
    expect(loadSeenState(memoryStorage('"seen"'), baseline)).toBe(baseline);
    expect(loadSeenState(undefined, baseline)).toBe(baseline);
    const failing = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("quota exceeded"); },
    };
    expect(loadSeenState(failing, baseline)).toBe(baseline);
    expect(() => saveSeenState(failing, baseline)).not.toThrow();
    expect(() => saveSeenState(undefined, baseline)).not.toThrow();
  });

  test("broken entries are dropped and the rest is kept", () => {
    expect(normalizeSeenState({ river: ["ayu", 3, null], pond: "medaka", reef: [] })).toEqual({ river: ["ayu"], reef: [] });
    expect(normalizeSeenState(undefined)).toBeUndefined();
    expect(normalizeSeenState([["river"]])).toBeUndefined();
  });
});

describe("tank species module", () => {
  test("lists the current species of every open tank, in the order of the museum", async () => {
    const module = await loadTankSpecies();
    expect(Object.keys(module.tankSpecies)).toEqual(tankSummaries.map((tank) => tank.id));
    for (const tank of getLoadedTanks()) {
      expect(module.tankSpecies[tank.id], tank.id).toEqual(tank.species.map((slot) => slot.speciesId));
    }
  });

  test("the baseline marks the tanks that were open when tracking began as seen", async () => {
    const { tankSpecies: current, seenBaseline } = await loadTankSpecies();
    expect(normalizeSeenState(seenBaseline)).toEqual(seenBaseline);
    // 記録を取り始める前からあった水槽は既読で始まる。あとから足した水槽と種だけが未読になる。
    const unseen = getUnseenSpecies(current, seenBaseline);
    const known = Object.keys(current).filter((tankId) => seenBaseline[tankId]);
    expect(known.length).toBeGreaterThan(0);
    expect(known.filter((tankId) => !unseen[tankId]).length).toBeGreaterThan(known.length / 2);
    for (const tankId of Object.keys(current)) {
      if (!seenBaseline[tankId]) expect(unseen[tankId], tankId).toEqual(current[tankId]);
    }
  });
});
