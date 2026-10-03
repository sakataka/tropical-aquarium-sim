export type Vec2 = { x: number; y: number };

// 背景画像上の座標と前後位置。画像の輪郭に沿う経路を、水景ごとに持つ。
export type SurfacePoint = Vec2 & { depth: number };
export type SceneSurface = {
  id: string;
  material: "sand" | "stone" | "wood" | "leaf";
  points: SurfacePoint[];
};
export type SceneTerrain = {
  surfaces: SceneSurface[];
  occluders: { id: string; depth: number; polygon: Vec2[] }[];
  /** 画像内の石・木の内部。遮蔽の輪郭とは別に、奥行きのある回避領域を持つ。 */
  obstacles?: { id: string; center: SurfacePoint; radius: Vec2; depthRadius: number }[];
  /** 隠れ場所・住みか。kind を持つものは、その種類を住みかにする魚が優先して使う。 */
  shelters?: (SurfacePoint & { id: string; kind?: ShelterKind })[];
};
/** 住みかの種類。イソギンチャク、砂礫の巣穴、岩の隙間、流木や岩の下の陰。 */
export type ShelterKind = "anemone" | "burrow" | "crevice" | "cave";
// cover 表示で切り取られる背景と、前面ガラスの座標を一致させる。
export type SurfaceFrame = { x: number; y: number; width: number; height: number };
export type SurfaceMotion = {
  sceneId: string;
  surfaceId: string;
  progress: number;
  direction: -1 | 1;
  pauseSec: number;
  grazing: boolean;
  angle: number;
};

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
  | { type: "follow"; chancePerMin: number; durationSec: [number, number] }
  /**
   * 決まった住みか（水景の shelter の kind）の近くで暮らし、ときどき入って休む。
   * 夜や昼の隠れ場所にも、この種類の住みかを優先して使う。
   */
  | {
    type: "homeShelter";
    kind: ShelterKind;
    /** 住みかから離れる範囲（体長の倍数）。 */
    rangeBodyLengths: number;
    visitChancePerMin: number;
    visitDurationSec: [number, number];
  };

export type FishHabitType = FishHabit["type"];

// 生態の傾向は公開情報を参照。速度・頻度などの数値は鑑賞用の調整値で、実測値ではない。
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
  /**
   * 体のつくり。crustacean（エビ）は尾で泳がず、脚で歩き、触角を揺らし、
   * 遊泳肢で泳ぐときだけ腹を小さくしならせる。
   */
  bodyPlan: "fish" | "crustacean";
  /** 画像の左端から頭（触角の付け根）までの割合。これより左は触角として揺らす。 */
  headStart: number;
  /** 切り出した画像内の口・脚の接地点。画像の見た目に合わせた比率。 */
  mouthAnchor: Vec2;
  footAnchor: Vec2;
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
  | "follow"
  | "home";

/** 生成時に決まる種の標準値への倍率。泳ぐ間は変化させず、保存・管理UIの対象にしない。 */
export type FishPersonality = Readonly<{
  pace: number;
  responsiveness: number;
  restfulness: number;
  sociability: number;
  personalSpace: number;
  exploration: number;
}>;

export type FishInstance = {
  id: string;
  speciesId: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  depth: number;
  surfaceMotion?: SurfaceMotion;
  /** 習性行動の目的地。画像の座標を再計算できる参照だけを保持する。 */
  terrainGoal?: {
    sceneId: string; surfaceId?: string; progress?: number; shelterId?: string; facing?: -1 | 1;
    /** 同じ隠れ場所に入る仲間と重ならないよう、左右へずらす量 (cm)。 */
    offsetCm?: number;
  };
  /** 接地への寄り・離れを描画でも連続させる。保存対象外。 */
  contact?: { angle: number; kind: "mouth" | "belly"; weight: number };
  terrainRoute?: { sceneId: string; obstacleId: string; side: -1 | 1 };
  depthMotion?: { target: number; velocity: number; remainingSec: number };
  homeDepth?: number;
  bodyLengthVariance: number;
  personality: FishPersonality;
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

export type TankSpeciesSlot = { speciesId: string; maxCount: number };

// 水景・サイズ・入れられる魚種があらかじめ決まった水槽の型。
export type TankDefinition = {
  id: string;
  order: number;
  displayName: string;
  /** 展示ラベルに添える英字の名前。 */
  exhibitName: string;
  category: string;
  description: string;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  safeMarginCm: number;
  maxTotalFish: number;
  sceneIds: string[];
  species: TankSpeciesSlot[];
  defaultStock: FishStockEntry[];
};

export type SimulationInput = {
  tank: TankDefinition;
  lighting?: LightingId;
  species: Record<string, FishSpeciesDefinition>;
  fish: FishInstance[];
  deltaSec: number;
  structurePoints: Vec2[];
  scene?: AquariumScene;
  surfaceFrame?: SurfaceFrame;
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
  /** 画像のどの高さ（0〜1）をガラスの下端に合わせるか。超横長の水槽で水の層を残すために使う。 */
  framing?: { plateBottom: number };
  terrain?: SceneTerrain;
};

export type AquariumLayout = {
  sceneId: string;
  lighting: LightingId;
};

export type AquariumCustomization = { stock: FishStockEntry[]; layout: AquariumLayout };
export type AquariumPreferences = { soundEnabled: boolean; soundVolume: number };

export type AquariumPersistedState = {
  version: 5;
  stockArrangementVersion: number;
  fiveTankStockVersion: number;
  activeTankId: string;
  tanks: Record<string, AquariumCustomization>;
  preferences: AquariumPreferences;
};

export type AquariumConfig = {
  stateStorageKey: string;
  legacyStorageKeys: string[];
  discardedStorageKeys: string[];
};
