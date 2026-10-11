import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import page from "../index.html";
import { CSS_ASSET_CACHE, CSS_ASSET_ROUTE } from "./css-assets";
function start() {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(arg => arg !== "--"), options: {
    host: { type: "string", default: "127.0.0.1" }, port: { type: "string" }, preview: { type: "boolean", default: false }, strictPort: { type: "boolean" },
  } });
  if (values.host !== "127.0.0.1" && values.host !== "localhost") throw new Error("Frontend must listen on loopback.");
  const port = Number(values.port ?? process.env.LOCALWEB_DEV_PORT ?? "0");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid frontend port");
  const publicRoutes = Object.fromEntries([...new Bun.Glob("**/*").scanSync({ cwd: values.preview ? "dist" : "public", onlyFiles: true })].map(file => ["/" + file, Bun.file((values.preview ? "dist/" : "public/") + file)]));
  if (!values.preview) mkdirSync(CSS_ASSET_CACHE, { recursive: true });
  const routes: Bun.Serve.Routes<undefined, string> = values.preview
    ? { ...publicRoutes, "/*": Bun.file("dist/index.html") }
    : { ...publicRoutes, [CSS_ASSET_ROUTE]: { dir: CSS_ASSET_CACHE }, "/*": page };
  const server = Bun.serve({ hostname: values.host, port,
    development: values.preview ? false : { hmr: true, console: true },
    routes,
  });
  console.log(`Frontend listening on ${server.url}`);
}
try { start(); } catch (error) { console.error(error); process.exit(1); }
