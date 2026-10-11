import { describe, expect, test } from "vitest";
import { fishCatalog, getSceneById, getTankById } from "../../core/catalog";
import { createFishFromStock } from "../../core/fishPopulation";
import { stepSurfaceWalker } from "../../core/surfaceMotion";
import type { FishInstance } from "../../core/types";
import { getMotionState, forgetMotionState } from "../motionState";
import { FishBody } from "../fishBody";
import { Texture } from "pixi.js";
import { crabRenderer } from "./crab";
import { VERTICES_X, type BodyMesh, type SwimStyle } from "./types";

let sequence = 0;
function setup(bodyLengthCm = 7) {
  const species = fishCatalog["japanese-mud-crab"]!;
  const tank = getTankById("cold-crabs-180")!;
  const fish: FishInstance = { ...createFishFromStock([{ speciesId: "horsehair-crab", count: 1 }], tank)[0]!,
    id: `crab-pose-${sequence++}`, seed: 0, facing: -1, behaviorMode: "coast", velocity: { x: .56, y: 0 } };
  const width = 720, height = 370, verticesY = crabRenderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) for (let col = 0; col < VERTICES_X; col++) {
    const i = (row * VERTICES_X + col) * 2;
    base[i] = col / (VERTICES_X - 1) * width; base[i + 1] = row / (verticesY - 1) * height;
  }
  const mesh: BodyMesh = { base, positions: new Float32Array(base), width, height, pivotX: width * .42, verticesY,
    swim: { ...species.swim } as SwimStyle, motion: getMotionState(fish) };
  const step = (seconds: number, current = fish, speed = Math.hypot(current.velocity.x, current.velocity.y), fps = 60) => {
    for (let tick = 0; tick < Math.round(seconds * fps); tick++) {
      crabRenderer.deform(mesh, { fish: current, speed, deltaSec: 1 / fps, bodyLengthCm, bottomY: 30 });
    }
  };
  return { mesh, fish, step, clean: () => forgetMotionState(fish.id) };
}
function maxJump(a: Float32Array, b: Float32Array) {
  let maximum = 0;
  for (let i = 0; i < a.length; i += 2) maximum = Math.max(maximum, Math.hypot(a[i]! - b[i]!, a[i + 1]! - b[i + 1]!));
  return maximum;
}

