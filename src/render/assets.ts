import { Assets, type Texture } from "pixi.js";

export * from "./assetUrls";

// PixiJS は既定で Web Worker の中で fetch と createImageBitmap を使って画像を読む。
// iPhone の Safari ではこれが失敗することがあったため、<img> と同じ通常の読み込みにする。
Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });

// 読み込んだテクスチャの URL。展示室を移ったら、次の展示室で使わないものを GPU から外す。
// 展示室は十数室、水景は数十枚あり、回るたびに積み上がると iPhone のメモリが足りなくなるため。
const loadedTextureUrls = new Set<string>();

export function loadTexture(src: string, options?: { mipmaps?: boolean }): Promise<Texture> {
  loadedTextureUrls.add(src);
  return Assets.load<Texture>(options?.mipmaps ? { src, data: { autoGenerateMipmaps: true } } : src);
}

/**
 * keep にないテクスチャを解放する。解放したテクスチャを使う画面（前の展示室）が
 * すでに外れてから呼ぶ。魚のテクスチャは fishLayer が destroyed を見て読み直す。
 */
export function releaseTexturesExcept(keep: ReadonlySet<string>): void {
  const unused = [...loadedTextureUrls].filter((url) => !keep.has(url));
  if (unused.length === 0) return;
  for (const url of unused) loadedTextureUrls.delete(url);
  void Assets.unload(unused).catch((error: unknown) => console.error("Texture release failed", error));
}
