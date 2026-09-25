import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 既定は相対 base。LocalWeb の通常 host と Tailscale の /apps/{id}/ 配下の両方で、
// 素の `bun run build` の成果物がそのまま動くようにする（GitHub Pages は VITE_BASE_PATH で指定）。
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react()],
});
