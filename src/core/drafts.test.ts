import { testFiles } from "./testFiles";
import { describe, expect, test } from "bun:test";
import { getBodyPlanId, HEAD_START_PLANS } from "./bodyPlans";
import { parseFishSpeciesDefinition } from "./schema";

// 展示室を開ける前の下書き（content-drafts/fish/）。アプリは読み込まないが、形はここで確かめる。
const drafts: Record<string, { default: unknown }> = Object.fromEntries(await Promise.all(Object.keys(testFiles("../../content-drafts/fish/*/species.json", import.meta.url)).map(async path => [path, { default: await Bun.file(new URL(path, import.meta.url)).json() }])));
const images = testFiles("../../content-drafts/fish/*/body.webp", import.meta.url);

const entries = Object.entries(drafts).map(([path, module]) => [path.split("/").slice(-2)[0]!, module.default] as const);

describe("species drafts", () => {
  // 下書きがすべて展示室へ移ったあとも、このテストファイルを空にしない。
  if (entries.length === 0) test("no drafts are waiting for a hall", () => expect(entries).toEqual([]));
  test.each(entries)(
    "%s is a complete species definition",
    (id, value) => {
      const species = parseFishSpeciesDefinition(value);
      expect(species.id).toBe(id);
      expect(species.profile, `${id} needs a profile`).toBeDefined();
      expect(images[`../../content-drafts/fish/${id}/body.webp`], `${id}/body.webp`).toBeDefined();
      if (!HEAD_START_PLANS.includes(getBodyPlanId(species))) expect(species.swim?.headStart, id).toBeUndefined();
    },
  );
});
