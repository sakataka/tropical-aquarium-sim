import { describe, expect, test } from "vitest";
import { getBodyPlan } from "./bodyPlans";
import { parseFishSpeciesDefinition } from "./schema";

// 展示室を開ける前の下書き（content-drafts/fish/）。アプリは読み込まないが、形はここで確かめる。
const drafts = import.meta.glob<{ default: unknown }>("../../content-drafts/fish/*/species.json", { eager: true });
const images = import.meta.glob("../../content-drafts/fish/*/body.webp");

describe("species drafts", () => {
  test.each(Object.entries(drafts).map(([path, module]) => [path.split("/").slice(-2)[0]!, module.default] as const))(
    "%s is a complete species definition",
    (id, value) => {
      const species = parseFishSpeciesDefinition(value);
      expect(species.id).toBe(id);
      expect(species.profile, `${id} needs a profile`).toBeDefined();
      expect(images[`../../content-drafts/fish/${id}/body.webp`], `${id}/body.webp`).toBeDefined();
      if (!getBodyPlan(species).antennae) expect(species.swim?.headStart, id).toBeUndefined();
    },
  );
});
