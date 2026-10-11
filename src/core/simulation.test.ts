import { describe, expect, test } from "bun:test";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import type { FishInstance } from "./types";

const TANK_60CM = getTankById("asia-60")!;

/** 魚を生むときの乱数を固定する（線形合同法）。同じ seed からは同じ個体が生まれる。 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("natural swimming", () => {
  test("surface fish keep their layer when attracted to bottom structures", () => {
    const tank = getTankById("cube-30")!;
    const species = structuredClone(fishCatalog["clown-killifish"]);
    species.ecology.structureAffinity = 1;
    species.ecology.restFraction = 0;
    let fish = createFishFromStock([{ speciesId: species.id, count: 1 }], tank);
    fish[0] = { ...fish[0], position: { x: 12, y: 4 }, velocity: { x: 0.5, y: 0 },
      facing: 1, seed: 42, target: undefined, behaviorMode: "coast", behaviorTimeRemainingSec: 0 };
    for (let i = 0; i < 3600; i++) {
      fish = stepSimulation({ tank, species: { [species.id]: species }, fish, deltaSec: 0.05,
        structurePoints: [{ x: 20, y: 26 }] }).fish;
      expect(fish[0].target!.y).toBeLessThanOrEqual(tank.heightCm * species.preferredZone.maxY);
      expect(fish[0].position.y).toBeLessThanOrEqual(tank.heightCm * species.preferredZone.maxY + 1);
    }
  });

  test("shrimp walk and graze at the bottom without rising toward structure centers", () => {
    const tank = getTankById("japan-60")!;
    const species = fishCatalog["amano-shrimp"];
    let fish = createFishFromStock([{ speciesId: species.id, count: 3 }], tank);
    fish = fish.map((item, index) => ({ ...item, seed: 42 + index }));
    const bottomY = tank.heightCm - tank.safeMarginCm;
    let grazing = false;
    for (let i = 0; i < 3600; i++) {
      fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: 0.05,
        structurePoints: [{ x: 20, y: 24 }, { x: 46, y: 25 }] }).fish;
      for (const item of fish) {
        expect(item.position.y).toBeCloseTo(bottomY, 5);
        // 採餌中の短い移動も含め、尾跳ねの瞬発速度には達しない。
        expect(Math.hypot(item.velocity.x, item.velocity.y)).toBeLessThanOrEqual(species.realBodyLengthCm * 0.12);
        grazing ||= item.behaviorMode === "forage";
      }
    }
    expect(grazing).toBe(true);
  });
  test("keeps fish inside the tank over time", () => {
    let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 8 }], TANK_60CM);
    for (let index = 0; index < 600; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
    }
    for (const item of fish) {
      expect(item.position.x).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
      expect(item.position.x).toBeLessThanOrEqual(TANK_60CM.widthCm - TANK_60CM.safeMarginCm);
      expect(item.position.y).toBeGreaterThanOrEqual(TANK_60CM.safeMarginCm);
      expect(item.position.y).toBeLessThanOrEqual(TANK_60CM.heightCm - TANK_60CM.safeMarginCm);
    }
  });

  test("respects the species swimming zone", () => {
    let fish = createFishFromStock([{ speciesId: "corydoras", count: 6 }], TANK_60CM);
    for (let index = 0; index < 300; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
    }
    const averageY = fish.reduce((sum, item) => sum + item.position.y, 0) / fish.length;
    expect(averageY).toBeGreaterThan(TANK_60CM.heightCm * 0.55);
  });

  test("uses placed midground decor as a passive target", () => {
    const species = structuredClone(fishCatalog["dwarf-gourami"]);
    species.ecology.structureAffinity = 1;
    species.ecology.restFraction = 0;
    species.ecology.habits = [];
    const fish = createFishFromStock([{ speciesId: species.id, count: 1 }], TANK_60CM);
    // 構造物選択そのものを確認するため、個体の寄り道倍率は標準に固定する。
    fish[0].personality = { ...fish[0].personality, exploration: 1 };
    fish[0].behaviorMode = "coast";
    fish[0].behaviorTimeRemainingSec = 0;
    fish[0].target = undefined;
    const output = stepSimulation({
      tank: TANK_60CM,
      species: { [species.id]: species },
      fish,
      deltaSec: 0.05,
      structurePoints: [{ x: 42, y: 26 }],
    }).fish[0];
    expect(output.targetKind).toBe("structure");
    expect(output.target!.x).toBeGreaterThan(35);
    expect(output.target!.y).toBeGreaterThan(20);
  });

  test("schooling changes heading in response to nearby fish", () => {
    const species = fishCatalog["neon-tetra"];
    const school = createFishFromStock([{ speciesId: species.id, count: 2 }], TANK_60CM);
    school[0] = { ...school[0], position: { x: 25, y: 18 }, velocity: { x: 1, y: 0 } };
    school[1] = { ...school[1], position: { x: 27, y: 20 }, velocity: { x: 0, y: 1 } };
    const alone = stepSimulation({
      tank: TANK_60CM, species: fishCatalog, fish: [school[0]], deltaSec: 0.1, structurePoints: [],
    }).fish[0];
    const together = stepSimulation({
      tank: TANK_60CM, species: fishCatalog, fish: school, deltaSec: 0.1, structurePoints: [],
    }).fish[0];
    expect(together.velocity.y).not.toBeCloseTo(alone.velocity.y, 5);
  });

  test("keeps swimming in one direction instead of reversing every kick", () => {
    let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 6 }], TANK_60CM);
    let previous = fish.map((item) => item.facing);
    let reversals = 0;
    for (let index = 0; index < 1200; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM,
        species: fishCatalog,
        fish,
        deltaSec: 0.05,
        structurePoints: [{ x: 14, y: 22 }, { x: 46, y: 20 }],
      }).fish;
      fish.forEach((item, fishIndex) => {
        if (item.facing !== previous[fishIndex]) reversals += 1;
      });
      previous = fish.map((item) => item.facing);
    }
    // 60秒間で1匹あたり10回未満（以前は30回前後）。
    expect(reversals / fish.length).toBeLessThan(10);
  });

  test("nocturnal kuhli loaches hide by day and roam at night", () => {
    const restShare = (lighting: "natural" | "night") => {
      let fish = createFishFromStock([{ speciesId: "kuhli-loach", count: 4 }], TANK_60CM);
      let resting = 0;
      for (let index = 0; index < 2400; index += 1) {
        fish = stepSimulation({
          tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, lighting,
          structurePoints: [{ x: 14, y: 22 }, { x: 46, y: 20 }],
        }).fish;
        resting += fish.filter((item) => item.behaviorMode === "rest").length;
      }
      return resting / (2400 * fish.length);
    };
    expect(restShare("natural")).toBeGreaterThan(0.3);
    expect(restShare("night")).toBeLessThan(0.1);
  });

  test("air-breathing corydoras dash to the surface and return", () => {
    const species = structuredClone(fishCatalog.corydoras);
    species.ecology.habits = [{ type: "airBreathing", breathsPerHour: [600, 600], style: "dash" }];
    let fish = createFishFromStock([{ speciesId: species.id, count: 1 }], TANK_60CM);
    let minY = Infinity;
    let returned = false;
    for (let index = 0; index < 600; index += 1) {
      fish = stepSimulation({
        tank: TANK_60CM, species: { [species.id]: species }, fish, deltaSec: 0.05, structurePoints: [],
      }).fish;
      minY = Math.min(minY, fish[0].position.y);
      if (minY < 4 && fish[0].position.y > TANK_60CM.heightCm * 0.6) returned = true;
    }
    expect(minY).toBeLessThan(4);
    expect(returned).toBe(true);
  });

  test("diurnal fish slow down under night lighting", () => {
    const averageSpeed = (lighting: "natural" | "night") => {
      let fish = createFishFromStock([{ speciesId: "neon-tetra", count: 6 }], TANK_60CM);
      let total = 0;
      for (let index = 0; index < 1200; index += 1) {
        fish = stepSimulation({
          tank: TANK_60CM, species: fishCatalog, fish, deltaSec: 0.05, lighting, structurePoints: [],
        }).fish;
        total += fish.reduce((sum, item) => sum + Math.hypot(item.velocity.x, item.velocity.y), 0);
      }
      return total / (1200 * fish.length);
    };
    expect(averageSpeed("night")).toBeLessThan(averageSpeed("natural") * 0.6);
  });

  test("diurnal midwater fish settle lower at night, while surface fish stay up", () => {
    const tank = getTankById("amazon-90")!;
    // 群れはまとまって動くので、1つの群れを2分見ただけでは、泳層の中のどこにいたかで昼の深さが大きく揺れる
    // （昼の平均は群れによって泳層 0.28〜0.72 の中の 0.39〜0.60）。同じ乱数から生んだ同じ群れを昼と夜で比べ、
    // 4つの群れで平均する。乱数を固定するので、実行するたびに結果が変わらない。
    const averageDepth = (speciesId: string, lighting: "natural" | "night", population: number) => {
      let fish = createFishFromStock([{ speciesId, count: 8 }], tank, seededRandom(population));
      let total = 0, samples = 0;
      for (let index = 0; index < 3600; index += 1) {
        fish = stepSimulation({ tank, species: fishCatalog, fish, deltaSec: 0.05, lighting, structurePoints: [] }).fish;
        if (index < 1200) continue;
        total += fish.reduce((sum, item) => sum + item.position.y / tank.heightCm, 0);
        samples += fish.length;
      }
      return total / samples;
    };
    const populations = [1, 2, 3, 4];
    const nightDrop = populations.reduce((sum, population) =>
      sum + averageDepth("neon-tetra", "night", population) - averageDepth("neon-tetra", "natural", population), 0) / populations.length;
    expect(nightDrop).toBeGreaterThan(0.05);
    // 水面に暮らすマーブルハチェットは夜も上層にいる。
    expect(averageDepth("marbled-hatchetfish", "night", 1)).toBeLessThan(0.4);
  });
});

describe("resting beside rocks", () => {
  // 底に並んで重なる2つの岩。重なりのくぼみと、岩と底の間の細いすき間に、休む魚が寄りかかる。
  const tank = getTankById("cube-30")!;
  const scene = { ...getSceneById("cube-stones")!, terrain: { surfaces: [], occluders: [], obstacles: [
    { id: "west", center: { x: .35, y: .9, depth: .5 }, radius: { x: .25, y: .2 }, depthRadius: .1 },
    { id: "east", center: { x: .68, y: .88, depth: .5 }, radius: { x: .22, y: .22 }, depthRadius: .1 },
  ] } };

  /** 体長×0.2 だけ広げた回避領域の、いちばん深くめり込んだ所の正規化した距離（1 未満なら内側）。許容誤差を置かずに測る。 */
  function nearestObstacleDistance(position: { x: number; y: number }, depth: number, bodyLengthCm: number) {
    let nearest = Infinity;
    for (const obstacle of scene.terrain.obstacles) {
      const relativeDepth = (depth - obstacle.center.depth) / obstacle.depthRadius;
      if (Math.abs(relativeDepth) >= 1) continue;
      const section = Math.sqrt(1 - relativeDepth * relativeDepth);
      const rx = obstacle.radius.x * tank.widthCm * section + bodyLengthCm * .2;
      const ry = obstacle.radius.y * tank.heightCm * section + bodyLengthCm * .2;
      nearest = Math.min(nearest, Math.hypot((position.x - obstacle.center.x * tank.widthCm) / rx,
        (position.y - obstacle.center.y * tank.heightCm) / ry));
    }
    return nearest;
  }

  test("pausing fish lean on rocks without seeping in, so they are never pushed out with a jump", () => {
    // よく止まって休み、薄い岩の手前と奥を行き来する底寄りの小魚。止まっている間も奥行きは動くので、岩の手前で止められる。
    const species = structuredClone(fishCatalog["ember-tetra"]!);
    species.ecology.restFraction = .6;
    species.ecology.depthRange = [.3, .7];
    species.preferredZone = { ...species.preferredZone, minY: .75, maxY: .95 };
    const bodyLength = species.realBodyLengthCm;
    const failures: string[] = [];
    let touches = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const random = seededRandom(seed);
      let fish: FishInstance[] = createFishFromStock([{ speciesId: species.id, count: 3 }], tank, random).map((f, i) => ({
        ...f, seed: seed * 7919 + i, bodyLengthVariance: 1,
        // 岩の輪郭の手前か奥に、ゆっくりした惰性で止まりかけた姿で置く。
        position: { x: tank.widthCm * (.2 + random() * .6), y: tank.heightCm * (.8 + random() * .1) },
        velocity: { x: (random() - .5) * .6, y: random() * .4 }, depth: random() < .5 ? .3 : .7,
        target: undefined, behaviorMode: "pause" as const, behaviorTimeRemainingSec: 1 + random() * 3,
      }));
      let inside = 0, worstJump = 0;
      for (let tick = 0; tick < 1200; tick++) {
        const previous = fish;
        fish = stepSimulation({ tank, scene, fish, species: { [species.id]: species }, structurePoints: [], deltaSec: .1 }).fish;
        for (const [i, f] of fish.entries()) {
          const p = previous[i]!;
          const distance = nearestObstacleDistance(f.position, f.depth, bodyLength);
          if (distance < 1) inside++;
          if (distance < 1.001) touches++;
          // 止まっている間は、直前の速さか、休む場所へ寄る最も速い速さ（体長×0.2/秒）より速くは動かない。
          const resting = (mode: typeof f.behaviorMode) => mode === "pause" || mode === "rest";
          if (resting(p.behaviorMode) && resting(f.behaviorMode)) {
            const allowed = Math.max(Math.hypot(p.velocity.x, p.velocity.y), bodyLength * .2) * .1;
            worstJump = Math.max(worstJump, Math.hypot(f.position.x - p.position.x, f.position.y - p.position.y) - allowed);
          }
        }
      }
      if (inside > 0 || worstJump > 1e-6) failures.push(`seed ${seed}: inside ${inside} frames, jump ${worstJump.toFixed(3)}cm`);
    }
    // 岩に寄りかかる場面が実際に起きていることも確かめる。
    expect(touches).toBeGreaterThan(1000);
    expect(failures).toEqual([]);
  });
});
