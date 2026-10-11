import { Texture } from "pixi.js";
import { describe, expect, test } from "bun:test";
import { VERTICES_X, type BodyPlanRenderer, type MotionState, type SwimStyle } from "../render/bodyPlans";
import { seaStarRenderer } from "../render/bodyPlans/seaStar";
import { urchinRenderer } from "../render/bodyPlans/urchin";
import { FishBody, forgetMotionState } from "../render/fishBody";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, LightingId } from "./types";

function setup(tankId: string, speciesId: string, count: number, lighting: LightingId) {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock([{ speciesId, count }], tank).map((f, i) => ({
    ...f, id: `${speciesId}-${i}`, seed: 17 + i * 211, personality: createFishPersonality(17 + i * 211),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[], previous: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      const previous = fish;
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, lighting, deltaSec: .05 }).fish;
      each?.(fish, previous);
    }
  };
  return {
    tank, scene, frame, step,
    get fish() { return fish; },
    set fish(value) { fish = value; },
  };
}

const MOTION: MotionState = {
  phase: 0, amplitude: 0, yaw: 0, yawVelocity: 0, targetYaw: 0, sinceTurnSec: 1, pitch: 0, stridePhase: 0,
  clockSec: 0, detailPhase: 0, flick: 0, stepBlend: 0, swimBlend: 0, lift: 0, burial: 0,
};

/** 正方形の画像のメッシュを、決まった状態で1回変形する。 */
function deformed(renderer: BodyPlanRenderer, swim: Partial<SwimStyle>, motion: Partial<MotionState>,
  fish: Partial<FishInstance> = {}, speed = 0, deltaSec = 0) {
  const width = 200, height = 200, verticesY = renderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) {
    for (let column = 0; column < VERTICES_X; column++) {
      const index = (row * VERTICES_X + column) * 2;
      base[index] = column / (VERTICES_X - 1) * width;
      base[index + 1] = row / (verticesY - 1) * height;
    }
  }
  const positions = new Float32Array(base);
  const style: SwimStyle = { tailBeatHz: .1, bodyWaveStart: .5, waveCount: 2, tailSweepRad: .5, verticalFlex: 0,
    bodyPlan: "seaStar", headStart: 0, mouthAnchor: { x: .5, y: .5 }, footAnchor: { x: .5, y: .5 }, bell: { top: 0, bottom: 1 },
    radial: { x: .5, y: .5, radius: .08, reach: .48 }, ...swim };
  const state = { ...MOTION, ...motion };
  renderer.deform({ positions, base, width, height, pivotX: width / 2, verticesY, swim: style, motion: state },
    { fish: { behaviorMode: "coast", ...fish } as FishInstance, speed, deltaSec, bottomY: 0, bodyLengthCm: 30 });
  const at = (column: number, row: number) => ({ x: positions[(row * VERTICES_X + column) * 2]!,
    y: positions[(row * VERTICES_X + column) * 2 + 1]! });
  return { at, verticesY, motion: state };
}

