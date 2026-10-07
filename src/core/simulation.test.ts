import { describe, expect, test } from "vitest";
import { fishCatalog, getTankById } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";

const TANK_60CM = getTankById("asia-60")!;

describe("natural swimming", () => {
  test("surface fish keep their layer when attracted to bottom structures", () => {
    const tank = getTankById("cube-30")!;
    const species = structuredClone(fishCatalog["clown-killifish"]);
    species.ecology.structureAffinity = 1;
    species.ecology.restFraction = 0;
    let fish = createFishFromStock([{ speciesId: species.id, count: 1 }], tank);
    fish[0] = { ...fish[0], position: { x: 12, y: 4 }, velocity: { x: 0.5, y: 0 },
      facing: 1, seed: 42, target: undefined, behaviorMode: "coast", behaviorTimeRemainingSec: 0 };
    for (let i = 0; i < 3600; i++) {
      fish = stepSimulation({ tank, species: { [species.id]: species }, fish, deltaSec: 0.05,
        structurePoints: [{ x: 20, y: 26 }] }).fish;
      expect(fish[0].target!.y).toBeLessThanOrEqual(tank.heightCm * species.preferredZone.maxY);
      expect(fish[0].position.y).toBeLessThanOrEqual(tank.heightCm * species.preferredZone.maxY + 1);
    }
  });

  test("shrimp walk and graze at the bottom without rising toward structure centers", () => {
    const tank = getTankById("japan-60")!;
    const species = fishCatalog["amano-shrimp"];
    let fish = createFishFromStock([{ speciesId: species.id, count: 3 }], tank);
    fish = fish.map((item, index) => ({ ...item, seed: 42 + index }));
    const bottomY = tank.heightCm - tank.safeMarginCm;
    let grazing = false;
    for (let i = 0; i < 3600; i++) {
      fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: 0.05,
        structurePoints: [{ x: 20, y: 24 }, { x: 46, y: 25 }] }).fish;
      for (const item of fish) {
        expect(item.position.y).toBeCloseTo(bottomY, 5);
        // 採餌中の短い移動も含め、尾跳ねの瞬発速度には達しない。
        expect(Math.hypot(item.velocity.x, item.velocity.y)).toBeLessThanOrEqual(species.realBodyLengthCm * 0.12);
        grazing ||= item.behaviorMode === "forage";
      }
    }
    expect(grazing).toBe(true);
  });
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
    // 構造物選択そのものを確認するため、個体の寄り道倍率は標準に固定する。
    fish[0].personality = { ...fish[0].personality, exploration: 1 };
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

  test("diurnal midwater fish settle lower at night, while surface fish stay up", () => {
    const tank = getTankById("amazon-90")!;
    const averageDepth = (speciesId: string, lighting: "natural" | "night") => {
      let fish = createFishFromStock([{ speciesId, count: 8 }], tank).map((item, index) => ({ ...item, seed: 7 + index * 13 }));
      let total = 0, samples = 0;
      for (let index = 0; index < 3600; index += 1) {
        fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: 0.05, lighting, structurePoints: [] }).fish;
        if (index < 1200) continue;
        total += fish.reduce((sum, item) => sum + item.position.y / tank.heightCm, 0);
        samples += fish.length;
      }
      return total / samples;
    };
    expect(averageDepth("neon-tetra", "night")).toBeGreaterThan(averageDepth("neon-tetra", "natural") + 0.05);
    // 水面に暮らすマーブルハチェットは夜も上層にいる。
    expect(averageDepth("marbled-hatchetfish", "night")).toBeLessThan(0.4);
  });
});
