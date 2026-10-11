import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { contentModules } from "./content-modules";
import { cssAssets } from "./css-assets";
import { parseArgs } from "node:util";

const { values } = parseArgs({ args: process.argv.slice(2).filter(arg => arg !== "--"), options: { base: { type: "string", default: process.env.ASSET_BASE_PATH ?? "./" }, outDir: { type: "string", default: "dist" } } });
if (values.base !== "./" && !(values.base!.startsWith("/") && values.base!.endsWith("/"))) throw new Error("Asset base must be relative ./ or an absolute directory path.");
const outDir = resolve(values.outDir!);
const staging = `${outDir}.build-${process.pid}`;
const backup = `${outDir}.previous-${process.pid}`;
try {
  const result = await Bun.build({ entrypoints: ["index.html"], outdir: staging, target: "browser", minify: true, splitting: true, publicPath: values.base, plugins: [contentModules(resolve("src/content")), cssAssets(resolve(staging, "assets"), values.base + "assets/")], define: { "process.env.NODE_ENV": '"production"', "import.meta.env.BASE_URL": JSON.stringify(values.base) } });
  if (!result.success) throw new AggregateError(result.logs, "Frontend build failed");
  if (existsSync("public")) cpSync("public", staging, { recursive: true });
  mkdirSync(resolve(outDir, ".."), { recursive: true });
  if (existsSync(outDir)) renameSync(outDir, backup);
  try { renameSync(staging, outDir); } catch (error) { if (existsSync(backup)) renameSync(backup, outDir); throw error; }
  rmSync(backup, { recursive: true, force: true });
  console.log(`Built ${result.outputs.length} assets in ${values.outDir}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
