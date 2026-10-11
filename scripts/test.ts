const mode = process.argv[2] ?? "all";
const args = process.argv.slice(3).filter(arg => arg !== "--");
const files = [...new Bun.Glob("{src,scripts}/**/*.test.{ts,tsx}").scanSync()].sort();
const tankSuite = "src/core/terrainEndurance.test.ts";
const seed = process.env.TEST_SEED === "random" ? String(Math.floor(Math.random() * 2 ** 32)) : process.env.TEST_SEED ?? "1";
const jobs: (string | undefined)[] = mode === "tanks" ? [] : [undefined];
if (mode !== "fast") for (let shard = 1; shard <= 8; shard++) jobs.push(`${shard}/8`);
let failed = false;
async function worker() {
  while (jobs.length) {
    const shard = jobs.shift();
    const selected = shard ? [tankSuite] : files.filter(file => file !== tankSuite);
    // ./を付けて実ファイルを指定し、tmpや別worktreeを検索対象にしない。
    const child = Bun.spawn([process.execPath, "test", ...selected.map(file => "./" + file), ...args], { stdout: "inherit", stderr: "inherit", env: { ...process.env, TEST_SEED: seed, TANK_SHARD: shard ?? "1/1" } });
    if (await child.exited !== 0) {
      failed = true;
      console.error(`Failed: TEST_SEED=${seed} TANK_SHARD=${shard ?? "1/1"}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
process.exitCode = failed ? 1 : 0;

export {};
