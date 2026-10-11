/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { contentModules } from "./vite/contentModules";

// サブエージェントの git worktree（.claude/worktrees/）と、一時成果物（tmp/）に残した古い写しのテストは拾わない。
const testExclude = [...configDefaults.exclude, ".claude/**", "tmp/**"];
const TANK_SUITE = "src/core/terrainEndurance.test.ts";
const TANK_SHARDS = 8;
// テストの乱数（Math.random）は既定で固定する。`TEST_SEED=random` で毎回違う乱数にし、使った値を表示する
// （落ちたら `TEST_SEED=<値>` で再現する）。仕組みは src/core/testSetup.ts。
const testSeed = process.env.TEST_SEED === "random" ? String(Math.floor(Math.random() * 2 ** 31)) : process.env.TEST_SEED ?? "1";
if (process.env.TEST_SEED === "random") console.log(`TEST_SEED=${testSeed}`);

// 既定は相対 base。LocalWeb の通常 host と Tailscale の /apps/{id}/ 配下の両方で、
// 素の `bun run build` の成果物がそのまま動くようにする（GitHub Pages は VITE_BASE_PATH で指定）。
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react(), contentModules(fileURLToPath(new URL("./src/content/", import.meta.url)))],
  // サブエージェントの git worktree と一時成果物の変更で、開発サーバーが画面を読み込み直さないようにする
  // （画面検証の途中で読み込み直すと、結果が崩れる）。
  server: { watch: { ignored: ["**/.claude/**", "**/tmp/**"] } },
  test: {
    setupFiles: ["src/core/testSetup.ts"],
    env: { TEST_SEED: testSeed },
    projects: [
      // 速いテスト。作業中は `bun run test:fast` でこれだけを流す。
      { extends: true, test: { name: "unit", exclude: [...testExclude, TANK_SUITE] } },
      // 全水槽を回す重いテストは、同じファイルを水槽の受け持ちを変えて並列に流す。
      ...Array.from({ length: TANK_SHARDS }, (_, index) => ({
        extends: true as const,
        test: { name: `tanks-${index + 1}`, include: [TANK_SUITE], exclude: testExclude,
          env: { TANK_SHARD: `${index + 1}/${TANK_SHARDS}` } },
      })),
    ],
  },
});
