import { describe, expect, test } from "bun:test";
import { getBodyPlan } from "./bodyPlans";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import { startleFish } from "./startle";
import { getRenderedSurfaceFrame } from "./testContent";
import type { FishInstance } from "./types";

const tank = getTankById("clione-30")!;
const scene = getSceneById("clione-30")!;
const frame = getRenderedSurfaceFrame(tank, scene);
const clione = fishCatalog["naked-sea-butterfly"]!;

function setup(count: number, seed = 7) {
  let fish = createFishFromStock([{ speciesId: clione.id, count }], tank).map((f, i) => ({
    ...f, id: `clione-${i}`, seed: seed + i * 131, personality: createFishPersonality(seed + i * 131),
  }));
  const step = (seconds: number, each?: (fish: FishInstance[]) => void) => {
    for (let tick = 0; tick < seconds * 20; tick++) {
      fish = stepSimulation({ tank, scene, surfaceFrame: frame, fish, species: fishCatalog, deltaSec: .05 }).fish;
      each?.(fish);
    }
    return fish;
  };
  const tap = (point: { x: number; y: number }) => {
    fish = startleFish({ fish, species: fishCatalog, tank, scene, frame, point, strength: 1, random: () => 0 });
    return fish;
  };
  return { step, tap, get fish() { return fish; } };
}

describe("sea angels", () => {
  test("drift by flapping their wings and say where the wings are", () => {
    expect(clione.swim?.bodyPlan).toBe("pteropod");
    expect(getBodyPlan(clione).drifts).toBe(true);
    expect(getBodyPlan(clione).flaps).toBe(true);
    const wings = clione.swim!.wings!;
    expect(wings.top).toBeLessThanOrEqual(wings.y);
    expect(wings.y).toBeLessThanOrEqual(wings.bottom);
  });

  test("keep flapping without pausing, lean toward where they go, and never turn the image around", () => {
    const world = setup(1);
    const facing = world.fish[0]!.facing;
    let minY = Infinity, maxY = -Infinity, slow = 0, leaning = 0, samples = 0;
    world.step(240, ([fish]) => {
      samples += 1;
      minY = Math.min(minY, fish!.position.y);
      maxY = Math.max(maxY, fish!.position.y);
      const speed = Math.hypot(fish!.velocity.x, fish!.velocity.y);
      if (speed < clione.realBodyLengthCm * 0.05) slow += 1;
      if (Math.abs(fish!.tilt ?? 0) > 0.3) leaning += 1;
      expect(fish!.facing).toBe(facing);
      expect(Math.abs(fish!.tilt ?? 0)).toBeLessThanOrEqual(0.81);
      expect(fish!.position.y).toBeGreaterThanOrEqual(0);
      expect(fish!.position.y).toBeLessThanOrEqual(tank.heightCm);
    });
    // 羽ばたきは途切れないので、ほとんど止まらない。
    expect(slow / samples).toBeLessThan(0.1);
    expect(leaning / samples).toBeGreaterThan(0.05);
    expect(maxY - minY).toBeGreaterThan(tank.heightCm * 0.3);
  });

  test("flap faster and swim away when the glass is tapped, then drift again", () => {
    const world = setup(1);
    world.step(10);
    const before = world.fish[0]!;
    // 広く空いている側へ逃げるよう、壁に近い側を叩く。
    const side = before.position.x < tank.widthCm / 2 ? -1 : 1;
    const point = { x: before.position.x + side * 2, y: before.position.y };
    world.tap(point);
    expect(world.fish[0]!.targetKind).toBe("flee");
    const phaseRate = (fish: FishInstance[], seconds: number) => {
      let turns = 0, last = fish[0]!.pulsePhase ?? 0;
      world.step(seconds, ([f]) => {
        if ((f!.pulsePhase ?? 0) < last) turns += 1;
        last = f!.pulsePhase ?? 0;
      });
      return turns / seconds;
    };
    let fastest = 0;
    world.step(0.6, ([f]) => { fastest = Math.max(fastest, Math.hypot(f!.velocity.x, f!.velocity.y)); });
    const after = world.fish[0]!;
    // 叩いた所から離れる。
    expect((after.position.x - before.position.x) * side).toBeLessThan(0);
    expect(fastest).toBeGreaterThan(clione.ecology.speedBodyLengthsPerSec.cruise * clione.realBodyLengthCm * 1.5);
    world.step(5);
    expect(world.fish[0]!.targetKind).toBe("openWater");
    const calm = phaseRate(world.fish, 10);
    expect(calm).toBeLessThan((clione.swim!.tailBeatHz ?? 1) * 1.6);
  });
});
