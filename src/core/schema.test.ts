import { describe, expect, test } from "vitest";
import neon from "../content/fish/neon-tetra/species.json";
import { parseFishSpeciesDefinition } from "./schema";

describe("fish species schema", () => {
  test("accepts the co-located catalog definition", () => {
    expect(parseFishSpeciesDefinition(neon).catalog.scientificName)
      .toBe("Paracheirodon innesi");
  });

  test("rejects a species without catalog metadata", () => {
    const { catalog: _catalog, ...invalid } = neon;
    expect(() => parseFishSpeciesDefinition(invalid)).toThrow();
  });
});
