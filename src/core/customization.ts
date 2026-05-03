import { z } from "zod";
import type {
  AquariumCustomization,
  AquariumEnvironmentCustomization,
  AquariumPreset,
  FishSpeciesDefinition,
  FishStockEntry,
} from "./types";

export const CUSTOMIZATION_STORAGE_KEY = "tropical-aquarium.customization.v1";
export const MAX_FISH_PER_SPECIES = 12;
export const MAX_TOTAL_FISH = 30;

export const DEFAULT_ENVIRONMENT: AquariumEnvironmentCustomization = {
  backgroundStyle: "clear",
  rearPlants: "full",
  foregroundPlants: "full",
  plantDensity: "medium",
  lighting: "natural",
};

export const aquariumPresets: AquariumPreset[] = [
  {
    id: "community",
    displayName: "コミュニティ水槽",
    stock: [
      { speciesId: "neon-tetra", count: 4 },
      { speciesId: "harlequin-rasbora", count: 4 },
      { speciesId: "corydoras", count: 3 },
      { speciesId: "guppy", count: 2 },
      { speciesId: "dwarf-gourami", count: 1 },
      { speciesId: "angelfish", count: 1 },
    ],
    environment: DEFAULT_ENVIRONMENT,
  },
  {
    id: "school",
    displayName: "群泳メイン",
    stock: [
      { speciesId: "neon-tetra", count: 10 },
      { speciesId: "harlequin-rasbora", count: 8 },
      { speciesId: "corydoras", count: 4 },
    ],
    environment: {
      backgroundStyle: "bright",
      rearPlants: "full",
      foregroundPlants: "subtle",
      plantDensity: "high",
      lighting: "cool",
    },
  },
  {
    id: "calm",
    displayName: "落ち着いた夜景",
    stock: [
      { speciesId: "corydoras", count: 5 },
      { speciesId: "dwarf-gourami", count: 2 },
      { speciesId: "angelfish", count: 1 },
      { speciesId: "guppy", count: 3 },
    ],
    environment: {
      backgroundStyle: "deep",
      rearPlants: "subtle",
      foregroundPlants: "full",
      plantDensity: "low",
      lighting: "night",
    },
  },
];

export const DEFAULT_CUSTOMIZATION = aquariumPresets[0];

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
  environment: aquariumEnvironmentSchema.default(DEFAULT_ENVIRONMENT),
});

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
