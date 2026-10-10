import { beforeEach } from "vitest";
import { loaders } from "virtual:species-index";
import { addSpecies, loadAllHalls } from "./catalog";

// アプリは展示室ごとに水槽・水景・生き物を遅れて読む。テストは全件を検査するので、先にすべて読んでおく。
// どの水槽にもいない生き物も、図鑑から読めるので含める。
await loadAllHalls();
await Promise.all(Object.values(loaders).map((load) => load().then(addSpecies)));

// テストの間は Math.random を決まった乱数列に置き換え、テストごとに初めから振り直す（実行の順番や絞り込みで
// 結果が変わらないように）。魚を生む createFishFromStock などが個体差を Math.random で決めるので、置き換えないと
// 実行ごとに少しずつ違う魚で走り、たまにだけ落ちる。乱数を揺さぶって探すときは `bun run test:fuzz`。
const testSeed = Number(import.meta.env.TEST_SEED);
if (!Number.isFinite(testSeed)) throw new Error(`TEST_SEED は数か "random" にする: ${import.meta.env.TEST_SEED}`);
function seedRandom() {
  let state = testSeed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
seedRandom();
beforeEach(({ onTestFailed }) => {
  seedRandom();
  onTestFailed(() => console.error(`乱数の種: TEST_SEED=${testSeed}`));
});
