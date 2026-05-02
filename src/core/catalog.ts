import { parseFishSpeciesDefinition } from "./schema";
import type { FishSpeciesDefinition } from "./types";

type SpeciesJsonModule = {
  default: unknown;
};

const speciesModules = import.meta.glob<SpeciesJsonModule>(
  "../content/fish/**/species.json",
  {
    eager: true,
  },
);

export function loadFishCatalog(): Record<string, FishSpeciesDefinition> {
  const catalog: Record<string, FishSpeciesDefinition> = {};

  for (const [path, module] of Object.entries(speciesModules)) {
    const species = parseFishSpeciesDefinition(module.default);

    if (catalog[species.id]) {
      throw new Error(`Duplicate fish species id "${species.id}" in ${path}`);
    }

    catalog[species.id] = species;
  }

  return catalog;
}

export const fishCatalog = loadFishCatalog();
