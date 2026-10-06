import { getFloorOfHall, getHallSlotsOnFloor, museum } from "./museum";
import type { FishRoomDefinition } from "./room";
import type { SpeciesIndexEntry } from "./speciesIndexEntry";
import { aquariumTanks } from "./tankCatalog";
import type { TankDefinition } from "./types";

export type { SpeciesIndexEntry } from "./speciesIndexEntry";

/** 全種の見出し。図鑑を開くときに1つのチャンクとして読み、起動時には読まない。 */
export function loadSpeciesIndex(): Promise<SpeciesIndexEntry[]> {
  return import("virtual:species-index").then((module) => module.default);
}

// 館内図の順（上の階から、階の中は左から）に並べた展示室。
const hallsInMapOrder = (): FishRoomDefinition[] =>
  museum.floors.flatMap((floor) => getHallSlotsOnFloor(floor.id).flatMap((slot) => slot.room ? [slot.room] : []));

export type SpeciesExhibit = { tank: TankDefinition; hall: FishRoomDefinition; floorLabel?: string };

/** その生き物を見られる水槽。館内図の順（展示室の順、展示室の中の水槽の順）。 */
export function getSpeciesExhibits(speciesId: string): SpeciesExhibit[] {
  return hallsInMapOrder().flatMap((hall) => hall.tanks.flatMap(({ tankId }) => {
    const tank = aquariumTanks.find((item) => item.id === tankId);
    if (!tank?.species.some((slot) => slot.speciesId === speciesId)) return [];
    return [{ tank, hall, floorLabel: getFloorOfHall(hall.id)?.label }];
  }));
}

/** 展示順の並べ替えに使う、最初に見られる水槽の順位と展示室の名前。どこにもいない種は含まない。 */
export function getExhibitOrder(): Map<string, { rank: number; hallName: string }> {
  const order = new Map<string, { rank: number; hallName: string }>();
  for (const hall of hallsInMapOrder()) for (const { tankId } of hall.tanks) {
    const tank = aquariumTanks.find((item) => item.id === tankId);
    for (const slot of tank?.species ?? []) {
      if (!order.has(slot.speciesId)) order.set(slot.speciesId, { rank: order.size, hallName: hall.displayName });
    }
  }
  return order;
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
