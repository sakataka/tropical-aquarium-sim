import { describe, expect, test } from "vitest";
import { speciesIds } from "./catalog";
import { getExhibitOrder, getSpeciesExhibits, loadSpeciesIndex, searchSpeciesIndex } from "./speciesIndex";
import { toSpeciesKey } from "./speciesIndexEntry";
import { aquariumTanks } from "./tankCatalog";

describe("species index", () => {
  test("lists every species folder with its taxonomy", async () => {
    const entries = await loadSpeciesIndex();
    expect(entries.map((entry) => entry.id)).toEqual([...speciesIds]);
    for (const entry of entries) {
      expect(entry.familyJa, entry.id).toBeTruthy();
      expect(entry.salinity, entry.id).toBeTruthy();
    }
  });

  test("finds species by name, kana, scientific name and family", async () => {
    const entries = await loadSpeciesIndex();
    const ids = (query: string) => searchSpeciesIndex(entries, query).map((entry) => entry.id);
    expect(ids("ねおんてとら")).toContain("neon-tetra");
    expect(ids("Paracheirodon")).toContain("neon-tetra");
    expect(ids("メダカ科")).toContain("medaka");
    expect(ids("")).toHaveLength(entries.length);
  });

  test("every species shown in a tank links back to that tank", () => {
    const order = getExhibitOrder();
    for (const tank of aquariumTanks) for (const slot of tank.species) {
      expect(getSpeciesExhibits(slot.speciesId).map((item) => item.tank.id)).toContain(tank.id);
      expect(order.has(slot.speciesId)).toBe(true);
    }
  });
});

describe("species key for counting", () => {
  test.each([
    ["Paracheirodon innesi", "Paracheirodon innesi"],
    ["Rhodeus ocellatus kurumeus", "Rhodeus ocellatus"],
    ["Oncorhynchus masou ishikawae", "Oncorhynchus masou"],
    ["Ancistrus sp.", null],
    ["Crossocheilus sp.", null],
    ["Cobitis biwae complex", null],
    ["Pangio sp. (kuhlii group)", null],
    ["Pseudotropheus sp. 'acei'", null],
  ])("%s", (name, key) => {
    expect(toSpeciesKey(name)).toBe(key);
  });
});
