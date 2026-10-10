// 描画の重さを測る。狭い画面（420×912）で、展示室（全水槽を同時に描く）と、各展示室でいちばん匹数の多い水槽の
// 水槽画面を開き、1フレームにかかる時間と、その内訳・描画の回数・テクスチャの量・読み込みの量を記録する。
// 種や水槽を足すたびに悪化していないかを見る。
//
//   bun run measure:perf                      全展示室を測り、基準値（docs/performance-baseline.json）と比べる
//   bun run measure:perf -- --halls=amazon    展示室を絞る（その展示室と、その中のいちばん匹数の多い水槽）
//   bun run measure:perf -- --tanks=cube-30   指定した水槽の水槽画面だけを測る（基準値とは比べない）
//   bun run measure:perf -- --update-baseline 測った値を新しい基準値として保存する
//   bun run measure:perf -- --no-build        dist/ を作り直さずに測る
//   bun run measure:perf -- --dist=<フォルダ>  別のビルドを測る（変更の前後を比べるとき）
//
// 本番ビルド（dist/）を、時刻を細かく読めるヘッダー（cross-origin isolated）を付けて配り、Bun.WebView（WebKit）で開く。
// 測るのは Mac の上なので、iPhone での絶対値ではない。同じ Mac での前後の比較に使う。
// 測っている間にテストやビルドを並行して走らせると、値が大きく出る。

const VIEWPORT = { width: 420, height: 912 };
const BASELINE_FILE = "docs/performance-baseline.json";
const OUTPUT_DIR = "tmp/perf";
/** 測るフレーム数（中央値を取る）。FRAMES はふだんの描画、SYNC_FRAMES は GPU の描き終わりを待つ描画。 */
const FRAMES = 300;
const SYNC_FRAMES = 150;
/** 計算の量（workMs）が基準値からこの割合と、この時間（ミリ秒）の両方を超えて増えたら知らせる（揺れは5%ほど）。 */
const REGRESSION_RATIO = 1.15;
const REGRESSION_MS = 0.1;

type RoomJson = { id: string; displayName: string; tanks: { tankId: string }[] };
type TankJson = { id: string; defaultStock: { speciesId: string; count: number }[] };
type Result = {
  /** 展示室の id。水槽画面の計測では、水槽の id。 */
  id: string;
  tanks: number;
  creatures: number;
  /**
   * 全水槽の1フレームぶんの計算の量（ミリ秒）。GPU へ送らずにフレームを続けて進めて測る。揺れが小さいので、
   * 基準値との比較にはこれを使う。内訳は、simulation が動きの計算、bodies が体のメッシュの変形と配置、
   * render が Pixi の描画命令の組み立て。
   */
  workMs: number;
  simulationMs: number;
  bodiesMs: number;
  renderMs: number;
  /**
   * 画面の更新に合わせたふだんの描画で、1フレームにメインスレッドでかかる時間（ミリ秒）。中央値と、遅いほうから
   * 5%のフレームの値。フレームの合間に CPU が休むので workMs の数倍から20倍になり、測るたびに1〜2割揺れる。
   */
  cpuMs: number;
  cpuP95Ms: number;
  /**
   * 描画命令を送ってから、GPU がそのフレームを描き終えるまで待った時間（Mac の GPU での値）。
   * 何も描かなくても読み戻しだけで 1.2〜1.5ms かかるので、差を見る。
   */
  gpuWaitMs: number;
  /** 1フレームの描画の回数と、WebGL の呼び出しの総数（WebKit は呼び出しごとに GPU のプロセスへ送る）。 */
  drawCalls: number;
  glCalls: number;
  /** 1フレームに GPU へ送り直す頂点などのデータの量（KB）。 */
  uploadKb: number;
  meshVertices: number;
  textures: number;
  textureMb: number;
  /** キャンバスの画素数（百万画素）。見えていない部分も毎フレーム描く。 */
  canvasMegapixels: number;
  /** フレームの間隔の平均と、20ms を超えたフレームの割合（60fps なら 16.67ms、0%）。 */
  frameIntervalMs: number;
  slowFramePercent: number;
  /** 開き始めてから画面が見えるまで（秒）と、その画面を直接開いたときに読むファイルの量（MB。うち画像）。 */
  readySec: number;
  loadedMb: number;
  imageMb: number;
};
type Baseline = { measuredAt: string; commit: string; machine: string; viewport: string; halls: Result[]; tanks: Result[] };

