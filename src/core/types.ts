export type Vec2 = {
  x: number;
  y: number;
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
  foodResponsiveness: number;
  tapResponsiveness: number;
  tapResponse: "flee" | "freeze" | "approach";
  tapSurfaceBias: number;
  tapStructureBias: number;
  structurePatrolStrength: number;
};

type SwimMotionProfile = {
  kickIntervalSecMin: number;
  kickIntervalSecMax: number;
  kickDurationSec: number;
  pauseDurationSecMin: number;
  pauseDurationSecMax: number;
  feedDurationSecMin: number;
  feedDurationSecMax: number;
  feedSpeedMultiplier: number;
  coastDragPerSec: number;
  wanderStrength: number;
};

export type FishSpeciesDefinition = {
  id: string;
  displayName: string;
  realBodyLengthCm: number;
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

export type FishGuideEntry = {
  scientificName: string;
  origin: string;
  temperament: string;
  movement: string;
  habitat: string;
  note: string;
};

export type FishTargetKind =
  | "openWater"
  | "structure"
  | "edgeCruise"
  | "surfaceVisit"
  | "feed"
  | "tap";

export type FishInstance = {
  id: string;
  speciesId: string;
  arrivedAtMs: number;
  nickname?: string;
  favorite: boolean;
  lastFedAtMs?: number;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  depth: number;
  bodyLengthVariance: number;
  behaviorMode: "kick" | "coast" | "pause" | "feed" | "tapFlee" | "tapFreeze" | "tapApproach";
  behaviorTimeRemainingSec: number;
  target?: Vec2;
  targetKind?: FishTargetKind;
  hunger: number;
  seed: number;
};

export type TankDefinition = {
  id: string;
  displayName: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  safeMarginCm: number;
  feedPoint: Vec2;
};

export type FeedingEvent = {
  position: Vec2;
  strength: number;
  createdAtMs?: number;
};

export type TapEvent = {
  position: Vec2;
  strength: number;
  createdAtMs?: number;
};

export type SimulationInput = {
  tank: TankDefinition;
  species: Record<string, FishSpeciesDefinition>;
  fish: FishInstance[];
  deltaSec: number;
  feeding?: FeedingEvent;
  tapEvent?: TapEvent;
};

export type SimulationOutput = {
  fish: FishInstance[];
};

export type FishStockEntry = {
  speciesId: string;
  count: number;
};

export type AquariumEnvironmentCustomization = {
  backgroundStyle: "clear" | "deep" | "bright";
  rearPlants: "off" | "subtle" | "full";
  foregroundPlants: "off" | "subtle" | "full";
  plantDensity: "low" | "medium" | "high";
  lighting: "natural" | "cool" | "evening" | "night";
};

export type AquariumCustomization = {
  stock: FishStockEntry[];
  environment: AquariumEnvironmentCustomization;
};

export type FishResident = Pick<
  FishInstance,
  | "id"
  | "speciesId"
  | "arrivedAtMs"
  | "nickname"
  | "favorite"
  | "lastFedAtMs"
  | "bodyLengthVariance"
  | "hunger"
  | "seed"
>;

export type AquariumPreferences = {
  tankName: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  lightingMode: "auto" | "manual";
  soundEnabled: boolean;
  soundVolume: number;
};

export type AquariumPersistedState = {
  version: 2;
  customization: AquariumCustomization;
  residents: FishResident[];
  preferences: AquariumPreferences;
  selectedFishId?: string;
};

export type AquariumPreset = AquariumCustomization & {
  id: string;
  displayName: string;
};

export type AquariumConfig = {
  storageKey: string;
  stateStorageKey: string;
  maxFishPerSpecies: number;
  maxTotalFish: number;
  presets: AquariumPreset[];
};
