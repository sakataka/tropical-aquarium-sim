import { Texture } from "pixi.js";
import { describe, expect, test } from "vitest";
import { VERTICES_X, type MotionState } from "../render/bodyPlans";
import { rayRenderer } from "../render/bodyPlans/ray";
import { FishBody, forgetMotionState } from "../render/fishBody";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance } from "./types";

function setup(tankId: string, speciesId: string, count: number) {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock([{ speciesId, count }], tank).map((f, i) => ({
    ...f, id: `ray-${i}`, seed: 41 + i * 173, personality: createFishPersonality(41 + i * 173),
  }));
  const step = (seconds: number, each: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .05 }).fish;
      each(fish);
    }
  };
  return { tank, step };
}

function deformedRay(motion: Partial<MotionState>) {
  const width = 200, height = 100, verticesY = rayRenderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) {
    for (let column = 0; column < VERTICES_X; column++) {
      const index = (row * VERTICES_X + column) * 2;
      base[index] = column / (VERTICES_X - 1) * width;
      base[index + 1] = row / (verticesY - 1) * height;
    }
  }
  const positions = new Float32Array(base);
  const swim = { tailBeatHz: 1, bodyWaveStart: .5, waveCount: 1, tailSweepRad: .3, verticalFlex: 0, bodyPlan: "ray" as const,
    headStart: 0, mouthAnchor: { x: 0, y: .5 }, footAnchor: { x: .3, y: .5 }, bell: { top: 0, bottom: 1 } };
  rayRenderer.deform({ positions, base, width, height, pivotX: width * .3, verticesY, swim,
    motion: { phase: 0, amplitude: 0, yaw: 0, yawVelocity: 0, targetYaw: 0, sinceTurnSec: 1, pitch: 0, stridePhase: 0,
      clockSec: 0, detailPhase: 0, flick: 0, stepBlend: 0, swimBlend: 0, lift: 0, burial: 0, ...motion } },
  { fish: {} as FishInstance, speed: 0, deltaSec: 0, bottomY: 0, bodyLengthCm: 50 });
  const at = (column: number, row: number) => ({ x: positions[(row * VERTICES_X + column) * 2]!,
    y: positions[(row * VERTICES_X + column) * 2 + 1]! });
  return { at, verticesY };
}

describe("rays", () => {
  test("stingrays keep near the sand and spend time lying on it", () => {
    const { tank, step } = setup("sand-flats-180", "red-stingray", 2);
    let frames = 0, resting = 0, high = 0;
    step(600, (fish) => fish.forEach((f) => {
      frames += 1;
      if (f.behaviorMode === "rest") resting += 1;
      if (f.position.y < tank.heightCm * .5) high += 1;
    }));
    expect(resting).toBeGreaterThan(frames * .15);
    expect(high).toBeLessThan(frames * .02);
  });

  test("a manta never settles and keeps flying through open water", () => {
    const { step } = setup("kuroshio-2250", "giant-oceanic-manta-ray", 1);
    let frames = 0, moving = 0;
    step(600, (fish) => fish.forEach((f) => {
      frames += 1;
      expect(f.behaviorMode).not.toBe("rest");
      if (Math.hypot(f.velocity.x, f.velocity.y) > 5) moving += 1;
    }));
    expect(moving).toBeGreaterThan(frames * .9);
  });

  test("turning rotates the disc in its own plane instead of mirroring the image", () => {
    const facingLeft = deformedRay({ yaw: 0 });
    const facingRight = deformedRay({ yaw: Math.PI });
    const middle = (facingLeft.verticesY - 1) / 2;
    // 頭（左端）は回りきると右へ、奥の縁（上の行）は手前（下）へ来る。
    expect(facingLeft.at(0, middle).x).toBeLessThan(60);
    expect(facingRight.at(0, middle).x).toBeGreaterThan(60);
    expect(facingLeft.at(8, 0).y).toBeLessThan(50);
    expect(facingRight.at(8, 0).y).toBeGreaterThan(50);
    // 見下ろした円盤なので、体盤の奥行きは縦に縮む。
    expect(facingLeft.at(8, facingLeft.verticesY - 1).y - facingLeft.at(8, 0).y).toBeLessThan(50);
  });

  test("the fin margins lift and fall together while the body axis stays put", () => {
    const up = deformedRay({ amplitude: .5, phase: Math.PI / 2 });
    const down = deformedRay({ amplitude: .5, phase: -Math.PI / 2 });
    const edge = up.verticesY - 1;
    const middle = edge / 2;
    // 体盤の後ろ寄りの縁は、羽ばたきの上下で画面の上下へ動き、中心線は動かない。
    expect(down.at(10, 0).y - up.at(10, 0).y).toBeGreaterThan(5);
    expect(down.at(10, edge).y - up.at(10, edge).y).toBeGreaterThan(5);
    expect(up.at(10, middle).y).toBeCloseTo(down.at(10, middle).y, 6);
  });

  test("a ray stands on the near rim of its disc, and stays put while it turns", () => {
    const tank = getTankById("sand-flats-180")!, species = fishCatalog["red-stingray"]!;
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!, behaviorMode: "rest" as const,
      facing: -1 as const, contact: { angle: 0, kind: "belly" as const, weight: 1 }, velocity: { x: 0, y: 0 } };
    const body = new FishBody(Texture.EMPTY, species, fish);
    body.update(fish, .05, tank.heightCm, 0);
    const pivot = { x: body.mesh.pivot.x, y: body.mesh.pivot.y };
    const positions = body.mesh.geometry.positions;
    let lowest = -Infinity;
    for (let index = 1; index < positions.length; index += 2) lowest = Math.max(lowest, positions[index]!);
    // 位置は体盤のいちばん手前の縁で、それより下へ体がはみ出さない（ひれの縁と尾が揺れる分だけ許す）。
    expect(lowest - pivot.y).toBeLessThan(body.mesh.texture.height * .06);
    for (let i = 0; i < 30; i++) body.update({ ...fish, facing: 1, contact: undefined, behaviorMode: "coast" }, .05, tank.heightCm);
    expect(body.mesh.pivot.x).toBe(pivot.x);
    expect(body.mesh.pivot.y).toBe(pivot.y);
    body.destroy(); forgetMotionState(fish.id);
  });
});
