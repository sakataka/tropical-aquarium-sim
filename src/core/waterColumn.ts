import type { AquariumScene, SurfaceFrame, TankDefinition } from "./types";
import { clamp, lerp } from "./math";

/**
 * 魚が泳げる水の部分。水面の上の空気まで見える水景（マングローブ、干潟）では、
 * 水面より上へ泳ぎ出さず、泳ぐ層（preferredZone）も水の部分に対する比率として当てる。
 * 水面は手前ほど絵の下に、奥ほど上に見えるので、高さは奥行きごとに決まる。
 */
export type WaterColumn = {
  /** 奥行き depth（0 = ガラス側、1 = 奥）での水面の高さ (cm、ガラスの上端から)。 */
  topCm: (depth: number) => number;
  heightCm: number;
};

export function getWaterColumn(tank: TankDefinition, scene: Pick<AquariumScene, "waterLine"> | undefined,
  frame: SurfaceFrame): WaterColumn {
  const line = scene?.waterLine;
  if (!line) return { topCm: () => 0, heightCm: tank.heightCm };
  // 水面がガラスの下端近くまで下がっても、底の上に泳ぐ余地を残す。
  const limit = tank.heightCm * 0.7;
  const top = (imageY: number) => clamp((frame.y + imageY * frame.height) * tank.heightCm, 0, limit);
  const front = top(line.front);
  const back = top(line.back);
  return { topCm: (depth) => lerp(front, back, clamp(depth, 0, 1)), heightCm: tank.heightCm };
}

/** 水の部分に対する高さの比率（0 = 水面、1 = 底）を、ガラスの上端からの cm へ直す。 */
export function waterY(water: WaterColumn, ratio: number, depth: number): number {
  const top = water.topCm(depth);
  return top + ratio * (water.heightCm - top);
}

/** 魚が上がれる高さ (cm)。水面の少し下。 */
export function waterCeilingCm(water: WaterColumn, tank: TankDefinition, depth: number): number {
  return water.topCm(depth) + tank.safeMarginCm;
}
