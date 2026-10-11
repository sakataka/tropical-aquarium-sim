// 先に書いておいた種の下書き（content-drafts/prepared/fish/<id>/species.json）の形を確かめる。
//   bun run scripts/check-prepared.ts [<species-id>...]   （省くと全部）
// 絵が決まってから入れる項目（sourceBodyBounds、visual.fallbackColor、swim の位置の項目）は、下書きに
// あってはいけない。仮の値を足したうえで、アプリと同じスキーマで読めることを見る。
// 保管庫が読めるときは、体のつくり（swim.bodyPlan）が、絵の画風を描ける体のつくりかどうかも見る。
// 見るのは形だけで、数字が調査にあるか、測り方が合っているかは見ない。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseFishSpeciesDefinition } from "../src/core/schema";

const BASE = "content-drafts/prepared/fish";
const IMAGE_FIELDS = ["mouthAnchor", "footAnchor", "headStart", "shell", "feelers", "bell", "fins", "tailStartY", "wings", "legs", "spine", "limbs", "radial"];
const ids = Bun.argv.slice(2).length > 0 ? Bun.argv.slice(2)
  : !existsSync(BASE) ? []
  : (await Array.fromAsync(new Bun.Glob("*/species.json").scan(BASE))).map((path) => path.split("/")[0]!).sort();
if (ids.length === 0) console.log("先に書いた下書きはありません");

// 画風ごとに、館の種が使っている体のつくり（保管庫の生成の記録から）。
const styles = Bun.spawnSync(["uv", "run", "scripts/species-packet.py", "--body-plans", ...ids]);
const expected: Record<string, { style: string | null; plans: string[] | null }> = styles.exitCode === 0 ? JSON.parse(styles.stdout.toString()) : {};
if (styles.exitCode !== 0 && ids.length > 0) console.log("（保管庫が読めないので、体のつくりと画風の対応は見ていません）");

let failed = 0;
for (const id of ids) {
  const problems: string[] = [];
  const file = Bun.file(join(BASE, id, "species.json"));
  if (!await file.exists()) {
    console.log(`✗ ${id}: species.json がありません`);
    failed++;
    continue;
  }
  const draft = await file.json() as Record<string, any>;
  if (draft.id !== id) problems.push(`id が ${draft.id}`);
  if ("sourceBodyBounds" in draft) problems.push("sourceBodyBounds は書かない（絵の取り込みで入る）");
  if (draft.visual) problems.push("visual は書かない（絵の取り込みで入る）");
  for (const key of IMAGE_FIELDS) if (draft.swim && key in draft.swim) problems.push(`swim.${key} は書かない（絵を見て入れる）`);
  const plan = draft.swim?.bodyPlan ?? "fish";
  const style = expected[id];
  if (style?.style && style.plans?.length === 0) problems.push(`画風 ${style.style} を描ける体のつくりがまだない（下書きを書かずに保留にする）`);
  else if (style?.plans && style.plans.length > 0 && !style.plans.includes(plan)) problems.push(`swim.bodyPlan が ${plan}。画風 ${style.style} の館の種は ${style.plans.join("・")}`);
  if ((draft.ecology?.sources?.length ?? 0) < 5 && !/出典\s*\d+\s*件/.test(await Bun.file(join(BASE, id, "notes.md")).exists() ? await Bun.file(join(BASE, id, "notes.md")).text() : "")) {
    problems.push(`ecology.sources が ${draft.ecology?.sources?.length ?? 0} 件（調査の出典が少ないなら notes.md に「出典◯件」と書く）`);
  }
  try {
    parseFishSpeciesDefinition({ ...draft, visual: { fallbackColor: "#808080" }, sourceBodyBounds: { x: 0, y: 0, width: 100, height: 40 } });
  } catch (error) {
    problems.push(String(error).slice(0, 600));
  }
  const text = JSON.stringify([draft.catalog, draft.profile]);
  if (/だ。|である。/.test(text)) problems.push("文末は「です・ます」にする");
  if (!await Bun.file(join(BASE, id, "notes.md")).exists()) problems.push("notes.md（仮の値と気になる点）がありません");
  if (problems.length > 0) failed++;
  console.log(`${problems.length === 0 ? "✓" : "✗"} ${id}${problems.map((problem) => `\n    ${problem}`).join("")}`);
}
if (failed > 0) process.exit(1);
