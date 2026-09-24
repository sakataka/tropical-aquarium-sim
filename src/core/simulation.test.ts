import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { getTankById } from "./tankCatalog";

const TANK_60CM = getTankById("asia-60")!;

describe("natural swimming", () => {
  test("keeps fish inside the tank over time", () => {
    let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 8 }], TANK_60CM);
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
    let fish = createFishFromStock([{ speciesId: "corydoras", count: 6 }], TANK_60CM);
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
    species.ecology.structureAffinity = 1;
    species.ecology.restFraction = 0;
    species.ecology.habits = [];
    const fish = createFishFromStock([{ speciesId: species.id, count: 1 }], TANK_60CM);
    fish[0].behaviorMode = "coast";
    fish[0].behaviorTimeRemainingSec = 0;
    fish[0].target = undefined;
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
    const school = createFishFromStock([{ speciesId: species.id, count: 2 }], TANK_60CM);
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

  test("keeps swimming in one direction instead of reversing every kick", () => {
    let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 6 }], TANK_60CM);
    let previous = fish.map((item) => item.facing);
    let reversals = 0;
    for (let index = 0; index < 1200; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM,
        species: fishCatalog,
        fish,
        deltaSec: 0.05,
        structurePoints: [{ x: 14, y: 22 }, { x: 46, y: 20 }],
      }).fish;
      fish.forEach((item, fishIndex) => {
        if (item.facing !== previous[fishIndex]) reversals += 1;
      });
      previous = fish.map((item) => item.facing);
    }
    // 60秒間で1匹あたり10回未満（以前は30回前後）。
    expect(reversals / fish.length).toBeLessThan(10);
  });

  test("nocturnal kuhli loaches hide by day and roam at night", () => {
    const restShare = (lighting: "natural" | "night") => {
      let fish = createFishFromStock([{ speciesId: "kuhli-loach", count: 4 }], TANK_60CM);
      let resting = 0;
      for (let index = 0; index < 2400; index += 1) {
        fish = stepSimulation({
          tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, lighting,
          structurePoints: [{ x: 14, y: 22 }, { x: 46, y: 20 }],
        }).fish;
        resting += fish.filter((item) => item.behaviorMode === "rest").length;
      }
      return resting / (2400 * fish.length);
    };
    expect(restShare("natural")).toBeGreaterThan(0.3);
    expect(restShare("night")).toBeLessThan(0.1);
  });

  test("air-breathing corydoras dash to the surface and return", () => {
    const species = structuredClone(fishCatalog.corydoras);
    species.ecology.habits = [{ type: "airBreathing", breathsPerHour: [600, 600], style: "dash" }];
    let fish = createFishFromStock([{ speciesId: species.id, count: 1 }], TANK_60CM);
    let minY = Infinity;
    let returned = false;
    for (let index = 0; index < 600; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: { [species.id]: species }, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
      minY = Math.min(minY, fish[0].position.y);
      if (minY < 4 && fish[0].position.y > TANK_60CM.heightCm * 0.6) returned = true;
    }
    expect(minY).toBeLessThan(4);
    expect(returned).toBe(true);
  });

  test("diurnal fish slow down under night lighting", () => {
    const averageSpeed = (lighting: "natural" | "night") => {
      let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 6 }], TANK_60CM);
      let total = 0;
      for (let index = 0; index < 1200; index += 1) {
        fish = stepSimulation({
          tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, lighting, structurePoints: [],
        }).fish;
        total += fish.reduce((sum, item) => sum + Math.hypot(item.velocity.x, item.velocity.y), 0);
      }
      return total / (1200 * fish.length);
    };
    expect(averageSpeed("night")).toBeLessThan(averageSpeed("natural") * 0.6);
  });
});
