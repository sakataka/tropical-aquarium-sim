import { describe, expect, test } from "bun:test";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, FishStockEntry } from "./types";

function setup(tankId: string, stock: FishStockEntry[]) {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0])!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock(stock, tank).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: 5 + i * 97, personality: createFishPersonality(5 + i * 97),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .05 }).fish;
      each?.(fish);
    }
    return fish;
  };
  const tap = (point: { x: number; y: number }) => {
    fish = startleFish({ fish, species: fishCatalog, tank, scene, frame, point, strength: 1, random: () => 0 });
    return fish;
  };
  return { tank, step, tap, get fish() { return fish; } };
}

describe("octopuses", () => {
  test("crawl over the bottom and rest for long stretches", () => {
    const world = setup("octopus-squid-120", [{ speciesId: "east-asian-common-octopus", count: 1 }]);
    let walking = 0, resting = 0;
    world.step(300, ([f]) => {
      expect(f!.surfaceMotion).toBeDefined();
      if (f!.behaviorMode === "rest") resting += 1;
      else if (Math.hypot(f!.velocity.x, f!.velocity.y) > .05) walking += 1;
    });
    expect(walking).toBeGreaterThan(100);
    expect(resting).toBeGreaterThan(walking * .3);
  });

  test("jet away along the bottom mantle first, then sit still", () => {
    const world = setup("octopus-squid-120", [{ speciesId: "east-asian-common-octopus", count: 1 }]);
    world.step(5);
    const octopus = world.fish[0]!;
    // 右を叩くと左へ逃げる。胴（画像の右）を先にするので、画像を反転して右を向く。
    world.tap({ x: octopus.position.x + 1, y: octopus.position.y });
    expect(world.fish[0]!.surfaceMotion?.flee).toBeDefined();
    expect(world.fish[0]!.facing).toBe(1);
    const start = { ...world.fish[0]!.position };
    world.step(.4, ([f]) => expect(f!.facing).toBe(1));
    expect(world.fish[0]!.position.x).toBeLessThan(start.x - 3);
    world.step(.6);
    expect(world.fish[0]!.surfaceMotion?.flee).toBeUndefined();
    expect(world.fish[0]!.behaviorMode).toBe("rest");
  });
});

describe("squid", () => {
  test("swim both forwards and backwards, turning only on longer backward runs", () => {
    const world = setup("octopus-squid-120", [{ speciesId: "bigfin-reef-squid", count: 4 }]);
    let backward = 0, forward = 0, turns = 0;
    let facing = world.fish.map((f) => f.facing);
    world.step(300, (fish) => {
      for (const [i, f] of fish.entries()) {
        const along = f.velocity.x * f.facing;
        if (along < -.5) backward += 1;
        if (along > .5) forward += 1;
        if (f.facing !== facing[i]) turns += 1;
      }
      facing = fish.map((f) => f.facing);
    });
    expect(backward).toBeGreaterThan(200);
    expect(forward).toBeGreaterThan(backward);
    expect(turns).toBeGreaterThan(4);
  });

  test("jet away from a tap without turning around", () => {
    const world = setup("octopus-squid-120", [{ speciesId: "bigfin-reef-squid", count: 1 }]);
    world.step(10);
    // 壁際では壁に沿って逃げるので、水槽の中ほどで叩く。
    world.fish[0]!.position = { x: world.tank.widthCm / 2, y: world.tank.heightCm * .4 };
    const squid = world.fish[0]!;
    const facing = squid.facing;
    // 頭の前を叩くと、向きを変えずに後ろ（胴の側）へ飛び退く。
    world.tap({ x: squid.position.x + facing * 2, y: squid.position.y });
    expect(world.fish[0]!.targetKind).toBe("flee");
    const start = { ...world.fish[0]!.position };
    world.step(1, ([f]) => expect(f!.facing).toBe(facing));
    expect((world.fish[0]!.position.x - start.x) * facing).toBeLessThan(-3);
  });
});

describe("flapjack octopus", () => {
  test("swims by pulsing its web, and settles on the bottom to rest now and then", () => {
    const world = setup("deep-cephalopods-120", [{ speciesId: "flapjack-octopus", count: 1 }]);
    let resting = 0, swimming = 0, lowest = 0;
    const facing = world.fish[0]!.facing;
    world.step(600, ([f]) => {
      expect(f!.facing).toBe(facing);
      if (f!.behaviorMode === "rest") {
        resting += 1;
        lowest = Math.max(lowest, f!.position.y);
      } else swimming += 1;
    });
    expect(resting).toBeGreaterThan(600);
    expect(swimming).toBeGreaterThan(600);
    expect(lowest).toBeGreaterThan(world.tank.heightCm * .6);
  });
});
