export type Vec2 = { x: number; y: number };

export type LightingId = "natural" | "cool" | "evening" | "night";
export type SwimZoneId = "surface" | "middle" | "bottom";

export type FishCatalogInfo = {
  scientificName: string;
  originRegionId: string;
  originRegionName: string;
  origin: string;
  temperament: string;
  movement: string;
  habitat: string;
  aliases?: string[];
};

type SpeciesBehaviorProfile = {
  separationBodyLengths: number;
  alignmentBodyLengths: number;
  attractionBodyLengths: number;
  separationStrength: number;
  alignmentStrength: number;
  attractionStrength: number;
  wallAvoidanceStrength: number;
  edgeCruiseChance: number;
  structureAffinity: number;
  surfaceAffinity: number;
  zoneHoldStrength: number;
  surfaceVisitChance: number;
  structurePatrolStrength: number;
};

type SwimMotionProfile = {
  kickIntervalSecMin: number;
  kickIntervalSecMax: number;
  kickDurationSec: number;
  pauseDurationSecMin: number;
  pauseDurationSecMax: number;
  coastDragPerSec: number;
  wanderStrength: number;
};

export type FishSpeciesDefinition = {
  id: string;
  displayName: string;
  realBodyLengthCm: number;
  catalog: FishCatalogInfo;
  animation?: { framesPerSecond: number };
  visual: { fallbackColor: string };
  sourceBodyBounds: { x: number; y: number; width: number; height: number };
  cruisingSpeedCmPerSec: number;
  burstSpeedCmPerSec: number;
  turnRateRadPerSec: number;
  stopProbabilityPerSec: number;
  motion: SwimMotionProfile;
  preferredZone: { minX: number; maxX: number; minY: number; maxY: number };
  schooling: { enabled: boolean; radiusCm: number; strength: number };
  behavior: SpeciesBehaviorProfile;
};

export type FishTargetKind = "openWater" | "structure" | "edgeCruise" | "surfaceVisit";

export type FishInstance = {
  id: string;
  speciesId: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  depth: number;
  bodyLengthVariance: number;
  behaviorMode: "kick" | "coast" | "pause";
  behaviorTimeRemainingSec: number;
  target?: Vec2;
  targetKind?: FishTargetKind;
  seed: number;
};

export type TankDefinition = {
  id: string;
  displayName: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  safeMarginCm: number;
};

export type SimulationInput = {
  tank: TankDefinition;
  species: Record<string, FishSpeciesDefinition>;
  fish: FishInstance[];
  deltaSec: number;
  structurePoints: Vec2[];
};

export type SimulationOutput = { fish: FishInstance[] };
export type FishStockEntry = { speciesId: string; count: number };

export type DecorSlotId =
  | "rear-left"
  | "rear-right"
  | "mid-left"
  | "mid-right"
  | "front-left"
  | "front-center"
  | "front-right";

export type DecorCategory = "background" | "substrate" | "rear" | "mid" | "front";
export type DecorPlacement = { assetId: string; flipped: boolean };

export type AquariumLayout = {
  themeId: "planted" | "driftwood" | "iwagumi";
  backgroundId: string;
  substrateId: string;
  lighting: LightingId;
  slots: Record<DecorSlotId, DecorPlacement | null>;
};

export type DecorAssetDefinition = {
  id: string;
  displayName: string;
  category: DecorCategory;
  allowedSlots: DecorSlotId[];
  scale: number;
  anchorY: number;
};

export type AquariumTheme = {
  id: AquariumLayout["themeId"];
  displayName: string;
  description: string;
  layout: AquariumLayout;
};

export type AquariumCustomization = { stock: FishStockEntry[]; layout: AquariumLayout };
export type AquariumPreferences = { soundEnabled: boolean; soundVolume: number };

export type AquariumPersistedState = {
  version: 3;
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
};

export type AquariumConfig = {
  legacyStorageKey: string;
  legacyStateStorageKey: string;
  stateStorageKey: string;
  maxFishPerSpecies: number;
  maxTotalFish: number;
  themes: AquariumTheme[];
};
