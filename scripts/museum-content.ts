// 検証・計測のスクリプトが使う、館の建物・階・展示室の並び。
// 内容ファイル（src/content/museum/buildings/<id>/building.json）から読むので、建物や展示室を足しても書き換えずに済む。
export type BuildingJson = {
  id: string;
  order: number;
  floors: { id: string; order: number; halls: { id: string }[] }[];
};

const buildings: BuildingJson[] = [];
for await (const path of new Bun.Glob("src/content/museum/buildings/*/building.json").scan()) {
  const building = await Bun.file(path).json() as BuildingJson;
  building.floors.sort((a, b) => a.order - b.order);
  buildings.push(building);
}
buildings.sort((a, b) => a.order - b.order);

/** 建物。館内図に並ぶ順。最初の建物が、何も指定せずに開いたときの建物。 */
export const BUILDINGS: readonly BuildingJson[] = buildings;
/** すべての階。建物の順、建物の中は上から順。 */
export const FLOORS = buildings.flatMap((building) => building.floors.map((floor) => ({ ...floor, buildingId: building.id })));
/** 展示室の枠の id。館内図の順（準備中の枠も含む）。 */
export const HALL_ORDER = FLOORS.flatMap((floor) => floor.halls.map((hall) => hall.id));
/** 開いている展示室（room/<id>.json がある枠）の id。館内図の順。 */
export const OPEN_HALLS: string[] = [];
for (const id of HALL_ORDER) if (await Bun.file(`src/content/room/${id}.json`).exists()) OPEN_HALLS.push(id);
