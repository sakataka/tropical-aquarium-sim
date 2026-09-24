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

export type ActivityPeriod = "diurnal" | "crepuscular" | "nocturnal";
export type SwimGait = "burstCoast" | "steady" | "glide" | "undulate";
export type SocialGrouping = "school" | "shoal" | "group" | "solitary";

export type FishHabit =
  | { type: "airBreathing"; breathsPerHour: [number, number]; style: "dash" | "rise" }
  | { type: "bottomRest"; chancePerMin: number; durationSec: [number, number] }
  | { type: "bottomForage" }
  | { type: "grazing"; chancePerMin: number; durationSec: [number, number] }
  | { type: "hideByDay"; durationSec: [number, number] }
  | { type: "follow"; chancePerMin: number; durationSec: [number, number] };

export type FishHabitType = FishHabit["type"];

// 公開情報から調べた生態を、体長あたりの速度など実在の単位で持つ。
export type FishEcology = {
  activityPeriod: ActivityPeriod;
  gait: SwimGait;
  speedBodyLengthsPerSec: { cruise: number; burst: number };
  turnRateRadPerSec: number;
  /** 昼間に止まって漂ったり休んだりする時間の割合。 */
  restFraction: number;
  /** 前後方向の居場所（0 = ガラス側、1 = 奥）。 */
  depthRange: [number, number];
  social: {
    grouping: SocialGrouping;
    spacingBodyLengths: number;
    cohesion: number;
    polarization: number;
  };
  structureAffinity: number;
  habits: FishHabit[];
  sources: { title: string; url: string }[];
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
  preferredZone: { minX: number; maxX: number; minY: number; maxY: number };
  ecology: FishEcology;
};

export type FishTargetKind =
  | "openWater"
  | "structure"
  | "surfaceVisit"
  | "descend"
  | "rest"
  | "hide"
  | "forage"
  | "follow";

export type FishInstance = {
  id: string;
  speciesId: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  depth: number;
  bodyLengthVariance: number;
  behaviorMode: "kick" | "coast" | "pause" | "rest" | "forage";
  behaviorTimeRemainingSec: number;
  target?: Vec2;
  targetKind?: FishTargetKind;
  /** 今の目的地へ向かい始めてからの秒数。描画・保存には使わない。 */
  legTimeSec?: number;
  /** 休む・ついばむ・追いかけるなど、今の習性行動の残り秒数。 */
  habitTimeSec?: number;
  followId?: string;
  nextBreathSec?: number;
  /** 描画用の姿勢。底を探るときは頭を下げる。 */
  posture?: "level" | "noseDown";
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
  lighting?: LightingId;
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
