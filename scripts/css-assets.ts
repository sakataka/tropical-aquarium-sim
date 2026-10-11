import type { BunPlugin } from "bun";
import { basename, extname, resolve } from "node:path";

export const CSS_ASSET_CACHE = resolve("node_modules/.cache/frontend-css-assets");
export const CSS_ASSET_ROUTE = "/_css-assets/*";

export function cssAssets(outDir: string, publicPath: string): BunPlugin {
  return {
    name: "css-asset-files",
    setup(build) {
      build.onResolve({ filter: /\.(woff2?|ttf|otf|png|jpe?g|webp|svg)$/ }, async args => {
        if (!args.importer.endsWith(".css") || /^(?:https?:|data:)/.test(args.path)) return;
        const source = args.path.startsWith("/") ? resolve("public", `.${args.path}`) : resolve(args.resolveDir, args.path);
        const bytes = await Bun.file(source).bytes();
        const extension = extname(source);
        const name = `${basename(source, extension)}-${Bun.hash(bytes).toString(16)}${extension}`;
        const target = resolve(outDir, name);
        if (!(await Bun.file(target).exists())) await Bun.write(target, bytes);
        return { path: `${publicPath}${name}`, external: true };
      });
    },
  };
}

export default cssAssets(CSS_ASSET_CACHE, "/_css-assets/");
