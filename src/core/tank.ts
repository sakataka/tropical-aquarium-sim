import type { TankDefinition } from "./types";

export const TANK_60CM: TankDefinition = {
  id: "standard-60cm",
  displayName: "60cm Standard Tank",
  widthCm: 60,
  heightCm: 36,
  depthCm: 30,
  safeMarginCm: 2,
  feedPoint: {
    x: 30,
    y: 5,
  },
};