const museumJson = await Bun.file("src/content/museum/museum.json").json() as { floors: { halls: { id: string }[] }[] };
const HALL_ORDER = museumJson.floors.flatMap((floor) => floor.halls.map((hall) => hall.id));
const ROOMS: RoomJson[] = [];
for await (const path of new Bun.Glob("src/content/room/*.json").scan()) ROOMS.push(await Bun.file(path).json());
ROOMS.sort((a, b) => HALL_ORDER.indexOf(a.id) - HALL_ORDER.indexOf(b.id));
const TANKS = new Map<string, TankJson>();
for await (const path of new Bun.Glob("src/content/tanks/*/tank.json").scan()) {
  const tank = await Bun.file(path).json() as TankJson;
  TANKS.set(tank.id, tank);
}
const option = (name: string) => Bun.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const ONLY_HALLS = option("halls")?.split(",");
for (const id of ONLY_HALLS ?? []) if (!ROOMS.some((room) => room.id === id)) throw new Error(`unknown hall: ${id}`);
const ONLY_TANKS = option("tanks")?.split(",");
for (const id of ONLY_TANKS ?? []) if (!TANKS.has(id)) throw new Error(`unknown tank: ${id}`);

async function main() {
  if (!Bun.WebView) throw new Error("Bun.WebView is not available in this Bun runtime.");
  const dist = option("dist") ?? "dist";
  if (!Bun.argv.includes("--no-build") && !option("dist")) await Bun.$`bun run build`.quiet();
  const server = serveDist(dist);
  const base = `http://127.0.0.1:${server.port}/`;
  const halls: Result[] = [], tanks: Result[] = [];
  const rooms = ROOMS.filter((item) => !ONLY_HALLS || ONLY_HALLS.includes(item.id));
  try {
    const errors: string[] = [];
    await using view = new Bun.WebView({ ...VIEWPORT, backend: "webkit",
      console: (type, ...args) => { if (type === "error") errors.push(args.map(String).join(" ")); } });
    await view.navigate(base);
    await sleep(1000);
    // 計測の窓口（src/render/perfProbe.ts）を働かせる印。
    await view.evaluate(`(localStorage.clear(), sessionStorage.setItem("tropical-aquarium.perf", "1"))`);
    const report = (item: Result) => console.error(`${item.id}: 計算 ${item.workMs.toFixed(2)} ms、実フレーム ${item.cpuMs.toFixed(2)} ms、GPU待ち ${item.gpuWaitMs.toFixed(2)} ms`);
    for (const room of ONLY_TANKS ? [] : rooms) {
      halls.push(await measure(view, dist, `${base}?hall=${room.id}`, "room", `.room-scroll.ready[data-room="${room.id}"]`,
        { id: room.id, tanks: room.tanks.length, creatures: room.tanks.reduce((sum, { tankId }) => sum + stockOf(tankId), 0) }));
      report(halls.at(-1)!);
    }
    // 水槽画面は、各展示室でいちばん匹数の多い水槽を測る。
    const tankIds = ONLY_TANKS ?? rooms.map((room) => room.tanks.map((item) => item.tankId).sort((a, b) => stockOf(b) - stockOf(a))[0]!);
    for (const tankId of tankIds) {
      tanks.push(await measure(view, dist, `${base}?tank=${tankId}`, "tank", ".tank-screen.visible .aquarium-stage canvas",
        { id: tankId, tanks: 1, creatures: stockOf(tankId) }));
      report(tanks.at(-1)!);
    }
    if (errors.length > 0) throw new Error(`console errors:\n${errors.join("\n")}`);
  } finally {
    server.stop(true);
  }

  const baseline = await Bun.file(BASELINE_FILE).exists() ? await Bun.file(BASELINE_FILE).json() as Baseline : undefined;
  if (ONLY_TANKS) {
    printTable(tanks, undefined);
    return;
  }
  console.log("展示室（全水槽を同時に描く）\n");
  const slowerHalls = printTable(halls, baseline?.halls);
  console.log("\n水槽画面（各展示室でいちばん匹数の多い水槽）\n");
  const slowerTanks = printTable(tanks, baseline?.tanks);
  if (baseline) {
    const slower = [...slowerHalls, ...slowerTanks];
    console.log(`\n基準値: ${baseline.measuredAt}（${baseline.commit}）`);
    console.log(slower.length > 0
      ? `⚠ 計算の量が基準値より${Math.round((REGRESSION_RATIO - 1) * 100)}%を超えて増えた: ${slower.join(", ")}`
      : "計算の量が基準値より大きく増えたものはありません。");
  }
  const record: Baseline = {
    measuredAt: new Date().toISOString().slice(0, 10),
    commit: (await Bun.$`git rev-parse --short HEAD`.text()).trim() + ((await Bun.$`git status --porcelain`.text()).trim() ? "+" : ""),
    machine: `${(await Bun.$`sysctl -n machdep.cpu.brand_string`.text()).trim()} / Bun ${Bun.version}`,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    halls,
    tanks,
  };
  await Bun.$`mkdir -p ${OUTPUT_DIR}`;
  await Bun.write(`${OUTPUT_DIR}/latest.json`, `${JSON.stringify(record, null, 2)}\n`);
  if (Bun.argv.includes("--update-baseline")) {
    // 絞って測ったときは、測ったものだけを入れ替える。
    const merge = (measured: Result[], previous: Result[] | undefined) => ONLY_HALLS && previous
      ? [...previous.filter((item) => !measured.some((entry) => entry.id === item.id)), ...measured] : measured;
    await Bun.write(BASELINE_FILE, `${JSON.stringify({ ...record, halls: merge(halls, baseline?.halls), tanks: merge(tanks, baseline?.tanks) }, null, 2)}\n`);
    console.log(`\n基準値を ${BASELINE_FILE} に保存しました。`);
  }
}

