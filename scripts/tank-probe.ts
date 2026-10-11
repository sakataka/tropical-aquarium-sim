// 水槽を画面と同じ切り取り方で泳がせ、種ごとの見え方に関わる数字を1画面の表にする。
// 水槽の仕上げ（docs/agent-lanes/tank-finish.md）で、地形と種の定義を直すたびに流す。読むだけで、内容ファイルは書き換えない。
//
//   bun run scripts/tank-probe.ts <水槽id> [--lighting <照明>] [--minutes 10] [--seeds 7,21] [--stock default|max]
//                                          [--scene <水景id>] [--no-image] [--no-walk-check]
//
// - 地形の置き方は src/core/testContent.ts の getRenderedSurfaceFrame（画面・耐久テストと同じ）。
// - 照明を省くと、水景の既定の照明（scene.json の defaultLighting）で泳がせる。最初の1分は数えない。
// - 表の値: 高さは水槽の高さに対する比率（0 = ガラスの上端、1 = 下端）、奥行きは depth（0 = ガラス側、1 = 奥）、
//   隠れ = 体の中心が自分より手前の遮蔽の輪郭の内側にある時間、切れ = 体の絵の5%以上がガラスの縁の外に出ている時間
//   （絵の大きさと支点は描画の近似。面の傾きと体の変形は見ない）。
// - 面を歩く生き物がいる水槽では、上限の匹数で「この照明10分＋夜10分」も回し、詰まりの目安を水槽全体で出す
//   （基準は docs/next-steps.md の「シミュレーションの不具合と不足」: 続けざまの引き返しが1匹・1分あたり 0.5 以下、
//   引き返しが続いた最長が120秒以下、1cm も動かない最長が300秒以下）。引き返し = 同じ面の上で進む向きが逆になること、
//   続けざま = 前の引き返しから6秒以内。種ごとの値は probe-*.txt に書く。
// - 出力は tmp/tank-work/<水槽id>/ の probe-*.txt（細かい値）と positions-*.json（ある時点の全個体の位置）。
//   最後に scripts/tank-view.py を呼び、その位置に体の絵を重ねた合成画像（view-900.jpg）も作る。
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contentModules } from "./content-modules";
import type { ActivityPeriod, FishInstance, FishSpeciesDefinition, FishStockEntry, LightingId, TankDefinition, Vec2 } from "../src/core/types";

const LIGHTINGS: LightingId[] = ["natural", "cool", "evening", "night"];
// src/core/simulation.ts の ACTIVITY_BY_LIGHT と同じ表（公開されていないので写してある。変えたら合わせる）。
const ACTIVITY: Record<ActivityPeriod, Record<LightingId, number>> = {
  diurnal: { natural: 1, cool: 1, evening: 0.7, night: 0.3 },
  crepuscular: { natural: 0.75, cool: 0.75, evening: 1.1, night: 0.8 },
  nocturnal: { natural: 0.3, cool: 0.3, evening: 0.9, night: 1.1 },
};
const WARMUP_TICKS = 600;
const TICK_SEC = 0.1;
/** 面を歩く生き物の詰まりの基準。 */
const WALK_LIMITS = { quickTurnsPerMin: 0.5, chainSec: 120, stillSec: 300 };
/** 続けざまの引き返しと数える間隔（秒）。 */
const QUICK_TURN_SEC = 6;

const argv = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? undefined : argv[index + 1];
}
const flags = new Set(["lighting", "minutes", "seeds", "stock", "scene"]);
const tankId = argv.find((arg, i) => !arg.startsWith("--") && !flags.has((argv[i - 1] ?? "").slice(2)));
if (!tankId || argv.includes("--help")) {
  console.error("使い方: bun run scripts/tank-probe.ts <水槽id> [--lighting natural|cool|evening|night] [--minutes 10] [--seeds 7,21] [--stock default|max] [--scene <水景id>] [--no-image] [--no-walk-check]");
  process.exit(tankId ? 0 : 1);
}

