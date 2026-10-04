import type { FishSpeciesDefinition } from "./types";

/**
 * 体のつくりが動きに与える性質。シミュレーションは体のつくりの名前ではなく、この性質を見て分岐する。
 * 新しい体のつくり（カニ、クラゲなど）は、ここに性質を足し、描画側の
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
  /** ガラスを叩かれたとき。dart = 瞬発で泳ぎ去る、tailFlip = 腹を丸めて後ろへ跳ねる。 */
  startle: "dart" | "tailFlip";
};

export const BODY_PLANS = {
  fish: {
    walksOnSurfaces: false,
    bottomDweller: false,
    tailKick: true,
    antennae: false,
    startle: "dart",
  },
  // エビ。脚で歩き、触角を揺らし、驚くと尾で後ろへ跳ねる。
  crustacean: {
    walksOnSurfaces: true,
    bottomDweller: true,
    tailKick: false,
    antennae: true,
    startle: "tailFlip",
  },
} as const satisfies Record<string, BodyPlanTraits>;

export type BodyPlanId = keyof typeof BODY_PLANS;

export const BODY_PLAN_IDS = Object.keys(BODY_PLANS) as [BodyPlanId, ...BodyPlanId[]];

export function getBodyPlanId(species: FishSpeciesDefinition): BodyPlanId {
  return species.swim?.bodyPlan ?? "fish";
}

export function getBodyPlan(species: FishSpeciesDefinition): BodyPlanTraits {
  return BODY_PLANS[getBodyPlanId(species)];
}