describe("crab walking poses", () => {
  test("equally paced small and large crabs take equally slow steps", () => {
    const small = setup(7), large = setup(70);
    small.step(5, small.fish, .56); large.step(5, large.fish, 5.6);
    expect(small.mesh.motion.strideHz).toBeLessThan(.9);
    expect(large.mesh.motion.stridePhase).toBeCloseTo(small.mesh.motion.stridePhase, 10);
    small.clean(); large.clean();
  });

  test("stopping and restarting do not snap the legs or freeze a lifted foot", () => {
    const { mesh, fish, step, clean } = setup(); step(3);
    const rest = { ...fish, behaviorMode: "rest" as const, velocity: { x: 0, y: 0 } };
    const moving = new Float32Array(mesh.positions);
    step(1 / 60, rest);
    expect(maxJump(moving, mesh.positions)).toBeLessThan(2);
    step(5, rest);
    expect(mesh.motion.stepBlend).toBeLessThan(.0001);
    const resting = new Float32Array(mesh.positions);
    step(1 / 60);
    expect(maxJump(resting, mesh.positions)).toBeLessThan(2);
    expect(mesh.motion.strideHz).toBeLessThan(.1);
    clean();
  });

  test("paused renderers retain the same pose when movement, feeding or alarm changes", () => {
    const { mesh, fish, step, clean } = setup(); step(3);
    const before = new Float32Array(mesh.positions);
    for (const mode of ["rest", "forage", "kick"] as const) {
      crabRenderer.deform(mesh, { fish: { ...fish, behaviorMode: mode, velocity: { x: -.5, y: 0 },
        surfaceMotion: { sceneId: "test", surfaceId: "sand", progress: .4, direction: -1, pauseSec: mode === "rest" ? 5 : 0,
          grazing: mode === "forage", angle: 0, flee: mode === "kick" ? { direction: -1, facing: -1, remainingSec: .3 } : undefined } },
        speed: 0, deltaSec: 0, bodyLengthCm: 7, bottomY: 30 });
      expect(mesh.positions).toEqual(before);
    }
    clean();
  });

  test("30fps and 60fps produce nearly the same walking rhythm", () => {
    const a = setup(), b = setup(); a.step(4, a.fish, .56, 30); b.step(4);
    expect(Math.abs(a.mesh.motion.stridePhase - b.mesh.motion.stridePhase)).toBeLessThan(.05);
    expect(maxJump(a.mesh.positions, b.mesh.positions)).toBeLessThan(2);
    a.clean(); b.clean();
  });

  test("the carapace is not bent by the walking cycle", () => {
    const { mesh, step, clean } = setup();
    const row = 5, col = 12, i = (row * VERTICES_X + col) * 2;
    for (let tick = 0; tick < 180; tick++) {
      step(1 / 60);
      expect(mesh.positions[i]).toBe(mesh.base[i]);
      expect(Math.abs(mesh.positions[i + 1]! - mesh.base[i + 1]!)).toBeLessThan(1);
    }
    clean();
  });

  test("crabs keep stepping on a path that only changes depth", () => {
    const { fish, mesh, step, clean } = setup();
    const tank = getTankById("cold-crabs-180")!, species = fishCatalog["japanese-mud-crab"]!;
    const scene = { ...getSceneById(tank.sceneIds[0]!)!, terrain: { surfaces: [{ id: "depth-only", material: "sand" as const,
      points: [{ x: .5, y: .9, depth: .1 }, { x: .5, y: .9, depth: .9 }] }], shelters: [], occluders: [], avoidAreas: [] } };
    const current = stepSurfaceWalker({ ...fish, surfaceMotion: { sceneId: scene.id, surfaceId: "depth-only", progress: .4,
      direction: 1, pauseSec: 0, grazing: false, angle: 0 } },
    { ...species, ecology: { ...species.ecology, habits: [] } }, tank, scene, { x: 0, y: 0, width: 1, height: 1 }, 1 / 60, 1);
    expect(Math.hypot(current.velocity.x, current.velocity.y)).toBe(0);
    expect(current.surfaceMotion!.speedCmPerSec).toBeGreaterThan(0);
    step(2, current);
    expect(mesh.motion.stepBlend).toBeGreaterThan(.95);
    expect(mesh.motion.stridePhase).toBeGreaterThan(1);
    clean();
  });

  test("walking feet do not move the body's contact pivot", () => {
    const { fish, clean } = setup();
    const species = fishCatalog["japanese-mud-crab"]!;
    const body = new FishBody(Texture.EMPTY, species, fish);
    for (let tick = 0; tick < 180; tick++) {
      body.update(fish, 1 / 60, 30, 0);
      expect(body.mesh.pivot.x).toBe(species.swim!.footAnchor!.x * body.mesh.texture.width);
      expect(body.mesh.pivot.y).toBe(species.swim!.footAnchor!.y * body.mesh.texture.height);
    }
    body.destroy(); clean();
  });

  test("feet move back during stance regardless of facing or sideways travel direction", () => {
    for (const facing of [-1, 1] as const) for (const direction of [-1, 1]) {
      const { mesh, fish, clean } = setup();
      mesh.motion.yaw = facing === 1 ? Math.PI : 0;
      mesh.motion.stepBlend = 1; mesh.motion.strideDirection = direction;
      const i = ((mesh.verticesY - 1) * VERTICES_X + 12) * 2;
      const at = (cycle: number) => {
        mesh.motion.stridePhase = cycle * Math.PI * 2;
        crabRenderer.deform(mesh, { fish: { ...fish, facing, velocity: { x: direction * .56, y: 0 } },
          speed: .56, deltaSec: 0, bodyLengthCm: 7, bottomY: 30 });
        return mesh.positions[i]!;
      };
      const early = at(.1), late = at(.6);
      expect((late - early) * direction).toBeLessThan(-1);
      clean();
    }
  });

  test("feeding ends with resumed leg movement even when the grazing flag remains set", () => {
    const { fish, mesh, step, clean } = setup();
    const tank = getTankById("cold-crabs-180")!, species = fishCatalog["japanese-mud-crab"]!;
    const scene = getSceneById(tank.sceneIds[0]!)!;
    const frame = { x: 0, y: 0, width: 1, height: 1 };
    const definition = { ...species, ecology: { ...species.ecology, habits: [] } };
    let current: FishInstance = { ...fish, behaviorMode: "forage", surfaceMotion: { sceneId: scene.id,
      surfaceId: scene.terrain!.surfaces[0]!.id, progress: .4, direction: 1, pauseSec: .01, grazing: true, angle: 0 } };
    current = stepSurfaceWalker(current, definition, tank, scene, frame, .05, 1);
    current = stepSurfaceWalker(current, definition, tank, scene, frame, .05, 1);
    expect(current.surfaceMotion!.grazing).toBe(true);
    expect(current.behaviorMode).toBe("coast");
    expect(current.surfaceMotion!.speedCmPerSec).toBeGreaterThan(0);
    step(2, current);
    expect(mesh.motion.stepBlend).toBeGreaterThan(.95);
    expect(mesh.motion.stridePhase).toBeGreaterThan(1);
    clean();
  });

  test("leg deformation never folds or inverts the image mesh", () => {
    for (const species of Object.values(fishCatalog).filter(s => s.swim?.bodyPlan === "crab")) {
      const { mesh, fish, clean } = setup(species.realBodyLengthCm);
      mesh.swim = { ...mesh.swim, ...species.swim };
      mesh.motion.stepBlend = 1; mesh.motion.strideDirection = 1;
      for (const alarm of [0, 1]) for (let phase = 0; phase < 40; phase++) {
        mesh.motion.flick = alarm;
        mesh.motion.stridePhase = phase / 40 * Math.PI * 2;
        crabRenderer.deform(mesh, { fish, speed: .56, deltaSec: 0, bodyLengthCm: species.realBodyLengthCm, bottomY: 30 });
        const point = (i: number) => [mesh.positions[i * 2]!, mesh.positions[i * 2 + 1]!] as const;
        const cross = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
          (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
        for (let row = 0; row < mesh.verticesY - 1; row++) for (let col = 0; col < VERTICES_X - 1; col++) {
          const a = row * VERTICES_X + col, b = a + 1, c = a + VERTICES_X, d = c + 1;
          expect(cross(point(a), point(b), point(c)), species.id).toBeGreaterThan(0);
          expect(cross(point(b), point(d), point(c)), species.id).toBeGreaterThan(0);
        }
      }
      clean();
    }
  });
});
