/// <reference types="vitest/config" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { toSpeciesIndexEntry } from "./src/core/speciesIndexEntry";

// 図鑑の一覧に使う全種の見出し（名前、学名、分類、原産地など）を、ビルド時に species.json から作る。
// 魚種を置けば自動で載り、中央の一覧ファイルを手で書かない。図鑑を開くときに1つのチャンクとして読む。
function speciesIndex(): Plugin {
  const moduleId = "virtual:species-index";
  const resolvedId = `\0${moduleId}`;
  const fishDir = fileURLToPath(new URL("./src/content/fish/", import.meta.url));
  return {
    name: "species-index",
    resolveId: (source) => (source === moduleId ? resolvedId : undefined),
    load(id) {
      if (id !== resolvedId) return undefined;
      const entries = readdirSync(fishDir).sort().flatMap((folder) => {
        const file = join(fishDir, folder, "species.json");
        if (!existsSync(file)) return [];
        this.addWatchFile(file);
        return [toSpeciesIndexEntry(JSON.parse(readFileSync(file, "utf8")))];
      });
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}

// 既定は相対 base。LocalWeb の通常 host と Tailscale の /apps/{id}/ 配下の両方で、
// 素の `bun run build` の成果物がそのまま動くようにする（GitHub Pages は VITE_BASE_PATH で指定）。
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react(), speciesIndex()],
  test: { setupFiles: ["src/core/testSetup.ts"] },
});
