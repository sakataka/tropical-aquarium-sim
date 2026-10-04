import type { BodyPlanId } from "../../core/bodyPlans";
import { crustaceanRenderer } from "./crustacean";
import { fishRenderer } from "./fish";
import type { BodyPlanRenderer } from "./types";

// 体のつくりごとの描き方。core の BODY_PLANS に足した体のつくりは、ここにも足す（欠けると型エラー）。
export const BODY_PLAN_RENDERERS: Record<BodyPlanId, BodyPlanRenderer> = {
  fish: fishRenderer,
  crustacean: crustaceanRenderer,
};

export * from "./types";
