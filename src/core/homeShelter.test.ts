import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { getSceneById } from "./sceneCatalog";
import { stepSimulation } from "./simulation";
import { worldPoint } from "./surfaceMotion";
import { getTankById } from "./tankCatalog";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, FishStockEntry, LightingId } from "./types";

const reef = getTankById("reef-120")!;
const scene = getSceneById("reef-lagoon")!;
const frame = getRenderedSurfaceFrame(reef, scene);
const shelterPoint = (kind: string) => worldPoint(scene.terrain!.shelters!.find((s) => s.kind === kind)!, reef, frame);

function run(stock: FishStockEntry[], seconds: number, lighting: LightingId, seed = 11,
  each?: (fish: FishInstance[]) => void) {
  let fish = createFishFromStock(stock, reef).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: seed + i * 977, personality: createFishPersonality(seed + i * 977),
  }));
  for (let tick = 0; tick < seconds * 10; tick++) {
    fish = stepSimulation({ tank: reef, scene, surfaceFrame: frame, fish, species: fishCatalog,
      structurePoints: [], lighting, deltaSec: .1 }).fish;
    each?.(fish);
  }
  return fish;
}

describe("home shelters", () => {
  test("clownfish stay around their anemone and sometimes nestle into it", () => {
    const anemone = shelterPoint("anemone");
    const range = 2.6 * fishCatalog["ocellaris-clownfish"]!.realBodyLengthCm;
    let far = 0, samples = 0, nestled = 0;
    run([{ speciesId: "ocellaris-clownfish", count: 2 }], 300, "natural", 11, (fish) => {
      for (const f of fish) {
        samples++;
        if (Math.hypot(f.position.x - anemone.x, f.position.y - anemone.y) > range * 1.6) far++;
        if (f.targetKind === "home" && f.behaviorMode === "rest") nestled++;
      }
    });
    // 最初は水槽の別の場所から泳ぎ寄るため、少しの離れは許す。
    expect(far / samples).toBeLessThan(.15);
    expect(nestled).toBeGreaterThan(0);
  });

  test("a firefish hovers near its burrow and darts into it", () => {
    const burrow = shelterPoint("burrow");
    let near = 0, samples = 0, inside = 0;
    run([{ speciesId: "firefish", count: 1 }], 300, "natural", 23, ([f]) => {
      samples++;
      if (Math.hypot(f!.position.x - burrow.x, f!.position.y - burrow.y) < 3.5 * 8) near++;
      if (f!.targetKind === "home" && f!.behaviorMode === "rest") inside++;
    });
    expect(near / samples).toBeGreaterThan(.7);
    expect(inside).toBeGreaterThan(0);
  });

  test("at night the reef fish retire to their own kind of shelter", () => {
    const fish = run([
      { speciesId: "ocellaris-clownfish", count: 2 },
      { speciesId: "firefish", count: 1 },
      { speciesId: "mandarinfish", count: 1 },
    ], 240, "night");
    const shelterOf = (f: FishInstance) => scene.terrain!.shelters!.find((s) => s.id === f.terrainGoal?.shelterId)?.kind;
    const expected: Record<string, string> = {
      "ocellaris-clownfish": "anemone", firefish: "burrow", mandarinfish: "crevice",
    };
    for (const f of fish) {
      expect(f.behaviorMode, f.speciesId).toBe("rest");
      expect(shelterOf(f), f.speciesId).toBe(expected[f.speciesId]);
    }
  });
});

test("fish of different species keep out of each other's bodies", () => {
  const amazon = getTankById("amazon-90")!;
  const amazonScene = getSceneById(amazon.sceneIds[0])!;
  const amazonFrame = getRenderedSurfaceFrame(amazon, amazonScene);
  const run = () => {
    let fish = createFishFromStock([{ speciesId: "angelfish", count: 3 }, { speciesId: "neon-tetra", count: 20 }], amazon)
      .map((f, i) => ({ ...f, id: `${f.speciesId}-${i}`, seed: 5 + i * 31, personality: createFishPersonality(5 + i * 31),
        bodyLengthVariance: 1, behaviorTimeRemainingSec: .6 }));
    let overlaps = 0;
    for (let tick = 0; tick < 1800; tick++) {
      fish = stepSimulation({ tank: amazon, scene: amazonScene, surfaceFrame: amazonFrame,
        fish, species: fishCatalog, structurePoints: [], deltaSec: .1 }).fish;
      const angels = fish.filter((f) => f.speciesId === "angelfish");
      for (const neon of fish.filter((f) => f.speciesId === "neon-tetra")) for (const angel of angels) {
        const distance = Math.hypot(neon.position.x - angel.position.x, neon.position.y - angel.position.y,
          (neon.depth - angel.depth) * amazon.depthCm);
        if (distance < 2) overlaps++;
      }
    }
    return overlaps;
  };
  // 3分間の 3×20 組で、体の中心が2cm以内に重なるのはまれ（間合いなしでは100回前後）。
  expect(run()).toBeLessThan(40);
});
