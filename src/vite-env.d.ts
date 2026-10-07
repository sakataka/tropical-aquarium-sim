/// <reference types="vite/client" />

declare module '*.png' {
  const src: string;
  export default src;
}

// ビルド時に内容ファイルから作るモジュール（vite/contentModules.ts）。

/** 起動時に読む館の索引。 */
declare module "virtual:museum" {
  export const museum: import("./core/contentSchemas").MuseumDefinition;
  export const halls: import("./core/contentTypes").HallSummary[];
  export const tanks: import("./core/contentTypes").TankSummary[];
  export const scenes: Record<string, import("./core/contentTypes").SceneSummary>;
  export const mapImageUrl: string;
  export const defaultTankId: string;
  export const hallLoaders: Record<string, () => Promise<import("./core/contentTypes").HallModule>>;
}

/** 図鑑の全種の見出しと、1種ずつ読む関数。 */
declare module "virtual:species-index" {
  const entries: import("./core/speciesIndexEntry").SpeciesIndexEntry[];
  export default entries;
  export const loaders: Record<string, () => Promise<import("./core/contentTypes").SpeciesModule>>;
}
