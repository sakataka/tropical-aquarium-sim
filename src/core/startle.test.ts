import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, FishStockEntry, TankDefinition } from "./types";

function setup(tankId: string, stock: FishStockEntry[]) {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0])!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock(stock, tank).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: 3 + i * 101, personality: createFishPersonality(3 + i * 101),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .05 }).fish;
      each?.(fish);
    }
    return fish;
  };
  const tap = (point: { x: number; y: number }, strength = 1) => {
    fish = startleFish({ fish, species: fishCatalog, tank, scene, frame, point, strength, random: () => 0 });
    return fish;
  };
  return { tank, scene, frame, step, tap, get fish() { return fish; } };
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const centre = (tank: TankDefinition) => ({ x: tank.widthCm / 2, y: tank.heightCm / 2 });

describe("tapping the glass", () => {
  test("nearby fish dart away from the tap, then return to normal swimming", () => {
    const world = setup("amazon-90", [{ speciesId: "neon-tetra", count: 12 }]);
    world.step(10);
    const point = { ...world.fish[0]!.position };
    const before = world.fish.map((f) => distance(f.position, point));
    world.tap(point);
    expect(world.fish.some((f) => f.targetKind === "flee")).toBe(true);
    world.step(1.5);
    const fled = world.fish.filter((_, i) => before[i]! < 15);
    for (const f of fled) expect(distance(f.position, point)).toBeGreaterThan(Math.min(...before));
    world.step(8);
    expect(world.fish.every((f) => f.targetKind !== "flee")).toBe(true);
  });

  test("shelter dwellers dive into their shelter and stay a while", () => {
    const world = setup("reef-120", [{ speciesId: "firefish", count: 1 }, { speciesId: "ocellaris-clownfish", count: 2 }]);
    world.step(20);
    world.tap(world.fish[0]!.position);
    const homes = world.fish.filter((f) => f.targetKind === "home" && f.terrainGoal?.shelterId);
    expect(homes.length).toBeGreaterThan(0);
    let resting = 0;
    world.step(8, (fish) => { resting += fish.filter((f) => f.targetKind === "home" && f.behaviorMode === "rest").length; });
    expect(resting).toBeGreaterThan(0);
  });

  test("shrimp flick backwards without turning, then freeze", () => {
    const world = setup("japan-60", [{ speciesId: "amano-shrimp", count: 1 }]);
    world.step(5);
    const shrimp = world.fish[0]!;
    world.tap({ x: shrimp.position.x + 1, y: shrimp.position.y });
    expect(world.fish[0]!.surfaceMotion?.flee).toBeDefined();
    const facing = world.fish[0]!.facing;
    let moved = 0;
    const start = { ...world.fish[0]!.position };
    world.step(.25, ([f]) => { expect(f!.facing).toBe(facing); moved = distance(f!.position, start); });
    expect(moved).toBeGreaterThan(2);
    world.step(.4);
    expect(world.fish[0]!.surfaceMotion?.flee).toBeUndefined();
    expect(world.fish[0]!.behaviorMode).toBe("rest");
  });

  test("crabs scuttle sideways away from the tap without turning, then freeze", () => {
    const world = setup("cold-crabs-180", [{ speciesId: "horsehair-crab", count: 1 }]);
    world.step(5);
    const crab = world.fish[0]!;
    world.tap({ x: crab.position.x + 1, y: crab.position.y });
    expect(world.fish[0]!.surfaceMotion?.flee).toBeDefined();
    const facing = world.fish[0]!.facing;
    const start = { ...world.fish[0]!.position };
    world.step(.25, ([f]) => expect(f!.facing).toBe(facing));
    expect(world.fish[0]!.position.x).toBeLessThan(start.x);
    world.step(.4);
    expect(world.fish[0]!.surfaceMotion?.flee).toBeUndefined();
    expect(world.fish[0]!.behaviorMode).toBe("rest");
  });

  test("distant fish ignore a gentle tap, and repeated taps weaken the response", () => {
    const world = setup("amazon-90", [{ speciesId: "neon-tetra", count: 6 }]);
    const far = { x: world.tank.widthCm * 2, y: centre(world.tank).y };
    expect(world.tap(far).every((f) => f.targetKind !== "flee")).toBe(true);
    const weak = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene,
      frame: world.frame, point: world.fish[0]!.position, strength: 0, random: () => 0.5 });
    expect(weak.every((f) => f.targetKind !== "flee")).toBe(true);
  });
});
