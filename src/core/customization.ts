import { z } from "zod";
import configJson from "../content/aquarium/customization.json";
import { aquariumScenes, getSceneById } from "./sceneCatalog";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  FishSpeciesDefinition,
  FishStockEntry,
  LightingId,
  Vec2,
} from "./types";

const lightingSchema = z.enum(["natural", "cool", "evening", "night"]);

const layoutSchema = z.object({
  sceneId: z.string().min(1),
  lighting: lightingSchema,
});

const configSchema = z.object({
  legacyStorageKey: z.string().min(1),
  legacyStateStorageKey: z.string().min(1),
  previousStateStorageKey: z.string().min(1),
  stateStorageKey: z.string().min(1),
  maxFishPerSpecies: z.number().int().positive(),
  maxTotalFish: z.number().int().positive(),
});

const config = configSchema.parse(configJson) as AquariumConfig;

export const CUSTOMIZATION_STORAGE_KEY = config.legacyStorageKey;
export const LEGACY_AQUARIUM_STATE_STORAGE_KEY = config.legacyStateStorageKey;
export const PREVIOUS_AQUARIUM_STATE_STORAGE_KEY = config.previousStateStorageKey;
export const AQUARIUM_STATE_STORAGE_KEY = config.stateStorageKey;
export const MAX_FISH_PER_SPECIES = config.maxFishPerSpecies;
export const MAX_TOTAL_FISH = config.maxTotalFish;

const DEFAULT_STOCK: FishStockEntry[] = [
  { speciesId: "neon-tetra", count: 6 },
  { speciesId: "harlequin-rasbora", count: 5 },
  { speciesId: "corydoras", count: 3 },
  { speciesId: "guppy", count: 2 },
  { speciesId: "dwarf-gourami", count: 1 },
  { speciesId: "angelfish", count: 1 },
];

export const DEFAULT_CUSTOMIZATION: AquariumCustomization = {
  stock: DEFAULT_STOCK,
  layout: getDefaultLayout(aquariumScenes[0].id),
};

export const DEFAULT_PREFERENCES: AquariumPreferences = {
  soundEnabled: false,
  soundVolume: 0.42,
};

const persistedStateSchema = z.object({
  version: z.literal(4),
  customization: z.object({
    stock: z.array(z.object({
      speciesId: z.string().min(1),
      count: z.number().finite(),
    })),
    layout: layoutSchema,
  }),
  preferences: z.object({
    soundEnabled: z.boolean(),
    soundVolume: z.number().finite(),
  }),
});

export function getDefaultLayout(sceneId: string): AquariumLayout {
  const scene = getSceneById(sceneId) ?? aquariumScenes[0];
  return { sceneId: scene.id, lighting: scene.defaultLighting };
}

export function normalizeAquariumCustomization(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumCustomization {
  const candidate = value && typeof value === "object"
    ? value as Partial<AquariumCustomization>
    : {};
  return {
    stock: normalizeStock(candidate.stock, speciesCatalog),
    layout: normalizeLayout(candidate.layout),
  };
}

export function normalizeAquariumPersistedState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  const parsed = persistedStateSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return {
    version: 4,
    customization: normalizeAquariumCustomization(parsed.data.customization, speciesCatalog),
    preferences: normalizePreferences(parsed.data.preferences),
  };
}

