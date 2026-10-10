// 展示計画（保管庫の catalog/exhibit-plan.json）と、アプリの内容（src/content/）を突き合わせる。
//
//   bun run plan:check            食い違いと、器の数（建物ごとの展示室・水槽・種）を表示する
//   bun run plan:check -- --json  同じ内容を JSON で出す
//
// 展示計画は「館 → 建物 → 階 → 展示室 → 水槽 → 生き物」の正本で、アプリはそのうち開いた分だけを持つ。
// 「図鑑に載る種は、館のどこかの水槽で必ず見られる」を守るには、種を受け入れる前に器（水槽）が計画にあることが要る。
// ここでは次を確かめる。食い違い（errors）があれば終了コード1で終わる。
//   - 館内図の建物・階・展示室の枠が、計画と同じ並びであること
//   - アプリの水槽が、計画の同じ展示室にあること。アプリの水槽の種が、計画のその水槽の種に入っていること
//   - 保管庫のカタログにある種が、どれも計画のどこかの水槽（species か futureSpecies）に置かれていること
// 保管庫は環境変数 AQUARIUM_ASSET_VAULT（なければ ~/Documents/aquarium-assets）。
import { homedir } from "node:os";
import { join } from "node:path";
import { BUILDINGS, FLOORS } from "./museum-content";

type PlanTank = {
  id: string; displayName: string; phase: number;
  species: string[]; futureSpecies?: string[];
  /** 入れたい種の手がかり。needs はまだ描けない体のつくり、varietyOf は改良品種の元の種（種の数には数えない）。 */
  candidates?: { nameJa: string; scientificName?: string; needs?: string; varietyOf?: string }[];
};
type PlanHall = { id: string; displayName: string; tanks: PlanTank[] };
type PlanFloor = { id: string; buildingId?: string; displayName: string; halls: PlanHall[] };
type Plan = {
  schemaVersion: string;
  buildings?: { id: string; displayName: string }[];
  floors: PlanFloor[];
  unplacedSpecies?: string[];
};
type TankJson = { id: string; species: { speciesId: string }[] };
type RoomJson = { id: string; tanks: { tankId: string }[] };

const vault = process.env.AQUARIUM_ASSET_VAULT ?? join(homedir(), "Documents/aquarium-assets");
const planFile = Bun.file(join(vault, "catalog/exhibit-plan.json"));
if (!await planFile.exists()) {
  console.error(`展示計画が見つかりません: ${planFile.name}（AQUARIUM_ASSET_VAULT を確かめてください）`);
  process.exit(2);
}
const plan = await planFile.json() as Plan;
const DEFAULT_BUILDING = BUILDINGS[0]!.id;
const planBuildings = plan.buildings ?? [{ id: DEFAULT_BUILDING, displayName: "本館" }];

const rooms = new Map<string, RoomJson>();
for await (const path of new Bun.Glob("src/content/room/*.json").scan()) {
  const room = await Bun.file(path).json() as RoomJson;
  rooms.set(room.id, room);
}
const tanks = new Map<string, TankJson>();
for await (const path of new Bun.Glob("src/content/tanks/*/tank.json").scan()) {
  const tank = await Bun.file(path).json() as TankJson;
  tanks.set(tank.id, tank);
}
const appSpecies = new Set<string>();
for await (const path of new Bun.Glob("src/content/fish/*/species.json").scan()) appSpecies.add(path.split("/").at(-2)!);

const errors: string[] = [];
const notes: string[] = [];

