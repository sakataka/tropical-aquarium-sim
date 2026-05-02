import type { FishSpeciesDefinition } from "./types";

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

  return targetBodyLengthPx / params.species.sourceBodyBounds.width;
}

export function applyBodyLengthVariance(
  baseScale: number,
  bodyLengthVariance: number,
): number {
  return baseScale * clamp(bodyLengthVariance, 0.85, 1.15);
}

export function applyDepthScale(baseScale: number, depth: number): number {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
