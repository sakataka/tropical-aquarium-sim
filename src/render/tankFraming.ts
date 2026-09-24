import type { TankDefinition } from "../core";
import { fishRoom } from "../core/room";

/** 最初は水槽の全体が余白を残して収まるようにする。 */
const VIEW_FILL_RATIO = 0.9;
/** 画面を覆う大きさの何倍まで近づけるか。 */
const MAX_ZOOM_OVER_COVER = 1.8;

// 水槽画面は部屋で見えているガラスと同じ縦横比で水景を切り取る。
// こうすると、部屋から寄り終えた構図と水槽画面の構図が一致する。
export function getGlassAspect(tank: TankDefinition): number {
  const placement = fishRoom.tanks.find((item) => item.tankId === tank.id);
  if (!placement) return tank.widthCm / tank.heightCm;
  return (placement.glass.width * fishRoom.aspectRatio) / placement.glass.height;
}

/** ガラスの全体が余白を残して画面に収まる大きさ（画面の px）。ズーム1倍の基準。 */
export function frameGlass(glassAspect: number, viewWidth: number, viewHeight: number) {
  const width = Math.min(viewWidth * VIEW_FILL_RATIO, viewHeight * VIEW_FILL_RATIO * glassAspect);
  return { width, height: width / glassAspect };
}

/** 近づける上限の倍率。ガラスが画面を覆う大きさよりさらに少し寄れる。 */
export function getMaxZoom(glass: { width: number; height: number }, viewWidth: number, viewHeight: number) {
  const cover = Math.max(viewWidth / glass.width, viewHeight / glass.height);
  return Math.max(2, cover * MAX_ZOOM_OVER_COVER);
}
