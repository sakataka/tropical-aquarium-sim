import { describe, expect, test } from "vitest";
import { getBodyPlan } from "./bodyPlans";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { worldPoint } from "./surfaceMotion";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, FishStockEntry } from "./types";

const tank = getTankById("seahorse-90")!;
const scene = getSceneById("seahorse-90")!;
const frame = getRenderedSurfaceFrame(tank, scene);

function setup(stock: FishStockEntry[], seed = 7) {
  let fish = createFishFromStock(stock, tank).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: seed + i * 131, personality: createFishPersonality(seed + i * 131),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 10; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .1 }).fish;
      each?.(fish);
    }
    return fish;
  };
  const tap = (point: { x: number; y: number }) => {
    fish = startleFish({ fish, species: fishCatalog, tank, scene, frame, point, strength: 1, random: () => 0 });
    return fish;
  };
  return { step, tap, get fish() { return fish; } };
}

describe("seahorses and seadragons", () => {
  test("swim with their fins, never kicking with the tail", () => {
    for (const id of ["spotted-seahorse", "leafy-seadragon", "weedy-seadragon"]) {
      const species = fishCatalog[id]!;
      expect(species.swim?.bodyPlan, id).toBe("seahorse");
      expect(getBodyPlan(species).tailKick, id).toBe(false);
      expect(species.swim?.fins?.length, id).toBeGreaterThan(0);
    }
    expect(fishCatalog["spotted-seahorse"]!.swim?.tailStartY).toBeGreaterThan(.5);
  });

  test("a seahorse wraps its tail around seagrass, holds on for a while and stays nearby", () => {
    const world = setup([{ speciesId: "spotted-seahorse", count: 3 }]);
    const holdfasts = scene.terrain!.shelters!.filter((s) => s.kind === "holdfast").map((s) => worldPoint(s, tank, frame));
    const range = 4 * fishCatalog["spotted-seahorse"]!.realBodyLengthCm;
    let holding = 0, still = 0, far = 0, samples = 0;
    world.step(600, (fish) => {
      for (const f of fish) {
        samples++;
        if (f.targetKind !== "home" || f.behaviorMode !== "rest") {
          if (!holdfasts.some((h) => Math.hypot(f.position.x - h.x, f.position.y - h.y) < range * 1.6)) far++;
          continue;
        }
        holding++;
        if (Math.hypot(f.velocity.x, f.velocity.y) < .3) still++;
      }
    });
    // 一日の多くを海草につかまって過ごし、つかまっている間はほとんど動かない。
    expect(holding / samples).toBeGreaterThan(.3);
    expect(still / holding).toBeGreaterThan(.9);
    expect(far / samples).toBeLessThan(.1);
  });

  test("a startled seahorse retreats to its seagrass", () => {
    const world = setup([{ speciesId: "spotted-seahorse", count: 1 }], 21);
    world.step(20);
    const seahorse = world.fish[0]!;
    world.tap({ x: seahorse.position.x + 1, y: seahorse.position.y });
    const fled = world.fish[0]!;
    expect(fled.targetKind).toBe("home");
    const shelter = scene.terrain!.shelters!.find((s) => s.id === fled.terrainGoal?.shelterId);
    expect(shelter?.kind).toBe("holdfast");
  });
});
