import { describe, expect, test } from "vitest";
import { getTankById } from "./tankCatalog";
import { createFishFromStock, getStockCount, reconcileFishStock } from "./fishPopulation";

const TANK_60CM = getTankById("asia-60")!;

describe("fish population", () => {
  test("creates transient fish from species counts only", () => {
    const fish = createFishFromStock([
      { speciesId: "neon-tetra", count: 3 },
      { speciesId: "corydoras", count: 2 },
    ], TANK_60CM);
    expect(fish).toHaveLength(5);
    expect(fish.filter((item) => item.speciesId === "neon-tetra")).toHaveLength(3);
    expect(JSON.stringify(fish)).not.toMatch(/nickname|hunger|favorite|arrivedAt/);
  });

  test("reconciles by species while preserving existing swimmers", () => {
    const initial = createFishFromStock([{ speciesId: "guppy", count: 2 }], TANK_60CM);
    const next = reconcileFishStock(initial, [
      { speciesId: "guppy", count: 1 },
      { speciesId: "platy", count: 2 },
    ], TANK_60CM);
    expect(next).toHaveLength(3);
    expect(next[0].id).toBe(initial[0].id);
    expect(getStockCount([{ speciesId: "platy", count: 2 }], "platy")).toBe(2);
  });
});
