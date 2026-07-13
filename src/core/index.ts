export { fishCatalog } from "./catalog";
export {
  createFeedingEvent,
  createTapEvent,
  getActiveFeeding,
  getActiveTap,
} from "./aquariumEvents";
export {
  AQUARIUM_STATE_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumPresets,
  getPresetById,
  normalizeAquariumPersistedState,
  normalizeAquariumCustomization,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getMatchingPresetId,
  getStockCount,
  hydrateFishResidents,
  reconcileFishStock,
  toFishResidents,
} from "./fishPopulation";
export { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";
export { fishGuideSchema } from "./schema";
export { stepSimulation } from "./simulation";
export { TANK_60CM } from "./tank";
export type {
  AquariumCustomization,
  AquariumEnvironmentCustomization,
  AquariumPersistedState,
  AquariumPreferences,
  AquariumPreset,
  FeedingEvent,
  FishGuideEntry,
  FishInstance,
  FishSpeciesDefinition,
  TankDefinition,
  TapEvent,
  Vec2,
} from "./types";
