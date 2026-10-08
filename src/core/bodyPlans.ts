import type { FishSpeciesDefinition } from "./types";

/**
 * 体のつくりが動きに与える性質。シミュレーションは体のつくりの名前ではなく、この性質を見て分岐する。
 * 新しい体のつくり（クラゲ、タコなど）は、ここに性質を足し、描画側の
 * src/render/bodyPlans/ に変形を足す。どちらかが欠けると型エラーになる。
 */
export type BodyPlanTraits = {
  /** 地形のある水景では、泳がずに砂底・石・流木の面の上を歩く。 */
  walksOnSurfaces: boolean;
  /** 底で暮らし、泳層や水中の寄り道先へ浮き上がらない。生まれる位置も底。 */
  bottomDweller: boolean;
  /** 尾で水を蹴って加速する。false なら蹴る拍でも巡航の速さのまま進む。 */
  tailKick: boolean;
  /** 画像の前端に触角があり、体長は swim.headStart より後ろで測る。 */
  antennae: boolean;
  /** 横歩きする。進む向きへ体を向けず、向きを保ったまま左右へ歩き、休むときにときどき向きを変える。 */
  sideways: boolean;
  /**
   * 泳がずに漂う（クラゲ）。傘の拍動で傘の向きへ進み、開く間にゆっくり沈む。
   * 向きを変えず（画像を反転しない）、群れ・住みか・地形の面を使わない。動きは src/core/driftMotion.ts。
   */
  drifts: boolean;
  /**
   * 前へも後ろへも泳ぐ（イカ、オウムガイ）。体の向きを保ったまま後ろへも進み、
   * 同じ向きへしばらく後ろ向きに進んだときだけ向きを変える。
   */
  reverses: boolean;
  /**
   * ガラスを叩かれたとき。dart = 瞬発で泳ぎ去る、tailFlip = 腹を丸めて後ろへ跳ねる、
   * scuttle = 向きを変えずに横へ素早く走って離れ、はさみを振り上げる。
   * jet = 漏斗から水を噴いて胴を先に飛び退き、腕をそろえてなびかせる（タコ、イカ）。none = 反応しない（クラゲ）。
   */
  startle: "dart" | "tailFlip" | "scuttle" | "jet" | "none";
};

export const BODY_PLANS = {
  fish: {
    walksOnSurfaces: false,
    bottomDweller: false,
    tailKick: true,
    antennae: false,
    sideways: false,
    drifts: false,
    reverses: false,
    startle: "dart",
  },
  // エビ。脚で歩き、触角を揺らし、驚くと尾で後ろへ跳ねる。
  crustacean: {
    walksOnSurfaces: true,
    bottomDweller: true,
    tailKick: false,
    antennae: true,
    sideways: false,
    drifts: false,
    reverses: false,
    startle: "tailFlip",
  },
  // カニ。斜め前から見た画像で、脚を左右へ広げて横へ歩く。ついばむときは、はさみを交互に口へ運ぶ。
  crab: {
    walksOnSurfaces: true,
    bottomDweller: true,
    tailKick: false,
    antennae: false,
    sideways: true,
    drifts: false,
    reverses: false,
    startle: "scuttle",
  },
  // クラゲ。傘を上にした真横の画像（サカサクラゲは傘が下）。傘を縮める拍で進み、触手をなびかせて漂う。
  jelly: {
    walksOnSurfaces: false,
    bottomDweller: false,
    tailKick: false,
    antennae: false,
    sideways: false,
    drifts: true,
    reverses: false,
    startle: "none",
  },
  // タコ。斜め上から見た画像（前が左、胴が右上）。腕をうねらせて底を這い、長く休む。驚くと胴を先に噴射で飛び退く。
  octopus: {
    walksOnSurfaces: true,
    bottomDweller: true,
    tailKick: false,
    antennae: false,
    sideways: false,
    drifts: false,
    reverses: false,
    startle: "jet",
  },
  // イカ・オウムガイ。真横の画像（腕が左）。ひれを波打たせて前へも後ろへも進み、驚くと噴射で後ろへ飛び退く。
  squid: {
    walksOnSurfaces: false,
    bottomDweller: false,
    tailKick: false,
    antennae: false,
    sideways: false,
    drifts: false,
    reverses: true,
    startle: "jet",
  },
} as const satisfies Record<string, BodyPlanTraits>;

export type BodyPlanId = keyof typeof BODY_PLANS;

export const BODY_PLAN_IDS = Object.keys(BODY_PLANS) as [BodyPlanId, ...BodyPlanId[]];

/** swim.headStart を使う体のつくり。エビは触角の付け根、イカは腕の付け根を書く。 */
export const HEAD_START_PLANS: readonly BodyPlanId[] = ["crustacean", "squid"];

export function getBodyPlanId(species: FishSpeciesDefinition): BodyPlanId {
  return species.swim?.bodyPlan ?? "fish";
}

export function getBodyPlan(species: FishSpeciesDefinition): BodyPlanTraits {
  return BODY_PLANS[getBodyPlanId(species)];
}
