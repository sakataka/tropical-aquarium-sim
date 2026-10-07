// 画像の URL。描画ライブラリ（PixiJS）に依存しないので、館内図や設定パネルからも使える。
// 展示室・水景・魚の画像の URL は、館の索引（core/museum.ts）と展示室のモジュール（core/catalog.ts）が持つ。
import bubbleParticleUrl from "../content/environment/bubble.png";
import { getHallImageUrls } from "../core/catalog";

export { getFishImageUrl, getRoomImageUrl, getScenePlateUrl } from "../core/catalog";

export const environmentAssets = { bubbleParticleUrl };

/** 展示室の部屋の絵、水景、魚の画像の URL。泡の画像はどの展示室でも使う。 */
export function getHallTextureUrls(hallId: string): Set<string> {
  return new Set([environmentAssets.bubbleParticleUrl, ...getHallImageUrls(hallId)]);
}
