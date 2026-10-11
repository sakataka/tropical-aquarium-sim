import { describe, expect, test } from "bun:test";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance, LightingId } from "./types";

function setup(count: number, lighting: LightingId) {
  const tank = getTankById("horseshoe-crab-180")!;
  const scene = getSceneById(tank.sceneIds[0]!)!;
  const frame = getRenderedSurfaceFrame(tank, scene);
  let fish = createFishFromStock([{ speciesId: "tri-spine-horseshoe-crab", count }], tank).map((f, i) => ({
    ...f, id: `crab-${i}`, seed: 23 + i * 131, personality: createFishPersonality(23 + i * 131),
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

describe("horseshoe crabs", () => {
  test("crawl the sand at night, facing the way they go, and sometimes burrow and come out again", () => {
    const world = setup(3, "night");
    let walking = 0, burrowed = 0, emerged = 0, wrongWay = 0;
    world.step(900, (fish, previous) => {
      fish.forEach((f, i) => {
        const p = previous[i]!;
        expect(f.surfaceMotion).toBeDefined();
        if (Math.abs(f.velocity.x) > .2) {
          walking += 1;
          if (Math.sign(f.velocity.x) !== f.facing) wrongWay += 1;
        }
        if (f.surfaceMotion!.burrowed) {
          burrowed += 1;
          // 潜っている間は動かない。
          if (p.surfaceMotion?.burrowed) expect(f.position).toEqual(p.position);
        }
        if (p.surfaceMotion?.burrowed && !f.surfaceMotion!.burrowed) emerged += 1;
      });
    });
    expect(walking).toBeGreaterThan(1000);
    expect(wrongWay).toBeLessThan(walking * .02);
    expect(burrowed).toBeGreaterThan(1000);
    expect(emerged).toBeGreaterThan(0);
  });

  test("stop and hunker down when the glass is tapped, but stay put while burrowed", () => {
    const world = setup(1, "night");
    // 手前の砂の上を歩いているところを叩く（奥の個体には振動が届かない）。
    const index = 0;
    world.fish = world.fish.map((f) => ({ ...f, surfaceMotion: { sceneId: world.scene.id, surfaceId: "front-sand-east",
      progress: .5, direction: 1, pauseSec: 0, grazing: false, angle: 0 } }));
    world.step(.05);
    expect(world.fish[index]!.surfaceMotion!.pauseSec).toBe(0);
    expect(world.fish[index]!.depth).toBeLessThan(.3);
    const walking = world.fish[index]!;
    world.fish = startleFish({ fish: world.fish, species: fishCatalog, tank: world.tank, scene: world.scene, frame: world.frame,
      point: { x: walking.position.x + 2, y: walking.position.y }, strength: 1, random: () => 0 });
    const tapped = world.fish[index]!;
    expect(tapped.alarmSec).toBeGreaterThan(0);
    expect(tapped.surfaceMotion!.pauseSec).toBeGreaterThan(tapped.alarmSec!);
    world.step(2.5, (fish) => expect(fish[index]!.position).toEqual(walking.position));
    world.step(5);
    expect(world.fish[index]!.alarmSec).toBeUndefined();

    // 砂に潜っている間は、叩いても何も変わらない。
    world.fish = world.fish.map((f) => ({ ...f, alarmSec: undefined,
      surfaceMotion: { ...f.surfaceMotion!, burrowed: true, pauseSec: 30 } }));
    const buried = world.fish;
    const after = startleFish({ fish: buried, species: fishCatalog, tank: world.tank, scene: world.scene, frame: world.frame,
      point: buried[index]!.position, strength: 1, random: () => 0 });
    expect(after[index]).toBe(buried[index]);
  });

  test("only burrow into sand, never into stone or wood", () => {
    const world = setup(1, "night");
    const stoneScene = { ...world.scene, terrain: { ...world.scene.terrain!,
      surfaces: world.scene.terrain!.surfaces.map((s) => ({ ...s, material: "stone" as const })) } };
    let fish = world.fish;
    let burrowed = 0;
    for (let tick = 0; tick < 600 * 20; tick++) {
      fish = stepSimulation({ tank: world.tank, scene: stoneScene, surfaceFrame: world.frame, fish, species: fishCatalog,
        lighting: "natural", deltaSec: .05 }).fish;
      if (fish[0]!.surfaceMotion?.burrowed) burrowed += 1;
    }
    expect(burrowed).toBe(0);
  });
});
