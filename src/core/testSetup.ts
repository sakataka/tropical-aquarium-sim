import { loaders } from "virtual:species-index";
import { addSpecies, loadAllHalls } from "./catalog";

// アプリは展示室ごとに水槽・水景・生き物を遅れて読む。テストは全件を検査するので、先にすべて読んでおく。
// どの水槽にもいない生き物も、図鑑から読めるので含める。
await loadAllHalls();
await Promise.all(Object.values(loaders).map((load) => load().then(addSpecies)));
