import type { HallModule, LoadedScene, SpeciesModule } from "./contentTypes";
import { hallLoaders, halls } from "./museum";
import type { FishSpeciesDefinition, TankDefinition } from "./types";

// 読み込み済みの展示室の中身。展示室に入るときに loadHall でその展示室のモジュールを読み、
// 水槽の定義、水景の地形、生き物をここへ足す。読んでいない展示室のものは引けない。
// 内容はビルド時に検証済みなので、ここでは形を確かめない。

/**
 * 読み込み済みの生き物。展示室や図鑑で読むと増え、同じオブジェクトのまま使い続ける。
 * シミュレーションと描画には、これをそのまま渡す。
 */
export const fishCatalog: Record<string, FishSpeciesDefinition> = {};

const loadedHalls = new Map<string, HallModule>();
const pendingHalls = new Map<string, Promise<void>>();
const tanks = new Map<string, TankDefinition>();
const scenes = new Map<string, LoadedScene>();
const fishImageUrls = new Map<string, string>();

/** 生き物を読み込み済みに加える。すでにあれば、そのオブジェクトを使い続ける。 */
export function addSpecies(module: SpeciesModule): FishSpeciesDefinition {
  return fishCatalog[module.default.id] ??= module.default;
}

/** 展示室の水槽、水景の地形、生き物をまとめて読む。 */
export function loadHall(hallId: string): Promise<void> {
  if (loadedHalls.has(hallId)) return Promise.resolve();
  const current = pendingHalls.get(hallId);
  if (current) return current;
  const load = hallLoaders[hallId];
  if (!load) return Promise.reject(new Error(`Hall not found: ${hallId}`));
  const promise = load().then((module) => {
    for (const tank of module.tanks) tanks.set(tank.id, tank);
    for (const scene of module.scenes) scenes.set(scene.id, scene);
    for (const species of module.species) {
      addSpecies({ default: species });
      const url = module.fishImages[species.id];
      if (url) fishImageUrls.set(species.id, url);
    }
    loadedHalls.set(hallId, module);
  }).finally(() => pendingHalls.delete(hallId));
  pendingHalls.set(hallId, promise);
  return promise;
}

/** すべての展示室を読む。テストと、全水槽を検査するときに使う。 */
export function loadAllHalls(): Promise<void> {
  return Promise.all(halls.map((hall) => loadHall(hall.id))).then(() => undefined);
}

/** 読み込み済みの水槽。読んでいない展示室の水槽は undefined。 */
export function getTankById(tankId: string | null | undefined): TankDefinition | undefined {
  return tankId ? tanks.get(tankId) : undefined;
}

/** 読み込み済みの水槽を館内図の順に。 */
export function getLoadedTanks(): TankDefinition[] {
  return halls.flatMap((hall) => loadedHalls.get(hall.id)?.tanks ?? []);
}

/** 地形まで読み込んだ水景。読んでいない展示室の水景は undefined。 */
export function getSceneById(sceneId: string | null | undefined): LoadedScene | undefined {
  return sceneId ? scenes.get(sceneId) : undefined;
}

export function getSpeciesLimit(tank: TankDefinition, speciesId: string): number {
  return tank.species.find((slot) => slot.speciesId === speciesId)?.maxCount ?? 0;
}

/** 生き物の体の画像（body.webp）。読み込み済みの生き物だけ。 */
export function getFishImageUrl(speciesId: string): string | undefined {
  return fishImageUrls.get(speciesId);
}

/** 水景の一枚絵。読み込み済みの展示室の水景だけ。 */
export function getScenePlateUrl(sceneId: string): string | undefined {
  return scenes.get(sceneId)?.plateUrl;
}

/** 展示室の部屋の絵。 */
export function getRoomImageUrl(hallId: string): string | undefined {
  return loadedHalls.get(hallId)?.roomImageUrl;
}

/** 展示室で使う部屋の絵、水景、魚の画像の URL。 */
export function getHallImageUrls(hallId: string): string[] {
  const module = loadedHalls.get(hallId);
  if (!module) return [];
  return [
    module.roomImageUrl,
    ...module.scenes.flatMap((scene) => scene.plateUrl ?? []),
    ...module.species.flatMap((species) => module.fishImages[species.id] ?? []),
  ];
}
