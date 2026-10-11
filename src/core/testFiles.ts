import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
/** Files used by content tests, with paths relative to the test module. */
export function testFiles(pattern: string, from: string): Record<string, true> {
  return Object.fromEntries([...new Bun.Glob(pattern).scanSync({ cwd: dirname(fileURLToPath(from)), onlyFiles: true })].map(path => [path, true]));
}
