import { addSpecies, fishCatalog } from "./catalog";
import { getFloorOfHall, getFloorPlaceLabel, getHallOfTank, getTankSummary, type HallSummary, type TankSummary } from "./museum";
import type { SpeciesIndexEntry } from "./speciesIndexEntry";
import type { FishSpeciesDefinition } from "./types";

export type { SpeciesIndexEntry } from "./speciesIndexEntry";

const loadIndexModule = () => import("virtual:species-index");

/** 全種の見出し。図鑑を開くときに1つのチャンクとして読み、起動時には読まない。 */
export function loadSpeciesIndex(): Promise<SpeciesIndexEntry[]> {
  return loadIndexModule().then((module) => module.default);
}

/** 生き物1種の定義を読む。図鑑の解説に使う。 */
export function loadSpeciesDefinition(speciesId: string): Promise<FishSpeciesDefinition> {
  const loaded = fishCatalog[speciesId];
  if (loaded) return Promise.resolve(loaded);
  return loadIndexModule().then((module) => {
    const load = module.loaders[speciesId];
    if (!load) throw new Error(`Fish species not found: ${speciesId}`);
    return load();
  }).then(addSpecies);
}

export type SpeciesExhibit = { tank: TankSummary; hall: HallSummary; floorLabel?: string };

/** その生き物を見られる水槽。館内図の順（展示室の順、展示室の中の水槽の順）。 */
export function getSpeciesExhibits(entry: Pick<SpeciesIndexEntry, "tankIds">): SpeciesExhibit[] {
  return entry.tankIds.flatMap((tankId) => {
    const tank = getTankSummary(tankId);
    if (!tank) return [];
    const hall = getHallOfTank(tankId);
    const floor = getFloorOfHall(hall.id);
    return [{ tank, hall, floorLabel: floor && getFloorPlaceLabel(floor) }];
  });
}

/** 展示順の並べ替えで、その生き物を最初に見られる展示室の名前。どこにもいない種は undefined。 */
export function getFirstExhibitHallName(entry: Pick<SpeciesIndexEntry, "tankIds">): string | undefined {
  const tankId = entry.tankIds[0];
  return tankId ? getHallOfTank(tankId).displayName : undefined;
}

/** かな・全角半角・大文字小文字の違いを吸収して比べる。 */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .replace(/[\s・･·\-‐]/g, "");
}

/** 名前、学名、別名、目・科、原産地のどれかに、空白で区切った語がすべて含まれるもの。 */
export function searchSpeciesIndex(entries: SpeciesIndexEntry[], query: string): SpeciesIndexEntry[] {
  const words = query.split(/[\s　]+/).map(normalizeSearchText).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = normalizeSearchText([
      entry.name, entry.scientificName, ...entry.aliases, entry.orderJa, entry.family, entry.familyJa, entry.region,
    ].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
