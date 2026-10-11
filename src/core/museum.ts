import {
  defaultTankId as firstTankId,
  floorLoaders,
  floorSpeciesCounts,
  halls as hallList,
  hallLoaders as loaders,
  mapImageUrls,
  museum as museumData,
  tanks as tankList,
} from "virtual:museum";
import type { MuseumBuilding, MuseumFloor } from "./contentSchemas";
import type { HallLayout, HallModule, HallSummary, SceneSummary, TankSummary } from "./contentTypes";
import { glassAspect, windowOverscan } from "./room";

// 起動時に読む館の索引。館内図・URL の解決・保存データの確認に要る、建物と階、展示室・水槽の見出しだけを持つ。
// 館 → 建物 → 階 → 展示室 → 水槽の順に並ぶ。階・展示室・水槽の id は館全体で重ならないので、
// 建物を足しても URL（?floor=・?hall=・?tank=）と保存データの形は変わらない。
// 部屋の絵のガラスの位置と水景の縮小版は階ごとのモジュールにあり、館内図で階を開くときか、
// その階の展示室に入るときに loadFloor で読む。
// 水槽の定義、水景の地形、生き物は展示室ごとのモジュールにあり、展示室に入るときに読む（catalog.ts）。
// ビルド時に内容ファイルから作り、検証も済ませてある（scripts/content-modules.ts）。

export type { MuseumBuilding, MuseumFloor, MuseumMapArea } from "./contentSchemas";
export type { HallLayout, HallSummary, SceneSummary, TankSummary } from "./contentTypes";

/** 館内図に並べる展示室の枠。room があれば開ける展示室、なければ準備中。 */
export type HallSlot = {
  id: string;
  displayName: string;
  floor: MuseumFloor;
  room?: HallSummary;
};

export const museum = museumData;
/** 建物。館内図に並べる順。最初の建物を、何も指定せずに開いたときに見せる。 */
export const buildings: readonly MuseumBuilding[] = museum.buildings;
/** すべての階。建物の順、建物の中は上から順。 */
export const floors: readonly MuseumFloor[] = buildings.flatMap((building) => building.floors);
/** 開いている展示室。館内図の順（建物の順、上の階から、階の中は並べた順）。 */
export const halls: readonly HallSummary[] = hallList;
/** すべての水槽。館内図の順（展示室の順、展示室の中の水槽の順）。 */
export const tankSummaries: readonly TankSummary[] = tankList;
/** 保存データがないときに選んでおく水槽。 */
export const defaultTankId = firstTankId;
export const hallLoaders: Readonly<Record<string, () => Promise<HallModule>>> = loaders;

const hallById = new Map(halls.map((hall) => [hall.id, hall]));
const tankById = new Map(tankSummaries.map((tank) => [tank.id, tank]));

const hallSlots: HallSlot[] = floors.flatMap((floor) => floor.halls.map((hall) => {
  const room = hallById.get(hall.id);
  const displayName = room?.displayName ?? hall.displayName;
  if (!displayName) throw new Error(`Hall "${hall.id}" has no room and no displayName`);
  return { id: hall.id, displayName, floor, room };
}));

/** その階の展示室の枠を左から順に。準備中の枠も含む。 */
export function getHallSlotsOnFloor(floorId: string): HallSlot[] {
  return hallSlots.filter((slot) => slot.floor.id === floorId);
}

/** 展示室のある階。 */
export function getFloorOfHall(hallId: string): MuseumFloor | undefined {
  return hallSlots.find((slot) => slot.id === hallId)?.floor;
}

export function getHallById(hallId: string | null | undefined): HallSummary | undefined {
  return hallId ? hallById.get(hallId) : undefined;
}

export function getTankSummary(tankId: string | null | undefined): TankSummary | undefined {
  return tankId ? tankById.get(tankId) : undefined;
}

/** 水槽のある展示室。 */
export function getHallOfTank(tankId: string): HallSummary {
  const hall = hallById.get(tankById.get(tankId)?.hallId ?? "");
  if (!hall) throw new Error(`Tank is not placed in any hall: ${tankId}`);
  return hall;
}

