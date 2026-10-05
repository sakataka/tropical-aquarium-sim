import { loadAllSpecies } from "./catalog";
import { loadAllScenes } from "./sceneCatalog";

// アプリは展示室ごとに魚種と水景の地形を遅れて読む。テストは全件を検査するので、先にすべて読んでおく。
await Promise.all([loadAllSpecies(), loadAllScenes()]);
