import { z } from "zod";
import configJson from "../content/aquarium/customization.json";
import { getSceneById } from "./sceneCatalog";
import { aquariumTanks, getSpeciesLimit, getTankById } from "./tankCatalog";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  FishSpeciesDefinition,
  FishStockEntry,
  LightingId,
  TankDefinition,
  Vec2,
} from "./types";

const configSchema = z.object({
  stateStorageKey: z.string().min(1),
  legacyStorageKeys: z.array(z.string().min(1)),
  discardedStorageKeys: z.array(z.string().min(1)),
});

const config = configSchema.parse(configJson) as AquariumConfig;

export const AQUARIUM_STATE_STORAGE_KEY = config.stateStorageKey;
/** 新しい順。読み込み時は最初に見つかったものだけを移行する。 */
export const LEGACY_STORAGE_KEYS = config.legacyStorageKeys;
/** 読まずに消す古い保存。魚種を追加したら保存キーの末尾を上げ、前のキーをここへ移して初期状態から始め直す。 */
export const DISCARDED_STORAGE_KEYS = config.discardedStorageKeys;

export const DEFAULT_PREFERENCES: AquariumPreferences = {
  soundEnabled: false,
  soundVolume: 0.42,
};

const persistedStateSchema = z.object({
  version: z.literal(5),
  activeTankId: z.string(),
  tanks: z.record(z.string(), z.unknown()),
  preferences: z.unknown(),
});

export function getDefaultLayout(tank: TankDefinition, sceneId?: string): AquariumLayout {
  const id = sceneId && tank.sceneIds.includes(sceneId) ? sceneId : tank.sceneIds[0]!;
  return { sceneId: id, lighting: getSceneById(id)?.defaultLighting ?? "natural" };
}

