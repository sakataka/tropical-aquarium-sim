import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 実際の監視プロセスで、JSONの追加・削除、atomic save、エラー修復を確かめる。
test("JSON supervisor refreshes cached content and shuts its child down", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aquarium-watch-"));
  mkdirSync(join(dir, "src/content"), { recursive: true });
  mkdirSync(join(dir, "scripts"));
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port!; probe.stop(true);
  await Bun.write(join(dir, "scripts/dev.ts"), Bun.file(new URL("./dev.ts", import.meta.url)));
  await Bun.write(join(dir, "scripts/dev-frontend.ts"), `
    let content;
    try { content = await Promise.all([...new Bun.Glob("*.json").scanSync({ cwd: "src/content" })].sort().map(path => Bun.file("src/content/" + path).json())); } catch {}
    Bun.serve({ hostname: "127.0.0.1", port: Number(process.argv[3]), fetch: () => Response.json({ pid: process.pid, content: content ?? null }) });
  `);
  const value = join(dir, "src/content/value.json");
  await Bun.write(value, '"first"');
  const child = Bun.spawn([process.execPath, "scripts/dev.ts", "--port", String(port)], { cwd: dir, stdout: "ignore", stderr: "ignore" });
  const url = `http://127.0.0.1:${port}/`;
  async function waitFor(content: unknown) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try { const result = await (await fetch(url)).json(); if (JSON.stringify(result.content) === JSON.stringify(content)) return result.pid as number; } catch {}
      await Bun.sleep(30);
    }
    throw new Error(`Content not refreshed: ${JSON.stringify(content)}`);
  }
  try {
    const first = await waitFor(["first"]);
    await Bun.write(value, '"edited"'); expect(await waitFor(["edited"])).not.toBe(first);
    await Bun.write(join(dir, "src/content/add.json"), '"added"'); await waitFor(["added", "edited"]);
    rmSync(join(dir, "src/content/add.json")); await waitFor(["edited"]);
    await Bun.write(value + ".tmp", '"atomic"'); renameSync(value + ".tmp", value); await waitFor(["atomic"]);
    await Bun.write(value, "{"); await waitFor(null);
    await Bun.write(value, '"fixed"'); const fixed = await waitFor(["fixed"]);
    await Bun.write(join(dir, "src/content/notes.txt"), "unrelated"); await Bun.sleep(200);
    expect(await waitFor(["fixed"])).toBe(fixed);
  } finally {
    child.kill(); await child.exited;
    rmSync(dir, { recursive: true, force: true });
  }
  await expect(fetch(url)).rejects.toThrow();
}, 15000);

test("a dev startup failure exits instead of leaving a watcher running", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aquarium-startup-"));
  mkdirSync(join(dir, "src/content"), { recursive: true }); mkdirSync(join(dir, "scripts"));
  await Bun.write(join(dir, "scripts/dev.ts"), Bun.file(new URL("./dev.ts", import.meta.url)));
  await Bun.write(join(dir, "scripts/dev-frontend.ts"), "process.exit(7);");
  const child = Bun.spawn([process.execPath, "scripts/dev.ts"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
  try { expect(await child.exited).toBe(7); } finally { child.kill(); rmSync(dir, { recursive: true, force: true }); }
}, 5000);

test("the real frontend rejects external binding and an occupied port", async () => {
  const held = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  try {
    for (const args of [["--host", "0.0.0.0"], ["--port", String(held.port)]]) {
      const child = Bun.spawn([process.execPath, "scripts/dev.ts", ...args], { stdout: "ignore", stderr: "ignore" });
      try {
        const code = await Promise.race([child.exited, Bun.sleep(1500).then(() => undefined)]);
        expect(code).toBe(1);
      } finally { child.kill(); await child.exited; }
    }
  } finally { held.stop(true); }
}, 5000);
