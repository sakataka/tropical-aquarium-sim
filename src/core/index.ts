export { fishCatalog } from "./catalog";
export {
  DECOR_SLOT_IDS,
  DECOR_SLOT_LABELS,
  decorAssets,
  decorAssetsById,
  getAssetsForSlot,
} from "./environmentCatalog";
export {
  AQUARIUM_STATE_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  DEFAULT_PREFERENCES,
  LEGACY_AQUARIUM_STATE_STORAGE_KEY,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumThemes,
  getMatchingThemeId,
  getStructurePoints,
  getThemeById,
  migrateLegacyAquariumState,
  normalizeAquariumCustomization,
  normalizeAquariumPersistedState,
  setLayoutSlot,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getStockCount,
  reconcileFishStock,
} from "./fishPopulation";
export { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";
export { stepSimulation } from "./simulation";
export { TANK_60CM } from "./tank";
export type {
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  AquariumTheme,
  DecorAssetDefinition,
  DecorPlacement,
  DecorSlotId,
  FishCatalogInfo,
  FishInstance,
  FishSpeciesDefinition,
  FishStockEntry,
  LightingId,
  SwimZoneId,
  TankDefinition,
  Vec2,
} from "./types";
