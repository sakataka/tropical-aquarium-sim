import { testFiles } from "./testFiles";
import { describe, expect, test } from "bun:test";
import { getLoadedTanks } from "./catalog";
import { getSpeciesExhibits, loadSpeciesIndex, searchSpeciesIndex } from "./speciesIndex";
import { toSpeciesKey } from "./speciesIndexEntry";

const speciesFolders = Object.keys(testFiles("../content/fish/*/species.json", import.meta.url))
  .map((path) => path.split("/").slice(-2)[0]!).sort();

describe("species index", () => {
  test("lists every species folder with its taxonomy", async () => {
    const entries = await loadSpeciesIndex();
    expect(entries.map((entry) => entry.id)).toEqual(speciesFolders);
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

  test("every species shown in a tank links back to that tank", async () => {
    const entries = new Map((await loadSpeciesIndex()).map((entry) => [entry.id, entry]));
    for (const tank of getLoadedTanks()) for (const slot of tank.species) {
      const entry = entries.get(slot.speciesId)!;
      expect(getSpeciesExhibits(entry).map((item) => item.tank.id)).toContain(tank.id);
      expect(entry.exhibitRank, slot.speciesId).toBeTypeOf("number");
      expect(entry.imageUrl, slot.speciesId).toBeTruthy();
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