// 1. 建物・階・展示室の枠の並び。
const same = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);
if (!same(planBuildings.map((item) => item.id), BUILDINGS.map((item) => item.id))) {
  errors.push(`建物の並びが違います。計画: ${planBuildings.map((item) => item.id).join(", ")} / アプリ: ${BUILDINGS.map((item) => item.id).join(", ")}`);
}
for (const building of BUILDINGS) {
  const planned = plan.floors.filter((floor) => (floor.buildingId ?? DEFAULT_BUILDING) === building.id);
  if (!same(planned.map((floor) => floor.id), building.floors.map((floor) => floor.id))) {
    errors.push(`${building.id}: 階の並びが違います。計画: ${planned.map((floor) => floor.id).join(", ")} / アプリ: ${building.floors.map((floor) => floor.id).join(", ")}`);
  }
}
for (const floor of FLOORS) {
  const planned = plan.floors.find((item) => item.id === floor.id);
  if (!planned) continue;
  const inPlan = planned.halls.map((hall) => hall.id);
  const inApp = floor.halls.map((hall) => hall.id);
  if (!same(inPlan, inApp)) errors.push(`${floor.id}: 展示室の枠が違います。計画: ${inPlan.join(", ")} / アプリ: ${inApp.join(", ")}`);
}

// 2. 水槽と、その種。
const planTankHall = new Map<string, string>();
const planTanks = new Map<string, PlanTank>();
for (const floor of plan.floors) for (const hall of floor.halls) for (const tank of hall.tanks) {
  if (planTanks.has(tank.id)) errors.push(`計画の水槽 id が重なっています: ${tank.id}`);
  planTanks.set(tank.id, tank);
  planTankHall.set(tank.id, hall.id);
}
for (const room of rooms.values()) for (const { tankId } of room.tanks) {
  const hallId = planTankHall.get(tankId);
  if (!hallId) errors.push(`水槽 ${tankId}（展示室 ${room.id}）が計画にありません`);
  else if (hallId !== room.id) errors.push(`水槽 ${tankId} の展示室が違います。計画: ${hallId} / アプリ: ${room.id}`);
}
for (const tank of tanks.values()) {
  const planned = planTanks.get(tank.id);
  if (!planned) continue;
  const extra = tank.species.map((slot) => slot.speciesId).filter((id) => !planned.species.includes(id));
  if (extra.length > 0) errors.push(`水槽 ${tank.id} の種が計画にありません: ${extra.join(", ")}`);
}
// 開いている展示室の水槽のうち、計画にあってアプリにないもの（準備中のガラス）。
for (const room of rooms.values()) {
  const hall = plan.floors.flatMap((floor) => floor.halls).find((item) => item.id === room.id);
  const missing = hall?.tanks.filter((tank) => !room.tanks.some((item) => item.tankId === tank.id)).map((tank) => tank.id) ?? [];
  if (missing.length > 0) notes.push(`展示室 ${room.id} は開いていますが、計画の水槽 ${missing.join(", ")} がまだありません`);
}

// 3. カタログの種の置き場所。
const catalog = new Map<string, { nameJa: string }>();
for (const name of ["species-backlog.json", "dots-additions.json"]) {
  const file = Bun.file(join(vault, "catalog", name));
  if (!await file.exists()) continue;
  const data = await file.json() as { entries: { speciesId: string; nameJa: string }[]; excludedExistingAppSpecies?: string[] };
  for (const entry of data.entries) catalog.set(entry.speciesId, { nameJa: entry.nameJa });
}
const placed = new Map<string, string[]>();
const future = new Map<string, string[]>();
for (const tank of planTanks.values()) {
  for (const id of tank.species) placed.set(id, [...(placed.get(id) ?? []), tank.id]);
  for (const id of tank.futureSpecies ?? []) future.set(id, [...(future.get(id) ?? []), tank.id]);
}
const unplaced = new Set(plan.unplacedSpecies ?? []);
const homeless = [...catalog.keys()].filter((id) => !placed.has(id) && !future.has(id) && !appSpecies.has(id));
for (const id of homeless) {
  (unplaced.has(id) ? notes : errors).push(`カタログの種 ${id}（${catalog.get(id)!.nameJa}）の置き場所が計画にありません${unplaced.has(id) ? "（unplacedSpecies に記録済み）" : ""}`);
}
for (const id of appSpecies) if (!placed.has(id)) errors.push(`アプリの種 ${id} が、計画のどの水槽の species にもありません`);
// 計画では置いてあるが、アプリにまだいない種。水槽が開いていれば取り込める。
const waiting = [...placed.keys()].filter((id) => !appSpecies.has(id) && catalog.has(id)).map((id) => {
  const tankIds = placed.get(id)!;
  return { id, nameJa: catalog.get(id)!.nameJa, tankIds, open: tankIds.some((tankId) => tanks.has(tankId)) };
});

