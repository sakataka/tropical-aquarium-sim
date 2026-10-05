import { loadSpecies } from "./catalog";
import type { FishRoomDefinition } from "./room";
import { loadScenes } from "./sceneCatalog";
import { getTankById } from "./tankCatalog";

// 展示室に入る前に、その展示室の水槽で選べる魚種と水景の地形をまとめて読む。
// 館内図からは展示室の中身を読まないので、展示室や魚種が増えても起動時の読み込みは増えない。
const loadedHalls = new Set<string>();
const pendingHalls = new Map<string, Promise<void>>();

/** 展示室の水槽で使う魚種と水景の ID。 */
export function getHallContentIds(room: FishRoomDefinition): { speciesIds: string[]; sceneIds: string[] } {
  const tanks = room.tanks.flatMap((placement) => getTankById(placement.tankId) ?? []);
  return {
    speciesIds: [...new Set(tanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)))],
    sceneIds: [...new Set(tanks.flatMap((tank) => tank.sceneIds))],
  };
}

export function isHallContentLoaded(roomId: string): boolean {
  return loadedHalls.has(roomId);
}

export function loadHallContent(room: FishRoomDefinition): Promise<void> {
  if (loadedHalls.has(room.id)) return Promise.resolve();
  const current = pendingHalls.get(room.id);
  if (current) return current;
  const { speciesIds, sceneIds } = getHallContentIds(room);
  const promise = Promise.all([loadSpecies(speciesIds), loadScenes(sceneIds)])
    .then(() => { loadedHalls.add(room.id); })
    .finally(() => pendingHalls.delete(room.id));
  pendingHalls.set(room.id, promise);
  return promise;
}
