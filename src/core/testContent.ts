import { closeSync, openSync, readSync } from "node:fs";
// テスト専用。水景の一枚絵のピクセル寸法を読み、描画と同じ切り取り方で地形を検証する。
import { framePlate, toSurfaceFrame } from "./plateFraming";
import { getGlassAspect, getWindowOverscan } from "./museum";
import type { AquariumScene, SurfaceFrame, TankDefinition } from "./types";

const plateHeaders = new Map<string, Uint8Array>();
function plateHeader(sceneId: string): Uint8Array {
  const saved = plateHeaders.get(sceneId);
  if (saved) return saved;
  const file = new URL(`../content/environment/scenes/${sceneId}/plate.webp`, import.meta.url);
  const handle = openSync(file, "r");
  const header = new Uint8Array(48);
  let bytes: number;
  try { bytes = readSync(handle, header, 0, header.length, 0); } finally { closeSync(handle); }
  const result = header.subarray(0, bytes);
  plateHeaders.set(sceneId, result);
  return result;
}

/** WebP のヘッダー（VP8X / VP8 / VP8L）から画像の幅と高さを読む。 */
export function webpSize(header: Uint8Array, source: string): { width: number; height: number } {
  const byte = (i: number) => header[i]!;
  const chunk = String.fromCharCode(...header.slice(12, 16));
  const text = (start: number) => String.fromCharCode(...header.slice(start, start + 4));
  if (text(0) !== "RIFF" || text(8) !== "WEBP" || header.length < (chunk === "VP8L" ? 25 : 30)) {
    throw new Error(`Invalid WebP header for ${source}`);
  }
  if (chunk === "VP8X") {
    return { width: 1 + (byte(24) | byte(25) << 8 | byte(26) << 16), height: 1 + (byte(27) | byte(28) << 8 | byte(29) << 16) };
  }
  if (chunk === "VP8 ") return { width: (byte(26) | byte(27) << 8) & 0x3fff, height: (byte(28) | byte(29) << 8) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = byte(21) | byte(22) << 8 | byte(23) << 16 | byte(24) << 24;
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unsupported WebP chunk for ${source}: ${chunk}`);
}

/** 部屋と水槽画面で使うのと同じ、水景画像のガラスに対する位置。 */
export function getRenderedSurfaceFrame(tank: TankDefinition, scene: AquariumScene): SurfaceFrame {
  const glass = { x: 0, y: 0, width: getGlassAspect(tank.id), height: 1 };
  return toSurfaceFrame(framePlate(webpSize(plateHeader(scene.id), scene.id), glass, getWindowOverscan(tank.id), scene), glass);
}
