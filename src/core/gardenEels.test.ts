import { describe, expect, test } from "bun:test";
import { VERTICES_X, type MotionState } from "../render/bodyPlans";
import { gardenEelRenderer } from "../render/bodyPlans/gardenEel";
import { burrowPosition } from "./burrowMotion";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { insideTerrain } from "./terrainMotion";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, LightingId } from "./types";

const EELS = ["spotted-garden-eel", "splendid-garden-eel"];

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// 同じ乱数から生むので、エイやウツボがいつ巣穴の上を通るかも毎回同じになる。
function setup() {
  const tank = getTankById("sand-eels-120")!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock(tank.defaultStock, tank, seededRandom(5)).map((f, i) => ({
    ...f, id: `${f.speciesId}-${i}`, seed: 71 + i * 211, personality: createFishPersonality(71 + i * 211),
  }));
  const step = (seconds: number, lighting: LightingId = "natural", each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, lighting, deltaSec: .05 }).fish;
      each?.(fish);
    }
  };
  const eels = () => fish.filter((f) => EELS.includes(f.speciesId));
  return { tank, scene, frame, step, eels, get fish() { return fish; }, set fish(next) { fish = next; } };
}

function deformedEel(emerge: number, motion: Partial<MotionState> = {}) {
  const width = 100, height = 300, verticesY = gardenEelRenderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) {
    for (let column = 0; column < VERTICES_X; column++) {
      const index = (row * VERTICES_X + column) * 2;
      base[index] = column / (VERTICES_X - 1) * width;
      base[index + 1] = row / (verticesY - 1) * height;
    }
  }
  const positions = new Float32Array(base);
  const swim = { tailBeatHz: 1, bodyWaveStart: .5, waveCount: 1, tailSweepRad: .3, verticalFlex: 0, bodyPlan: "gardenEel" as const,
    headStart: 0, mouthAnchor: { x: 0, y: .5 }, footAnchor: { x: .5, y: 1 }, bell: { top: 0, bottom: 1 },
    spine: [{ x: .6, y: .25 }, { x: .62, y: .6 }, { x: .7, y: .98 }] };
  const pivot = gardenEelRenderer.pivot!({ width, height, swim });
  gardenEelRenderer.deform({ positions, base, width, height, pivotX: pivot.x, verticesY, swim,
    motion: { phase: 0, amplitude: 0, yaw: 0, yawVelocity: 0, targetYaw: 0, sinceTurnSec: 1, pitch: 0, stridePhase: 0,
      clockSec: 0, detailPhase: 1, flick: 0, stepBlend: 0, swimBlend: 0, lift: 0, burial: 0, ...motion } },
  { fish: { burrowHome: { emerge } } as FishInstance, speed: 0, deltaSec: 0, bottomY: 0, bodyLengthCm: 12 });
  let top = Infinity, bottom = -Infinity, headX = 0;
  for (let index = 0; index < positions.length; index += 2) {
    bottom = Math.max(bottom, positions[index + 1]!);
    if (positions[index + 1]! < top) { top = positions[index + 1]!; headX = positions[index]!; }
  }
  return { top, bottom, headX, pivot };
}

