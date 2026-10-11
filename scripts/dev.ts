import { watch } from "node:fs";
import { extname } from "node:path";
let child = start();
let stopped = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let restarting = Promise.resolve();
// Bun自身のwatchは生成器とその依存コード、ここでは内容ファイルを監視する。
function start() {
  return Bun.spawn([process.execPath, "--watch", "scripts/dev-frontend.ts", ...process.argv.slice(2)], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
}
const watcher = watch("src/content", { recursive: true }, (event, filename) => {
  // 内容JSONと画像・音声、フォルダの追加・削除を監視する。メモや一時ファイルは除く。
  if (filename && !/\.(json|webp|png|m4a)$/i.test(filename) && !(event === "rename" && !extname(filename))) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    restarting = restarting.then(async () => {
      if (stopped) return;
      child.kill();
      await child.exited;
      if (!stopped) { console.log("Content changed; restarting frontend"); child = start(); }
    });
  }, 100);
});
function stop() { stopped = true; clearTimeout(timer); watcher.close(); child.kill(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Also exit if startup fails; a restarted child is monitored on the next iteration.
while (!stopped) {
  const watched = child;
  const code = await watched.exited;
  await restarting;
  if (stopped) break;
  if (watched === child) { stop(); process.exitCode = code; break; }
}
