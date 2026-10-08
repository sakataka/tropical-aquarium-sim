import type { BodyPlanId } from "../../core/bodyPlans";
import { crabRenderer } from "./crab";
import { crustaceanRenderer } from "./crustacean";
import { fishRenderer } from "./fish";
import { horseshoeCrabRenderer } from "./horseshoeCrab";
import { jellyRenderer } from "./jelly";
import { octopusRenderer } from "./octopus";
import { pteropodRenderer } from "./pteropod";
import { rayRenderer } from "./ray";
import { seahorseRenderer } from "./seahorse";
import { squidRenderer } from "./squid";
import type { BodyPlanRenderer } from "./types";
import { walkerRenderer } from "./walker";

// 体のつくりごとの描き方。core の BODY_PLANS に足した体のつくりは、ここにも足す（欠けると型エラー）。
export const BODY_PLAN_RENDERERS: Record<BodyPlanId, BodyPlanRenderer> = {
  fish: fishRenderer,
  crustacean: crustaceanRenderer,
  crab: crabRenderer,
  jelly: jellyRenderer,
  octopus: octopusRenderer,
  squid: squidRenderer,
  seahorse: seahorseRenderer,
  pteropod: pteropodRenderer,
  walker: walkerRenderer,
  horseshoeCrab: horseshoeCrabRenderer,
  ray: rayRenderer,
};

export * from "./types";
