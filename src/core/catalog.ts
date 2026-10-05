import { parseFishSpeciesDefinition } from "./schema";
import type { FishSpeciesDefinition } from "./types";

type SpeciesJsonModule = {
  default: unknown;
};

// 魚種は数百まで増えるので、起動時には読まない。展示室に入るときに、その展示室の水槽で
// 使う魚種だけを loadSpecies で読み、形を検証して fishCatalog に足す。
// 1種ずつ別のチャンクになり、使わない魚種の JSON はダウンロードもしない。
const speciesLoaders = import.meta.glob<SpeciesJsonModule>("../content/fish/*/species.json");

function speciesIdFromPath(path: string): string {
  return path.split("/").slice(-2)[0]!;
}

const loaderById = new Map(Object.entries(speciesLoaders).map(([path, load]) => [speciesIdFromPath(path), load]));

/** すべての魚種の ID。フォルダ名から求めるので、中身を読まなくても分かる。 */
export const speciesIds: readonly string[] = [...loaderById.keys()].sort();

/** 魚種があるかどうかだけを引く表。保存データの検証など、中身が要らない処理に使う。 */
export const speciesDirectory: Readonly<Record<string, true>> = Object.fromEntries(speciesIds.map((id) => [id, true]));

/**
 * 読み込み済みの魚種。loadSpecies で増え、同じオブジェクトのまま使い続ける。
 * シミュレーションと描画には、これをそのまま渡す。
 */
export const fishCatalog: Record<string, FishSpeciesDefinition> = {};

const pending = new Map<string, Promise<void>>();

export function loadSpecies(ids: Iterable<string>): Promise<void> {
  return Promise.all([...new Set(ids)].map(loadOne)).then(() => undefined);
}

/** すべての魚種を読む。テストと、全魚種を検査するときに使う。 */
export function loadAllSpecies(): Promise<void> {
  return loadSpecies(speciesIds);
}

function loadOne(id: string): Promise<void> {
  if (fishCatalog[id]) return Promise.resolve();
  const current = pending.get(id);
  if (current) return current;
  const load = loaderById.get(id);
  if (!load) return Promise.reject(new Error(`Fish species not found: ${id}`));
  const promise = load().then((module) => {
    const species = parseFishSpeciesDefinition(module.default);
    if (species.id !== id) throw new Error(`Fish species id "${species.id}" must match its folder "${id}"`);
    fishCatalog[id] = species;
  }).finally(() => pending.delete(id));
  pending.set(id, promise);
  return promise;
}
