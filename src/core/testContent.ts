// テスト専用。水景の一枚絵のピクセル寸法を読み、描画と同じ切り取り方で地形を検証する。
import { framePlate, toSurfaceFrame } from "./plateFraming";
import { getGlassAspect, getWindowOverscan } from "./room";
import type { AquariumScene, SurfaceFrame, TankDefinition } from "./types";

const plateModules = import.meta.glob<string>("../content/environment/scenes/*/plate.webp", {
  eager: true, import: "default", query: "?inline",
});

/** WebP のヘッダー（VP8X / VP8 / VP8L）から画像の幅と高さを読む。 */
function getPlateSize(sceneId: string): { width: number; height: number } {
  const entry = Object.entries(plateModules).find(([path]) => path.endsWith(`/scenes/${sceneId}/plate.webp`));
  if (!entry) throw new Error(`plate.webp not found: ${sceneId}`);
  const binary = atob(entry[1].slice(entry[1].indexOf(",") + 1, entry[1].indexOf(",") + 1 + 64));
  const byte = (i: number) => binary.charCodeAt(i);
  const chunk = binary.slice(12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + (byte(24) | byte(25) << 8 | byte(26) << 16), height: 1 + (byte(27) | byte(28) << 8 | byte(29) << 16) };
  }
  if (chunk === "VP8 ") return { width: (byte(26) | byte(27) << 8) & 0x3fff, height: (byte(28) | byte(29) << 8) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = byte(21) | byte(22) << 8 | byte(23) << 16 | byte(24) << 24;
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unsupported WebP chunk for ${sceneId}: ${chunk}`);
}

/** 部屋と水槽画面で使うのと同じ、水景画像のガラスに対する位置。 */
export function getRenderedSurfaceFrame(tank: TankDefinition, scene: AquariumScene): SurfaceFrame {
  const glass = { x: 0, y: 0, width: getGlassAspect(tank), height: 1 };
  return toSurfaceFrame(framePlate(getPlateSize(scene.id), glass, getWindowOverscan(tank.id), scene), glass);
}
