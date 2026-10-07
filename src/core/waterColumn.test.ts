import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { getRenderedSurfaceFrame } from "./testContent";
import { getWaterColumn, waterCeilingCm } from "./waterColumn";

// 水面の上の空気まで見える水景で、魚が水の中にとどまり、空気を吸う魚は水面まで上がる。
describe("water line", () => {
  for (const tankId of ["mangrove-180", "mudflat-120"]) {
    test(`${tankId}: fish stay below the water line and breathers reach it`, () => {
      const tank = getTankById(tankId)!;
      const scene = getSceneById(tank.sceneIds[0])!;
      const frame = getRenderedSurfaceFrame(tank, scene);
      const water = getWaterColumn(tank, scene, frame);
      // 手前の水面は、奥の水面より下に見える。
      expect(water.topCm(0)).toBeGreaterThan(water.topCm(1));
      expect(water.topCm(1)).toBeGreaterThan(tank.safeMarginCm);
      let fish = createFishFromStock(tank.defaultStock, tank).map((item, index) => ({ ...item, seed: 42 + index * 1327 }));
      const breathed = new Set<string>();
      const leftGoalAt = new Map<string, number>();
      for (let tick = 0; tick < 6000; tick++) {
        fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog,
          structurePoints: [], lighting: "natural", deltaSec: .1 }).fish;
        for (const item of fish) {
          const ceiling = waterCeilingCm(water, tank, item.depth);
          if (item.targetKind === "surfaceVisit" && item.position.y <= ceiling + 1) breathed.add(item.speciesId);
          // 巣穴など地形の目的地は水の外にもある。そこから戻る数秒の間は確かめない。
          if (item.terrainGoal) { leftGoalAt.set(item.id, tick); continue; }
          if (tick - (leftGoalAt.get(item.id) ?? -1000) < 100) continue;
          // 水面のすぐ下まで岩があるところでは、岩に押し上げられて水面の余白の中へ入ることがある。
          expect(item.position.y, `${item.speciesId} at ${tick}`).toBeGreaterThanOrEqual(water.topCm(item.depth));
        }
      }
      const breathers = tank.defaultStock.map((entry) => entry.speciesId)
        .filter((id) => fishCatalog[id]!.ecology.habits.some((habit) => habit.type === "airBreathing"));
      expect([...breathed].sort()).toEqual(breathers.sort());
    });
  }

  test("scenes without a water line keep the whole tank as water", () => {
    const tank = getTankById("asia-60")!;
    const water = getWaterColumn(tank, getSceneById(tank.sceneIds[0]), { x: 0, y: 0, width: 1, height: 1 });
    expect(water.topCm(0)).toBe(0);
    expect(water.topCm(1)).toBe(0);
  });
});
