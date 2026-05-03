import { describe, expect, it } from "vitest";
import { fishCatalog } from "./catalog";

describe("fish catalog", () => {
  it("loads the viewing-focused six species set", () => {
    expect(Object.keys(fishCatalog).sort()).toEqual([
      "angelfish",
      "corydoras",
      "dwarf-gourami",
      "guppy",
      "harlequin-rasbora",
      "neon-tetra",
    ]);
  });

  it("allows static-image species without swim frames", () => {
    expect(fishCatalog.corydoras.animation).toBeUndefined();
    expect(fishCatalog["dwarf-gourami"].animation).toBeUndefined();
    expect(fishCatalog["harlequin-rasbora"].animation).toBeUndefined();
  });
});
