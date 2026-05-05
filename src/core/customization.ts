import { z } from "zod";
import aquariumConfigJson from "../content/aquarium/customization.json";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumEnvironmentCustomization,
  AquariumPreset,
  FishSpeciesDefinition,
  FishStockEntry,
} from "./types";

const SCHEMA_DEFAULT_ENVIRONMENT: AquariumEnvironmentCustomization = {
  backgroundStyle: "clear",
  rearPlants: "full",
  foregroundPlants: "full",
  plantDensity: "medium",
  lighting: "natural",
};

export const aquariumEnvironmentSchema = z.object({
  backgroundStyle: z.enum(["clear", "deep", "bright"]).default("clear"),
  rearPlants: z.enum(["off", "subtle", "full"]).default("full"),
  foregroundPlants: z.enum(["off", "subtle", "full"]).default("full"),
  plantDensity: z.enum(["low", "medium", "high"]).default("medium"),
  lighting: z.enum(["natural", "cool", "evening", "night"]).default("natural"),
});

export const aquariumCustomizationSchema = z.object({
  stock: z.array(
    z.object({
      speciesId: z.string().min(1),
      count: z.number().finite().int().min(0),
    }),
  ).default([]),
  environment: aquariumEnvironmentSchema.default(SCHEMA_DEFAULT_ENVIRONMENT),
});

const aquariumConfigSchema = z.object({
  storageKey: z.string().min(1),
  maxFishPerSpecies: z.number().finite().int().positive(),
  maxTotalFish: z.number().finite().int().positive(),
  defaultEnvironment: aquariumEnvironmentSchema,
  presets: z.array(
    aquariumCustomizationSchema.extend({
      id: z.string().min(1),
      displayName: z.string().min(1),
    }),
  ).min(1),
});

export const aquariumConfig: AquariumConfig = aquariumConfigSchema.parse(aquariumConfigJson);
export const CUSTOMIZATION_STORAGE_KEY = aquariumConfig.storageKey;
export const MAX_FISH_PER_SPECIES = aquariumConfig.maxFishPerSpecies;
export const MAX_TOTAL_FISH = aquariumConfig.maxTotalFish;
export const DEFAULT_ENVIRONMENT: AquariumEnvironmentCustomization =
  aquariumConfig.defaultEnvironment;
export const aquariumPresets: AquariumPreset[] = aquariumConfig.presets;
export const DEFAULT_CUSTOMIZATION = aquariumPresets[0];

export function getPresetById(presetId: string | null | undefined): AquariumPreset | undefined {
  return aquariumPresets.find((preset) => preset.id === presetId);
}

export function normalizeAquariumCustomization(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumCustomization {
  const parsed = aquariumCustomizationSchema.safeParse(value);
  const source = parsed.success ? parsed.data : DEFAULT_CUSTOMIZATION;
  const stock = normalizeStock(source.stock, speciesCatalog);

  return {
    stock,
    environment: {
      ...DEFAULT_ENVIRONMENT,
      ...source.environment,
    },
  };
}

export function normalizeStock(
  stock: FishStockEntry[],
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const bySpecies = new Map<string, number>();
  const orderedSpecies: string[] = [];

  for (const entry of stock) {
    if (!speciesCatalog[entry.speciesId]) {
      continue;
    }
    if (!bySpecies.has(entry.speciesId)) {
      orderedSpecies.push(entry.speciesId);
    }
    const current = bySpecies.get(entry.speciesId) ?? 0;
    bySpecies.set(
      entry.speciesId,
      Math.min(MAX_FISH_PER_SPECIES, current + clampCount(entry.count)),
    );
  }

  const normalized: FishStockEntry[] = [];
  let total = 0;
  for (const speciesId of orderedSpecies) {
    const count = bySpecies.get(speciesId) ?? 0;
    const nextCount = Math.min(count, MAX_TOTAL_FISH - total);
    if (nextCount > 0) {
      normalized.push({ speciesId, count: nextCount });
      total += nextCount;
    }
    if (total >= MAX_TOTAL_FISH) {
      break;
    }
  }

  return normalized.length > 0
    ? normalized
    : DEFAULT_CUSTOMIZATION.stock.filter((entry) => speciesCatalog[entry.speciesId]);
}

export function setStockCount(
  stock: FishStockEntry[],
  speciesId: string,
  count: number,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const next = new Map(stock.map((entry) => [entry.speciesId, entry.count]));
  next.set(speciesId, clampCount(count));
  return normalizeStock(
    Array.from(next, ([entrySpeciesId, entryCount]) => ({
      speciesId: entrySpeciesId,
      count: entryCount,
    })),
    speciesCatalog,
  );
}

function clampCount(count: number): number {
  return Math.max(0, Math.min(MAX_FISH_PER_SPECIES, Math.trunc(count)));
}
