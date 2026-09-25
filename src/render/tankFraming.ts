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

/** 縦長の画面では、最初から水槽の高さが画面のこの割合になるまで寄せる。 */
const MIN_INITIAL_HEIGHT_RATIO = 0.4;

/**
 * 最初に映す倍率。横長の画面では1倍（全体）。縦長の画面で水槽が細い帯に
 * ならないよう寄せ、はみ出した分は横にスワイプして見る。
 */
export function getInitialZoom(glass: { width: number; height: number }, viewWidth: number, viewHeight: number) {
  const cover = Math.max(viewWidth / glass.width, viewHeight / glass.height);
  const wanted = (viewHeight * MIN_INITIAL_HEIGHT_RATIO) / glass.height;
  return Math.max(1, Math.min(wanted, cover));
}

/** 画素数の多いスマホでGPUメモリを使いすぎないよう、描画解像度に上限を設ける。 */
const MAX_CANVAS_PIXELS = 4_000_000;

export function getRenderOptions(width: number, height: number) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const pixelLimit = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height));
  return {
    resolution: Math.max(1, Math.min(devicePixelRatio, 2, pixelLimit)),
    // 高精細な画面ではアンチエイリアスがなくても縁は十分なめらかで、メモリを大きく節約できる。
    antialias: devicePixelRatio < 2,
  };
}
