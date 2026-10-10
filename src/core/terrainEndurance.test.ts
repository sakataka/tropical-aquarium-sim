import { describe, expect, test } from "vitest";
import { getBodyPlan } from "./bodyPlans";
import { fishCatalog, getLoadedTanks, getSceneById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { getRenderedSurfaceFrame } from "./testContent";
import { insideTerrain } from "./terrainMotion";
import type { FishStockEntry, LightingId, TankDefinition } from "./types";

// 全水槽を回す重いテスト。水槽ごとのテストに分けてあり、`-t <水槽id>` で担当の水槽だけに絞れる。
// vite.config.ts がこのファイルを複数のプロジェクト（tanks-1 … tanks-N）で並列に流し、
// TANK_SHARD（"1/8" など）で、そのプロジェクトが受け持つ水槽を決める。
const [shard, shardCount] = String(import.meta.env.TANK_SHARD ?? "1/1").split("/").map(Number) as [number, number];
// かかる時間は、水景の数と匹数のおよそ1.5乗に比例する。重い水槽から順に、その時点でいちばん軽い
// プロジェクトへ配り、プロジェクトごとの時間をそろえる。
const cost = (tank: TankDefinition) => tank.sceneIds.length * tank.maxTotalFish ** 1.5;
const loads = Array.from({ length: shardCount }, () => 0);
const aquariumTanks = [...getLoadedTanks()]
  .sort((a, b) => cost(b) - cost(a) || a.id.localeCompare(b.id))
  .filter((tank) => {
    const lightest = loads.indexOf(Math.min(...loads));
    loads[lightest]! += cost(tank);
    return lightest === shard - 1;
  });

describe.each(aquariumTanks.flatMap((tank) => tank.sceneIds.map((sceneId) => ({ tank, sceneId, label: tank.id === sceneId ? tank.id : `${tank.id} / ${sceneId}` }))))("$label", ({ tank, sceneId }) => {
  const scene = getSceneById(sceneId)!;

  // 上限匹数で昼・夜を続けて泳がせる。フレームごとの大量の expect は避け、
  // 実寸での移動量・衝突・個体数・通常の奥行き変化を検証する。
  test.each([42, 137])("remains stable at capacity through ten minutes of day and night (seed %s)", (seed) => {
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
        const label = `${lighting}/${tick}/${f.speciesId}`;
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
    expect(fish.length).toBe(tank.maxTotalFish);
    // 面を歩く生き物（エビ）の奥行きは経路が決める。泳ぐ魚がいる水槽だけ、奥行きの変化を確かめる。
    if (fish.some((f) => !getBodyPlan(fishCatalog[f.speciesId]!).walksOnSurfaces)) {
      expect(depthTravel).toBeGreaterThan(.03);
    }
    expect(longestBlockedSec).toBeLessThanOrEqual(1);
  }, 60000);

  // 既定の匹数で3分泳がせ、地形が使えること、回避領域の外とガラスの内にいることを確かめる。
  test("has usable terrain, and the default population remains outside solids and inside glass", () => {
    // 回避領域と隠れ場所は、岩も底もない中層の水景にはない。住みかが要る魚の隠れ場所は content.test で確かめる。
    expect(scene.terrain?.surfaces.length).toBeGreaterThan(0);
    // 最も縦方向が切り取られるワイド水槽と、正方形の背景の両方を確認する。
    const frame = tank.id === "cube-30" ? { x: -.02, y: -.02, width: 1.04, height: 1.02 }
      : { x: -.02, y: -.52, width: 1.04, height: 1.52 };
    let fish = createFishFromStock(tank.defaultStock, tank).map((f, i) => ({ ...f, seed: 100 + i * 5000,
      bodyLengthVariance: 1, behaviorTimeRemainingSec: .6 }));
    for (let tick = 0; tick < 1800; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog,
        structurePoints: [], deltaSec: .1 }).fish;
      for (const f of fish) {
        const label = `${f.speciesId}/${tick}`;
        if (!Number.isFinite(f.position.x + f.position.y + f.depth)) throw new Error(`Nonfinite ${label}`);
        if (f.position.x < tank.safeMarginCm || f.position.x > tank.widthCm - tank.safeMarginCm ||
          f.position.y < tank.safeMarginCm || f.position.y > tank.heightCm - tank.safeMarginCm) throw new Error(`Glass boundary ${label}`);
        if (!f.surfaceMotion && insideTerrain(f.position, f.depth, { tank, scene, frame, species: fishCatalog[f.speciesId]! }))
          throw new Error(`Solid intersection ${label}`);
      }
    }
    expect(fish.length).toBe(tank.defaultStock.reduce((sum, s) => sum + s.count, 0));
  }, 60000);
});