// 内容ファイルを、テストと同じ仕組みで読む（scripts/test-setup.ts）。読むのはこの水槽の展示室だけ。
await Bun.plugin(contentModules(fileURLToPath(new URL("../src/content", import.meta.url)), true));
const { fishCatalog, getLoadedTanks, getSceneById, getTankById, loadHall } = await import("../src/core/catalog");
const { getTankSummary, getHallOfTank } = await import("../src/core/museum");
const { getBodyPlan } = await import("../src/core/bodyPlans");
const { createFishFromStock, createFishPersonality } = await import("../src/core/fishPopulation");
const { stepSimulation } = await import("../src/core/simulation");
const { pointInPolygon } = await import("../src/core/terrainMotion");
const { getRenderedSurfaceFrame } = await import("../src/core/testContent");

if (!getTankSummary(tankId)) {
  console.error(`水槽が見つかりません: ${tankId}（src/content/tanks/ にあり、展示室の絵に置かれている水槽を指定する）`);
  process.exit(1);
}
const hall = getHallOfTank(tankId);
await loadHall(hall.id);
const tank = getTankById(tankId)!;
const sceneId = option("scene") ?? tank.sceneIds[0]!;
const scene = getSceneById(sceneId);
if (!scene) {
  console.error(`水景が見つかりません: ${sceneId}`);
  process.exit(1);
}
const lighting = (option("lighting") ?? scene.defaultLighting) as LightingId;
if (!LIGHTINGS.includes(lighting)) {
  console.error(`照明は ${LIGHTINGS.join(" / ")} のどれか: ${lighting}`);
  process.exit(1);
}
const minutes = Number(option("minutes") ?? 10);
const seeds = (option("seeds") ?? "7,21").split(",").map(Number);
const useMax = (option("stock") ?? "default") === "max";
if (!(minutes > 1) || seeds.some((seed) => !Number.isFinite(seed))) {
  console.error("--minutes は1より大きい数、--seeds はコンマ区切りの数にする");
  process.exit(1);
}
const frame = getRenderedSurfaceFrame(tank, scene);
const occluders = scene.terrain?.occluders ?? [];

/** 上限の匹数。耐久テスト（src/core/terrainEndurance.test.ts）と同じ配り方。 */
function maxStock(): FishStockEntry[] {
  const stock = tank.species.map((slot) => ({ speciesId: slot.speciesId, count: 0 }));
  let count = 0;
  while (count < tank.maxTotalFish) for (const [i, slot] of tank.species.entries()) {
    if (count < tank.maxTotalFish && stock[i]!.count < slot.maxCount) { stock[i]!.count++; count++; }
  }
  return stock;
}

/** createFishFromStock が個体差を Math.random で決めるので、乱数の種ごとに同じ列へ置き換える。 */
function seedRandom(seed: number) {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** 泳がせる。照明を順に切り替え、数え始めてからの各ステップを visit に渡す。 */
function simulate(stock: FishStockEntry[], seed: number, phases: { lighting: LightingId; ticks: number }[],
  visit: (fish: FishInstance[], previous: FishInstance[], seconds: number, tick: number) => void) {
  seedRandom(seed);
  let fish = createFishFromStock(stock, tank).map((f, i) => ({ ...f, id: `p${seed}-${i}`, seed: seed + i * 1327,
    personality: createFishPersonality(seed + i * 1327), bodyLengthVariance: 1 }));
  let tick = 0;
  for (const phase of phases) for (let i = 0; i < phase.ticks; i++, tick++) {
    const previous = fish;
    fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, lighting: phase.lighting, deltaSec: TICK_SEC }).fish;
    if (tick >= WARMUP_TICKS) visit(fish, previous, (tick - WARMUP_TICKS) * TICK_SEC, tick - WARMUP_TICKS);
  }
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const toPlate = (position: Vec2) => ({ x: (position.x / tank.widthCm - frame.x) / frame.width, y: (position.y / tank.heightCm - frame.y) / frame.height });