const floorById = new Map(floors.map((floor) => [floor.id, floor]));
const buildingById = new Map(buildings.map((building) => [building.id, building]));

export function getFloorById(floorId: string | null | undefined): MuseumFloor | undefined {
  return floorId ? floorById.get(floorId) : undefined;
}

export function getBuildingById(buildingId: string | null | undefined): MuseumBuilding | undefined {
  return buildingId ? buildingById.get(buildingId) : undefined;
}

/** 何も指定せずに開いたときに見せる建物（本館）。 */
export const defaultBuilding = buildings[0]!;

/** 階のある建物。 */
export function getBuildingOfFloor(floor: MuseumFloor): MuseumBuilding {
  return buildingById.get(floor.buildingId)!;
}

/** 建物の断面図の絵。 */
export function getMapImageUrl(buildingId: string): string {
  return mapImageUrls[buildingId]!;
}

/**
 * 階を館の中の場所として呼ぶ名前。建物が1つなら「3階」、複数あれば「海の館 3階」。
 * 建物の中の画面（その建物の断面図や階の一覧）では floor.label をそのまま使う。
 */
export function getFloorPlaceLabel(floor: MuseumFloor): string {
  return buildings.length > 1 ? `${getBuildingOfFloor(floor).displayName} ${floor.label}` : floor.label;
}

/** 階で見られる生き物の数（同じ生き物を数えない）。 */
export function getFloorSpeciesCount(floorId: string): number {
  return floorSpeciesCounts[floorId] ?? 0;
}

const loadedFloors = new Set<string>();
const pendingFloors = new Map<string, Promise<void>>();
const hallLayouts = new Map<string, HallLayout>();
const sceneSummaries = new Map<string, SceneSummary>();

/** 階の部屋の絵・ガラスの位置と、その階の水景の縮小版・既定の照明を読む。 */
export function loadFloor(floorId: string): Promise<void> {
  if (loadedFloors.has(floorId)) return Promise.resolve();
  const current = pendingFloors.get(floorId);
  if (current) return current;
  const load = floorLoaders[floorId];
  if (!load) return Promise.reject(new Error(`Floor not found: ${floorId}`));
  const promise = load().then((module) => {
    for (const hall of module.halls) hallLayouts.set(hall.id, hall);
    for (const [id, scene] of Object.entries(module.scenes)) sceneSummaries.set(id, scene);
    loadedFloors.add(floorId);
  }).finally(() => pendingFloors.delete(floorId));
  pendingFloors.set(floorId, promise);
  return promise;
}

export function isFloorLoaded(floorId: string): boolean {
  return loadedFloors.has(floorId);
}

/** 展示室の部屋の絵とガラスの位置。その階を読んでいなければ undefined。 */
export function getHallLayout(hallId: string): HallLayout | undefined {
  return hallLayouts.get(hallId);
}

/** 水景の縮小版と既定の照明。その水景を使う水槽の階を読んでいなければ undefined。 */
export function getSceneSummary(sceneId: string | null | undefined): SceneSummary | undefined {
  return sceneId ? sceneSummaries.get(sceneId) : undefined;
}

function getPlacement(tankId: string) {
  const hall = getHallLayout(getHallOfTank(tankId).id);
  if (!hall) throw new Error(`Floor of tank "${tankId}" is not loaded`);
  return { hall, placement: hall.tanks.find((item) => item.tankId === tankId)! };
}

// 水槽画面は部屋で見えているガラスと同じ縦横比で水景を切り取る。
// こうすると、部屋から寄り終えた構図と水槽画面の構図が一致する。どちらもその階を読んでから使う。
export function getGlassAspect(tankId: string): number {
  const { hall, placement } = getPlacement(tankId);
  return glassAspect(hall, placement);
}

/** 側面ガラスまで含めた切り抜き範囲が、前面ガラスの何倍か。水景はここまで広げて描く。 */
export function getWindowOverscan(tankId: string): { x: number; y: number } {
  return windowOverscan(getPlacement(tankId).placement);
}
