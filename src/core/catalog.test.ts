import { describe, expect, it } from "vitest";
import { fishCatalog } from "./catalog";

describe("fish catalog", () => {
  it("loads the viewing-focused species set", () => {
    expect(Object.keys(fishCatalog).sort()).toEqual([
      "angelfish",
      "corydoras",
      "dwarf-gourami",
      "guppy",
      "harlequin-rasbora",
      "kuhli-loach",
      "neon-tetra",
      "platy",
    ]);
  });

  it("allows static-image species without swim frames", () => {
    expect(fishCatalog.corydoras.animation).toBeUndefined();
    expect(fishCatalog["dwarf-gourami"].animation).toBeUndefined();
    expect(fishCatalog["harlequin-rasbora"].animation).toBeUndefined();
    expect(fishCatalog.platy.animation).toBeUndefined();
  });

  it("loads species-level behavior differences for real-fish motion profiles", () => {
    expect(fishCatalog["neon-tetra"].schooling.strength).toBeGreaterThan(
      fishCatalog.guppy.schooling.strength,
    );
    expect(fishCatalog.guppy.behavior.surfaceVisitChance).toBeGreaterThan(
      fishCatalog["neon-tetra"].behavior.surfaceVisitChance,
    );
    expect(fishCatalog.corydoras.behavior.structurePatrolStrength).toBeGreaterThan(
      fishCatalog.angelfish.behavior.structurePatrolStrength,
    );
    expect(fishCatalog.angelfish.motion.wanderStrength).toBeLessThan(
      fishCatalog["neon-tetra"].motion.wanderStrength,
    );
    expect(fishCatalog["kuhli-loach"].preferredZone.minY).toBeGreaterThan(
      fishCatalog.platy.preferredZone.minY,
    );
  });
});