/** 体の絵のうち、個体の位置に置かれる点（絵の幅・高さに対する比率。頭が左）。src/render/fishBody.ts の支点の近似。 */
function bodyAnchor(fish: FishInstance, species: FishSpeciesDefinition): Vec2 {
  const plan = getBodyPlan(species);
  if (fish.surfaceMotion || plan.walksOnSurfaces) return species.swim?.footAnchor ?? { x: .42, y: .95 };
  const free = { x: plan.drifts ? .5 : .42, y: .5 };
  if (!fish.contact) return free;
  const to = fish.contact.kind === "mouth" ? species.swim?.mouthAnchor ?? { x: .025, y: .62 } : { x: .42, y: .82 };
  return { x: free.x + (to.x - free.x) * fish.contact.weight, y: free.y + (to.y - free.y) * fish.contact.weight };
}

/** 体の絵の幅 (cm)。触角のあるエビは、体長を触角の付け根より後ろで測る（src/core/scale.ts）。 */
function spriteLengthCm(species: FishSpeciesDefinition): number {
  const antenna = getBodyPlan(species).antennae ? species.swim?.headStart ?? 0 : 0;
  return species.realBodyLengthCm / (1 - antenna);
}

/** 体の絵がガラスのどの縁から5%以上はみ出しているか。 */
function cutEdges(fish: FishInstance, species: FishSpeciesDefinition) {
  const length = spriteLengthCm(species) * fish.bodyLengthVariance * (1.04 - clamp(fish.depth, 0, 1) * .1);
  const height = length * species.sourceBodyBounds.height / species.sourceBodyBounds.width;
  const anchor = bodyAnchor(fish, species);
  const ax = fish.facing === 1 ? 1 - anchor.x : anchor.x;
  const left = fish.position.x - ax * length, top = fish.position.y - anchor.y * height;
  return {
    left: left < -length * .05, right: left + length > tank.widthCm + length * .05,
    top: top < -height * .05, bottom: top + height > tank.heightCm + height * .05,
  };
}

type Stat = {
  count: number; n: number; ys: number[]; xs: number[]; depths: number[];
  modes: Record<string, number>; kinds: Record<string, number>; surfaces: Record<string, number>;
  hidden: number; left: number; right: number; top: number; bottom: number; sides: number; ends: number;
};
type WalkStat = { individuals: number; minutes: number; quickTurns: number; longestChainSec: number; longestStillSec: number };

/** 面を歩く個体の、続けざまの引き返しと、動かない時間を数える。 */
function walkTracker() {
  const state = new Map<string, { lastTurn: number; chainStart: number; anchor: Vec2; stillSince: number }>();
  const result = new Map<string, WalkStat>();
  let lastSeconds = 0;
  return {
    result,
    visit(fish: FishInstance[], previous: FishInstance[], seconds: number) {
      lastSeconds = seconds;
      for (const [i, f] of fish.entries()) {
        const species = fishCatalog[f.speciesId]!;
        if (!getBodyPlan(species).walksOnSurfaces) continue;
        const stat = result.get(f.speciesId) ?? { individuals: 0, minutes: 0, quickTurns: 0, longestChainSec: 0, longestStillSec: 0 };
        result.set(f.speciesId, stat);
        let own = state.get(f.id);
        if (!own) {
          own = { lastTurn: -Infinity, chainStart: 0, anchor: { ...f.position }, stillSince: seconds };
          state.set(f.id, own);
          stat.individuals++;
        }
        stat.minutes += TICK_SEC / 60;
        const before = previous[i]!.surfaceMotion, now = f.surfaceMotion;
        if (before && now && before.surfaceId === now.surfaceId && before.direction !== now.direction) {
          if (seconds - own.lastTurn <= QUICK_TURN_SEC) {
            stat.quickTurns++;
            stat.longestChainSec = Math.max(stat.longestChainSec, seconds - own.chainStart);
          } else own.chainStart = seconds;
          own.lastTurn = seconds;
        }
        if (Math.hypot(f.position.x - own.anchor.x, f.position.y - own.anchor.y) > 1) {
          own.anchor = { ...f.position };
          own.stillSince = seconds;
        }
        stat.longestStillSec = Math.max(stat.longestStillSec, seconds - own.stillSince);
      }
    },
    /** 乱数の種を変える前に、個体ごとの状態を捨てる。 */
    reset() { state.clear(); return lastSeconds; },
  };
}