/** ビルドしたフォルダを配る。COOP/COEP を付けると、WebKit の performance.now() が 1ms 刻みから 0.02ms 刻みになる。 */
function serveDist(dist: string) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(`${dist}${path.endsWith("/") ? `${path}index.html` : path}`);
      if (!await file.exists()) return new Response("not found", { status: 404 });
      return new Response(file, { headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
      } });
    },
  });
}

const stockOf = (tankId: string) => TANKS.get(tankId)!.defaultStock.reduce((total, entry) => total + entry.count, 0);

/** 画面を開き、ready の要素が現れて読み込みが落ち着いてから、appName の Pixi アプリを測る。 */
async function measure(view: Bun.WebView, dist: string, url: string, appName: "room" | "tank", ready: string,
  subject: Pick<Result, "id" | "tanks" | "creatures">): Promise<Result> {
  await view.navigate(url);
  const readySec = await waitFor(view, `document.querySelector(${JSON.stringify(ready)}) ? performance.now() / 1000 : 0`, 30_000);
  // 生き物の画像は描き始めてから読むので、読み込みが止まるまで待つ。
  let resources = -1;
  for (let quiet = 0; quiet < 4;) {
    await sleep(250);
    const count = Number(await view.evaluate(`performance.getEntriesByType("resource").length`));
    quiet = count === resources ? quiet + 1 : 0;
    resources = count;
  }
  // 水槽画面は、水中の光や泡が現れきるまで待つ。
  await sleep(appName === "tank" ? 3000 : 1000);
  if (await view.evaluate(`!!document.querySelector(".render-problem")`)) throw new Error(`${subject.id}: render problem`);
  const { loadedPaths, ...measured } = await view.evaluate(`(${measureInPage.toString()})(${JSON.stringify(appName)}, ${FRAMES}, ${SYNC_FRAMES})`) as Awaited<ReturnType<typeof measureInPage>>;
  const megabytes = (paths: string[]) => round(paths.reduce((sum, path) => sum + Bun.file(`${dist}${decodeURIComponent(path)}`).size, 0) / 1024 / 1024, 2);
  return { ...subject, ...measured, readySec: round(readySec, 2), loadedMb: megabytes(loadedPaths),
    imageMb: megabytes(loadedPaths.filter((path) => /\.(webp|png|jpg)$/.test(path))) };
}

/**
 * ページの中で動く。画面の更新（毎秒60回）に合わせたふだんの描画のまま、1フレームごとの時間を測る。
 * フレームを間を置かずに続けて進める測り方は使わない（前のフレームの描画が GPU に残っているうちに次を送ると
 * 待たされ、実際にはない時間が描画に乗る）。
 */
