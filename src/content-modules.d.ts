declare module "*.css";

declare module '*.png' {
  const src: string;
  export default src;
}

// ビルド時に内容ファイルから作るモジュール（scripts/content-modules.ts）。

/** 起動時に読む館の索引。 */
declare module "virtual:museum" {
  export const museum: import("./core/contentSchemas").MuseumDefinition;
  export const halls: import("./core/contentTypes").HallSummary[];
  /** 階ごとの、見られる生き物の数（同じ生き物を数えない）。 */
  export const floorSpeciesCounts: Record<string, number>;
  export const tanks: import("./core/contentTypes").TankSummary[];
  /** 建物ごとの断面図の絵。 */
  export const mapImageUrls: Record<string, string>;
  export const defaultTankId: string;
  export const hallLoaders: Record<string, () => Promise<import("./core/contentTypes").HallModule>>;
  export const floorLoaders: Record<string, () => Promise<import("./core/contentTypes").FloorModule>>;
}

/** 水槽ごとの今の種の並びと、既読の最初の状態。起動後に読む。 */
declare module "virtual:tank-species" {
  export const tankSpecies: import("./core/contentTypes").TankSpeciesModule["tankSpecies"];
  export const seenBaseline: import("./core/contentTypes").TankSpeciesModule["seenBaseline"];
}

/** 図鑑の全種の見出しと、1種ずつ読む関数。 */
declare module "virtual:species-index" {
  const entries: import("./core/speciesIndexEntry").SpeciesIndexEntry[];
  export default entries;
  export const loaders: Record<string, () => Promise<import("./core/contentTypes").SpeciesModule>>;
}

declare module "*?url" { const url: string; export default url; }
