import { Texture } from "pixi.js";
import { describe, expect, test } from "vitest";
import { VERTICES_X, type MotionState, type SwimStyle } from "../render/bodyPlans";
import { gastropodRenderer } from "../render/bodyPlans/gastropod";
import { FishBody, forgetMotionState } from "../render/fishBody";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, LightingId } from "./types";

const PLACEMENTS = [
  ["japan-60", "dusky-nerite"],
  ["goldfish-90", "chinese-mystery-snail"],
  ["rice-paddy-60", "japanese-mystery-snail"],
  ["brackish-45", "zebra-nerite"],
  ["reef-invertebrates-90", "festive-hypselodoris"],
] as const;

function setup(tankId: string, speciesId: string, count: number, lighting: LightingId = "natural") {
  const tank = getTankById(tankId)!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock([{ speciesId, count }], tank).map((f, i) => ({
    ...f, id: `${speciesId}-${i}`, seed: 31 + i * 197, personality: createFishPersonality(31 + i * 197),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, lighting, deltaSec: .05 }).fish;
      each?.(fish);
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

const SNAIL: Partial<SwimStyle> = {
  tailSweepRad: .2, verticalFlex: .004, waveCount: 1.5, footAnchor: { x: .5, y: .95 },
  shell: [{ x: .62, y: .45, rx: .36, ry: .4 }],
  feelers: [{ kind: "tentacle", base: { x: .2, y: .6 }, tip: { x: .02, y: .4 }, width: .04 }],
};
const SLUG: Partial<SwimStyle> = {
  tailSweepRad: .12, verticalFlex: .012, waveCount: 2.5, footAnchor: { x: .45, y: .93 },
  feelers: [{ kind: "rhinophore", base: { x: .12, y: .5 }, tip: { x: .08, y: .1 }, width: .04 },
    { kind: "gill", base: { x: .7, y: .4 }, tip: { x: .74, y: .05 }, width: .07 }],
};

/** 200×100 の画像のメッシュを、決まった状態で1回変形する。 */
function deformed(swim: Partial<SwimStyle>, motion: Partial<MotionState>, fish: Partial<FishInstance> = {}, speed = 0) {
  const width = 200, height = 100, verticesY = gastropodRenderer.verticesY;
  const base = new Float32Array(VERTICES_X * verticesY * 2);
  for (let row = 0; row < verticesY; row++) {
    for (let column = 0; column < VERTICES_X; column++) {
      const index = (row * VERTICES_X + column) * 2;
      base[index] = column / (VERTICES_X - 1) * width;
      base[index + 1] = row / (verticesY - 1) * height;
    }
  }
  const positions = new Float32Array(base);
  const style: SwimStyle = { tailBeatHz: .4, bodyWaveStart: .5, waveCount: 1, tailSweepRad: .2, verticalFlex: 0,
    bodyPlan: "gastropod", headStart: 0, mouthAnchor: { x: .1, y: .8 }, footAnchor: { x: .5, y: .95 },
    bell: { top: 0, bottom: 1 }, ...swim };
  const state = { ...MOTION, ...motion };
  gastropodRenderer.deform({ positions, base, width, height, pivotX: width * style.footAnchor.x, verticesY, swim: style, motion: state },
    { fish: { behaviorMode: "coast", ...fish } as FishInstance, speed, deltaSec: 0, bottomY: 0, bodyLengthCm: 4 });
  /** 画像の比率 (u, v) に最も近い頂点の位置。 */
  const at = (u: number, v: number) => {
    const column = Math.round(u * (VERTICES_X - 1)), row = Math.round(v * (verticesY - 1));
    const index = (row * VERTICES_X + column) * 2;
    return { x: positions[index]!, y: positions[index + 1]!, baseX: base[index]!, baseY: base[index + 1]! };
  };
  return { at, motion: state };
}

describe("snails and sea slugs", () => {
  test("crawl very slowly over the surfaces of their tanks and stop for long spells", () => {
    for (const [tankId, speciesId] of PLACEMENTS) {
      const world = setup(tankId, speciesId, 2);
      const species = fishCatalog[speciesId]!;
      expect(species.swim?.bodyPlan, speciesId).toBe("gastropod");
      expect(world.tank.defaultStock.some((stock) => stock.speciesId === speciesId), tankId).toBe(true);
      let frames = 0, moving = 0, still = 0, fastest = 0;
      world.step(600, (fish) => fish.forEach((f) => {
        frames += 1;
        expect(f.surfaceMotion, speciesId).toBeDefined();
        const speed = Math.hypot(f.velocity.x, f.velocity.y);
        fastest = Math.max(fastest, speed);
        if (speed > 0) moving += 1;
        if (f.behaviorMode === "rest" || f.behaviorMode === "forage") still += 1;
      }));
      // 速くても1秒に体の長さの1割ほど（数mm）しか進まない。
      expect(fastest, speciesId).toBeLessThan(species.realBodyLengthCm * .12);
      expect(moving, speciesId).toBeGreaterThan(frames * .1);
      expect(still, speciesId).toBeGreaterThan(frames * .2);
    }
  });

  test("a tapped snail stays withdrawn in its shell for a while before it crawls on", () => {
    const world = setup("rice-paddy-60", "japanese-mystery-snail", 1);
    world.fish = world.fish.map((f) => ({ ...f, surfaceMotion: { sceneId: world.scene.id, surfaceId: "mud-front",
      progress: .5, direction: 1, pauseSec: 0, grazing: false, angle: 0 } }));
    world.step(.05);
    const before = world.fish[0]!;
    world.fish = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene, frame: world.frame,
      point: { x: before.position.x + 2, y: before.position.y }, strength: 1, random: () => 0 });
    const tapped = world.fish[0]!;
    // 巻貝は殻に6秒以上こもり、体を出しきるまで（4秒ほど）は動かない。
    expect(tapped.alarmSec).toBeGreaterThanOrEqual(6);
    expect(tapped.surfaceMotion!.pauseSec).toBeGreaterThanOrEqual(10);
    world.step(9.5, (fish) => expect(fish[0]!.position).toEqual(before.position));
  });

  test("the shell stays put while the head and foot stretch and the tentacles sway", () => {
    const early = deformed(SNAIL, { stepBlend: 1, stridePhase: Math.PI / 2, clockSec: 0 }, {}, .2);
    const later = deformed(SNAIL, { stepBlend: 1, stridePhase: -Math.PI / 2, clockSec: 1.3 }, {}, .2);
    // 殻の中ほどは、足の上のかすかな揺れ（画像の横幅の1.5%未満）しか動かない。
    const shell = (mesh: ReturnType<typeof deformed>) => mesh.at(.62, .4);
    expect(Math.abs(shell(early).x - shell(later).x)).toBeLessThan(3);
    expect(Math.abs(shell(early).y - shell(later).y)).toBeLessThan(1);
    // 頭は這う拍で前後し、触角の先は揺れる。
    const head = (mesh: ReturnType<typeof deformed>) => mesh.at(.12, .75);
    expect(head(early).x).toBeLessThan(head(later).x - 2);
    const tip = (mesh: ReturnType<typeof deformed>) => mesh.at(.04, .4);
    expect(Math.hypot(tip(early).x - tip(later).x, tip(early).y - tip(later).y)).toBeGreaterThan(1);
  });

  test("a withdrawing snail pulls its head into the shell and sets the shell down", () => {
    const out = deformed(SNAIL, {});
    const inside = deformed(SNAIL, { flick: 1 }, { alarmSec: 3 });
    // 触角の先と頭は殻の楕円の中へ集まる。
    const ellipse = (point: { x: number; y: number }, drop: number) =>
      Math.hypot((point.x - .62 * 200) / (.36 * 200), (point.y - drop - .45 * 100) / (.4 * 100));
    const drop = (.95 - (.45 + .4)) * 100;
    expect(ellipse(out.at(.04, .4), 0)).toBeGreaterThan(1.5);
    expect(ellipse(inside.at(.04, .4), drop)).toBeLessThan(1);
    expect(ellipse(inside.at(.12, .75), drop)).toBeLessThan(1);
    // 殻は足の裏の高さまで下りる。
    expect(inside.at(.62, .4).y - out.at(.62, .4).y).toBeCloseTo(drop, 4);
  });

  test("a disturbed sea slug draws in its rhinophores and gill and rounds up", () => {
    const calm = deformed(SLUG, {});
    const startled = deformed(SLUG, { flick: 1 }, { alarmSec: 3 });
    const rhinophoreTip = (mesh: ReturnType<typeof deformed>) => mesh.at(.08, .13);
    const gillTip = (mesh: ReturnType<typeof deformed>) => mesh.at(.74, .07);
    // 触角と鰓の先は付け根へ縮む。
    expect(rhinophoreTip(startled).y - rhinophoreTip(calm).y).toBeGreaterThan(20);
    expect(gillTip(startled).y - gillTip(calm).y).toBeGreaterThan(15);
    // 体は短くなる（尾の先が中心へ寄る）。
    expect(calm.at(1, .7).x - startled.at(1, .7).x).toBeGreaterThan(10);
  });

  test("stands on its foot, a fixed point that never moves while it crawls, turns or withdraws", () => {
    for (const [tankId, speciesId] of PLACEMENTS) {
      const tank = getTankById(tankId)!, species = fishCatalog[speciesId]!;
      const fish = { ...createFishFromStock([{ speciesId, count: 1 }], tank)[0]!, behaviorMode: "coast" as const,
        facing: -1 as const, velocity: { x: -.2, y: 0 } };
      const body = new FishBody(Texture.EMPTY, species, fish);
      body.update(fish, .05, tank.heightCm, 0);
      const pivot = { x: body.mesh.pivot.x, y: body.mesh.pivot.y };
      for (let i = 0; i < 60; i++) {
        body.update({ ...fish, facing: 1, velocity: { x: .2, y: 0 }, alarmSec: i > 30 ? 2 : undefined }, .05, tank.heightCm, 0);
      }
      expect(body.mesh.pivot.x).toBe(pivot.x);
      expect(body.mesh.pivot.y).toBe(pivot.y);
      body.destroy(); forgetMotionState(fish.id);
    }
  });
});