// ---------------------------------------------------------------- 計測

const stock = useMax ? maxStock() : tank.defaultStock.filter((entry) => entry.count > 0);
const stats = new Map<string, Stat>();
for (const entry of stock) stats.set(entry.speciesId, { count: entry.count, n: 0, ys: [], xs: [], depths: [], modes: {}, kinds: {},
  surfaces: {}, hidden: 0, left: 0, right: 0, top: 0, bottom: 0, sides: 0, ends: 0 });
const snapshots: unknown[] = [];
const ticks = Math.round(minutes * 60 / TICK_SEC);
const snapshotEvery = Math.max(1, Math.floor((ticks - WARMUP_TICKS) / 5));
const started = performance.now();
for (const [seedIndex, seed] of seeds.entries()) {
  simulate(stock, seed, [{ lighting, ticks }], (fish, _previous, seconds, tick) => {
    for (const f of fish) {
      const species = fishCatalog[f.speciesId]!, s = stats.get(f.speciesId)!;
      const plate = toPlate(f.position);
      s.n++;
      s.modes[f.behaviorMode] = (s.modes[f.behaviorMode] ?? 0) + 1;
      const kind = f.targetKind ?? "-";
      s.kinds[kind] = (s.kinds[kind] ?? 0) + 1;
      if (f.surfaceMotion) s.surfaces[f.surfaceMotion.surfaceId] = (s.surfaces[f.surfaceMotion.surfaceId] ?? 0) + 1;
      if (occluders.some((occluder) => f.depth > occluder.depth && pointInPolygon(plate, occluder.polygon))) s.hidden++;
      const cut = cutEdges(f, species);
      if (cut.left) s.left++;
      if (cut.right) s.right++;
      if (cut.top) s.top++;
      if (cut.bottom) s.bottom++;
      if (cut.left || cut.right) s.sides++;
      if (cut.top || cut.bottom) s.ends++;
      if (tick % 10 === 0) { s.ys.push(f.position.y / tank.heightCm); s.xs.push(f.position.x / tank.widthCm); s.depths.push(f.depth); }
    }
    if (seedIndex === 0 && tick % snapshotEvery === snapshotEvery - 1) snapshots.push({ seconds: Math.round(seconds + WARMUP_TICKS * TICK_SEC),
      fish: fish.map((f) => {
        const species = fishCatalog[f.speciesId]!, plate = toPlate(f.position);
        return { speciesId: f.speciesId, x: +plate.x.toFixed(4), y: +plate.y.toFixed(4), depth: +f.depth.toFixed(3), facing: f.facing,
          anchor: bodyAnchor(f, species), angle: f.surfaceMotion?.angle ?? 0, walker: Boolean(f.surfaceMotion),
          mode: f.behaviorMode, kind: f.targetKind, glassY: +(f.position.y / tank.heightCm).toFixed(3) };
      }) });
  });
}

// 面を歩く生き物の詰まり: 上限の匹数で、この照明10分＋夜10分。
const walkers = tank.species.filter((slot) => getBodyPlan(fishCatalog[slot.speciesId]!).walksOnSurfaces);
const walkCheck = walkers.length > 0 && !argv.includes("--no-walk-check") ? walkTracker() : undefined;
// 1回の鉢合わせで値が大きく動くので、乱数は --seeds の各値と、それに1000を足した値の2倍ぶん回す。
if (walkCheck) for (const seed of [...seeds, ...seeds.map((seed) => seed + 1000)]) {
  simulate(maxStock(), seed, [{ lighting, ticks: 6000 + WARMUP_TICKS }, { lighting: "night", ticks: 6000 }], walkCheck.visit);
  walkCheck.reset();
}
const elapsedSec = (performance.now() - started) / 1000;

// ---------------------------------------------------------------- 表

