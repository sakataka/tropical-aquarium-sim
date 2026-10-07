import { describe, expect, test } from "vitest";
import { Texture } from "pixi.js";
import { fishCatalog, getTankById } from "../core/catalog";
import { createFishFromStock } from "../core/fishPopulation";
import { FishBody, forgetMotionState } from "./fishBody";
import { sampleMeshPoint, stepTurnSpring } from "./fishMotion";

describe("continuous fish poses", () => {
  test("a turn remains bounded at 4fps and agrees with 60fps", () => {
    const run = (steps: number) => {
      let state = { value: 0, velocity: 0 };
      for (let i = 0; i < steps; i++) {
        state = stepTurnSpring(state.value, state.velocity, Math.PI, 1 / steps);
        expect(state.value).toBeGreaterThanOrEqual(0);
        expect(state.value).toBeLessThanOrEqual(Math.PI);
      }
      return state;
    };
    expect(run(4).value).toBeCloseTo(run(60).value, 12);
    expect(run(4).velocity).toBeCloseTo(run(60).velocity, 12);
  });

  test.each([-1, 1] as const)("the deformed mouth stays on its anchor while facing %s", (facing) => {
    const tank = getTankById("cube-30")!, species = fishCatalog.otocinclus!;
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!, facing,
      contact: { angle: .4, kind: "mouth" as const, weight: 1 }, velocity: { x: 0, y: 0 } };
    const body = new FishBody(Texture.EMPTY, species, fish);
    for (let i = 0; i < 20; i++) body.update(fish, .05, 29, .4);
    const mouth = species.swim!.mouthAnchor!;
    const point = sampleMeshPoint(body.mesh.geometry.positions, 26, 5, mouth.x, mouth.y);
    expect(body.mesh.pivot.x).toBeCloseTo(point.x, 10);
    expect(body.mesh.pivot.y).toBeCloseTo(point.y, 10);
    body.destroy(); forgetMotionState(fish.id);
  });

  test("shrimp appendages do not jitter when simulation randomness advances", () => {
    const tank = getTankById("japan-60")!, species = fishCatalog["amano-shrimp"]!;
    const fish = createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!;
    const body = new FishBody(Texture.EMPTY, species, fish);
    body.update(fish, .05, 29);
    const before = new Float32Array(body.mesh.geometry.positions);
    body.update({ ...fish, seed: fish.seed + 152467 }, 0, 29);
    expect(body.mesh.geometry.positions).toEqual(before);
    body.destroy(); forgetMotionState(fish.id);
  });

  test("switching from mouth to belly contact does not jump the mesh pivot", () => {
    const tank = getTankById("cube-30")!, species = fishCatalog.otocinclus!;
    const fish = { ...createFishFromStock([{ speciesId: species.id, count: 1 }], tank)[0]!,
      contact: { angle: 0, kind: "mouth" as const, weight: 1 }, velocity: { x: 0, y: 0 } };
    const body = new FishBody(Texture.EMPTY, species, fish);
    body.update(fish, .05, 29, 0);
    const previous = { x: body.mesh.pivot.x, y: body.mesh.pivot.y };
    body.update({ ...fish, contact: { ...fish.contact, kind: "belly" } }, .01, 29, 0);
    expect(Math.hypot(body.mesh.pivot.x - previous.x, body.mesh.pivot.y - previous.y)).toBeLessThan(.05 * body.mesh.texture.width);
    body.destroy(); forgetMotionState(fish.id);
  });
});