// v1〜v3 の保存データから、魚種別匹数・照明・音設定と最も近い水景を引き継ぐ。
export function migrateLegacyAquariumState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as {
    version?: number;
    customization?: {
      stock?: FishStockEntry[];
      environment?: Record<string, unknown>;
      layout?: Record<string, unknown>;
    };
    stock?: FishStockEntry[];
    environment?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
  };
  const legacyCustomization = source.customization ?? source;
  const legacyLayout = source.customization?.layout;
  const environment = legacyCustomization.environment ?? {};
  const sceneId = legacyLayout
    ? mapLegacyTheme(legacyLayout.themeId)
    : mapLegacyBackground(environment.backgroundStyle);
  const layout = getDefaultLayout(sceneId);
  const legacyLighting = legacyLayout?.lighting ?? environment.lighting;
  const preferences = source.preferences ?? {};

  return {
    version: 4,
    customization: normalizeAquariumCustomization({
      stock: legacyCustomization.stock,
      layout: {
        ...layout,
        lighting: isLightingId(legacyLighting) ? legacyLighting : layout.lighting,
      },
    }, speciesCatalog),
    preferences: normalizePreferences({
      soundEnabled: preferences.soundEnabled,
      soundVolume: preferences.soundVolume,
    }),
  };
}

export function setStockCount(
  stock: FishStockEntry[],
  speciesId: string,
  count: number,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const next = new Map(stock.map((entry) => [entry.speciesId, entry.count]));
  next.set(speciesId, count);
  return normalizeStock(
    Array.from(next, ([entrySpeciesId, entryCount]) => ({
      speciesId: entrySpeciesId,
      count: entryCount,
    })),
    speciesCatalog,
  );
}

export function getStructurePoints(layout: AquariumLayout): Vec2[] {
  return getSceneById(layout.sceneId)?.structurePoints ?? [];
}

function normalizeLayout(value: unknown): AquariumLayout {
  const parsed = layoutSchema.safeParse(value);
  if (!parsed.success || !getSceneById(parsed.data.sceneId)) {
    return getDefaultLayout(aquariumScenes[0].id);
  }
  return { sceneId: parsed.data.sceneId, lighting: parsed.data.lighting };
}

function normalizeStock(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const isExplicitStock = Array.isArray(value);
  const stock = isExplicitStock ? value : DEFAULT_STOCK;
  const counts = new Map<string, number>();
  const order: string[] = [];
  let knownSpeciesSeen = false;
  for (const item of stock) {
    if (!item || typeof item !== "object") continue;
    const { speciesId, count } = item as FishStockEntry;
    if (!speciesCatalog[speciesId]) continue;
    knownSpeciesSeen = true;
    if (!counts.has(speciesId)) order.push(speciesId);
    counts.set(
      speciesId,
      Math.min(MAX_FISH_PER_SPECIES, (counts.get(speciesId) ?? 0) + clampCount(count)),
    );
  }
  const result: FishStockEntry[] = [];
  let total = 0;
  for (const speciesId of order) {
    const count = Math.min(counts.get(speciesId) ?? 0, MAX_TOTAL_FISH - total);
    if (count > 0) result.push({ speciesId, count });
    total += count;
    if (total >= MAX_TOTAL_FISH) break;
  }
  if (result.length > 0 || (isExplicitStock && (stock.length === 0 || knownSpeciesSeen))) {
    return result;
  }
  return DEFAULT_STOCK.filter((entry) => speciesCatalog[entry.speciesId]);
}

function normalizePreferences(value: unknown): AquariumPreferences {
  const candidate = value && typeof value === "object"
    ? value as Partial<AquariumPreferences>
    : {};
  return {
    soundEnabled: candidate.soundEnabled === true,
    soundVolume: Math.max(0, Math.min(1,
      typeof candidate.soundVolume === "number"
        ? candidate.soundVolume
        : DEFAULT_PREFERENCES.soundVolume,
    )),
  };
}

function mapLegacyBackground(backgroundStyle: unknown): string {
  if (backgroundStyle === "deep") return "driftwood";
  if (backgroundStyle === "bright") return "iwagumi";
  return "planted";
}

function mapLegacyTheme(themeId: unknown): string {
  return typeof themeId === "string" && getSceneById(themeId) ? themeId : "planted";
}

function isLightingId(value: unknown): value is LightingId {
  return value === "natural" || value === "cool" || value === "evening" || value === "night";
}

function clampCount(count: number): number {
  return Math.max(0, Math.min(MAX_FISH_PER_SPECIES, Math.trunc(Number(count) || 0)));
}
