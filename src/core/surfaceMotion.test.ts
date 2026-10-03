import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { getSceneById, terrainSchema } from "./sceneCatalog";
import { stepSimulation } from "./simulation";
import { sampleSurface } from "./surfaceMotion";
import { getTankById } from "./tankCatalog";
import { normalizeTankCustomization } from "./customization";

const tank = getTankById("japan-60")!;
const shrimp = fishCatalog["amano-shrimp"]!;

describe("scene surface movement", () => {
  test("shrimp stay on their surfaces while climbing, changing depth, resting and grazing", () => {
    for (const sceneId of tank.sceneIds) {
      const scene = getSceneById(sceneId)!;
      let fish = createFishFromStock([{ speciesId: shrimp.id, count: 7 }], tank)
        .map((item, i) => ({ ...item, seed: 100 + i * 5000 }));
      let minY = tank.heightCm;
      const minDepth = fish.map(() => 1);
      const maxDepth = fish.map(() => 0);
      let grazed = false;
      let rested = false;
      // 非等方の cover 表示でも、脚が乗る場所と地形の座標が一致する。
      const frame = { x: -.02, y: -.52, width: 1.04, height: 1.52 };
      for (let i = 0; i < 4800; i++) {
        fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: .05,
          structurePoints: [], scene, surfaceFrame: frame }).fish;
        for (const [index, item] of fish.entries()) {
          const motion = item.surfaceMotion!;
          const surface = scene.terrain!.surfaces.find((s) => s.id === motion.surfaceId)!;
          const point = sampleSurface(surface, motion.progress, tank, frame);
          expect(item.position.x).toBeCloseTo(point.position.x, 8);
          expect(item.position.y).toBeCloseTo(point.position.y, 8);
          expect(item.depth).toBeCloseTo(point.depth, 8);
          expect(item.position.y).toBeGreaterThanOrEqual(tank.safeMarginCm);
          expect(item.position.y).toBeLessThanOrEqual(tank.heightCm - tank.safeMarginCm);
          expect(Number.isFinite(motion.angle)).toBe(true);
          expect(Math.hypot(item.velocity.x, item.velocity.y)).toBeLessThanOrEqual(.281);
          minY = Math.min(minY, item.position.y);
          minDepth[index] = Math.min(minDepth[index]!, item.depth);
          maxDepth[index] = Math.max(maxDepth[index]!, item.depth);
          grazed ||= item.behaviorMode === "forage";
          rested ||= item.behaviorMode === "rest";
        }
      }
      expect(minY).toBeLessThan(tank.heightCm * .85);
      expect(maxDepth.some((depth, i) => depth - minDepth[i]! > .04)).toBe(true);
      expect(grazed && rested).toBe(true);
    }
  });

  test("crosses joined sand and stone paths without jumping at the junction", () => {
    const scene = getSceneById("japan-moss-stones")!;
    const surface = scene.terrain!.surfaces.find((s) => s.id === "sand-west")!;
    const point = sampleSurface(surface, .9999, tank);
    const original = createFishFromStock([{ speciesId: shrimp.id, count: 1 }], tank)[0]!;
    const fish = { ...original, position: point.position, depth: point.depth,
      surfaceMotion: { sceneId: scene.id, surfaceId: surface.id, progress: .9999,
        direction: 1 as const, pauseSec: 0, grazing: false, angle: 0 }, seed: 42 };
    const next = stepSimulation({ tank, species: fishCatalog, fish: [fish], deltaSec: .25,
      structurePoints: [], scene }).fish[0]!;
    expect(next.surfaceMotion!.surfaceId).not.toBe(surface.id);
    expect(Math.hypot(next.position.x - fish.position.x, next.position.y - fish.position.y)).toBeLessThan(.071);
  });

  test("switching water scenes replaces old paths, and a scene without terrain falls back safely", () => {
    let fish = createFishFromStock([{ speciesId: shrimp.id, count: 1 }], tank);
    for (const sceneId of ["japan-moss-stones", "japan-moss-wood", "japan-spring"]) {
      const scene = getSceneById(sceneId)!;
      fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: .05, structurePoints: [], scene }).fish;
      expect(fish[0]!.surfaceMotion!.sceneId).toBe(sceneId);
      expect(scene.terrain!.surfaces.some((s) => s.id === fish[0]!.surfaceMotion!.surfaceId)).toBe(true);
    }
    fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: .05, structurePoints: [] }).fish;
    expect(fish[0]!.surfaceMotion).toBeUndefined();
    expect(Number.isFinite(fish[0]!.position.y)).toBe(true);
  });

  test("terrain changes neither open-water fish nor saved stock and lighting", () => {
    const scene = getSceneById("japan-moss-wood")!;
    const fish = createFishFromStock([{ speciesId: "medaka", count: 3 }], tank);
    const input = { tank, species: fishCatalog, fish, deltaSec: .05, structurePoints: [] };
    expect(stepSimulation({ ...input, scene })).toEqual(stepSimulation(input));
    const saved = { stock: [{ speciesId: shrimp.id, count: 3 }],
      layout: { sceneId: "japan-spring", lighting: "night" } };
    expect(normalizeTankCustomization(saved, tank, fishCatalog)).toEqual(saved);
    expect(normalizeTankCustomization({ ...saved, layout: { ...saved.layout, sceneId: scene.id } }, tank, fishCatalog)
      .layout.sceneId).toBe(scene.id);
  });

  test("rejects empty, degenerate and ambiguous surface definitions", () => {
    const terrain = getSceneById("japan-moss-wood")!.terrain!;
    expect(terrainSchema.safeParse({ ...terrain, surfaces: [] }).success).toBe(false);
    const first = terrain.surfaces[0]!;
    expect(terrainSchema.safeParse({ ...terrain, surfaces: [first, first] }).success).toBe(false);
    expect(terrainSchema.safeParse({ ...terrain,
      surfaces: [{ ...first, points: [first.points[0], first.points[0]] }] }).success).toBe(false);
  });
});
