import { z } from "zod";
import configJson from "../content/aquarium/customization.json";
import { DECOR_SLOT_IDS, decorAssetsById } from "./environmentCatalog";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  AquariumTheme,
  DecorPlacement,
  DecorSlotId,
  FishSpeciesDefinition,
  FishStockEntry,
  LightingId,
  Vec2,
} from "./types";

const placementSchema = z.object({
  assetId: z.string().min(1),
  flipped: z.boolean(),
});

const slotShape = Object.fromEntries(
  DECOR_SLOT_IDS.map((slotId) => [slotId, placementSchema.nullable()]),
) as Record<DecorSlotId, z.ZodNullable<typeof placementSchema>>;
const slotsSchema = z.object(slotShape);

const layoutSchema = z.object({
  themeId: z.enum(["planted", "driftwood", "iwagumi"]),
  backgroundId: z.string().min(1),
  substrateId: z.string().min(1),
  lighting: z.enum(["natural", "cool", "evening", "night"]),
  slots: slotsSchema,
});

const themeSchema = z.object({
  id: z.enum(["planted", "driftwood", "iwagumi"]),
  displayName: z.string().min(1),
  description: z.string().min(1),
  layout: layoutSchema,
});

const configSchema = z.object({
  legacyStorageKey: z.string().min(1),
  legacyStateStorageKey: z.string().min(1),
  stateStorageKey: z.string().min(1),
  maxFishPerSpecies: z.number().int().positive(),
  maxTotalFish: z.number().int().positive(),
  themes: z.array(themeSchema).length(3),
});

const config = configSchema.parse(configJson) as AquariumConfig;

export const CUSTOMIZATION_STORAGE_KEY = config.legacyStorageKey;
export const LEGACY_AQUARIUM_STATE_STORAGE_KEY = config.legacyStateStorageKey;
export const AQUARIUM_STATE_STORAGE_KEY = config.stateStorageKey;
export const MAX_FISH_PER_SPECIES = config.maxFishPerSpecies;
export const MAX_TOTAL_FISH = config.maxTotalFish;
export const aquariumThemes = config.themes;

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
  layout: cloneLayout(aquariumThemes[0].layout),
};

export const DEFAULT_PREFERENCES: AquariumPreferences = {
  soundEnabled: false,
  soundVolume: 0.42,
};

const persistedStateSchema = z.object({
  version: z.literal(3),
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

export function getThemeById(themeId: string | null | undefined): AquariumTheme | undefined {
  return aquariumThemes.find((theme) => theme.id === themeId);
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
    version: 3,
    customization: normalizeAquariumCustomization(parsed.data.customization, speciesCatalog),
    preferences: normalizePreferences(parsed.data.preferences),
  };
}

export function migrateLegacyAquariumState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as {
    version?: number;
    customization?: { stock?: FishStockEntry[]; environment?: Record<string, unknown> };
    stock?: FishStockEntry[];
    environment?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
  };
  const legacyCustomization = source.customization ?? source;
  const environment = legacyCustomization.environment ?? {};
  const themeId = mapLegacyTheme(environment.backgroundStyle);
  const theme = getThemeById(themeId) ?? aquariumThemes[0];
  const lighting = isLightingId(environment.lighting)
    ? environment.lighting
    : theme.layout.lighting;
  const preferences = source.preferences ?? {};

  return {
    version: 3,
    customization: normalizeAquariumCustomization({
      stock: legacyCustomization.stock,
      layout: {
        ...cloneLayout(theme.layout),
        lighting,
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

export function setLayoutSlot(
  layout: AquariumLayout,
  slotId: DecorSlotId,
  placement: DecorPlacement | null,
): AquariumLayout {
  const asset = placement ? decorAssetsById[placement.assetId] : undefined;
  const safePlacement = asset?.allowedSlots.includes(slotId) ? placement : null;
  return {
    ...layout,
    slots: {
      ...layout.slots,
      [slotId]: safePlacement,
    },
  };
}

export function getMatchingThemeId(layout: AquariumLayout): string | undefined {
  return aquariumThemes.find((theme) =>
    JSON.stringify(theme.layout) === JSON.stringify(layout)
  )?.id;
}

export function getStructurePoints(layout: AquariumLayout): Vec2[] {
  const points: Vec2[] = [];
  if (layout.slots["mid-left"]) points.push({ x: 18, y: 26 });
  if (layout.slots["mid-right"]) points.push({ x: 42, y: 26 });
  return points;
}

function normalizeLayout(value: unknown): AquariumLayout {
  const parsed = layoutSchema.safeParse(value);
  if (!parsed.success) {
    return cloneLayout(aquariumThemes[0].layout);
  }
  const background = decorAssetsById[parsed.data.backgroundId];
  const substrate = decorAssetsById[parsed.data.substrateId];
  const fallback = getThemeById(parsed.data.themeId)?.layout ?? aquariumThemes[0].layout;
  const slots = Object.fromEntries(DECOR_SLOT_IDS.map((slotId) => {
    const placement = parsed.data.slots[slotId];
    const asset = placement ? decorAssetsById[placement.assetId] : undefined;
    return [slotId, asset?.allowedSlots.includes(slotId) ? placement : null];
  })) as AquariumLayout["slots"];
  return {
    ...parsed.data,
    backgroundId: background?.category === "background"
      ? parsed.data.backgroundId
      : fallback.backgroundId,
    substrateId: substrate?.category === "substrate"
      ? parsed.data.substrateId
      : fallback.substrateId,
    slots,
  };
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

function mapLegacyTheme(backgroundStyle: unknown): AquariumLayout["themeId"] {
  if (backgroundStyle === "deep") return "driftwood";
  if (backgroundStyle === "bright") return "iwagumi";
  return "planted";
}

function isLightingId(value: unknown): value is LightingId {
  return value === "natural" || value === "cool" || value === "evening" || value === "night";
}

function clampCount(count: number): number {
  return Math.max(0, Math.min(MAX_FISH_PER_SPECIES, Math.trunc(Number(count) || 0)));
}

function cloneLayout(layout: AquariumLayout): AquariumLayout {
  return {
    ...layout,
    slots: Object.fromEntries(DECOR_SLOT_IDS.map((slotId) => [
      slotId,
      layout.slots[slotId] ? { ...layout.slots[slotId]! } : null,
    ])) as AquariumLayout["slots"],
  };
}