export function getDefaultCustomization(
  tank: TankDefinition,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumCustomization {
  return {
    stock: normalizeStock(tank.defaultStock, tank, speciesCatalog),
    layout: getDefaultLayout(tank),
  };
}

export function createDefaultState(
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState {
  return {
    version: 5,
    activeTankId: aquariumTanks[0]!.id,
    tanks: Object.fromEntries(aquariumTanks.map((tank) => [
      tank.id,
      getDefaultCustomization(tank, speciesCatalog),
    ])),
    preferences: DEFAULT_PREFERENCES,
  };
}

// 水槽に入れられない魚種や上限を超えた匹数、ほかの水槽の水景は落とす。
export function normalizeTankCustomization(
  value: unknown,
  tank: TankDefinition,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumCustomization {
  if (!value || typeof value !== "object") return getDefaultCustomization(tank, speciesCatalog);
  const candidate = value as Partial<AquariumCustomization>;
  return {
    stock: Array.isArray(candidate.stock)
      ? normalizeStock(candidate.stock, tank, speciesCatalog)
      : normalizeStock(tank.defaultStock, tank, speciesCatalog),
    layout: normalizeLayout(candidate.layout, tank),
  };
}

export function normalizeAquariumPersistedState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  const parsed = persistedStateSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return {
    version: 5,
    activeTankId: getTankById(parsed.data.activeTankId)?.id ?? aquariumTanks[0]!.id,
    tanks: Object.fromEntries(aquariumTanks.map((tank) => [
      tank.id,
      normalizeTankCustomization(parsed.data.tanks[tank.id], tank, speciesCatalog),
    ])),
    preferences: normalizePreferences(parsed.data.preferences),
  };
}

// v1〜v4 は60cm水槽1つだった。魚種はそれを入れられる水槽へ、水景と照明はその水景を持つ水槽へ移す。
export function migrateLegacyAquariumState(
  value: unknown,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): AquariumPersistedState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as {
    customization?: {
      stock?: unknown;
      environment?: Record<string, unknown>;
      layout?: Record<string, unknown>;
    };
    stock?: unknown;
    environment?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
  };
  const legacyCustomization = source.customization ?? source;
  const legacyLayout = source.customization?.layout;
  const environment = legacyCustomization.environment ?? {};
  const legacySceneId = typeof legacyLayout?.sceneId === "string"
    ? legacyLayout.sceneId
    : typeof legacyLayout?.themeId === "string"
      ? legacyLayout.themeId
      : mapLegacyBackground(environment.backgroundStyle);
  const legacyLighting = legacyLayout?.lighting ?? environment.lighting;
  const legacyStock = Array.isArray(legacyCustomization.stock)
    ? legacyCustomization.stock as FishStockEntry[]
    : [];

  const state = createDefaultState(speciesCatalog);
  const moved = new Map<string, FishStockEntry[]>();
  for (const entry of legacyStock) {
    const speciesId = entry && typeof entry === "object" ? entry.speciesId : undefined;
    const tank = aquariumTanks.find((item) => speciesId && getSpeciesLimit(item, speciesId) > 0);
    if (!tank) continue;
    moved.set(tank.id, [...(moved.get(tank.id) ?? []), entry]);
  }
  for (const tank of aquariumTanks) {
    const current = state.tanks[tank.id]!;
    const stock = moved.get(tank.id);
    const ownsScene = tank.sceneIds.includes(legacySceneId);
    state.tanks[tank.id] = {
      stock: stock ? normalizeStock(stock, tank, speciesCatalog) : current.stock,
      layout: ownsScene
        ? {
          sceneId: legacySceneId,
          lighting: isLightingId(legacyLighting) ? legacyLighting : current.layout.lighting,
        }
        : current.layout,
    };
    if (ownsScene) state.activeTankId = tank.id;
  }
  const preferences = source.preferences ?? {};
  state.preferences = normalizePreferences({ soundVolume: preferences.soundVolume });
  return state;
}

export function setStockCount(
  stock: FishStockEntry[],
  speciesId: string,
  count: number,
  tank: TankDefinition,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const next = new Map(stock.map((entry) => [entry.speciesId, entry.count]));
  next.set(speciesId, count);
  return normalizeStock(
    Array.from(next, ([entrySpeciesId, entryCount]) => ({
      speciesId: entrySpeciesId,
      count: entryCount,
    })),
    tank,
    speciesCatalog,
  );
}

/** 水景の構造物（流木など）の位置を、水槽の実寸 (cm) で返す。 */
export function getStructurePoints(tank: TankDefinition, layout: AquariumLayout): Vec2[] {
  return (getSceneById(layout.sceneId)?.structurePoints ?? []).map((point) => ({
    x: point.x * tank.widthCm,
    y: point.y * tank.heightCm,
  }));
}

function normalizeLayout(value: unknown, tank: TankDefinition): AquariumLayout {
  const candidate = value && typeof value === "object"
    ? value as Partial<AquariumLayout>
    : {};
  const layout = getDefaultLayout(tank, candidate.sceneId);
  return {
    sceneId: layout.sceneId,
    lighting: isLightingId(candidate.lighting) ? candidate.lighting : layout.lighting,
  };
}

function normalizeStock(
  stock: unknown[],
  tank: TankDefinition,
  speciesCatalog: Record<string, FishSpeciesDefinition>,
): FishStockEntry[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const item of stock) {
    if (!item || typeof item !== "object") continue;
    const { speciesId, count } = item as FishStockEntry;
    const limit = getSpeciesLimit(tank, speciesId);
    if (!speciesCatalog[speciesId] || limit === 0) continue;
    if (!counts.has(speciesId)) order.push(speciesId);
    counts.set(speciesId, Math.min(limit, (counts.get(speciesId) ?? 0) + clampCount(count)));
  }
  const result: FishStockEntry[] = [];
  let total = 0;
  for (const speciesId of order) {
    const count = Math.min(counts.get(speciesId) ?? 0, tank.maxTotalFish - total);
    if (count > 0) result.push({ speciesId, count });
    total += count;
    if (total >= tank.maxTotalFish) break;
  }
  return result;
}

// 環境音は保存値に関係なく毎回OFFで始める。ONにするのはその場で選んだときだけ。
function normalizePreferences(value: unknown): AquariumPreferences {
  const candidate = value && typeof value === "object"
    ? value as Partial<AquariumPreferences>
    : {};
  return {
    soundEnabled: false,
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

function isLightingId(value: unknown): value is LightingId {
  return value === "natural" || value === "cool" || value === "evening" || value === "night";
}

function clampCount(count: number): number {
  return Math.max(0, Math.trunc(Number(count) || 0));
}
