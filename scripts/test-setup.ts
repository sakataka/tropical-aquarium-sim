import { fileURLToPath } from "node:url";
import { contentModules } from "./content-modules";
await Bun.plugin(contentModules(fileURLToPath(new URL("../src/content", import.meta.url)), true));
await import("../src/core/testSetup");