describe("sea stars and sea urchins", () => {
  test("glide very slowly over the surfaces, resting for long spells", () => {
    for (const [tankId, speciesId, lighting] of [["reef-invertebrates-90", "blue-sea-star", "natural"],
      ["kelp-forest-400", "sunflower-sea-star", "natural"], ["reef-invertebrates-90", "long-spined-sea-urchin", "night"],
      ["northern-reef-240", "northern-sea-urchin", "evening"]] as const) {
      const world = setup(tankId, speciesId, 2, lighting);
      const species = fishCatalog[speciesId]!;
      let frames = 0, moving = 0, still = 0, fastest = 0;
      world.step(900, (fish) => fish.forEach((f) => {
        frames += 1;
        expect(f.surfaceMotion).toBeDefined();
        const speed = Math.hypot(f.velocity.x, f.velocity.y);
        fastest = Math.max(fastest, speed);
        if (speed > 0) moving += 1;
        if (f.behaviorMode === "rest" || f.behaviorMode === "forage") still += 1;
      }));
      // 動く間も、1秒に体の長さの数%しか進まない。
      expect(fastest).toBeLessThan(species.realBodyLengthCm * .05);
      expect(moving).toBeGreaterThan(frames * .1);
      expect(still).toBeGreaterThan(frames * .4);
    }
  });

  test("a sea star ignores a tap on the glass; an urchin stops and bristles its spines", () => {
    const stars = setup("reef-invertebrates-90", "blue-sea-star", 1, "natural");
    stars.step(1);
    const star = stars.fish;
    const after = startleFish({ fish: star, species: fishCatalog, tank: stars.tank, scene: stars.scene, frame: stars.frame,
      point: star[0]!.position, strength: 1, random: () => 0 });
    expect(after[0]).toBe(star[0]);

    const urchins = setup("reef-invertebrates-90", "long-spined-sea-urchin", 1, "night");
    urchins.fish = urchins.fish.map((f) => ({ ...f, surfaceMotion: { sceneId: urchins.scene.id, surfaceId: "front-sand-centre",
      progress: .5, direction: 1, pauseSec: 0, grazing: false, angle: 0 } }));
    urchins.step(.05);
    const walking = urchins.fish[0]!;
    urchins.fish = startleFish({ fish: urchins.fish, species: fishCatalog, tank: urchins.tank, scene: urchins.scene,
      frame: urchins.frame, point: { x: walking.position.x + 2, y: walking.position.y }, strength: 1, random: () => 0 });
    const tapped = urchins.fish[0]!;
    expect(tapped.alarmSec).toBeGreaterThan(0);
    urchins.step(2, (fish) => expect(fish[0]!.position).toEqual(walking.position));
    // 叩かれている間は、棘を震わせる。
    const calm = deformed(urchinRenderer, { bodyPlan: "urchin", tailSweepRad: .06 }, {}, {}, 0, .05);
    const bristling = deformed(urchinRenderer, { bodyPlan: "urchin", tailSweepRad: .06 }, { flick: 1, clockSec: .1 },
      { alarmSec: 2 }, 0, .05);
    expect(bristling.motion.flick).toBeGreaterThan(.9);
    expect(Math.hypot(bristling.at(0, 0).x - calm.at(0, 0).x, bristling.at(0, 0).y - calm.at(0, 0).y)).toBeGreaterThan(.5);
  });

  test("a sea star never mirrors its image and lifts the tips of the arms it leads with", () => {
    const middle = (seaStarRenderer.verticesY - 1) / 2;
    // 腕の先を持ち上げない状態では、斜め上から見下ろして縦に縮むだけ。
    const flat = deformed(seaStarRenderer, { tailSweepRad: 0 }, {});
    expect(flat.at(0, middle).x).toBeCloseTo(0, 6);
    expect(flat.at(VERTICES_X - 1, middle).x).toBeCloseTo(200, 6);
    expect(flat.at(12, seaStarRenderer.verticesY - 1).y - flat.at(12, 0).y).toBeCloseTo(100, 4);
    // 右へ進む（yaw π）とき、右の腕の先は左の腕の先より高く持ち上がる。左へ進むときは逆。画像は反転しない。
    const right = deformed(seaStarRenderer, {}, { yaw: Math.PI, stepBlend: 1 });
    const left = deformed(seaStarRenderer, {}, { yaw: 0, stepBlend: 1 });
    const rise = (mesh: ReturnType<typeof deformed>, column: number) => flat.at(column, middle).y - mesh.at(column, middle).y;
    expect(rise(right, VERTICES_X - 2)).toBeGreaterThan(rise(right, 1) + 2);
    expect(rise(left, 1)).toBeGreaterThan(rise(left, VERTICES_X - 2) + 2);
    expect(right.at(0, middle).x).toBeLessThan(10);
    // 盤の中心は動かない。
    const center = (VERTICES_X - 1) / 2;
    expect(Math.abs(right.at(Math.floor(center), middle).y - flat.at(Math.floor(center), middle).y)).toBeLessThan(.5);
  });

  test("the creature stands on a fixed point that never moves while it walks, turns or sways", () => {
    for (const speciesId of ["blue-sea-star", "long-spined-sea-urchin"]) {
      const tank = getTankById("reef-invertebrates-90")!, species = fishCatalog[speciesId]!;
      const fish = { ...createFishFromStock([{ speciesId, count: 1 }], tank)[0]!, behaviorMode: "coast" as const,
        facing: -1 as const, velocity: { x: -.2, y: 0 } };
      const body = new FishBody(Texture.EMPTY, species, fish);
      body.update(fish, .05, tank.heightCm, 0);
      const pivot = { x: body.mesh.pivot.x, y: body.mesh.pivot.y };
      for (let i = 0; i < 60; i++) body.update({ ...fish, facing: 1, velocity: { x: .2, y: 0 } }, .05, tank.heightCm, 0);
      expect(body.mesh.pivot.x).toBe(pivot.x);
      expect(body.mesh.pivot.y).toBe(pivot.y);
      body.destroy(); forgetMotionState(fish.id);
    }
  });

  test("urchin spines sway around the test while the test itself stays put", () => {
    const swim = { bodyPlan: "urchin" as const, tailSweepRad: .07, radial: { x: .5, y: .45, radius: .14, reach: .42 },
      footAnchor: { x: .5, y: .6 } };
    const early = deformed(urchinRenderer, swim, { clockSec: 0 });
    const later = deformed(urchinRenderer, swim, { clockSec: 2.5 });
    const testRow = Math.round(.45 * (urchinRenderer.verticesY - 1));
    const centerColumn = Math.round((VERTICES_X - 1) / 2);
    expect(later.at(centerColumn, testRow)).toEqual(early.at(centerColumn, testRow));
    // 棘の先（画像の隅に近い所）は動く。
    const moved = Math.hypot(later.at(2, 2).x - early.at(2, 2).x, later.at(2, 2).y - early.at(2, 2).y);
    expect(moved).toBeGreaterThan(1);
    expect(moved).toBeLessThan(40);
  });
});
