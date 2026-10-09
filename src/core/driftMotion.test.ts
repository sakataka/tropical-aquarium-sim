import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { bellContraction } from "./driftMotion";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { insideTerrain } from "./terrainMotion";
import type { FishSpeciesDefinition, TankDefinition } from "./types";

// クラゲの種がまだ水槽にないうちも確かめられるよう、既存の魚の定義をクラゲに作り替えて使う。
function jelly(id: string, bell: { top: number; bottom: number }, squeeze = 0.12): FishSpeciesDefinition {
  const base = structuredClone(fishCatalog["silver-barb"]!);
  return {
    ...base, id, realBodyLengthCm: 12,
    sourceBodyBounds: { x: 0, y: 0, width: 600, height: 1000 },
    preferredZone: { minX: 0.1, maxX: 0.9, minY: 0.15, maxY: 0.85 },
    swim: { bodyPlan: "jelly", tailBeatHz: 0.9, tailSweepRad: squeeze, waveCount: 1.2, bell },
    ecology: { ...base.ecology, speedBodyLengthsPerSec: { cruise: 0.25, burst: 0.625 }, habits: [] },
  };
}

const TANK: TankDefinition = { ...getTankById("asia-60")!, widthCm: 60, heightCm: 90, depthCm: 45 };

function swim(species: FishSpeciesDefinition, count: number, seconds: number,
  each?: (fish: ReturnType<typeof createFishFromStock>) => void) {
  const catalog = { [species.id]: species };
  let state = 7;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000;
  let fish = createFishFromStockWith(species, count, random);
  for (let i = 0; i < seconds * 20; i++) {
    fish = stepSimulation({ tank: TANK, species: catalog, fish, deltaSec: 0.05 }).fish;
    each?.(fish);
  }
  return fish;
}

function createFishFromStockWith(species: FishSpeciesDefinition, count: number, random: () => number) {
  // createFishFromStock は catalog の種を引くので、一時的に差し込む。
  (fishCatalog as Record<string, FishSpeciesDefinition>)[species.id] = species;
  try {
    return createFishFromStock([{ speciesId: species.id, count }], TANK, random);
  } finally {
    delete (fishCatalog as Record<string, FishSpeciesDefinition>)[species.id];
  }
}

describe("drifting jellies", () => {
  test("the bell closes quickly and opens slowly", () => {
    expect(bellContraction(0)).toBe(0);
    expect(bellContraction(0.32)).toBeCloseTo(1, 5);
    expect(bellContraction(0.5)).toBeGreaterThan(0.3);
    expect(bellContraction(0.99)).toBeLessThan(0.01);
  });

  test("a jelly rises on its pulses, sinks between them, and never turns around", () => {
    const species = jelly("test-jelly", { top: 0, bottom: 0.3 });
    let minY = Infinity, maxY = -Infinity, rising = 0, sinking = 0;
    const facing = createFishFromStockWith(species, 1, () => 0.5)[0]!.facing;
    swim(species, 1, 240, ([fish]) => {
      minY = Math.min(minY, fish!.position.y);
      maxY = Math.max(maxY, fish!.position.y);
      if (fish!.velocity.y < -0.3) rising += 1;
      if (fish!.velocity.y > 0.3) sinking += 1;
      expect(fish!.facing).toBe(facing);
      expect(Math.abs(fish!.tilt ?? 0)).toBeLessThanOrEqual(0.43);
      expect(fish!.position.y).toBeGreaterThanOrEqual(0);
      expect(fish!.position.y).toBeLessThanOrEqual(TANK.heightCm);
    });
    expect(rising).toBeGreaterThan(50);
    expect(sinking).toBeGreaterThan(50);
    // 水槽の上下を広く使う。
    expect(maxY - minY).toBeGreaterThan(TANK.heightCm * 0.3);
  });

  test("jellies keep their bells apart", () => {
    const species = jelly("test-jelly", { top: 0, bottom: 0.3 });
    let close = 0, samples = 0;
    swim(species, 5, 180, (fish) => {
      for (let a = 0; a < fish.length; a++) for (let b = a + 1; b < fish.length; b++) {
        samples += 1;
        const gap = Math.hypot(fish[a]!.position.x - fish[b]!.position.x, fish[a]!.position.y - fish[b]!.position.y,
          (fish[a]!.depth - fish[b]!.depth) * TANK.depthCm);
        if (gap < species.realBodyLengthCm * 0.4) close += 1;
      }
    });
    expect(close / samples).toBeLessThan(0.05);
  });

  test("an upside-down jelly stays on the bottom and pulses in place", () => {
    const species = jelly("test-upside-down", { top: 0.65, bottom: 1 });
    const [fish] = swim(species, 1, 120);
    const heightCm = species.realBodyLengthCm * fish!.bodyLengthVariance * 1000 / 600;
    expect(fish!.position.y).toBeGreaterThan(TANK.heightCm - TANK.safeMarginCm - heightCm);
    expect(fish!.behaviorMode).toBe("rest");
  });

  test("an upside-down jelly sinking onto a rock lies on the rock instead of sinking into it", () => {
    const species = jelly("test-upside-down", { top: 0.65, bottom: 1 });
    const scene = { ...getSceneById("cube-stones")!, terrain: { surfaces: [], occluders: [], obstacles: [
      { id: "rock", center: { x: .5, y: .95, depth: .5 }, radius: { x: .25, y: .15 }, depthRadius: .6 }] } };
    const context = { tank: TANK, scene, species, frame: { x: 0, y: 0, width: 1, height: 1 } };
    let fish = createFishFromStockWith(species, 1, () => 0.5).map((f) => ({ ...f, position: { x: 30, y: 50 }, depth: .5 }));
    for (let i = 0; i < 120 * 20; i++) {
      const previous = fish[0]!;
      fish = stepSimulation({ tank: TANK, scene, species: { [species.id]: species }, fish, deltaSec: 0.05 }).fish;
      expect(insideTerrain(fish[0]!.position, fish[0]!.depth, context)).toBe(false);
      expect(Math.hypot(fish[0]!.position.x - previous.position.x, fish[0]!.position.y - previous.position.y)).toBeLessThan(0.2);
    }
    expect(fish[0]!.behaviorMode).toBe("rest");
    // 岩の上面（回避領域の上端）の近くまで降りて止まる。
    const rockTop = TANK.heightCm * (.95 - .15) - species.realBodyLengthCm * .2;
    expect(fish[0]!.position.y).toBeGreaterThan(rockTop - 0.5);
  });

  test("jellies do not react to a tap on the glass", () => {
    const species = jelly("test-jelly", { top: 0, bottom: 0.3 });
    const fish = createFishFromStockWith(species, 3, () => 0.5);
    const after = startleFish({ fish, species: { [species.id]: species }, tank: TANK,
      frame: { x: 0, y: 0, width: 1, height: 1 }, point: fish[0]!.position, strength: 1, random: () => 0 });
    expect(after).toEqual(fish);
  });
});
