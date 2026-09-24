export { fishCatalog } from "./catalog";
export {
  AQUARIUM_STATE_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  LEGACY_STORAGE_KEYS,
  createDefaultState,
  getDefaultCustomization,
  getDefaultLayout,
  getStructurePoints,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  normalizeTankCustomization,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getStockCount,
  reconcileFishStock,
} from "./fishPopulation";
export { aquariumScenes, getSceneById } from "./sceneCatalog";
export { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";
export { getActivityLevel, stepSimulation } from "./simulation";
export { aquariumTanks, getSpeciesLimit, getTankById } from "./tankCatalog";
export type {
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  AquariumScene,
  FishCatalogInfo,
  FishEcology,
  FishHabit,
  FishInstance,
  FishSpeciesDefinition,
  FishStockEntry,
  FishSwimStyle,
  LightingId,
  SwimZoneId,
  TankDefinition,
  Vec2,
} from "./types";
