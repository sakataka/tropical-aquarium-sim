import { describe, expect, test } from "bun:test";
import { BODY_PLAN_RENDERERS } from "../render/bodyPlans";
import { BODY_PLAN_IDS, BODY_PLANS, getBodyPlan } from "./bodyPlans";
import { fishCatalog } from "./catalog";

describe("body plans", () => {
  test("every body plan has both its traits and a renderer", () => {
    expect(Object.keys(BODY_PLAN_RENDERERS).sort()).toEqual([...BODY_PLAN_IDS].sort());
    for (const id of BODY_PLAN_IDS) {
      expect(BODY_PLAN_RENDERERS[id].verticesY, id).toBeGreaterThanOrEqual(2);
    }
  });

  test("walkers live on the bottom, and the default plan is a swimming fish", () => {
    for (const id of BODY_PLAN_IDS) {
      if (BODY_PLANS[id].walksOnSurfaces) expect(BODY_PLANS[id].bottomDweller, id).toBe(true);
    }
    const fish = Object.values(fishCatalog).find((species) => species.swim?.bodyPlan === undefined)!;
    expect(getBodyPlan(fish)).toBe(BODY_PLANS.fish);
  });

  test("species with antennae say where the head starts", () => {
    for (const species of Object.values(fishCatalog)) {
      if (getBodyPlan(species).antennae) expect(species.swim?.headStart, species.id).toBeGreaterThan(0);
      // イカは腕の付け根を書く。
      if (species.swim?.bodyPlan === "squid") expect(species.swim.headStart, species.id).toBeGreaterThan(0);
    }
  });
});
