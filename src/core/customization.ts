import { z } from "zod";
import aquariumConfigJson from "../content/aquarium/customization.json";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumEnvironmentCustomization,
  AquariumPersistedState,
  AquariumPreset,
  FishSpeciesDefinition,
  FishStockEntry,
} from "./types";

const aquariumEnvironmentSchema = z.object({
  backgroundStyle: z.enum(["clear", "deep", "bright"]),
  rearPlants: z.enum(["off", "subtle", "full"]),
  foregroundPlants: z.enum(["off", "subtle", "full"]),
  plantDensity: z.enum(["low", "medium", "high"]),
  lighting: z.enum(["natural", "cool", "evening", "night"]),
});

const aquariumCustomizationSchema = z.object({
  stock: z.array(
    z.object({
      speciesId: z.string().min(1),
      count: z.number().finite().int().min(0),
    }),
  ),
  environment: aquariumEnvironmentSchema,
});

const aquariumConfigSchema = z.object({
  storageKey: z.string().min(1),
  stateStorageKey: z.string().min(1),
  maxFishPerSpecies: z.number().finite().int().positive(),
  maxTotalFish: z.number().finite().int().positive(),
  presets: z.array(
    aquariumCustomizationSchema.extend({
      id: z.string().min(1),
      displayName: z.string().min(1),
    }),
  ).min(1),
});

const aquariumConfig: AquariumConfig = aquariumConfigSchema.parse(aquariumConfigJson);
export const CUSTOMIZATION_STORAGE_KEY = aquariumConfig.storageKey;
export const AQUARIUM_STATE_STORAGE_KEY = aquariumConfig.stateStorageKey;
export const MAX_FISH_PER_SPECIES = aquariumConfig.maxFishPerSpecies;
export const MAX_TOTAL_FISH = aquariumConfig.maxTotalFish;
export const aquariumPresets: AquariumPreset[] = aquariumConfig.presets;
export const DEFAULT_CUSTOMIZATION = aquariumPresets[0];
const DEFAULT_ENVIRONMENT: AquariumEnvironmentCustomization =
  DEFAULT_CUSTOMIZATION.environment;

const fishResidentSchema = z.object({
  id: z.string().min(1),
  speciesId: z.string().min(1),
  arrivedAtMs: z.number().finite().nonnegative(),
  nickname: z.string().max(24).optional(),
  favorite: z.boolean(),
  lastFedAtMs: z.number().finite().nonnegative().optional(),
  bodyLengthVariance: z.number().finite(),
  hunger: z.number().finite(),
  seed: z.number().finite().int(),
});

const aquariumPersistedStateSchema = z.object({
  version: z.literal(2),
  customization: aquariumCustomizationSchema,
  residents: z.array(fishResidentSchema),
  preferences: z.object({
    tankName: z.string().min(1).max(32),
    createdAtMs: z.number().finite().nonnegative(),
    lastSeenAtMs: z.number().finite().nonnegative(),
    lightingMode: z.enum(["auto", "manual"]),
    soundEnabled: z.boolean(),
    soundVolume: z.number().finite(),
  }),
  selectedFishId: z.string().min(1).optional(),
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

export function normalizeAquariumPersistedState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  const parsed = aquariumPersistedStateSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }

  const customization = normalizeAquariumCustomization(
    parsed.data.customization,
    speciesCatalog,
  );
  const allowedCounts = new Map(
    customization.stock.map((entry) => [entry.speciesId, entry.count]),
  );
  const residentCounts = new Map<string, number>();
  const residents = parsed.data.residents.filter((resident) => {
    const limit = allowedCounts.get(resident.speciesId) ?? 0;
    const current = residentCounts.get(resident.speciesId) ?? 0;
    if (!speciesCatalog[resident.speciesId] || current >= limit) {
      return false;
    }
    residentCounts.set(resident.speciesId, current + 1);
    return true;
  }).map((resident) => ({
    ...resident,
    hunger: Math.max(0, Math.min(1, resident.hunger)),
    bodyLengthVariance: Math.max(0.85, Math.min(1.15, resident.bodyLengthVariance)),
    nickname: resident.nickname?.trim() || undefined,
  }));

  return {
    version: 2,
    customization,
    residents,
    preferences: {
      ...parsed.data.preferences,
      tankName: parsed.data.preferences.tankName.trim(),
      soundVolume: Math.max(0, Math.min(1, parsed.data.preferences.soundVolume)),
    },
    selectedFishId: parsed.data.selectedFishId,
  };
}

function normalizeStock(
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
