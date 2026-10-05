import { expect, test } from "vitest";
import { getBodyPlan } from "./bodyPlans";
import { fishCatalog } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { getSceneById } from "./sceneCatalog";
import { stepSimulation } from "./simulation";
import { aquariumTanks } from "./tankCatalog";
import { getRenderedSurfaceFrame } from "./testContent";
import { insideTerrain } from "./terrainMotion";
import type { FishStockEntry, LightingId } from "./types";

// 上限匹数で昼・夜を続けて泳がせる。フレームごとの大量の expect は避け、
// 実寸での移動量・衝突・個体数・通常の奥行き変化を検証する。
test.each([42, 137])("all habitats remain stable at capacity through ten minutes of day and night (seed %s)", (seed) => {
  const results: { sceneId: string; fish: number; depthTravel: number; longestBlockedSec: number }[] = [];
  for (const tank of aquariumTanks) for (const sceneId of tank.sceneIds) {
    const scene = getSceneById(sceneId)!;
    // 画面と同じ切り取り方（水景ごとの framing と部屋のガラスの縦横比）で地形を置く。
    const frame = getRenderedSurfaceFrame(tank, scene);
    const stock: FishStockEntry[] = tank.species.map((slot) => ({ speciesId: slot.speciesId, count: 0 }));
    let count = 0;
    while (count < tank.maxTotalFish) for (const [i, slot] of tank.species.entries()) {
      if (count < tank.maxTotalFish && stock[i]!.count < slot.maxCount) { stock[i]!.count++; count++; }
    }
    let fish = createFishFromStock(stock, tank).map((f, i) => {
      const personality = createFishPersonality(seed + i * 1327);
      // 初速にも生成時のランダムな pace が入るため、テスト用の性格へ揃える。
      return { ...f, id: `${sceneId}-${i}`, seed: seed + i * 1327, personality,
        velocity: { ...f.velocity, x: f.velocity.x / f.personality.pace * personality.pace },
        bodyLengthVariance: 1, behaviorTimeRemainingSec: .6 };
    });
    const initial = fish.map((f) => f.depth);
    const blocked = fish.map(() => 0);
    let depthTravel = 0, longestBlockedSec = 0;
    for (const lighting of ["natural", "night"] as LightingId[]) for (let tick = 0; tick < 6000; tick++) {
      const previous = fish;
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog,
        structurePoints: [], lighting, deltaSec: .1 }).fish;
      for (const [i, f] of fish.entries()) {
        const species = fishCatalog[f.speciesId]!, p = previous[i]!;
        const context = { tank, scene, species, frame };
        const label = `${sceneId}/${lighting}/${tick}/${f.speciesId}`;
        if (!Number.isFinite(f.position.x + f.position.y + f.depth + f.velocity.x + f.velocity.y)) throw new Error(`Nonfinite ${label}`);
        if (f.position.x < tank.safeMarginCm || f.position.x > tank.widthCm - tank.safeMarginCm ||
          f.position.y < tank.safeMarginCm || f.position.y > tank.heightCm - tank.safeMarginCm) throw new Error(`Glass boundary ${label}`);
        if (!f.surfaceMotion && insideTerrain(f.position, f.depth, context)) throw new Error(`Solid intersection ${label}`);
        if (tick > 0 || lighting === "night") {
          const distance = Math.hypot(f.position.x - p.position.x, f.position.y - p.position.y);
          const limit = Math.max(1.7, species.ecology.speedBodyLengthsPerSec.burst * species.realBodyLengthCm * 1.2) * .1;
          if (distance > limit + 1e-6) throw new Error(`Position jump ${label}: ${distance}`);
          const depthDistance = Math.abs(f.depth - p.depth) * tank.depthCm;
          if (!f.surfaceMotion && depthDistance > species.realBodyLengthCm * species.ecology.speedBodyLengthsPerSec.cruise * f.personality.pace * .72 * .1 + 1e-6)
            throw new Error(`Depth jump ${label}: ${depthDistance}`);
          if (!f.terrainGoal && !f.homeDepth && !f.surfaceMotion) depthTravel = Math.max(depthTravel, Math.abs(f.depth - initial[i]!));
          blocked[i] = f.terrainRoute && f.behaviorMode !== "pause" && Math.hypot(f.velocity.x, f.velocity.y) < .02
            ? blocked[i]! + .1 : 0;
          longestBlockedSec = Math.max(longestBlockedSec, blocked[i]!);
        }
      }
    }
    expect(fish.length, sceneId).toBe(tank.maxTotalFish);
    // 面を歩く生き物（エビ）の奥行きは経路が決める。泳ぐ魚がいる水槽だけ、奥行きの変化を確かめる。
    if (fish.some((f) => !getBodyPlan(fishCatalog[f.speciesId]!).walksOnSurfaces)) {
      expect(depthTravel, sceneId).toBeGreaterThan(.03);
    }
    results.push({ sceneId, fish: fish.length, depthTravel, longestBlockedSec });
  }
  expect(results.filter(r => r.longestBlockedSec > 1)).toEqual([]);
}, 120000);
