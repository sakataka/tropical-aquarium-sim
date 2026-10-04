import { getBodyPlan } from "./bodyPlans";
import type { FishSpeciesDefinition } from "./types";
import { clamp } from "./math";

export function getTargetBodyLengthPx(params: {
  viewportWidthPx: number;
  tankWidthCm: number;
  realBodyLengthCm: number;
}): number {
  return (
    params.viewportWidthPx * (params.realBodyLengthCm / params.tankWidthCm)
  );
}

export function getBaseSpriteScale(params: {
  viewportWidthPx: number;
  tankWidthCm: number;
  species: FishSpeciesDefinition;
}): number {
  const targetBodyLengthPx = getTargetBodyLengthPx({
    viewportWidthPx: params.viewportWidthPx,
    tankWidthCm: params.tankWidthCm,
    realBodyLengthCm: params.species.realBodyLengthCm,
  });

  // 切り出しには触角も含まれるが、エビの体長は頭から尾までで合わせる。
  const antennaFraction = getBodyPlan(params.species).antennae
    ? params.species.swim?.headStart ?? 0
    : 0;
  return targetBodyLengthPx / (params.species.sourceBodyBounds.width * (1 - antennaFraction));
}

function applyBodyLengthVariance(
  baseScale: number,
  bodyLengthVariance: number,
): number {
  return baseScale * clamp(bodyLengthVariance, 0.85, 1.15);
}

function applyDepthScale(baseScale: number, depth: number): number {
  const normalizedDepth = clamp(depth, 0, 1);
  return baseScale * (1.04 - normalizedDepth * 0.1);
}

export function getFishSpriteScale(params: {
  viewportWidthPx: number;
  tankWidthCm: number;
  species: FishSpeciesDefinition;
  bodyLengthVariance?: number;
  depth?: number;
}): number {
  let scale = getBaseSpriteScale(params);

  if (params.bodyLengthVariance !== undefined) {
    scale = applyBodyLengthVariance(scale, params.bodyLengthVariance);
  }

  if (params.depth !== undefined) {
    scale = applyDepthScale(scale, params.depth);
  }

  return scale;
}

