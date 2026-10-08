import type { BodyPlanId } from "./bodyPlans";

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
/** 住みかの種類。イソギンチャク、砂礫の巣穴、岩の隙間、流木や岩の下の陰、尾を巻きつける海草や海藻の茎。 */
export const SHELTER_KINDS = ["anemone", "burrow", "crevice", "cave", "holdfast"] as const;
export type ShelterKind = typeof SHELTER_KINDS[number];
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
  /** 砂に潜って休んでいる間（習性 burrow）。pauseSec が尽きると砂から出て歩き出す。 */
  burrowed?: boolean;
  /** 驚いて尾を打ち、後ろ向きに跳ね退いている間。向き（facing）は変えない。 */
  flee?: { direction: -1 | 1; remainingSec: number; facing: -1 | 1 };
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
  /** 面を歩く生き物が、砂の面で立ち止まったときに砂に潜って休む。砂でない面では潜らない。 */
  | { type: "burrow"; chancePerMin: number; durationSec: [number, number] }
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
   * 体のつくり。性質は src/core/bodyPlans.ts、描き方は src/render/bodyPlans/ にある。
   * crustacean（エビ）は尾で泳がず、脚で歩き、触角を揺らし、遊泳肢で泳ぐときだけ腹を小さくしならせる。
   */
  bodyPlan: BodyPlanId;
  /** 画像の左端から頭（触角の付け根）までの割合。これより左は触角として揺らす。 */
  headStart: number;
  /** 切り出した画像内の口・脚の接地点。画像の見た目に合わせた比率。 */
  mouthAnchor: Vec2;
  footAnchor: Vec2;
  /** クラゲの傘（拍動する部分）の範囲。画像の上端0〜下端1の比率。傘が下にあれば、傘を下にして底で暮らす。 */
  bell: { top: number; bottom: number };
  /** 細かく震わせるひれ（タツノオトシゴの背びれ・胸びれ）。画像内の中心と、画像の横幅に対する半径。 */
  fins: { x: number; y: number; radius: number }[];
  /** 体を立てた画像（タツノオトシゴ）で、尾が始まる高さ。画像の上端0〜下端1の比率。 */
  tailStartY: number;
  /**
   * 体を立てた正面の画像（クリオネ）の左右の翼足。rootX は画像の中心から付け根までの距離（画像の横幅に対する比率）、
   * y は付け根の高さ、top・bottom は翼足の上端と下端（画像の上端0〜下端1の比率）。
   */
  wings: { rootX: number; y: number; top: number; bottom: number };
  /**
   * 歩く生き物（両生類）の脚。x・y は付け根（肩・腰）、footX・footY は足先、width は脚の太さ（画像の横幅に対する比率）。
   * beat が同じ脚は同じ拍で運び、0 と 1 の組は半拍ずらす（手前の前脚と奥の後脚、奥の前脚と手前の後脚を組にする）。
   */
  legs: { x: number; y: number; footX: number; footY: number; width: number; beat: 0 | 1 }[];
  /**
   * 体を立てた画像（チンアナゴ）の体の中心線。首の付け根（体がほぼ縦になる所）から尾の先まで、上から順に並べる
   * （画像の横幅・高さに対する比率）。最初の点より上の頭と曲がった首は、形を保ったまま動かす。
   */
  spine: Vec2[];
};

/** IUCN レッドリストの区分。NE は未評価。 */
export type ConservationStatus = "LC" | "NT" | "VU" | "EN" | "CR" | "EW" | "DD" | "NE";

/**
 * 図鑑の項目。出典は ecology.sources と共通で、出典のない数値は書かない。
 * 水温と pH は野外の生息地の値で、分かるものだけを持つ。
 */
export type FishProfile = {
  taxonomy: { order: string; orderJa: string; family: string; familyJa: string };
  /** 成体のふつうの大きさ (cm)。全長か標準体長か、雌雄差などは sizeNote に書く。 */
  adultSizeCm: number;
  sizeNote: string;
  distribution: string;
  water: {
    salinity: "freshwater" | "brackish" | "marine";
    temperatureC?: [number, number];
    pH?: [number, number];
  };
  /** 家庭で飼育される / 主に公共水族館で展示される / 生体の展示がほとんどない。 */
  keeping: "home" | "publicAquarium" | "rarelyDisplayed";
  /**
   * status は IUCN の区分。NE は「未評価」と確かめられたときだけ使い、
   * 評価を確かめられていないときは status を書かず、note にその旨を書く。
   */
  conservation: { status?: ConservationStatus; assessedYear?: number; note?: string };
  /** この展示で観察できる行動。ecology.habits と対応させる。 */
  highlights: string[];
};

