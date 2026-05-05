export type Vec2 = {
  x: number;
  y: number;
};

export type BodyBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PreferredZone = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type SchoolingProfile = {
  enabled: boolean;
  radiusCm: number;
  strength: number;
};

export type SpeciesBehaviorProfile = {
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

export type SwimMotionProfile = {
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

export type FishAnimationProfile = {
  framePattern: string;
  framesPerSecond: number;
};

export type FishVisualProfile = {
  fallbackColor: string;
};

export type FishSpeciesDefinition = {
  id: string;
  displayName: string;
  realBodyLengthCm: number;
  sideImage: string;
  animation?: FishAnimationProfile;
  visual?: FishVisualProfile;
  sourceBodyBounds: BodyBounds;
  cruisingSpeedCmPerSec: number;
  burstSpeedCmPerSec: number;
  turnRateRadPerSec: number;
  stopProbabilityPerSec: number;
  motion: SwimMotionProfile;
  preferredZone: PreferredZone;
  schooling: SchoolingProfile;
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

export type FishBehaviorMode = "kick" | "coast" | "pause" | "feed" | "tapFlee" | "tapFreeze" | "tapApproach";
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
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  depth: number;
  bodyLengthVariance: number;
  behaviorMode: FishBehaviorMode;
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

export type AquariumBackgroundStyle = "clear" | "deep" | "bright";
export type AquariumPlantVisibility = "off" | "subtle" | "full";
export type AquariumPlantDensity = "low" | "medium" | "high";
export type AquariumLighting = "natural" | "cool" | "evening" | "night";

export type AquariumEnvironmentCustomization = {
  backgroundStyle: AquariumBackgroundStyle;
  rearPlants: AquariumPlantVisibility;
  foregroundPlants: AquariumPlantVisibility;
  plantDensity: AquariumPlantDensity;
  lighting: AquariumLighting;
};

export type AquariumCustomization = {
  stock: FishStockEntry[];
  environment: AquariumEnvironmentCustomization;
};

export type AquariumPreset = AquariumCustomization & {
  id: string;
  displayName: string;
};

export type AquariumConfig = {
  storageKey: string;
  maxFishPerSpecies: number;
  maxTotalFish: number;
  defaultEnvironment: AquariumEnvironmentCustomization;
  presets: AquariumPreset[];
};