async function measureInPage(appName: string, frames: number, syncFrames: number) {
  const probe = (window as any).__aquariumPerf as { apps: Record<string, any>; sections: Record<string, number> };
  const app = probe.apps[appName];
  const ticker = app.ticker;
  const gl = app.renderer.gl as WebGL2RenderingContext;
  const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
  const median = (values: number[]) => sorted(values)[Math.floor(values.length / 2)]!;
  const pixel = new Uint8Array(4);

  // Pixi の描画（app.render）を、時間を記録する関数に差し替えて count フレーム待つ。
  // sync のときは、描画のあとに1画素を読み戻し、GPU がそのフレームを描き終えるまで待つ時間を測る。
  const collect = (count: number, sync: boolean) => new Promise<Record<"starts" | "cpu" | "gpuWait", number[]>>((resolve) => {
    const out = { starts: [] as number[], cpu: [] as number[], gpuWait: [] as number[] };
    let frameStart = 0;
    const begin = () => { frameStart = performance.now(); };
    const render = () => {
      app.render();
      const submitted = performance.now();
      if (sync) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      out.starts.push(frameStart);
      out.cpu.push(submitted - frameStart);
      out.gpuWait.push(performance.now() - submitted);
      if (out.cpu.length < count) return;
      ticker.remove(begin);
      ticker.remove(render);
      ticker.add(app.render, app, -25);
      resolve(out);
    };
    ticker.remove(app.render, app);
    ticker.add(begin, undefined, 50);
    ticker.add(render, undefined, -25);
  });
  await collect(30, false);
  const paced = await collect(frames, false);
  const synced = await collect(syncFrames, true);
  const intervals = paced.starts.slice(1).map((time, index) => time - paced.starts[index]!);

  // 1フレームの WebGL の呼び出しの数と、GPU へ送り直すデータの量。
  let drawCalls = 0, glCalls = 0, uploadBytes = 0;
  const size = (data: unknown) => typeof data === "number" ? data : (data as ArrayBufferView | null)?.byteLength ?? 0;
  const wrapped: string[] = [];
  for (const name in gl) {
    const original = (gl as any)[name];
    if (typeof original !== "function") continue;
    wrapped.push(name);
    (gl as any)[name] = function (...args: any[]) {
      glCalls++;
      if (name.startsWith("draw")) drawCalls++;
      if (name === "bufferData") uploadBytes += size(args[1]);
      if (name === "bufferSubData") uploadBytes += args.length > 4 ? args[4] * (args[2].BYTES_PER_ELEMENT ?? 1) : size(args[2]);
      return original.apply(gl, args);
    };
  }
  const counted = 8;
  await collect(counted, false);
  for (const name of wrapped) delete (gl as any)[name];

  // 計算の量。描画と頂点の送信だけを空にして（GPU を待たないように）、フレームを続けて進める。5回のうち最小を取る。
  const stubbed: string[] = [];
  for (const name in gl) {
    if (typeof (gl as any)[name] !== "function" || !/^(draw|buffer(Sub)?Data$)/.test(name)) continue;
    stubbed.push(name);
    (gl as any)[name] = () => {};
  }
  let renderTotal = 0;
  const timedRender = () => { const start = performance.now(); app.render(); renderTotal += performance.now() - start; };
  ticker.stop();
  ticker.remove(app.render, app);
  ticker.add(timedRender, undefined, -25);
  let time = performance.now();
  const hot = (count: number) => {
    probe.sections = {};
    renderTotal = 0;
    const start = performance.now();
    for (let index = 0; index < count; index++) ticker.update(time += 1000 / 60);
    return { work: (performance.now() - start) / count, simulation: (probe.sections.simulation ?? 0) / count,
      bodies: (probe.sections.bodies ?? 0) / count, render: renderTotal / count };
  };
  hot(120);
  const best = Array.from({ length: 5 }, () => hot(200)).sort((a, b) => a.work - b.work)[0]!;
  for (const name of stubbed) delete (gl as any)[name];
  ticker.remove(timedRender);
  ticker.add(app.render, app, -25);
  ticker.start();

  let meshVertices = 0;
  const visit = (node: any) => {
    if (node.geometry?.positions) meshVertices += node.geometry.positions.length / 2;
    for (const child of node.children ?? []) visit(child);
  };
  visit(app.stage);
  const sources = (app.renderer.texture.managedTextures ?? []) as any[];
  const textureBytes = sources.reduce((sum, source) =>
    sum + source.pixelWidth * source.pixelHeight * 4 * (source.autoGenerateMipmaps ? 4 / 3 : 1), 0);
  // 読んだファイル。量は、呼び出し側がビルドのフォルダのファイルの大きさから出す（ブラウザの報告はキャッシュで揺れる）。
  const loadedPaths = [...new Set(performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname))];

  return {
    workMs: round(best.work, 3),
    simulationMs: round(best.simulation, 3),
    bodiesMs: round(best.bodies, 3),
    renderMs: round(best.render, 3),
    cpuMs: round(median(paced.cpu), 2),
    cpuP95Ms: round(sorted(paced.cpu)[Math.floor(paced.cpu.length * .95)]!, 2),
    gpuWaitMs: round(median(synced.gpuWait), 2),
    drawCalls: Math.round(drawCalls / counted),
    glCalls: Math.round(glCalls / counted),
    uploadKb: round(uploadBytes / counted / 1024, 1),
    meshVertices,
    textures: sources.length,
    textureMb: round(textureBytes / 1024 / 1024, 1),
    canvasMegapixels: round(app.canvas.width * app.canvas.height / 1e6, 1),
    frameIntervalMs: round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length, 2),
    slowFramePercent: round(intervals.filter((value) => value > 20).length / intervals.length * 100, 1),
    loadedPaths,
  };
}

