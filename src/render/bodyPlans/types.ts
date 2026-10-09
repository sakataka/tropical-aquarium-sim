import type { FishInstance } from "../../core";
import type { BodyPlanId } from "../../core/bodyPlans";
import type { Vec2 } from "../../core/types";

/** メッシュの横の分割数。どの体のつくりでも同じにし、接地点の計算を共通にする。 */
export const VERTICES_X = 26;
/** 反転の途中でも、体が線のように潰れきらない幅。 */
export const MIN_PROFILE_WIDTH = 0.1;

/** species.swim を描画側の標準値で埋めたもの。 */
export type SwimStyle = {
  tailBeatHz: number;
  bodyWaveStart: number;
  waveCount: number;
  tailSweepRad: number;
  verticalFlex: number;
  bodyPlan: BodyPlanId;
  headStart: number;
  mouthAnchor: Vec2;
  footAnchor: Vec2;
  bell: { top: number; bottom: number };
  fins?: { x: number; y: number; radius: number }[];
  tailStartY?: number;
  wings?: { rootX: number; y: number; top: number; bottom: number };
  legs?: { x: number; y: number; footX: number; footY: number; width: number; beat: 0 | 1 }[];
  spine?: Vec2[];
  limbs?: { kind: "hind" | "fore"; joints: Vec2[] }[];
  radial?: { x: number; y: number; radius: number; reach: number };
};

// 尾の振りや向きの状態は魚ごとに1つだけ持ち、部屋と水槽画面で共有する。
export type MotionState = {
  phase: number;
  amplitude: number;
  yaw: number;
  yawVelocity: number;
  targetYaw: number;
  sinceTurnSec: number;
  pitch: number;
  /** エビやカニの脚の運び。歩く速さに合わせて進む。 */
  stridePhase: number;
  clockSec: number;
  surfaceRotation?: number;
  detailPhase: number;
  contactAnchor?: { x: number; y: number };
  /** 驚いたときの構え（0〜1）。エビは尾を打つ腹の曲がり、カニははさみの振り上げ。 */
  flick: number;
  /** 歩いている度合い（0〜1）。両生類が立ち止まるときに、上げた脚をゆっくり下ろす。 */
  stepBlend: number;
  /** 泳いでいる度合い（0〜1）。両生類が面を離れて泳ぐ間、脚をたたんで体をくねらせる。 */
  swimBlend: number;
  /** 前を持ち上げている度合い（0〜1）。カブトガニが脚を伸ばして砂を探る。 */
  lift: number;
  /** 砂に潜っている度合い（0〜1）。fishBody が体を沈め、砂が透けて見えるよう薄くする。 */
  burial: number;
  /** カエルの後脚の伸び（-1 たたむ、0 画像の姿勢、1 伸ばしきる）。 */
  stroke?: number;
  /** カエルが最後に蹴り始めてからの秒数。 */
  strokeSec?: number;
  /** 前のフレームで蹴っていたか。蹴り始めを見分ける。 */
  kicking?: boolean;
  /** ヒトデが体の面の中でゆっくり回った角度（ラジアン）。画像を反転せず、這う間に少しずつ向きが変わる。 */
  spin?: number;
};

/** 変形に使う、画像メッシュとその元の形。 */
export type BodyMesh = {
  /** 書き換える頂点座標（x, y の並び）。 */
  positions: Float32Array;
  /** 変形前の頂点座標。 */
  base: Float32Array;
  width: number;
  height: number;
  pivotX: number;
  verticesY: number;
  swim: SwimStyle;
  motion: MotionState;
};

export type DeformFrame = {
  fish: FishInstance;
  /** 今の速さ (cm/秒)。 */
  speed: number;
  deltaSec: number;
  /** 水槽の底の高さ (cm)。泳いでいるか歩いているかの判定に使う。 */
  bottomY: number;
  /** この個体の体長 (cm)。歩幅から脚の運びの速さを決めるのに使う。 */
  bodyLengthCm: number;
};

/** 体のつくりごとの描き方。メッシュの縦の分割数と、毎フレームの変形。 */
export type BodyPlanRenderer = {
  verticesY: number;
  deform: (mesh: BodyMesh, frame: DeformFrame) => void;
  /** 上下へ進むときに体を傾ける割合（既定 1）。体を曲げない生き物は小さくする。 */
  pitchScale?: number;
  /**
   * 面の傾きに合わせて体を回す割合（既定 1）。面の多くは奥へ向かって上がる線で、画面の上では急な坂に見えても
   * 実際には平らなことが多い。平たく伏せる生き物（ヒトデ、ウニ）は小さくし、坂で体が立ち上がって見えないようにする。
   */
  surfaceTilt?: number;
  /**
   * 生き物の位置に置く、メッシュ上の固定の点（画像の座標）。接地や向きにかかわらず動かさない。
   * 真上から見たエイは、見下ろした体盤の手前の縁（体盤の中心の真下）にする。既定は、泳ぐ間は画像の中心、
   * 底や面に着くときは口・腹・脚の接地点。
   */
  pivot?: (size: { width: number; height: number; swim: SwimStyle }) => Vec2;
};

/** 横向きの幅（反転の途中は細くなる）。符号は向き。 */
export function profileWidth(yaw: number): number {
  const rawCos = Math.cos(yaw);
  return Math.sign(rawCos || 1) * Math.max(MIN_PROFILE_WIDTH, Math.abs(rawCos));
}
