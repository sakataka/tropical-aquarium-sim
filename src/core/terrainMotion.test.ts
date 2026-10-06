import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { getSceneById, terrainSchema } from "./sceneCatalog";
import { stepSimulation } from "./simulation";
import { aquariumTanks, getTankById } from "./tankCatalog";
import { FULL_SURFACE_FRAME } from "./surfaceMotion";
import { chooseTerrainGoal, constrainTerrainDepth, constrainTerrainStep, insideTerrain, pointInPolygon, resolveTerrainGoal, routeTerrainTarget } from "./terrainMotion";
import { getRenderedSurfaceFrame } from "./testContent";

describe("depth-aware terrain across habitats", () => {
  test("recovers without routing across a boulder when glass and another rock block the near waypoints", () => {
    // 上限48匹・seed137の耐久テストで、岩とガラスの間に止まった位置。
    const tank = getTankById("barbs-stream-90")!;
    const scene = getSceneById("barbs-stream-90")!;
    const species = fishCatalog["clown-loach"]!;
    const frame = getRenderedSurfaceFrame(tank, scene);
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      position: { x: 31.2920798020135, y: tank.heightCm - tank.safeMarginCm },
      depth: .5000001,
      terrainRoute: { sceneId: scene.id, obstacleId: "front-boulder-core", side: -1 as const, stuckSec: .6 },
    };
    const context = { tank, scene, species, frame };
    const navigation = routeTerrainTarget(fish, { x: 7.2, y: 37.514932126696834 }, context);
    expect(insideTerrain(fish.position, fish.depth, context)).toBe(false);
    expect(insideTerrain(navigation.target, fish.depth, context)).toBe(false);
    expect(navigation.target.x).toBeGreaterThanOrEqual(tank.safeMarginCm);
    expect(navigation.target.x).toBeLessThanOrEqual(tank.widthCm - tank.safeMarginCm);
    expect(navigation.target.y).toBeGreaterThanOrEqual(tank.safeMarginCm);
    expect(navigation.target.y).toBeLessThanOrEqual(tank.heightCm - tank.safeMarginCm);
    const reachable = constrainTerrainStep(fish.position, navigation.target, fish.depth, context);
    expect(Math.hypot(reachable.x - navigation.target.x, reachable.y - navigation.target.y)).toBeLessThan(1e-6);
    expect(Math.hypot(reachable.x - fish.position.x, reachable.y - fish.position.y)).toBeGreaterThan(.1);
    // 停止が検知されるまでは、従来の経路選択を変えない。
    const moving = routeTerrainTarget({ ...fish, terrainRoute: { ...fish.terrainRoute, stuckSec: 0 } },
      { x: 7.2, y: 37.514932126696834 }, context);
    expect(moving.target.x).toBeCloseTo(15.596987703071264, 10);
    expect(moving.target.y).toBeCloseTo(36.61186904556797, 10);
  });

  test("blocks a swept crossing at rock depth, while permitting passage in front and behind", () => {
    const tank = getTankById("cube-30")!;
    const scene = { ...getSceneById("cube-stones")!, terrain: {
      surfaces: [], occluders: [], obstacles: [{ id: "rock", center: { x: .5, y: .5, depth: .5 },
        radius: { x: .1, y: .1 }, depthRadius: .12 }],
    } };
    const context = { tank, scene, species: fishCatalog["ember-tetra"]!, frame: FULL_SURFACE_FRAME };
    const midY = tank.heightCm / 2;
    const from = { x: 4, y: midY }, to = { x: 26, y: midY };
    const hit = constrainTerrainStep(from, to, .5, context);
    expect(hit.x).toBeGreaterThan(from.x);
    expect(hit.x).toBeLessThan(12);
    expect(insideTerrain(hit, .5, context)).toBe(false);
    expect(constrainTerrainStep(from, to, .2, context)).toEqual(to);
    expect(constrainTerrainStep(from, to, .8, context)).toEqual(to);
    // 停止直前の微小な惰性でも、境界から岩の内側へ染み込まない。
    const edge = { x: 15 - (3 + context.species.realBodyLengthCm * .2) * 1.000000001, y: midY };
    const tiny = constrainTerrainStep(edge, { x: edge.x + .000001, y: edge.y }, .5, context);
    expect(insideTerrain(tiny, .5, context)).toBe(false);
  });

  test("every water scene has usable terrain, and populations remain outside solids and inside glass", () => {
    let grazing = false, hiding = false, changedDepth = false;
    for (const tank of aquariumTanks) for (const sceneId of tank.sceneIds) {
      const scene = getSceneById(sceneId)!;
      // 回避領域と隠れ場所は、岩も底もない中層の水景にはない。住みかが要る魚の隠れ場所は content.test で確かめる。
      expect(scene.terrain?.surfaces.length).toBeGreaterThan(0);
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

  test("goes around a head-on rock instead of reversing or pushing against it", () => {
    const tank = getTankById("cube-30")!, species = structuredClone(fishCatalog["ember-tetra"]!);
    species.ecology.habits = [];
    const scene = { ...getSceneById("cube-stones")!, terrain: { surfaces: [], occluders: [],
      obstacles: [{ id: "rock", center: { x: .5, y: .5, depth: .5 }, radius: { x: .12, y: .12 }, depthRadius: .1 }] } };
    let fish = [{ ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      position: { x: 5, y: 15 }, velocity: { x: 2, y: 0 }, depth: .5,
      target: { x: 25, y: 15 }, behaviorMode: "coast" as const, seed: 42,
      depthMotion: { target: .5, velocity: 0, remainingSec: 1000 } }];
    let passed = false, detoured = false;
    for (let i = 0; i < 1200; i++) {
      const previous = fish[0]!;
      fish = stepSimulation({ tank, scene, fish, species: { [species.id]: species }, structurePoints: [], deltaSec: .05 }).fish as typeof fish;
      const f = fish[0]!;
      expect(insideTerrain(f.position, f.depth, { tank, scene, species, frame: FULL_SURFACE_FRAME })).toBe(false);
      expect(Math.hypot(f.position.x - previous.position.x, f.position.y - previous.position.y)).toBeLessThan(.25);
      detoured ||= !!f.terrainRoute;
      passed ||= f.position.x > 22;
    }
    expect(detoured && passed).toBe(true);
  });

  test("even a thin depth obstacle blocks a front-to-back swept crossing", () => {
    const tank = getTankById("cube-30")!, species = fishCatalog["ember-tetra"]!;
    const scene = { ...getSceneById("cube-stones")!, terrain: { surfaces: [], occluders: [],
      obstacles: [{ id: "thin", center: { x: .5, y: .5, depth: .5 }, radius: { x: .1, y: .1 }, depthRadius: .002 }] } };
    const context = { tank, scene, species, frame: FULL_SURFACE_FRAME };
    const depth = constrainTerrainDepth({ x: 15, y: 15 }, .48, .52, context);
    expect(depth).toBeGreaterThan(.48);
    expect(depth).toBeLessThan(.499);
    expect(insideTerrain({ x: 15, y: 15 }, depth, context)).toBe(false);
  });

  test("grazing settles onto the actual contact point and release stays continuous", () => {
    const tank = getTankById("cube-30")!, scene = getSceneById("cube-planted")!, species = fishCatalog.otocinclus!;
    const goal = { sceneId: scene.id, surfaceId: "broad-leaf", progress: .5, facing: -1 as const };
    const point = resolveTerrainGoal(goal, { tank, scene, species, frame: FULL_SURFACE_FRAME })!;
    let fish = [{ ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      position: { x: point.position.x + .3, y: point.position.y - .3 }, depth: point.depth,
      velocity: { x: -.1, y: .1 }, terrainGoal: goal, targetKind: "forage" as const,
      behaviorMode: "forage" as const, habitTimeSec: 20 }];
    for (let i = 0; i < 150; i++) fish = stepSimulation({ tank, scene, fish, species: fishCatalog, structurePoints: [], deltaSec: .05 }).fish as typeof fish;
    expect(Math.hypot(fish[0]!.position.x - point.position.x, fish[0]!.position.y - point.position.y)).toBeLessThan(.02);
    expect(fish[0]!.contact!.weight).toBeGreaterThan(.98);
    const before = { ...fish[0]!, habitTimeSec: 0 };
    const released = stepSimulation({ tank, scene, fish: [before], species: fishCatalog, structurePoints: [], deltaSec: .05 }).fish[0]!;
    expect(released.terrainGoal).toBeUndefined();
    expect(released.contact!.weight).toBeLessThan(before.contact!.weight);
    expect(released.contact!.weight).toBeGreaterThan(.8);
    expect(Math.hypot(released.position.x - before.position.x, released.position.y - before.position.y)).toBeLessThan(.1);
  });

  test("ordinary depth travel waits until clear of an occluding silhouette", () => {
    const tank = getTankById("cube-30")!, species = fishCatalog["ember-tetra"]!;
    const scene = { ...getSceneById("cube-stones")!, terrain: { surfaces: [], obstacles: [],
      occluders: [{ id: "stone", depth: .5, polygon: [{ x: .3, y: .4 }, { x: .7, y: .4 }, { x: .7, y: .8 }, { x: .3, y: .8 }] }] } };
    const context = { tank, scene, species, frame: FULL_SURFACE_FRAME };
    expect(constrainTerrainDepth({ x: 15, y: 18 }, .49, .51, context, true)).toBeLessThan(.5);
    expect(constrainTerrainDepth({ x: 15, y: 4 }, .49, .51, context, true)).toBe(.51);
  });

  test("all thirteen silhouettes leave open water and front gravel visible", () => {
    for (const tank of aquariumTanks) for (const sceneId of tank.sceneIds) {
      for (const occluder of getSceneById(sceneId)!.terrain!.occluders) {
        expect(pointInPolygon({ x: .5, y: .3 }, occluder.polygon), sceneId).toBe(false);
        expect(pointInPolygon({ x: .15, y: .99 }, occluder.polygon), sceneId).toBe(false);
      }
    }
    const crevices = getSceneById("malawi-crevices")!;
    expect(crevices.terrain!.occluders.some((o) => pointInPolygon({ x: .75, y: .63 }, o.polygon))).toBe(false);
    const wood = getSceneById("japan-moss-wood")!;
    expect(wood.terrain!.occluders.some((o) => pointInPolygon({ x: .78, y: .77 }, o.polygon))).toBe(false);
  });

  test("a fish between the glass and a clipped root can slide out and reach the surface", () => {
    const tank = getTankById("asia-60")!, scene = getSceneById("root-driftwood")!, species = fishCatalog["honey-gourami"]!;
    let fish = [{ ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      position: { x: 56.911008463661844, y: 22.504634731339998 }, velocity: { x: 0, y: 0 },
      depth: .5299987370031973, seed: 3587811097, target: { x: 53.27332010955902, y: 2.3 },
      targetKind: "surfaceVisit" as const, behaviorMode: "coast" as const, nextBreathSec: -32,
      depthMotion: { target: .4772849368862807, velocity: 0, remainingSec: 19.7 },
      terrainRoute: { sceneId: scene.id, obstacleId: "east-root-core", side: -1 as const } }];
    const frame = { x: -.02, y: -.52, width: 1.04, height: 1.52 };
    let nearestSurface = tank.heightCm;
    for (let i = 0; i < 1200; i++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog,
        lighting: "night", deltaSec: .05, structurePoints: [] }).fish as typeof fish;
      nearestSurface = Math.min(nearestSurface, fish[0]!.position.y);
      expect(insideTerrain(fish[0]!.position, fish[0]!.depth, { tank, scene, species, frame })).toBe(false);
    }
    expect(nearestSurface).toBeLessThan(4);
  });

  test("nightfall releases a daytime shelter with a continuous departure", () => {
    const tank = getTankById("asia-60")!, scene = getSceneById("planted")!, species = fishCatalog["kuhli-loach"]!;
    const goal = { sceneId: scene.id, shelterId: scene.terrain!.shelters![0]!.id };
    const point = resolveTerrainGoal(goal, { tank, scene, species, frame: FULL_SURFACE_FRAME })!;
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      position: point.position, depth: point.depth, velocity: { x: 0, y: 0 }, terrainGoal: goal,
      target: point.position, targetKind: "hide" as const, behaviorMode: "rest" as const, habitTimeSec: 100 };
    const day = stepSimulation({ tank, scene, fish: [fish], species: fishCatalog, structurePoints: [], deltaSec: .05 }).fish[0]!;
    expect(day.targetKind).toBe("hide");
    const night = stepSimulation({ tank, scene, fish: [day], species: fishCatalog, lighting: "night", structurePoints: [], deltaSec: .05 }).fish[0]!;
    expect(night.targetKind).not.toBe("hide");
    expect(night.terrainGoal).toBeUndefined();
    expect(Math.hypot(night.position.x - day.position.x, night.position.y - day.position.y)).toBeLessThan(.1);
  });
});
