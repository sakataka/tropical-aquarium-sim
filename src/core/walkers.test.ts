import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import { getWaterColumn, waterCeilingCm } from "./waterColumn";
import type { FishInstance, FishStockEntry } from "./types";

function setup(tankId: string, stock: FishStockEntry[], lighting: "natural" | "night" = "night") {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock(stock, tank).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: 11 + i * 97, personality: createFishPersonality(11 + i * 97),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[], previous: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      const previous = fish;
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, lighting, deltaSec: .05 }).fish;
      each?.(fish, previous);
    }
    return fish;
  };
  return {
    tank, scene, frame, step,
    get fish() { return fish; },
    set fish(value) { fish = value; },
  };
}

describe("amphibians", () => {
  test("walk the river bed at night and rest for long stretches", () => {
    const world = setup("giant-salamander-240", [{ speciesId: "japanese-giant-salamander", count: 1 }]);
    world.fish = world.fish.map((f) => ({ ...f, nextBreathSec: 1e6 }));
    let walking = 0, resting = 0;
    world.step(600, ([f]) => {
      expect(f!.surfaceMotion).toBeDefined();
      if (f!.behaviorMode === "rest") resting += 1;
      else if (Math.hypot(f!.velocity.x, f!.velocity.y) > .05) walking += 1;
    });
    expect(walking).toBeGreaterThan(200);
    expect(resting).toBeGreaterThan(walking);
  });

  test("swim up to breathe at the surface, then return to the same spot and walk on", () => {
    const world = setup("giant-salamander-240", [{ speciesId: "japanese-giant-salamander", count: 1 }]);
    world.fish = world.fish.map((f) => ({ ...f, nextBreathSec: 1e6 }));
    world.step(5);
    // 息継ぎに上がれる砂利の上で、間隔が来たことにする。
    world.fish = world.fish.map((f) => ({ ...f, nextBreathSec: 0.01 }));
    let trip: NonNullable<FishInstance["breathTrip"]> | undefined;
    let highest = Number.POSITIVE_INFINITY;
    let turned = false;
    const bodyLength = fishCatalog["japanese-giant-salamander"]!.realBodyLengthCm;
    const burst = fishCatalog["japanese-giant-salamander"]!.ecology.speedBodyLengthsPerSec.burst;
    for (let i = 0; i < 60 * 20 && !(trip && world.fish[0]!.surfaceMotion); i++) {
      world.step(.05, ([f], [p]) => {
        expect(Math.hypot(f!.position.x - p!.position.x, f!.position.y - p!.position.y)).toBeLessThan(burst * bodyLength * .05 + 1e-6);
        if (f!.breathTrip) {
          expect(f!.depth).toBe(p!.depth);
          trip ??= f!.breathTrip;
          highest = Math.min(highest, f!.position.y);
          if (f!.breathTrip.phase === "sink" && f!.facing !== p!.facing) turned = true;
        }
      });
    }
    // 1回目で上がれなかったら、歩いて場所を変えながら上がれるまで試す。
    expect(trip).toBeDefined();
    const fish = world.fish[0]!;
    const water = getWaterColumn(world.tank, world.scene, world.frame);
    expect(highest).toBeLessThan(waterCeilingCm(water, world.tank, fish.depth) + bodyLength * .1);
    expect(fish.surfaceMotion).toBeDefined();
    expect(fish.breathTrip).toBeUndefined();
    expect(Math.hypot(fish.position.x - trip!.perch.x, fish.position.y - trip!.perch.y)).toBeLessThan(.5);
    // 斜めに上がり、水面で向き直って元の点へ頭から戻る。
    expect(Math.abs(trip!.apex.x - trip!.perch.x)).toBeGreaterThan((trip!.perch.y - trip!.apex.y) * .8);
    expect(turned).toBe(true);
  });

  test("turn away from a tap and crawl off head first", () => {
    const world = setup("giant-salamander-240", [{ speciesId: "japanese-giant-salamander", count: 1 }]);
    world.fish = world.fish.map((f) => ({ ...f, nextBreathSec: 1e6 }));
    world.step(3);
    const start = world.fish[0]!;
    world.fish = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene, frame: world.frame,
      point: { x: start.position.x + 2, y: start.position.y }, strength: 1, random: () => 0 });
    const fleeing = world.fish[0]!;
    expect(fleeing.surfaceMotion?.flee).toBeDefined();
    // 右を叩いたので、左へ向き直って這う。
    expect(fleeing.facing).toBe(-1);
    world.step(.8);
    expect(world.fish[0]!.position.x).toBeLessThan(start.position.x - 5);
  });

  test("ignore taps while swimming up to breathe", () => {
    const world = setup("rice-paddy-60", [{ speciesId: "japanese-fire-bellied-newt", count: 1 }]);
    world.step(2);
    world.fish = world.fish.map((f) => ({ ...f, nextBreathSec: 0.01 }));
    for (let i = 0; i < 400 && !world.fish[0]!.breathTrip; i++) world.step(.05);
    const swimming = world.fish[0]!;
    expect(swimming.breathTrip).toBeDefined();
    const tapped = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene,
      frame: world.frame, point: swimming.position, strength: 1, random: () => 0 });
    expect(tapped[0]).toBe(swimming);
  });
});
