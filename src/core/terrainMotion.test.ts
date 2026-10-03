import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { getSceneById, terrainSchema } from "./sceneCatalog";
import { stepSimulation } from "./simulation";
import { aquariumTanks, getTankById } from "./tankCatalog";
import { FULL_SURFACE_FRAME } from "./surfaceMotion";
import { chooseTerrainGoal, constrainTerrainStep, insideTerrain, resolveTerrainGoal } from "./terrainMotion";

describe("depth-aware terrain across habitats", () => {
  test("blocks a swept crossing at rock depth, while permitting passage in front and behind", () => {
    const tank = getTankById("cube-30")!;
    const scene = { ...getSceneById("cube-stones")!, terrain: {
      surfaces: [], occluders: [], obstacles: [{ id: "rock", center: { x: .5, y: .5, depth: .5 },
        radius: { x: .1, y: .1 }, depthRadius: .12 }],
    } };
    const context = { tank, scene, species: fishCatalog["ember-tetra"]!, frame: FULL_SURFACE_FRAME };
    const from = { x: 4, y: 15 }, to = { x: 26, y: 15 };
    const hit = constrainTerrainStep(from, to, .5, context);
    expect(hit.x).toBeGreaterThan(from.x);
    expect(hit.x).toBeLessThan(12);
    expect(insideTerrain(hit, .5, context)).toBe(false);
    expect(constrainTerrainStep(from, to, .2, context)).toEqual(to);
    expect(constrainTerrainStep(from, to, .8, context)).toEqual(to);
    // 停止直前の微小な惰性でも、境界から岩の内側へ染み込まない。
    const edge = { x: 15 - (3 + context.species.realBodyLengthCm * .2) * 1.000000001, y: 15 };
    const tiny = constrainTerrainStep(edge, { x: edge.x + .000001, y: edge.y }, .5, context);
    expect(insideTerrain(tiny, .5, context)).toBe(false);
  });

  test("every water scene has usable terrain, and populations remain outside solids and inside glass", () => {
    let grazing = false, hiding = false, changedDepth = false;
    for (const tank of aquariumTanks) for (const sceneId of tank.sceneIds) {
      const scene = getSceneById(sceneId)!;
      expect(scene.terrain?.surfaces.length).toBeGreaterThan(0);
      expect(scene.terrain?.obstacles?.length).toBeGreaterThan(0);
      expect(scene.terrain?.shelters?.length).toBeGreaterThan(0);
      // 最も縦方向が切り取られるワイド水槽と、正方形の背景の両方を確認する。
      const frame = tank.id === "cube-30" ? { x: -.02, y: -.02, width: 1.04, height: 1.02 }
        : { x: -.02, y: -.52, width: 1.04, height: 1.52 };
      let fish = createFishFromStock(tank.defaultStock, tank).map((f, i) => ({ ...f, seed: 100 + i * 5000,
        bodyLengthVariance: 1, behaviorTimeRemainingSec: .6 }));
      const initialDepth = fish.map((f) => f.depth);
      for (let tick = 0; tick < 1800; tick++) {
        fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog,
          structurePoints: [], deltaSec: .1 }).fish;
        for (const [i, f] of fish.entries()) {
          expect(Number.isFinite(f.position.x + f.position.y + f.depth)).toBe(true);
          expect(f.position.x).toBeGreaterThanOrEqual(tank.safeMarginCm);
          expect(f.position.x).toBeLessThanOrEqual(tank.widthCm - tank.safeMarginCm);
          expect(f.position.y).toBeGreaterThanOrEqual(tank.safeMarginCm);
          expect(f.position.y).toBeLessThanOrEqual(tank.heightCm - tank.safeMarginCm);
          if (!f.surfaceMotion) {
            expect(insideTerrain(f.position, f.depth, { tank, scene, frame, species: fishCatalog[f.speciesId]! }),
              `${sceneId}/${f.speciesId}/${tick}`).toBe(false);
            changedDepth ||= Math.abs(f.depth - initialDepth[i]!) > .03;
            grazing ||= f.behaviorMode === "forage" && !!f.terrainGoal;
            hiding ||= f.targetKind === "hide" && f.behaviorMode === "rest" && !!f.terrainGoal;
          }
        }
      }
      expect(fish.length).toBe(tank.defaultStock.reduce((sum, s) => sum + s.count, 0));
    }
    expect(grazing && hiding && changedDepth).toBe(true);
  }, 30000);

  test("a grazer reaches a leaf gradually in depth, and scene switches discard its old destination", () => {
    const tank = getTankById("cube-30")!, scene = getSceneById("cube-planted")!;
    const species = structuredClone(fishCatalog["otocinclus"]!);
    species.ecology.habits = [{ type: "grazing", chancePerMin: 60000, durationSec: [6, 18] }];
    const context = { scene, tank, species, frame: FULL_SURFACE_FRAME };
    const goal = { sceneId: scene.id, surfaceId: "broad-leaf", progress: .5 };
    const point = resolveTerrainGoal(goal, context)!;
    let fish = createFishFromStock([{ speciesId: species.id, count: 1 }], tank);
    fish[0] = { ...fish[0]!, seed: 42, position: { x: point.position.x - .2, y: point.position.y - .2 },
      velocity: { x: 0, y: 0 }, depth: point.depth + .1, target: undefined,
      targetKind: "openWater", behaviorMode: "coast" };
    const original = fish[0]!;
    let arrived = false;
    for (let i = 0; i < 300; i++) {
      const before = fish[0]!;
      fish = stepSimulation({ tank, scene, species: { [species.id]: species }, fish, structurePoints: [], deltaSec: .05 }).fish;
      expect(fish[0]!.terrainGoal?.surfaceId).toBe("broad-leaf");
      expect(Math.abs(fish[0]!.depth - before.depth)).toBeLessThan(.002);
      if (fish[0]!.behaviorMode === "forage") { arrived = true; break; }
    }
    expect(arrived).toBe(true);
    expect(Math.abs(fish[0]!.depth - original.depth)).toBeGreaterThan(.05);
    const next = stepSimulation({ tank, scene: getSceneById("cube-stones"), fish,
      species: fishCatalog, structurePoints: [], deltaSec: .05 }).fish[0]!;
    expect(next.terrainGoal?.sceneId).not.toBe(scene.id);
    expect(Math.abs(next.depth - fish[0]!.depth)).toBeLessThan(.002);
    expect(next.surfaceMotion).toBeUndefined();
  });

  test("ignores cropped destinations, and rejects invalid obstacle dimensions and duplicate shelters", () => {
    const tank = getTankById("cube-30")!, scene = getSceneById("cube-planted")!;
    const fish = createFishFromStock([{ speciesId: "otocinclus", count: 1 }], tank)[0]!;
    const context = { scene, tank, species: fishCatalog[fish.speciesId]!,
      frame: { x: 0, y: -2, width: 1, height: 1 } };
    expect(chooseTerrainGoal("forage", fish, context, () => .2)).toBeUndefined();
    const terrain = scene.terrain!;
    const obstacle = terrain.obstacles![0]!;
    expect(terrainSchema.safeParse({ ...terrain, obstacles: [{ ...obstacle, depthRadius: 0 }] }).success).toBe(false);
    expect(terrainSchema.safeParse({ ...terrain, obstacles: [{ ...obstacle, radius: { x: -1, y: .1 } }] }).success).toBe(false);
    expect(terrainSchema.safeParse({ ...terrain, shelters: [terrain.shelters![0], terrain.shelters![0]] }).success).toBe(false);
  });
});
