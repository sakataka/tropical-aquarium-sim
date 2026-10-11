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

  test("oblique crab legs may point upward without relaxing side-view walker legs", () => {
    const legs = [0, 1].map((beat) => ({ x: .5, y: .5, knee: { x: .2, y: .1 }, footX: .1, footY: .3, width: .03, beat }));
    expect(parseFishSpeciesDefinition({ ...neon, swim: { bodyPlan: "crab", legs } }).swim?.legs?.[0]?.knee)
      .toEqual({ x: .2, y: .1 });
    expect(() => parseFishSpeciesDefinition({ ...neon, swim: { bodyPlan: "walker", legs } })).toThrow();
  });
});
