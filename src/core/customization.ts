import configJson from "../content/aquarium/customization.json";
import { getSpeciesLimit } from "./catalog";
import { defaultTankId, getSceneSummary, getTankSummary } from "./museum";
import type {
  AquariumConfig,
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  FishStockEntry,
  LightingId,
  TankDefinition,
} from "./types";

const config = configJson as AquariumConfig;

export const AQUARIUM_STATE_STORAGE_KEY = config.stateStorageKey;
/** 読まずに消す古い保存。通常の魚種追加では保存キーを変えない。 */
export const DISCARDED_STORAGE_KEYS = config.discardedStorageKeys;

const DEFAULT_PREFERENCES: AquariumPreferences = {
  soundEnabled: false,
  soundVolume: 0.42,
};

// 保存データの水槽ごとの設定は、その水槽のある展示室に入るまで匹数を確かめられない
// （水槽の定義は展示室のモジュールにある）。起動時には水景と照明だけを館の索引で確かめ、
// 匹数は展示室を読んだときに normalizeHallCustomizations で直す。まだ入っていない水槽の設定はない。

/** 水槽の水景。選べない水景なら、その水槽の最初の水景にする。照明は水景の既定。 */
export function getDefaultLayout(tank: { sceneIds: readonly string[] }, sceneId?: string): AquariumLayout {
  const id = sceneId && tank.sceneIds.includes(sceneId) ? sceneId : tank.sceneIds[0]!;
  return { sceneId: id, lighting: getSceneSummary(id)?.defaultLighting ?? "natural" };
}

export function createDefaultState(): AquariumPersistedState {
  return {
    version: 5,
    activeTankId: defaultTankId,
    tanks: {},
    preferences: DEFAULT_PREFERENCES,
  };
}

/** 保存データを読む。形が違えば undefined。館にない水槽の設定は落とす。 */
export function normalizeAquariumPersistedState(value: unknown): AquariumPersistedState | undefined {
  if (!isRecord(value) || value.version !== 5 || typeof value.activeTankId !== "string" || !isRecord(value.tanks)) {
    return undefined;
  }
  const tanks: Record<string, AquariumCustomization> = {};
  for (const [tankId, saved] of Object.entries(value.tanks)) {
    const tank = getTankSummary(tankId);
    if (!tank || !isRecord(saved)) continue;
    tanks[tankId] = {
      stock: Array.isArray(saved.stock) ? saved.stock.flatMap(toStockEntry) : [],
      layout: normalizeLayout(saved.layout, tank),
    };
  }
  return {
    version: 5,
    activeTankId: getTankSummary(value.activeTankId)?.id ?? defaultTankId,
    tanks,
    preferences: normalizePreferences(value.preferences),
  };
}

/**
 * 展示室の水槽の設定をそろえる。まだ設定のない水槽には既定の構成を入れ、
 * 保存されていた匹数は、水槽に入れられない生き物や上限を超えた分を落とす。
 */
export function normalizeHallCustomizations(
  saved: Readonly<Record<string, AquariumCustomization>>,
  tanks: readonly TankDefinition[],
): Record<string, AquariumCustomization> {
  const result = { ...saved };
  for (const tank of tanks) {
    const current = saved[tank.id];
    result[tank.id] = {
      stock: normalizeStock(current?.stock ?? tank.defaultStock, tank),
      layout: current?.layout ?? getDefaultLayout(tank),
    };
  }
  return result;
}

export function setStockCount(
  stock: FishStockEntry[],
  speciesId: string,
  count: number,
  tank: TankDefinition,
): FishStockEntry[] {
  const next = new Map(stock.map((entry) => [entry.speciesId, entry.count]));
  next.set(speciesId, count);
  return normalizeStock(
    Array.from(next, ([entrySpeciesId, entryCount]) => ({ speciesId: entrySpeciesId, count: entryCount })),
    tank,
  );
}

function normalizeLayout(value: unknown, tank: { sceneIds: readonly string[] }): AquariumLayout {
  const candidate = isRecord(value) ? value : {};
  const layout = getDefaultLayout(tank, typeof candidate.sceneId === "string" ? candidate.sceneId : undefined);
  return {
    sceneId: layout.sceneId,
    lighting: isLightingId(candidate.lighting) ? candidate.lighting : layout.lighting,
  };
}

function normalizeStock(stock: readonly FishStockEntry[], tank: TankDefinition): FishStockEntry[] {
  const counts = new Map<string, number>();
  for (const { speciesId, count } of stock) {
    const limit = getSpeciesLimit(tank, speciesId);
    if (limit === 0) continue;
    counts.set(speciesId, Math.min(limit, (counts.get(speciesId) ?? 0) + clampCount(count)));
  }
  const result: FishStockEntry[] = [];
  let total = 0;
  for (const [speciesId, limited] of counts) {
    const count = Math.min(limited, tank.maxTotalFish - total);
    if (count > 0) result.push({ speciesId, count });
    total += count;
    if (total >= tank.maxTotalFish) break;
  }
  return result;
}

function toStockEntry(value: unknown): FishStockEntry[] {
  return isRecord(value) && typeof value.speciesId === "string"
    ? [{ speciesId: value.speciesId, count: clampCount(value.count) }]
    : [];
}

// 環境音は保存値に関係なく毎回OFFで始める。ONにするのはその場で選んだときだけ。
function normalizePreferences(value: unknown): AquariumPreferences {
  const candidate = isRecord(value) ? value : {};
  return {
    soundEnabled: false,
    soundVolume: Math.max(0, Math.min(1,
      typeof candidate.soundVolume === "number"
        ? candidate.soundVolume
        : DEFAULT_PREFERENCES.soundVolume,
    )),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLightingId(value: unknown): value is LightingId {
  return value === "natural" || value === "cool" || value === "evening" || value === "night";
}

function clampCount(count: unknown): number {
  return Math.max(0, Math.trunc(Number(count) || 0));
}
