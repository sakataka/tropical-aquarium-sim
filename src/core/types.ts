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

// 画像メッシュの尾の振り方。未指定の項目は描画側の標準値を使う。
export type FishSwimStyle = {
  tailBeatHz: number;
  bodyWaveStart: number;
  waveCount: number;
  tailSweepRad: number;
  verticalFlex: number;
};

export type FishSpeciesDefinition = {
  id: string;
  displayName: string;
  realBodyLengthCm: number;
  catalog: FishCatalogInfo;
  swim?: Partial<FishSwimStyle>;
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

// 一枚絵の水景。背景と前景切り抜きは scenes/<id>/ に同じ構図で置く。
export type AquariumScene = {
  id: string;
  order: number;
  displayName: string;
  description: string;
  defaultLighting: LightingId;
  waterColor: string;
  structurePoints: Vec2[];
  bubbleSources: Vec2[];
};

export type AquariumLayout = {
  sceneId: string;
  lighting: LightingId;
};

export type AquariumCustomization = { stock: FishStockEntry[]; layout: AquariumLayout };
export type AquariumPreferences = { soundEnabled: boolean; soundVolume: number };

export type AquariumPersistedState = {
  version: 4;
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
};

export type AquariumConfig = {
  legacyStorageKey: string;
  legacyStateStorageKey: string;
  previousStateStorageKey: string;
  stateStorageKey: string;
  maxFishPerSpecies: number;
  maxTotalFish: number;
};
