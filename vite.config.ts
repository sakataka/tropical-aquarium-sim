/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { contentModules } from "./vite/contentModules";

// 既定は相対 base。LocalWeb の通常 host と Tailscale の /apps/{id}/ 配下の両方で、
// 素の `bun run build` の成果物がそのまま動くようにする（GitHub Pages は VITE_BASE_PATH で指定）。
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react(), contentModules(fileURLToPath(new URL("./src/content/", import.meta.url)))],
  // サブエージェントの git worktree（.claude/worktrees/）のテストは拾わない。
  test: { setupFiles: ["src/core/testSetup.ts"], exclude: [...configDefaults.exclude, ".claude/**"] },
});
