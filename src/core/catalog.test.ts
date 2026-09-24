import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";

describe("fish catalog", () => {
  test("fish species are discovered from species folders", () => {
    const species = Object.values(fishCatalog);
    expect(species).toHaveLength(10);
    expect(species.map((item) => item.id)).toContain("neon-tetra");
    for (const item of species) {
      expect(item.catalog.scientificName).toBeTruthy();
      expect(item.catalog.originRegionName).toBeTruthy();
      expect(item.catalog.origin).toBeTruthy();
      expect(item.catalog.movement).toBeTruthy();
      expect(item.ecology.sources.length).toBeGreaterThan(0);
    }
  });

  test("removed care and interaction fields are absent", () => {
    const serialized = JSON.stringify(fishCatalog);
    for (const removed of [
      "hunger", "feeding", "foodResponsiveness", "tapResponse",
      "tapAvoidance", "feedDurationSecMin", "feedSpeedMultiplier",
    ]) {
      expect(serialized).not.toContain(`\"${removed}\"`);
    }
  });

  test("species behave differently according to their ecology", () => {
    const signatures = new Set(Object.values(fishCatalog).map((item) => JSON.stringify([
      item.ecology.activityPeriod,
      item.ecology.gait,
      item.ecology.social.grouping,
      item.ecology.habits.map((habit) => habit.type).sort(),
    ])));
    expect(signatures.size).toBeGreaterThanOrEqual(7);
  });
});
