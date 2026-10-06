/// <reference types="vite/client" />

declare module '*.png' {
  const src: string;
  export default src;
}

// 図鑑の全種の見出し。vite.config.ts の speciesIndex がビルド時に作る。
declare module "virtual:species-index" {
  const entries: import("./core/speciesIndexEntry").SpeciesIndexEntry[];
  export default entries;
}
