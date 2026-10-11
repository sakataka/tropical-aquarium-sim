import { Texture } from "pixi.js";
import { describe, expect, test } from "bun:test";
import { VERTICES_X, type MotionState } from "../render/bodyPlans";
import { deformFrogAt, frogRenderer } from "../render/bodyPlans/frog";
import { FishBody, forgetMotionState } from "../render/fishBody";
import { getMotionState } from "../render/motionState";
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
    ...f, id: `frog-${i}`, seed: 53 + i * 211, personality: createFishPersonality(53 + i * 211),
  }));
  const step = (seconds: number, each: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .05 }).fish;
      each(fish);
    }
  };
  return { tank, step };
}

/** ヒメツメガエルの画像の大きさのメッシュを、後脚の伸び（stroke）と向き（yaw）を決めて変形する。 */
function deformedFrog(stroke: number, motion: Partial<MotionState> = {}) {
  const species = fishCatalog["african-dwarf-frog"]!;
  const width = 720, height = 385, verticesY = frogRenderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) {
    for (let column = 0; column < VERTICES_X; column++) {
      base[(row * VERTICES_X + column) * 2] = column / (VERTICES_X - 1) * width;
      base[(row * VERTICES_X + column) * 2 + 1] = row / (verticesY - 1) * height;
    }
  }
  const positions = new Float32Array(base);
  const swim = { tailBeatHz: 1, bodyWaveStart: .5, waveCount: 1, tailSweepRad: .3, verticalFlex: 0, bodyPlan: "frog" as const,
    headStart: 0, mouthAnchor: { x: 0, y: .5 }, footAnchor: { x: .4, y: .5 }, bell: { top: 0, bottom: 1 }, ...species.swim };
  deformFrogAt({ positions, base, width, height, pivotX: 0, verticesY, swim,
    motion: { phase: 0, amplitude: 0, yaw: 0, yawVelocity: 0, targetYaw: 0, sinceTurnSec: 1, pitch: 0, stridePhase: 0,
      clockSec: 0, detailPhase: 1, flick: 0, stepBlend: 0, swimBlend: 0, lift: 0, burial: 0, ...motion } },
  { fish: {} as FishInstance, speed: 0, deltaSec: 0, bottomY: 0, bodyLengthCm: 5 }, stroke);
  const at = (u: number, v: number) => {
    const column = Math.round(u * (VERTICES_X - 1)), row = Math.round(v * (verticesY - 1));
    return { x: positions[(row * VERTICES_X + column) * 2]!, y: positions[(row * VERTICES_X + column) * 2 + 1]! };
  };
  return { at, positions };
}

describe("frogs", () => {
  test("a kick straightens both hind legs behind the body, and recovery folds them up beside it", () => {
    const extended = deformedFrog(1), relaxed = deformedFrog(0), flexed = deformedFrog(-1);
    // 後脚の足先（画像の右上と右下の水かき）。
    const upperToe = (frog: ReturnType<typeof deformedFrog>) => frog.at(.94, .17);
    const lowerToe = (frog: ReturnType<typeof deformedFrog>) => frog.at(.93, .86);
    // 伸ばしきると、足先は体の後ろへ遠く伸び、左右の足が中心線へ寄る。
    expect(upperToe(extended).x).toBeGreaterThan(upperToe(relaxed).x + 20);
    expect(lowerToe(extended).y - upperToe(extended).y).toBeLessThan(lowerToe(relaxed).y - upperToe(relaxed).y);
    // たたむと、足先は体の脇へ引き寄せられる。
    expect(upperToe(flexed).x).toBeLessThan(upperToe(relaxed).x - 40);
    expect(lowerToe(flexed).x).toBeLessThan(lowerToe(relaxed).x - 40);
    // 胴と頭はほとんど動かない（脚の付け根の重みがわずかに混ざる）。
    expect(extended.at(.3, .5).x).toBeCloseTo(flexed.at(.3, .5).x, 0);
    expect(extended.at(0, .5).y).toBeCloseTo(flexed.at(0, .5).y, 0);
  });

  test("turning rotates the frog in its own plane instead of mirroring the image", () => {
    const left = deformedFrog(0, { yaw: 0 }), right = deformedFrog(0, { yaw: Math.PI });
    const center = .4 * 720;
    expect(left.at(0, .5).x).toBeLessThan(center);
    expect(right.at(0, .5).x).toBeGreaterThan(center);
    // 見下ろした姿なので、体の左右の幅は縦に縮む。
    expect(left.at(.4, 1).y - left.at(.4, 0).y).toBeLessThan(385 * .6);
  });

  test("the legs extend when the simulation kicks, glide, then fold again while coasting", () => {
    const tank = getTankById("killifish-45")!, species = fishCatalog["african-dwarf-frog"]!;
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!, id: "frog-stroke",
      velocity: { x: -2, y: 0 } };
    const body = new FishBody(Texture.EMPTY, species, fish);
    const motion = getMotionState(fish);
    for (let i = 0; i < 20; i++) body.update({ ...fish, behaviorMode: "coast" }, .05, tank.heightCm);
    expect(motion.stroke!).toBeLessThan(-.5);
    for (let i = 0; i < 4; i++) body.update({ ...fish, behaviorMode: "kick" }, .05, tank.heightCm);
    expect(motion.stroke!).toBeGreaterThan(.85);
    for (let i = 0; i < 6; i++) body.update({ ...fish, behaviorMode: "coast" }, .05, tank.heightCm);
    expect(motion.stroke!).toBeGreaterThan(.85);
    for (let i = 0; i < 20; i++) body.update({ ...fish, behaviorMode: "coast" }, .05, tank.heightCm);
    expect(motion.stroke!).toBeLessThan(-.4);
    body.destroy(); forgetMotionState(fish.id);
  });

  test("dwarf frogs swim up to breathe and also rest on the bottom", () => {
    const { tank, step } = setup("killifish-45", "african-dwarf-frog", 3);
    let breaths = 0, resting = 0, frames = 0;
    const atSurface = new Set<string>();
    step(600, (fish) => fish.forEach((f) => {
      frames += 1;
      if (f.behaviorMode === "rest") resting += 1;
      const surfacing = f.targetKind === "surfaceVisit" && f.position.y < tank.heightCm * .2;
      if (surfacing && !atSurface.has(f.id)) breaths += 1;
      if (surfacing) atSurface.add(f.id); else atSurface.delete(f.id);
    }));
    expect(breaths).toBeGreaterThan(3);
    expect(resting).toBeGreaterThan(frames * .08);
  });

  test("a Surinam toad spends most of its time lying still near the bottom", () => {
    const { tank, step } = setup("amazon-flooded-forest-240", "surinam-toad", 1);
    let resting = 0, high = 0, frames = 0;
    step(900, (fish) => fish.forEach((f) => {
      frames += 1;
      if (f.behaviorMode === "rest") resting += 1;
      if (f.position.y < tank.heightCm * .5 && f.targetKind !== "surfaceVisit" && f.targetKind !== "descend") high += 1;
    }));
    expect(resting).toBeGreaterThan(frames * .4);
    expect(high).toBeLessThan(frames * .05);
  });
});
