import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { terrainSchema } from "./contentSchemas";
import { stepSimulation } from "./simulation";
import { sampleSurface } from "./surfaceMotion";
import { normalizeHallCustomizations } from "./customization";
import type { AquariumCustomization } from "./types";

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
          expect(Math.hypot(item.velocity.x, item.velocity.y)).toBeLessThanOrEqual(
            shrimp.realBodyLengthCm * shrimp.ecology.speedBodyLengthsPerSec.cruise * item.personality.pace + .001);
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

  test("crabs walk both ways along their paths, keeping the way they face until they stop", () => {
    const crabTank = getTankById("cold-crabs-180")!;
    const scene = getSceneById(crabTank.sceneIds[0]!)!;
    let fish = createFishFromStock([{ speciesId: "horsehair-crab", count: 4 }], crabTank)
      .map((item, i) => ({ ...item, seed: 7 + i * 3000 }));
    let walkedLeft = false, walkedRight = false, turned = false;
    for (let i = 0; i < 6000; i++) {
      const before = fish;
      fish = stepSimulation({ tank: crabTank, species: fishCatalog, fish, deltaSec: .05, structurePoints: [], scene }).fish;
      for (const [index, item] of fish.entries()) {
        // 歩いている間は向きを変えない。向きを変えるのは立ち止まったときだけ。
        if (item.facing !== before[index]!.facing) {
          expect(item.behaviorMode === "rest" || item.behaviorMode === "forage").toBe(true);
          turned = true;
        }
        walkedLeft ||= item.velocity.x * item.facing < -.05;
        walkedRight ||= item.velocity.x * item.facing > .05;
      }
    }
    expect(walkedLeft && walkedRight && turned).toBe(true);
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
    expect(Math.hypot(next.position.x - fish.position.x, next.position.y - fish.position.y)).toBeLessThan(
      shrimp.realBodyLengthCm * shrimp.ecology.speedBodyLengthsPerSec.cruise * fish.personality.pace * .25 + .001);
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

  test("surface-layer fish keep their clear-water motion, and stock and lighting remain compatible", () => {
    const scene = getSceneById("japan-moss-wood")!;
    const fish = createFishFromStock([{ speciesId: "medaka", count: 3 }], tank);
    const input = { tank, species: fishCatalog, fish, deltaSec: .05, structurePoints: [] };
    const next = stepSimulation({ ...input, scene }).fish;
    const fallback = stepSimulation(input).fish;
    for (const [i, f] of next.entries()) {
      expect(f.position).toEqual(fallback[i]!.position);
      expect(f.surfaceMotion).toBeUndefined();
      expect(f.depthMotion).toBeDefined();
      expect(Math.abs(f.depth - fish[i]!.depth)).toBeLessThan(.001);
      expect(f.position.y).toBeLessThan(tank.heightCm * fishCatalog.medaka!.preferredZone.maxY);
    }
    const saved: AquariumCustomization = { stock: [{ speciesId: shrimp.id, count: 3 }],
      layout: { sceneId: "japan-spring", lighting: "night" } };
    const normalize = (value: AquariumCustomization) => normalizeHallCustomizations({ [tank.id]: value }, [tank])[tank.id]!;
    expect(normalize(saved)).toEqual(saved);
    expect(normalize({ ...saved, layout: { ...saved.layout, sceneId: scene.id } }).layout.sceneId).toBe(scene.id);
  });

  test("rejects empty, degenerate and ambiguous surface definitions", () => {
    const terrain = getSceneById("japan-moss-wood")!.terrain!;
    expect(terrainSchema.safeParse({ ...terrain, surfaces: [] }).success).toBe(false);
    const first = terrain.surfaces[0]!;
    expect(terrainSchema.safeParse({ ...terrain, surfaces: [first, first] }).success).toBe(false);
    expect(terrainSchema.safeParse({ ...terrain,
      surfaces: [{ ...first, points: [first.points[0], first.points[0]] }] }).success).toBe(false);
  });

  test("walkers turn at a cropped path boundary instead of leaving the glass", () => {
    const scene = getSceneById("japan-moss-wood")!;
    const frame = { x: -.25, y: -.52, width: 1.5, height: 1.52 };
    let fish = createFishFromStock([{ speciesId: shrimp.id, count: 7 }], tank)
      .map((f, i) => ({ ...f, seed: 137 + i * 1327 }));
    for (let i = 0; i < 12000; i++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, structurePoints: [], deltaSec: .1 }).fish;
      for (const f of fish) {
        if (f.position.x < tank.safeMarginCm || f.position.x > tank.widthCm - tank.safeMarginCm ||
          f.position.y < tank.safeMarginCm || f.position.y > tank.heightCm - tank.safeMarginCm) throw new Error("Cropped surface escaped glass");
        const motion = f.surfaceMotion!, surface = scene.terrain!.surfaces.find((s) => s.id === motion.surfaceId)!;
        const sample = sampleSurface(surface, motion.progress, tank, frame);
        if (Math.hypot(sample.position.x - f.position.x, sample.position.y - f.position.y) > 1e-8) throw new Error("Walker lost surface contact");
      }
    }
  });
});
