import type { TankDefinition } from "../core";
import { fishRoom } from "../core/room";

/** 縦長の画面でも、水槽の横幅の半分以上は見えるようにする。 */
const MIN_VISIBLE_WIDTH_RATIO = 0.5;

// 水槽画面は部屋で見えているガラスと同じ縦横比で水景を切り取る。
// こうすると、部屋から寄り終えた構図と水槽画面の構図が一致する。
export function getGlassAspect(tank: TankDefinition): number {
  const placement = fishRoom.tanks.find((item) => item.tankId === tank.id);
  if (!placement) return tank.widthCm / tank.heightCm;
  return (placement.glass.width * fishRoom.aspectRatio) / placement.glass.height;
}

/**
 * ガラスを画面いっぱいに映したときの大きさ（画面の px）。
 * はみ出した分はスクロールで眺める。
 */
export function frameGlass(glassAspect: number, viewWidth: number, viewHeight: number) {
  let width = viewWidth;
  let height = width / glassAspect;
  if (height < viewHeight) {
    height = viewHeight;
    width = height * glassAspect;
  }
  const maxWidth = viewWidth / MIN_VISIBLE_WIDTH_RATIO;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / glassAspect;
  }
  return { width, height };
}
