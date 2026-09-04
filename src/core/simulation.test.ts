import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { TANK_60CM } from "./tank";

describe("natural swimming", () => {
  test("keeps fish inside the tank over time", () => {
    let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 8 }]);
    for (let index = 0; index < 600; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
    }
    for (const item of fish) {
      expect(item.position.x).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
      expect(item.position.x).toBeLessThanOrEqual(TANK_60CM.widthCm - TANK_60CM.safeMarginCm);
      expect(item.position.y).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
      expect(item.position.y).toBeLessThanOrEqual(TANK_60CM.heightCm - TANK_60CM.safeMarginCm);
    }
  });

  test("respects the species swimming zone", () => {
    let fish = createFishFromStock([{ speciesId: "corydoras", count: 6 }]);
    for (let index = 0; index < 300; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
    }
    const averageY = fish.reduce((sum, item) => sum + item.position.y, 0) / fish.length;
    expect(averageY).toBeGreaterThan(TANK_60CM.heightCm * 0.55);
  });

  test("uses placed midground decor as a passive target", () => {
    const species = structuredClone(fishCatalog["dwarf-gourami"]);
    species.behavior.edgeCruiseChance = 0;
    species.behavior.surfaceVisitChance = 0;
    species.behavior.structureAffinity = 1;
    species.stopProbabilityPerSec = 0;
    const fish = createFishFromStock([{ speciesId: species.id, count: 1 }]);
    fish[0].behaviorMode = "coast";
    fish[0].behaviorTimeRemainingSec = 0;
    const output = stepSimulation({
      tank: TANK_60CM,
      species: { [species.id]: species },
      fish,
      deltaSec: 0.05,
      structurePoints: [{ x: 42, y: 26 }],
    }).fish[0];
    expect(output.targetKind).toBe("structure");
    expect(output.target!.x).toBeGreaterThan(35);
    expect(output.target!.y).toBeGreaterThan(20);
  });

  test("schooling changes heading in response to nearby fish", () => {
    const species = fishCatalog["neon-tetra"];
    const school = createFishFromStock([{ speciesId: species.id, count: 2 }]);
    school[0] = { ...school[0], position: { x: 25, y: 18 }, velocity: { x: 1, y: 0 } };
    school[1] = { ...school[1], position: { x: 27, y: 20 }, velocity: { x: 0, y: 1 } };
    const alone = stepSimulation({
      tank: TANK_60CM, species: fishCatalog, fish: [school[0]], deltaSec: 0.1, structurePoints: [],
    }).fish[0];
    const together = stepSimulation({
      tank: TANK_60CM, species: fishCatalog, fish: school, deltaSec: 0.1, structurePoints: [],
    }).fish[0];
    expect(together.velocity.y).not.toBeCloseTo(alone.velocity.y, 5);
  });
});
