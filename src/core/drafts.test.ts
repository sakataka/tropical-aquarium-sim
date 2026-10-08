import { describe, expect, test } from "vitest";
import { getBodyPlanId, HEAD_START_PLANS } from "./bodyPlans";
import { parseFishSpeciesDefinition } from "./schema";

// 展示室を開ける前の下書き（content-drafts/fish/）。アプリは読み込まないが、形はここで確かめる。
const drafts = import.meta.glob<{ default: unknown }>("../../content-drafts/fish/*/species.json", { eager: true });
const images = import.meta.glob("../../content-drafts/fish/*/body.webp");

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
