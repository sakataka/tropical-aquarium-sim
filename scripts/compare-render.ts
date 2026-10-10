import { OPEN_HALLS } from "./museum-content";

// 2つのビルドの展示室の絵を、画素単位で比べる。描画の作りを変えたとき（体の変形の計算を速くする、描き方を整理するなど）に、
// 絵が変わっていないことを確かめる。
//
//   bun run build && cp -R dist tmp/dist-before     変更の前のビルドを取っておく
//   （ソースを変更する）
//   bun run compare:render -- tmp/dist-before        変更の後（dist/ を作り直す）と、全展示室で比べる
//   bun run compare:render -- tmp/dist-before --halls=africa,amazon
//   bun run compare:render -- tmp/dist-before tmp/dist-after   ビルド済みの2つを比べる
//
// 乱数（Math.random）と時刻（performance.now、requestAnimationFrame）を決まった値に差し替えたページで、両方のビルドを
// 同じフレーム数だけ進め、展示室のキャンバス全体（狭い画面 420×912 で開いたときの全水槽）を読み出して比べる。
// 同じビルドを2回動かして1画素も違わないことも毎回確かめる（違えば、比べ方が成り立っていない）。
// 生き物の動きの計算を変えると位置が変わるので、全体が違って見える。絵の作りだけを変えたときに使う。

const VIEWPORT = { width: 420, height: 912 };
/** 絵を読み出すまでに進めるフレーム数（前回からの追加）。読み込み直後、4秒後、14秒後。 */
const CHECKPOINTS = [3, 240, 600];

// 開いている展示室だけを比べる（準備中の枠は絵がない）。
const HALLS = OPEN_HALLS;
const only = Bun.argv.find((arg) => arg.startsWith("--halls="))?.slice("--halls=".length).split(",");
for (const id of only ?? []) if (!HALLS.includes(id)) throw new Error(`unknown hall: ${id}`);
const [before, after = "dist"] = Bun.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!before) throw new Error("比べる相手のビルドのフォルダを渡してください（例: bun run compare:render -- tmp/dist-before）");
if (after === "dist") await Bun.$`bun run build`.quiet();
for (const dir of [before, after]) if (!await Bun.file(`${dir}/index.html`).exists()) throw new Error(`ビルドがありません: ${dir}`);

/** アプリより先に読ませ、乱数と時刻を決まった値にする。フレームは __step(n) で進めたときだけ進む。 */
const FIXED_CLOCK = `<script>(() => {
  let state = 12345;
  Math.random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let now = 1000;
  performance.now = () => now;
  const queue = [];
  window.requestAnimationFrame = (callback) => { queue.push(callback); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (count) => { for (let i = 0; i < count; i++) { now += 1000 / 60; for (const callback of queue.splice(0)) callback(now); } };
})();</script>`;

const captures = new Map<string, Uint8Array>();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  maxRequestBodySize: 256 * 1024 * 1024,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST") {
      captures.set(url.searchParams.get("name")!, new Uint8Array(await request.arrayBuffer()));
      return new Response("ok");
    }
    const match = /^\/(before|after)(\/.*)$/.exec(decodeURIComponent(url.pathname));
    if (!match) return new Response("not found", { status: 404 });
    const path = match[2]!;
    const file = Bun.file(`${match[1] === "before" ? before : after}${path.endsWith("/") ? `${path}index.html` : path}`);
    if (!await file.exists()) return new Response("not found", { status: 404 });
    const headers = { "Cache-Control": "no-store" };
    if (!path.endsWith("/")) return new Response(file, { headers });
    return new Response((await file.text()).replace("<head>", `<head>${FIXED_CLOCK}`), { headers: { ...headers, "content-type": "text/html" } });
  },
});
const origin = `http://127.0.0.1:${server.port}`;

if (!Bun.WebView) throw new Error("Bun.WebView is not available in this Bun runtime.");
let different = 0;
try {
  await using view = new Bun.WebView({ ...VIEWPORT, backend: "webkit" });
  for (const hall of HALLS.filter((id) => !only || only.includes(id))) {
    await capture(view, "before", hall, "a");
    await capture(view, "before", hall, "again");
    await capture(view, "after", hall, "b");
    const lines = CHECKPOINTS.map((_, index) => {
      const a = captures.get(`a-${index}`)!, again = captures.get(`again-${index}`)!, b = captures.get(`b-${index}`)!;
      if (countDifferent(a, again).pixels > 0) throw new Error(`${hall}: 同じビルドを2回動かした絵が一致しません（比べ方が成り立っていません）`);
      return countDifferent(a, b);
    });
    const worst = lines.reduce((max, line) => line.pixels > max.pixels ? line : max);
    if (worst.pixels > 0) different++;
    console.log(worst.pixels === 0 ? `${hall}: 同じ`
      : `${hall}: 違う画素 ${lines.map((line) => line.pixels).join(" / ")}（最大 ${(worst.pixels / worst.total * 100).toFixed(3)}%、色の差は最大 ${Math.max(...lines.map((line) => line.max))}/255）`);
  }
} finally {
  server.stop(true);
}
console.log(different === 0 ? "\nどの展示室も、画素まで同じです。" : `\n${different} 室で絵が違います。`);
process.exit(different === 0 ? 0 : 1);

/** 展示室を開いて決まった数のフレームを進め、区切りごとにキャンバスの画素をサーバーへ送る。 */
async function capture(view: Bun.WebView, build: "before" | "after", hall: string, name: string) {
  await view.navigate(`${origin}/${build}/`);
  await sleep(500);
  // 計測の窓口（src/render/perfProbe.ts）から、Pixi のアプリを取り出す。
  await view.evaluate(`(localStorage.clear(), sessionStorage.setItem("tropical-aquarium.perf", "1"))`);
  await view.navigate(`${origin}/${build}/?hall=${hall}`);
  for (let tries = 0; !(await view.evaluate(`!!document.querySelector(".room-stage canvas")`)); tries++) {
    if (tries > 400) throw new Error(`${hall}: 展示室が開きません`);
    await sleep(50);
  }
  await settle(view);
  // 最初の2フレームで、生き物の画像を読み始める。読み終えてから先へ進める（読み終わる時刻で絵が変わらないように）。
  await view.evaluate(`__step(2)`);
  await settle(view);
  await sleep(300);
  for (const [index, frames] of CHECKPOINTS.entries()) {
    await view.evaluate(`__step(${frames})`);
    await view.evaluate(`(async () => {
      const app = window.__aquariumPerf.apps.room, gl = app.renderer.gl;
      app.render();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      await fetch(location.origin + "/capture?name=${name}-${index}", { method: "POST", body: pixels });
      return true;
    })()`);
  }
}

/** 読み込みが止まるまで待つ。 */
async function settle(view: Bun.WebView) {
  let resources = -1;
  for (let quiet = 0; quiet < 4;) {
    await sleep(250);
    const count = Number(await view.evaluate(`performance.getEntriesByType("resource").length`));
    quiet = count === resources ? quiet + 1 : 0;
    resources = count;
  }
}

function countDifferent(a: Uint8Array, b: Uint8Array) {
  let pixels = 0, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const difference = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!), Math.abs(a[i + 3]! - b[i + 3]!));
    if (difference > 0) pixels++;
    if (difference > max) max = difference;
  }
  return { pixels, max, total: a.length / 4 };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
