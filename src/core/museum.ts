import {
  defaultTankId as firstTankId,
  halls as hallList,
  hallLoaders as loaders,
  mapImageUrl as mapImage,
  museum as museumData,
  scenes as sceneList,
  tanks as tankList,
} from "virtual:museum";
import type { MuseumFloor, MuseumMapArea } from "./contentSchemas";
import type { HallModule, HallSummary, SceneSummary, TankSummary } from "./contentTypes";
import { glassAspect, windowOverscan } from "./room";

// 起動時に読む館の索引。館内図・URL の解決・保存データの確認に要る、展示室・水槽・水景の見出しだけを持つ。
// 水槽の定義、水景の地形、生き物は展示室ごとのモジュールにあり、展示室に入るときに読む（catalog.ts）。
// ビルド時に内容ファイルから作り、検証も済ませてある（vite/contentModules.ts）。

export type { MuseumFloor, MuseumMapArea } from "./contentSchemas";
export type { HallSummary, SceneSummary, TankSummary } from "./contentTypes";

/** 館内図に並べる展示室の枠。room があれば開ける展示室、なければ準備中。 */
export type HallSlot = {
  id: string;
  displayName: string;
  floor: MuseumFloor;
  room?: HallSummary;
  /** 館内図の絵の中の範囲（絵の画素）。 */
  mapArea: MuseumMapArea;
};

/** 階は上から順に並ぶ。 */
export const museum = museumData;
/** 開いている展示室。館内図の順（上の階から、階の中は左から）。 */
export const halls: readonly HallSummary[] = hallList;
/** すべての水槽。館内図の順（展示室の順、展示室の中の水槽の順）。 */
export const tankSummaries: readonly TankSummary[] = tankList;
/** 館内図の断面図。 */
export const mapImageUrl = mapImage;
/** 保存データがないときに選んでおく水槽。 */
export const defaultTankId = firstTankId;
export const hallLoaders: Readonly<Record<string, () => Promise<HallModule>>> = loaders;

const hallById = new Map(halls.map((hall) => [hall.id, hall]));
const tankById = new Map(tankSummaries.map((tank) => [tank.id, tank]));

const hallSlots: HallSlot[] = museum.floors.flatMap((floor) => floor.halls.map((hall, index) => {
  const room = hallById.get(hall.id);
  const displayName = room?.displayName ?? hall.displayName;
  if (!displayName) throw new Error(`Hall "${hall.id}" has no room and no displayName`);
  const width = floor.mapArea.width / floor.halls.length;
  return {
    id: hall.id,
    displayName,
    floor,
    room,
    mapArea: { ...floor.mapArea, x: floor.mapArea.x + width * index, width },
  };
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

export function getSceneSummary(sceneId: string | null | undefined): SceneSummary | undefined {
  return sceneId ? sceneList[sceneId] : undefined;
}

function getPlacement(tankId: string) {
  const hall = getHallOfTank(tankId);
  return { hall, placement: hall.tanks.find((item) => item.tankId === tankId)! };
}

// 水槽画面は部屋で見えているガラスと同じ縦横比で水景を切り取る。
// こうすると、部屋から寄り終えた構図と水槽画面の構図が一致する。
export function getGlassAspect(tankId: string): number {
  const { hall, placement } = getPlacement(tankId);
  return glassAspect(hall, placement);
}

/** 側面ガラスまで含めた切り抜き範囲が、前面ガラスの何倍か。水景はここまで広げて描く。 */
export function getWindowOverscan(tankId: string): { x: number; y: number } {
  return windowOverscan(getPlacement(tankId).placement);
}
