// 先に書いておいた種の下書き（content-drafts/prepared/fish/<id>/species.json）の形を確かめる。
//   bun run scripts/check-prepared.ts [<species-id>...]   （省くと全部）
// 絵が決まってから入れる項目（sourceBodyBounds、visual.fallbackColor、swim の位置の項目）は、下書きに
// あってはいけない。仮の値を足したうえで、アプリと同じスキーマで読めることを見る。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseFishSpeciesDefinition } from "../src/core/schema";

const BASE = "content-drafts/prepared/fish";
const IMAGE_FIELDS = ["mouthAnchor", "footAnchor", "headStart", "shell", "feelers", "bell", "fins", "tailStartY", "wings", "legs", "spine", "limbs", "radial"];
const ids = Bun.argv.slice(2).length > 0 ? Bun.argv.slice(2)
  : !existsSync(BASE) ? []
  : (await Array.fromAsync(new Bun.Glob("*/species.json").scan(BASE))).map((path) => path.split("/")[0]!).sort();
if (ids.length === 0) console.log("先に書いた下書きはありません");

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