const quantile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? NaN;
const share = (count: number, total: number) => total > 0 ? 100 * count / total : 0;
const shares = (record: Record<string, number>, total: number) => Object.entries(record).sort((a, b) => b[1] - a[1])
  .map(([key, count]) => `${key} ${share(count, total).toFixed(0)}%`).join(", ");
const pad = (text: string | number, width: number) => String(text).padStart(width);
const idWidth = Math.max(4, ...stock.map((entry) => entry.speciesId.length));
const hasHome = (species: FishSpeciesDefinition) => species.ecology.habits.some((habit) => habit.type === "homeShelter" || habit.type === "hideByDay");

const lines: string[] = [];
const detail: string[] = [];
const notes: string[] = [];
const total = stock.reduce((sum, entry) => sum + entry.count, 0);
const hallDefault = getLoadedTanks().reduce((sum, t) => sum + t.defaultStock.reduce((n, entry) => n + entry.count, 0), 0);
lines.push(`${tank.id}「${tank.displayName}」 ${tank.widthCm}×${tank.heightCm.toFixed(0)}×${tank.depthCm}cm（幅×見える高さ×奥行き） 水景 ${scene.id}`
  + ` 照明 ${lighting}${lighting === scene.defaultLighting ? "（既定）" : `（既定は ${scene.defaultLighting}）`}`);