describe("garden eels", () => {
  test("each eel keeps its own burrow on open sand, spaced apart from its neighbours", () => {
    const world = setup();
    world.step(1);
    const first = world.eels().map((f) => ({ ...f.position, depth: f.depth }));
    const outSec = new Map<string, number>();
    // 大きな魚が上を通る間は首を低くするが、ほとんどの時間は体を出している。
    world.step(60, "natural", (fish) => fish.forEach((f) => {
      if ((f.burrowHome?.emerge ?? 0) > .3) outSec.set(f.id, (outSec.get(f.id) ?? 0) + .05);
    }));
    const eels = world.eels();
    expect(eels).toHaveLength(8);
    for (const [i, eel] of eels.entries()) {
      // 巣穴の口から動かない。
      expect(eel.position.x).toBeCloseTo(first[i]!.x, 6);
      expect(eel.position.y).toBeCloseTo(first[i]!.y, 6);
      expect(insideTerrain(eel.position, eel.depth, { ...world, species: fishCatalog[eel.speciesId]! })).toBe(false);
      expect(outSec.get(eel.id) ?? 0, eel.id).toBeGreaterThan(36);
      for (const other of eels.slice(i + 1)) {
        const gap = Math.hypot(eel.position.x - other.position.x, (eel.depth - other.depth) * world.tank.depthCm);
        expect(gap).toBeGreaterThan(15);
      }
    }
    // 巣穴の口は、水景の画像の座標から同じ位置に戻せる。
    const home = eels[0]!.burrowHome!;
    expect(burrowPosition(home, world).position.x).toBeCloseTo(eels[0]!.position.x, 6);
  });

  test("the colony mostly faces the same way, into the current", () => {
    const world = setup();
    world.step(60);
    let agreeing = 0, counted = 0;
    world.step(120, "natural", (fish) => {
      const facings = fish.filter((f) => EELS.includes(f.speciesId)).map((f) => f.facing);
      agreeing += Math.max(facings.filter((f) => f === 1).length, facings.filter((f) => f === -1).length);
      counted += facings.length;
    });
    expect(agreeing / counted).toBeGreaterThan(.75);
  });

  test("a tap sends them down their burrows, and they slowly come back out", () => {
    const world = setup();
    world.step(60);
    const eel = world.eels()[0]!;
    world.fish = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene, frame: world.frame,
      point: { x: eel.position.x, y: eel.position.y - 10 }, strength: 1, random: () => 0 });
    world.step(1);
    const hidden = world.eels().find((f) => f.id === eel.id)!;
    expect(hidden.burrowHome!.emerge).toBeLessThan(.05);
    expect(hidden.behaviorMode).toBe("rest");
    // しばらくは顔だけ出して様子をうかがう。
    world.step(4);
    expect(world.eels().find((f) => f.id === eel.id)!.burrowHome!.emerge).toBeLessThan(.25);
    world.step(30);
    expect(world.eels().find((f) => f.id === eel.id)!.burrowHome!.emerge).toBeGreaterThan(.4);
  });

  test("they stay down in their burrows in the dark", () => {
    const world = setup();
    world.step(60);
    world.step(30, "night");
    for (const eel of world.eels()) expect(eel.burrowHome!.emerge).toBeLessThan(.05);
  });

  test("a big fish passing over a burrow makes that eel duck", () => {
    const world = setup();
    world.step(60);
    const eel = world.eels()[0]!;
    const ray = world.fish.find((f) => f.speciesId === "bluespotted-ribbontail-ray")!;
    let lowest = 1;
    for (let i = 0; i < 40; i++) {
      // 泳いでいるエイを、巣穴の真上に置き続ける。
      world.fish = world.fish.map((f) => f.id === ray.id
        ? { ...f, position: { x: eel.position.x, y: eel.position.y - 8 }, depth: eel.depth, velocity: { x: 8, y: 0 } } : f);
      world.step(.05);
      lowest = Math.min(lowest, world.eels().find((f) => f.id === eel.id)!.burrowHome!.emerge);
    }
    expect(lowest).toBeLessThan(.25);
  });

  test("the body rises from the burrow mouth and everything below the sand is hidden", () => {
    const out = deformedEel(.8);
    const down = deformedEel(0);
    // 巣穴の口（メッシュの下端の中央）より下へははみ出さない。
    expect(out.bottom).toBeLessThanOrEqual(out.pivot.y + 1e-3);
    expect(out.top).toBeLessThan(out.pivot.y - 150);
    // 引っ込むと、体は砂の線に潰れて見えない。
    expect(down.top).toBeGreaterThan(down.pivot.y - 1);
    // 向きを変えると、頭は巣穴の口をはさんで反対側へ回る。
    const turned = deformedEel(.8, { yaw: Math.PI, targetYaw: Math.PI });
    expect(Math.sign(out.headX - out.pivot.x)).toBe(-Math.sign(turned.headX - out.pivot.x));
  });
});
