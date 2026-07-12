export { fishCatalog } from "./catalog";
export {
  createFeedingEvent,
  createTapEvent,
  getActiveFeeding,
  getActiveTap,
} from "./aquariumEvents";
export {
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumPresets,
  getPresetById,
  normalizeAquariumCustomization,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getMatchingPresetId,
  getStockCount,
  reconcileFishStock,
} from "./fishPopulation";
export { getBaseSpriteScale, getFishSpriteScale, getTargetBodyLengthPx } from "./scale";
export { fishGuideSchema } from "./schema";
export { stepSimulation } from "./simulation";
export { TANK_60CM } from "./tank";
export type {
  AquariumCustomization,
  AquariumEnvironmentCustomization,
  AquariumPreset,
  FeedingEvent,
  FishGuideEntry,
  FishInstance,
  FishSpeciesDefinition,
  TankDefinition,
  TapEvent,
  Vec2,
} from "./types";