// 4. 器の数。
const capacity = planBuildings.map((building) => {
  const floors = plan.floors.filter((floor) => (floor.buildingId ?? DEFAULT_BUILDING) === building.id);
  const halls = floors.flatMap((floor) => floor.halls);
  const all = halls.flatMap((hall) => hall.tanks);
  const species = new Set(all.flatMap((tank) => tank.species));
  // 改良品種は同じ種の姿の違いなので、種の手がかりには数えない。
  const candidates = new Set(all.flatMap((tank) => (tank.candidates ?? []).filter((item) => !item.varietyOf)
    .map((item) => item.scientificName ?? item.nameJa)));
  const waitingBodyPlan = new Set(all.flatMap((tank) => (tank.candidates ?? []).filter((item) => item.needs && !item.varietyOf)
    .map((item) => item.scientificName ?? item.nameJa)));
  return {
    id: building.id,
    displayName: building.displayName,
    floors: floors.length,
    halls: halls.length,
    openHalls: halls.filter((hall) => rooms.has(hall.id)).length,
    tanks: all.length,
    openTanks: all.filter((tank) => tanks.has(tank.id)).length,
    species: species.size,
    speciesInApp: [...species].filter((id) => appSpecies.has(id)).length,
    futureSpecies: new Set(all.flatMap((tank) => tank.futureSpecies ?? [])).size,
    candidates: candidates.size,
    candidatesNeedingBodyPlan: waitingBodyPlan.size,
  };
});
const sum = (key: keyof (typeof capacity)[number]) => capacity.reduce((total, item) => total + (item[key] as number), 0);
const total = {
  halls: sum("halls"), openHalls: sum("openHalls"), tanks: sum("tanks"), openTanks: sum("openTanks"),
  // 同じ種を2つの水槽に置くことがあるので、館全体では数え直す。
  species: placed.size, speciesInApp: appSpecies.size, candidates: sum("candidates"),
};

if (Bun.argv.includes("--json")) {
  console.log(JSON.stringify({ errors, notes, waiting, capacity, total }, null, 2));
} else {
  console.log(`展示計画 ${plan.schemaVersion}（${planFile.name}）`);
  console.log("\n器の数（開いている数 / 計画の数）");
  for (const item of capacity) {
    console.log(`  ${item.displayName}: ${item.floors}階 · 展示室 ${item.openHalls}/${item.halls} · 水槽 ${item.openTanks}/${item.tanks}`
      + ` · 種 ${item.speciesInApp}/${item.species}（待ち ${item.futureSpecies}、候補の手がかり ${item.candidates}、うち体のつくり待ち ${item.candidatesNeedingBodyPlan}）`);
  }
  console.log(`  合計: 展示室 ${total.openHalls}/${total.halls} · 水槽 ${total.openTanks}/${total.tanks} · 館にいる種 ${total.speciesInApp}`
    + ` · 計画で置いた種 ${total.species} · 候補の手がかり ${total.candidates}`);
  console.log(`  見込み: 置いた種 + 候補の手がかり = 約${total.species + total.candidates}種。水槽1つに平均 ${((total.species + total.candidates) / total.tanks).toFixed(1)}種`);
  if (waiting.length > 0) {
    console.log(`\n計画で水槽が決まっていて、館にまだいない種（${waiting.length}）`);
    for (const item of waiting) console.log(`  ${item.open ? "取り込める" : "水槽を待つ"}  ${item.id}（${item.nameJa}）→ ${item.tankIds.join(", ")}`);
  }
  if (notes.length > 0) {
    console.log(`\n覚え書き（${notes.length}）`);
    for (const note of notes) console.log(`  ${note}`);
  }
  console.log(errors.length > 0 ? `\n食い違い（${errors.length}）` : "\n食い違いはありません。");
  for (const error of errors) console.log(`  ${error}`);
}
process.exit(errors.length > 0 ? 1 : 0);