lines.push(`${useMax ? "上限" : "既定"}の匹数 ${total}匹（上限 ${tank.maxTotalFish}）、${minutes}分 × 乱数 ${seeds.join("・")}（最初の1分は数えない）。展示室 ${hall.id} の既定の合計 ${hallDefault}匹`);
lines.push(`${"種".padEnd(idWidth - 1)} 匹  体長cm 幅比%  高さ 中央(10–90%)   奥行き 泳/止/休/食%  隠れ%  切れ 左右/上下%  住みか%  活動`);
if (hallDefault > 180) notes.push(`展示室 ${hall.id} の既定の合計が ${hallDefault}匹（180匹までが目安）`);
for (const [id, s] of stats) {
  const species = fishCatalog[id]!;
  const plan = getBodyPlan(species);
  const mode = (name: string) => share(s.modes[name] ?? 0, s.n);
  const swim = mode("kick") + mode("coast"), pause = mode("pause"), rest = mode("rest"), forage = mode("forage");
  const widthShare = 100 * species.realBodyLengthCm / tank.widthCm;
  const hidden = share(s.hidden, s.n), sides = share(s.sides, s.n), ends = share(s.ends, s.n);
  const home = share((s.kinds.home ?? 0) + (s.kinds.hide ?? 0), s.n);
  const activity = ACTIVITY[species.ecology.activityPeriod][lighting];
  const mark = widthShare < 3 ? "小" : widthShare > 35 ? "大" : " ";
  lines.push(`${id.padEnd(idWidth)} ${pad(s.count, 2)}  ${pad(species.realBodyLengthCm.toFixed(1), 6)} ${pad(widthShare.toFixed(1), 5)}${mark}`
    + ` ${quantile(s.ys, .5).toFixed(2)} (${quantile(s.ys, .1).toFixed(2)}–${quantile(s.ys, .9).toFixed(2)})  ${quantile(s.depths, .5).toFixed(2)}`
    + `  ${pad(swim.toFixed(0), 3)}/${pad(pause.toFixed(0), 2)}/${pad(rest.toFixed(0), 2)}/${pad(forage.toFixed(0), 2)}  ${pad(hidden.toFixed(1), 5)}`
    + `  ${pad(sides.toFixed(1), 5)}/${pad(ends.toFixed(1), 4)}  ${pad(hasHome(species) ? home.toFixed(0) : "-", 6)}  ${activity} ${species.displayName}`);
  detail.push(`${id}（${species.displayName}、${plan.walksOnSurfaces ? "面を歩く" : "泳ぐ"}）`);
  detail.push(`  x  0/10/50/90/100%: ${[0, .1, .5, .9, 1].map((p) => quantile(s.xs, p).toFixed(2)).join(" ")}（水槽の幅に対する比率）`);
  detail.push(`  y  0/10/50/90/100%: ${[0, .1, .5, .9, 1].map((p) => quantile(s.ys, p).toFixed(2)).join(" ")}（0 = ガラスの上端、1 = 下端）`);
  detail.push(`  depth 0/10/50/90/100%: ${[0, .1, .5, .9, 1].map((p) => quantile(s.depths, p).toFixed(2)).join(" ")}（種の depthRange ${species.ecology.depthRange.join("–")}）`);
  detail.push(`  動き: ${shares(s.modes, s.n)} | 目的: ${shares(s.kinds, s.n)}`);
  detail.push(`  隠れ ${hidden.toFixed(1)}% | 切れ 左 ${share(s.left, s.n).toFixed(1)}% 右 ${share(s.right, s.n).toFixed(1)}% 上 ${share(s.top, s.n).toFixed(1)}% 下 ${share(s.bottom, s.n).toFixed(1)}%`);
  if (Object.keys(s.surfaces).length > 0) detail.push(`  面: ${shares(s.surfaces, s.n)}`);

  const name = species.displayName;
  if (widthShare < 3) notes.push(`${name}: 体長が幅の${widthShare.toFixed(1)}%（見えにくいはず。底と同じ色・透明なら報告に書く）`);
  if (widthShare > 35) notes.push(`${name}: 体長が幅の${widthShare.toFixed(1)}%（大きすぎて縁で切れやすい）`);
  if (hidden >= 25) notes.push(`${name}: 遮蔽に隠れる時間が${hidden.toFixed(0)}%`);
  const edges = ([["左端", s.left], ["右端", s.right], ["上端", s.top], ["下端", s.bottom]] as const)
    .filter(([, count]) => share(count, s.n) >= 5).map(([edge, count]) => `${edge}で切れる時間が${share(count, s.n).toFixed(0)}%`);
  if (edges.length > 0) notes.push(`${name}: ${edges.join("、")}`);
  if (!plan.walksOnSurfaces && pause + rest >= 80) notes.push(`${name}: 止まっている時間が${(pause + rest).toFixed(0)}%（${species.ecology.activityPeriod}。照明 ${lighting} での活動 ${activity}）`);
  if (species.ecology.habits.some((habit) => habit.type === "hideByDay") && activity < .6) notes.push(`${name}: hideByDay が働く照明（活動 ${activity}）。物陰に入ったままになりやすい`);
  const homeHabit = species.ecology.habits.find((habit) => habit.type === "homeShelter");
  if (homeHabit?.type === "homeShelter") {
    if (plan.walksOnSurfaces) notes.push(`${name}: homeShelter を持つが、面を歩く生き物は住みかを見ない`);
    else if (!(scene.terrain?.shelters ?? []).some((shelter) => shelter.kind === homeHabit.kind)) notes.push(`${name}: 住みかの種類 ${homeHabit.kind} の隠れ場所が地形にない`);
  }
}
if (walkers.length > 0) {
  lines.push("面を歩く生き物（面ごとの時間）:");
  for (const slot of walkers) {
    const s = stats.get(slot.speciesId);
    if (s) lines.push(`  ${slot.speciesId}: ${shares(s.surfaces, s.n) || "面にいない"}`);
  }
}
if (walkCheck) {
  // 基準は水槽の歩く生き物全体で見る（引き返しは全個体の平均、最長はどれか1匹の最長）。種ごとの値は細かい値のファイルへ。
  const all = [...walkCheck.result.entries()];
  const perMin = all.reduce((sum, [, w]) => sum + w.quickTurns, 0) / Math.max(all.reduce((sum, [, w]) => sum + w.minutes, 0), 1e-9);
  const longest = (key: "longestChainSec" | "longestStillSec") => all.reduce((best, entry) => entry[1][key] > best[1][key] ? entry : best);
  const [chainId, chain] = longest("longestChainSec"), [stillId, still] = longest("longestStillSec");
  const over = [perMin > WALK_LIMITS.quickTurnsPerMin && "続けざまの引き返し", chain.longestChainSec > WALK_LIMITS.chainSec && "引き返しが続いた長さ",
    still.longestStillSec > WALK_LIMITS.stillSec && "動かない長さ"].filter(Boolean);
  lines.push(`詰まりの目安（上限 ${tank.maxTotalFish}匹、${lighting} 10分＋night 10分 × 乱数${seeds.length * 2}通り）: 続けざまの引き返し ${perMin.toFixed(2)}/匹・分（基準 ${WALK_LIMITS.quickTurnsPerMin} 以下）、`
    + `引き返しが続いた最長 ${chain.longestChainSec.toFixed(0)}秒（${WALK_LIMITS.chainSec} 以下。${chainId}）、1cm も動かない最長 ${still.longestStillSec.toFixed(0)}秒（${WALK_LIMITS.stillSec} 以下。${stillId}）`);
  detail.push("詰まりの目安（種ごと）:");
  for (const [id, w] of all) detail.push(`  ${id}: 続けざまの引き返し ${(w.quickTurns / Math.max(w.minutes, 1e-9)).toFixed(2)}/匹・分、引き返しが続いた最長 ${w.longestChainSec.toFixed(0)}秒、1cm も動かない最長 ${w.longestStillSec.toFixed(0)}秒（${w.individuals}匹ぶん）`);
  if (over.length > 0) notes.push(`面を歩く生き物: 上限の匹数で詰まりの基準を超える（${over.join("・")}。面の重なり・行き止まり・匹数を見直す）`);
}

