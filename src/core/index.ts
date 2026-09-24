export { fishCatalog } from "./catalog";
export {
  AQUARIUM_STATE_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  DEFAULT_PREFERENCES,
  LEGACY_AQUARIUM_STATE_STORAGE_KEY,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  PREVIOUS_AQUARIUM_STATE_STORAGE_KEY,
  getDefaultLayout,
  getStructurePoints,
  migrateLegacyAquariumState,
  normalizeAquariumCustomization,
  normalizeAquariumPersistedState,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getStockCount,
  reconcileFishStock,
} from "./fishPopulation";
export { aquariumScenes, getSceneById } from "./sceneCatalog";
export { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";
export { stepSimulation } from "./simulation";
export { TANK_60CM } from "./tank";
export type {
  AquariumCustomization,
  AquariumLayout,
  AquariumPersistedState,
  AquariumPreferences,
  AquariumScene,
  FishCatalogInfo,
  FishInstance,
  FishSpeciesDefinition,
  FishStockEntry,
  FishSwimStyle,
  LightingId,
  SwimZoneId,
  TankDefinition,
  Vec2,
} from "./types";