export type FishSpeciesDefinition = {
  id: string;
  displayName: string;
  realBodyLengthCm: number;
  catalog: FishCatalogInfo;
  profile: FishProfile;
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
  | "home"
  | "flee";

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
  /** 岩を回り込む側。stuckSec は回り込みの途中で進めずにいる秒数。 */
  terrainRoute?: { sceneId: string; obstacleId: string; side: -1 | 1; stuckSec?: number };
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
  /** ガラスを叩かれて警戒している残り秒数。群れが締まり、物陰への戻りが速くなる。保存対象外。 */
  alarmSec?: number;
  /** クラゲの拍動の位相（0〜1）。推力と傘の縮みを描画と合わせる。保存対象外。 */
  pulsePhase?: number;
  /** クラゲの傘の傾き (rad)。進む向きへ少し傾ける。保存対象外。 */
  tilt?: number;
  /**
   * 面を歩く生き物が息継ぎに泳いでいる間。面を離れた点（perch）から水面の点（apex）へ上がり、
   * 息を吸ってから同じ道筋で perch へ戻り、離れたときの歩き方（surfaceMotion）に戻る。保存対象外。
   */
  breathTrip?: {
    sceneId: string;
    phase: "rise" | "breathe" | "sink";
    perch: Vec2;
    apex: Vec2;
    /** perch から apex までの道のりのどこにいるか（0〜1）。 */
    progress: number;
    /** 水面で息を吸う残り秒数。 */
    breatheSec: number;
    resume: SurfaceMotion;
  };
  /**
   * 巣穴に住む生き物（チンアナゴ）の巣穴と、体の出し方。巣穴の口は水景の画像の座標（水景のないときは水槽に対する比率）で持つ。
   * emerge は体（頭を含む）を巣穴から出している割合（0〜1）、reach は今出そうとしている割合。保存対象外。
   */
  burrowHome?: {
    sceneId: string;
    x: number;
    y: number;
    depth: number;
    emerge: number;
    reach: number;
    /** reach を選び直すまでの秒数。 */
    reachSec: number;
    /** 驚いて引っ込んだまま待つ残り秒数。 */
    hideSec: number;
    /** 向きを考え直すまでの秒数。 */
    turnSec: number;
  };
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
  /**
   * ガラス越しに見える水の高さ (cm)。魚の座標の縦の長さで、縦横の縮尺をそろえるため
   * 部屋の絵のガラスの縦横比から決める（水槽の高さを超えない）。
   */
  heightCm: number;
  /** 水槽の仕様としての高さ (cm)。表示用。 */
  specHeightCm: number;
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
  /** 寄り道先 (cm)。省略すると水景の structurePoints から求める。 */
  structurePoints?: Vec2[];
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
  /** 魚が寄り道する流木や水草の位置。地形と同じく背景画像に対する0〜1の比率。 */
  structurePoints: Vec2[];
  /** エアストーンの位置。背景画像に対する0〜1の比率。 */
  bubbleSources: Vec2[];
  /** 画像のどの高さ（0〜1）をガラスの下端に合わせるか。超横長の水槽で水の層を残すために使う。 */
  framing?: { plateBottom: number };
  /**
   * 水面の上の空気まで見える水景の、水面の高さ。背景画像に対する0〜1の比率で、
   * front はガラス側（奥行き0）、back は奥（奥行き1）で水面が見える高さ。省略時は全体が水中。
   */
  waterLine?: { front: number; back: number };
  terrain: SceneTerrain;
};

export type AquariumLayout = {
  sceneId: string;
  lighting: LightingId;
};

export type AquariumCustomization = { stock: FishStockEntry[]; layout: AquariumLayout };
export type AquariumPreferences = { soundEnabled: boolean; soundVolume: number };

export type AquariumPersistedState = {
  version: 5;
  activeTankId: string;
  /** 水槽ごとの設定。入ったことのある展示室の水槽だけを持つ。 */
  tanks: Record<string, AquariumCustomization>;
  preferences: AquariumPreferences;
};

export type AquariumConfig = {
  stateStorageKey: string;
  discardedStorageKeys: string[];
};
