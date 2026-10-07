export {
  fishCatalog,
  getSceneById,
  getSpeciesLimit,
  getTankById,
  loadHall,
} from "./catalog";
export {
  AQUARIUM_STATE_STORAGE_KEY,
  DISCARDED_STORAGE_KEYS,
  createDefaultState,
  getDefaultLayout,
  normalizeAquariumPersistedState,
  normalizeHallCustomizations,
  setStockCount,
} from "./customization";
export {
  createFishFromStock,
  getStockCount,
  reconcileFishStock,
} from "./fishPopulation";
export { imageToGlass } from "./plateFraming";
export { getFishSpriteScale } from "./scale";
export { stepSimulation } from "./simulation";
export { startleFish } from "./startle";
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
  FishPersonality,
  FishSpeciesDefinition,
  FishStockEntry,
  FishSwimStyle,
  LightingId,
  SwimZoneId,
  TankDefinition,
  Vec2,
} from "./types";
