import { describe, expect, test } from "bun:test";
import { fishCatalog, getSceneById, getTankById } from "./catalog";
import { createFishFromStock, createFishPersonality, reconcileFishStock } from "./fishPopulation";
import { stepSimulation } from "./simulation";
import type { FishInstance } from "./types";

const tank = getTankById("asia-60")!;
const neutral = { pace: 1, responsiveness: 1, restfulness: 1, sociability: 1, personalSpace: 1, exploration: 1 };
const swimmer = () => ({ ...createFishFromStock([{ speciesId: "neon-tetra", count: 1 }], tank)[0]!,
  position: { x: 30, y: 18 }, velocity: { x: 3, y: 0 }, depth: .4, facing: 1 as const,
  target: { x: 54, y: 18 }, seed: 42, personality: neutral, behaviorMode: "coast" as const, behaviorTimeRemainingSec: 100 });

describe("individual fish personalities", () => {
  test("birth traits vary within small bounds and remain stable through movement, scene and light changes", () => {
    const fish = createFishFromStock([{ speciesId: "neon-tetra", count: 12 }], tank);
    const limits = { pace: .08, responsiveness: .15, restfulness: .2, sociability: .2, personalSpace: .15, exploration: .2 };
    expect(new Set(fish.map(f => JSON.stringify(f.personality))).size).toBe(fish.length);
    for (const f of fish) {
      expect(Object.isFrozen(f.personality)).toBe(true);
      expect(f.personality).toEqual(createFishPersonality(f.seed));
      for (const [key, spread] of Object.entries(limits))
        expect(Math.abs(f.personality[key as keyof typeof limits] - 1)).toBeLessThanOrEqual(spread);
    }
    let next = fish;
    for (const sceneId of ["planted", "root-driftwood", "iwagumi"]) for (let i = 0; i < 400; i++)
      next = stepSimulation({ tank, scene: getSceneById(sceneId), fish: next, species: fishCatalog,
        lighting: i < 200 ? "natural" : "night", deltaSec: .05, structurePoints: [] }).fish;
    expect(next.some((f, i) => f.seed !== fish[i]!.seed)).toBe(true);
    next.forEach((f, i) => expect(f.personality).toBe(fish[i]!.personality));
    const added = reconcileFishStock(next, [{ speciesId: "neon-tetra", count: 13 }], tank);
    next.forEach((f, i) => expect(added[i]).toBe(f));
    expect(added[12]!.personality).toEqual(createFishPersonality(added[12]!.seed));
  });

  test("pace changes speed for otherwise identical fish and random streams", () => {
    const speed = (pace: number) => {
      let fish: FishInstance = { ...swimmer(), personality: { ...neutral, pace } };
      for (let i = 0; i < 20; i++) fish = stepSimulation({ tank, species: fishCatalog,
        fish: [fish], structurePoints: [], deltaSec: .05 }).fish[0]!;
      return Math.hypot(fish.velocity.x, fish.velocity.y);
    };
    expect(speed(1.08)).toBeGreaterThan(speed(.92) * 1.1);
  });

  test("restful fish pause longer with the same chance and random draw", () => {
    const species = structuredClone(fishCatalog["neon-tetra"]!);
    species.ecology.habits = []; species.ecology.restFraction = 1;
    const pause = (restfulness: number) => stepSimulation({ tank, species: { [species.id]: species },
      fish: [{ ...swimmer(), personality: { ...neutral, restfulness }, behaviorTimeRemainingSec: 0 }],
      structurePoints: [], deltaSec: .05 }).fish[0]!;
    const short = pause(.8), long = pause(1.2);
    expect(short.behaviorMode).toBe("pause"); expect(long.behaviorMode).toBe("pause");
    expect(long.behaviorTimeRemainingSec / short.behaviorTimeRemainingSec).toBeCloseTo(1.5, 8);
  });

  test("sociability changes the response to nearby fish without forcing solitary species to flock", () => {
    const deflection = (sociability: number, solitary = false) => {
      const species = structuredClone(fishCatalog["neon-tetra"]!);
      species.ecology.habits = [];
      if (solitary) species.ecology.social.grouping = "solitary";
      const fish = { ...swimmer(), personality: { ...neutral, sociability } };
      const neighbor = { ...swimmer(), id: "neighbor", position: { x: 30, y: 25 }, velocity: { x: 0, y: 3 } };
      return stepSimulation({ tank, species: { [species.id]: species }, fish: [fish, neighbor],
        structurePoints: [], deltaSec: .1 }).fish[0]!.velocity.y;
    };
    expect(deflection(1.2)).toBeGreaterThan(deflection(.8));
    expect(deflection(.8, true)).toBeCloseTo(0, 8);
    expect(deflection(1.2, true)).toBeCloseTo(0, 8);
  });

  test("a school member gently matches the actual speed of active neighbors", () => {
    const species = structuredClone(fishCatalog["neon-tetra"]!);
    species.ecology.habits = []; species.ecology.social.cohesion = 0;
    const following = (speed: number, mode: "coast" | "pause" = "coast") => stepSimulation({ tank,
      species: { [species.id]: species }, fish: [swimmer(), { ...swimmer(), id: "neighbor",
        position: { x: 35, y: 18 }, velocity: { x: speed, y: 0 }, behaviorMode: mode }],
      structurePoints: [], deltaSec: .1 }).fish[0]!.velocity.x;
    expect(following(6)).toBeGreaterThan(following(2));
    expect(following(0, "pause")).toBe(following(6, "pause"));
  });

  test("personal space changes separation from a neighbor at the preferred distance", () => {
    const species = structuredClone(fishCatalog["neon-tetra"]!);
    species.ecology.habits = []; species.ecology.social.spacingBodyLengths = 2;
    const velocity = (personalSpace: number) => stepSimulation({ tank, species: { [species.id]: species },
      fish: [{ ...swimmer(), personality: { ...neutral, personalSpace } }, { ...swimmer(), id: "neighbor",
        position: { x: 30, y: 18 + species.realBodyLengthCm * 2 }, velocity: { x: 3, y: 0 } }],
      structurePoints: [], deltaSec: .1 }).fish[0]!.velocity.y;
    expect(velocity(1.15)).toBeLessThan(velocity(.85));
  });

  test("responsiveness changes how quickly an individual turns toward its target", () => {
    const velocity = (responsiveness: number) => stepSimulation({ tank, species: fishCatalog,
      fish: [{ ...swimmer(), personality: { ...neutral, responsiveness }, target: { x: 45, y: 23 } }],
      structurePoints: [], deltaSec: .1 }).fish[0]!.velocity.y;
    expect(velocity(1.15)).toBeGreaterThan(velocity(.85));
  });
});