const folder = fileURLToPath(new URL(`../tmp/tank-work/${tank.id}/`, import.meta.url));
mkdirSync(folder, { recursive: true });
const label = `${lighting}-${useMax ? "max" : "default"}`;
const reportFile = `${folder}probe-${label}.txt`, positionsFile = `${folder}positions-${label}.json`;
const speciesInfo = Object.fromEntries(stock.map((entry) => {
  const species = fishCatalog[entry.speciesId]!;
  return [entry.speciesId, { displayName: species.displayName, bodyLengthCm: species.realBodyLengthCm, spriteLengthCm: spriteLengthCm(species),
    walks: getBodyPlan(species).walksOnSurfaces }];
}));
writeFileSync(positionsFile, JSON.stringify({ tankId: tank.id, sceneId: scene.id, lighting, stock, frame,
  tank: { widthCm: tank.widthCm, heightCm: tank.heightCm }, species: speciesInfo, snapshots }) + "\n");

lines.push(notes.length > 0 ? "気をつける点:" : "気をつける点: なし");
const room = Math.max(3, 38 - lines.length);
for (const note of notes.slice(0, notes.length > room ? room - 1 : room)) lines.push(`  - ${note}`);
if (notes.length > room) lines.push(`  …ほか ${notes.length - room + 1} 件（probe-${label}.txt）`);
writeFileSync(reportFile, [...lines.filter((line) => !line.startsWith("  …ほか")), "", "気をつける点（全部）:", ...notes.map((note) => `  - ${note}`),
  "", `frame ${JSON.stringify(frame)}`, "", ...detail].join("\n") + "\n");
console.log(lines.join("\n"));

let imageLine = "";
if (!argv.includes("--no-image")) {
  const view = Bun.spawnSync(["uv", "run", fileURLToPath(new URL("./tank-view.py", import.meta.url)), tank.id, "--scene", scene.id,
    "--positions", positionsFile, "--quiet"], { stdout: "pipe", stderr: "pipe" });
  imageLine = view.exitCode === 0 ? ` / 合成画像 ${view.stdout.toString().trim().split("\n").pop()}`
    : ` / 合成画像は作れなかった: ${view.stderr.toString().trim().split("\n").pop()}`;
}
console.log(`-> tmp/tank-work/${tank.id}/probe-${label}.txt（細かい値）、positions-${label}.json${imageLine}（計算 ${elapsedSec.toFixed(1)}秒）`);

export {};