/** 表を出し、計算の量が基準値より大きく増えたものの id を返す。 */
function printTable(results: Result[], baseline: Result[] | undefined): string[] {
  const before = (item: Result) => baseline?.find((entry) => entry.id === item.id);
  const change = (now: number, was: number | undefined) => was === undefined ? "-"
    : `${now >= was ? "+" : ""}${Math.round((now / was - 1) * 100)}%${isSlower(now, was) ? " ⚠" : ""}`;
  const columns: [string, (item: Result) => string | number][] = [
    ["", (item) => item.id], ["水槽", (item) => item.tanks], ["生き物", (item) => item.creatures],
    ["計算 ms", (item) => item.workMs.toFixed(2)], ["動き", (item) => item.simulationMs.toFixed(2)],
    ["体", (item) => item.bodiesMs.toFixed(2)], ["描画", (item) => item.renderMs.toFixed(2)],
    ["実フレーム ms", (item) => item.cpuMs.toFixed(2)], ["遅い5%", (item) => item.cpuP95Ms.toFixed(2)],
    ["GPU待ち ms", (item) => item.gpuWaitMs.toFixed(2)],
    ["描画回数", (item) => item.drawCalls], ["GL呼出", (item) => item.glCalls], ["送信 KB", (item) => item.uploadKb],
    ["頂点", (item) => item.meshVertices], ["テクスチャ MB", (item) => item.textureMb], ["画素 MP", (item) => item.canvasMegapixels],
    ["間隔 ms", (item) => item.frameIntervalMs], ["遅い%", (item) => item.slowFramePercent], ["表示 秒", (item) => item.readySec],
    ["読込 MB", (item) => item.loadedMb], ["うち画像", (item) => item.imageMb],
    ["計算の基準比", (item) => change(item.workMs, before(item)?.workMs)],
  ];
  console.log(`| ${columns.map(([name]) => name).join(" | ")} |`);
  console.log(`|${columns.map((_, index) => index === 0 ? "---" : "---:").join("|")}|`);
  for (const item of results) console.log(`| ${columns.map(([, value]) => value(item)).join(" | ")} |`);
  return results.filter((item) => {
    const was = before(item);
    return was && isSlower(item.workMs, was.workMs);
  }).map((item) => item.id);
}

function isSlower(now: number, was: number) {
  return now > was * REGRESSION_RATIO && now - was > REGRESSION_MS;
}

async function waitFor(view: Bun.WebView, expression: string, timeoutMs: number): Promise<number> {
  for (const start = Date.now(); Date.now() - start < timeoutMs;) {
    const value = Number(await view.evaluate(expression));
    if (value) return value;
    await sleep(50);
  }
  throw new Error(`timed out: ${expression}`);
}

function round(value: number, digits: number) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
