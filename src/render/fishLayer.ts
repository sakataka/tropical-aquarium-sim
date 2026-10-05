import { Container, Texture } from "pixi.js";
import {
  getFishSpriteScale,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import { getFishImageUrl, loadTexture } from "./assets";
import { FishBody } from "./fishBody";
import { clamp } from "../core/math";

type FishRecord = { body: FishBody; visualScale: number };
export type ViewRect = { x: number; y: number; width: number; height: number };

// 魚の画像は全画面で共有し、同じ魚種を何度も読み込まない。
const fishTextures = new Map<string, Texture | Promise<void>>();

// 水槽1つ分の魚を、指定した矩形（水槽の前面ガラス）に描く。
// 背景から切り抜いた石・流木（TerrainLayer）と同じ層に置き、zIndex（奥行き）で前後を決める。
export class FishLayer {
  waterTint = 0xffffff;
  private readonly records = new Map<string, FishRecord>();

  constructor(private readonly layer: Container) {
    layer.sortableChildren = true;
  }

  update(
    fish: FishInstance[],
    catalog: Record<string, FishSpeciesDefinition>,
    tank: TankDefinition,
    rect: ViewRect,
    deltaSec: number,
    /** false のときは描くだけで、尾の振りなどの状態は進めない（もう一方の画面が進める）。 */
    advance = true,
  ) {
    const activeIds = new Set(fish.map((item) => item.id));
    for (const [id, record] of this.records) {
      if (!activeIds.has(id)) {
        record.body.destroy();
        this.records.delete(id);
      }
    }
    for (const item of fish) {
      const definition = catalog[item.speciesId];
      if (!definition) continue;
      let record = this.records.get(item.id);
      if (!record) {
        const texture = getFishTexture(definition);
        if (!texture) continue;
        record = {
          body: new FishBody(texture, definition, item),
          visualScale: 0,
        };
        this.records.set(item.id, record);
      }
      const mesh = record.body.mesh;
      if (mesh.parent !== this.layer) this.layer.addChild(mesh);

      // 体長は原画の体の幅を基準に決まるので、縮小した画像の幅へ換算する。
      const textureScale = definition.sourceBodyBounds.width / record.body.mesh.texture.width;
      const scale = textureScale * getFishSpriteScale({
        viewportWidthPx: rect.width,
        tankWidthCm: tank.widthCm,
        species: definition,
        bodyLengthVariance: item.bodyLengthVariance,
        depth: item.depth,
      });
      record.visualScale = record.visualScale === 0
        ? scale
        : record.visualScale + (scale - record.visualScale) * (1 - Math.exp(-4 * deltaSec));
      mesh.position.set(
        rect.x + (item.position.x / tank.widthCm) * rect.width,
        rect.y + (item.position.y / tank.heightCm) * rect.height,
      );
      mesh.scale.set(record.visualScale);
      // 奥の魚はぼかさず、水の色と透明度だけで距離を出す。上からの光は水面近くほど強く、
      // 底や奥では弱まるので、同じ魚でも泳ぐ位置で明るさが変わり、水景の光となじむ。
      const lightFalloff = clamp(1.04 - (item.position.y / tank.heightCm) * 0.2 - item.depth * 0.1, 0.72, 1);
      mesh.tint = scaleColor(mixColor(0xffffff, this.waterTint, 0.06 + item.depth * 0.26), lightFalloff);
      mesh.alpha = 1 - item.depth * 0.08;
      mesh.zIndex = -item.depth;
      const angle = item.surfaceMotion?.angle ?? item.contact?.angle;
      const surfaceAngle = angle !== undefined
        ? Math.atan(Math.tan(angle) * rect.height / rect.width) : undefined;
      record.body.update(item, advance ? deltaSec : 0, tank.heightCm - tank.safeMarginCm, surfaceAngle);
    }
  }

  destroy() {
    for (const record of this.records.values()) record.body.destroy();
    this.records.clear();
  }
}

// 水の色を明るく正規化し、魚にかける乗算色にする。
export function getWaterTint(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const max = Math.max(...channels, 1);
  const [r, g, b] = channels.map((channel) => Math.round((channel / max) * 255));
  return (r! << 16) | (g! << 8) | b!;
}

function getFishTexture(definition: FishSpeciesDefinition): Texture | undefined {
  const cached = fishTextures.get(definition.id);
  // 展示室を移ったときに解放されたテクスチャは読み直す（assets.ts の releaseTexturesExcept）。
  if (cached instanceof Texture && !cached.destroyed) return cached;
  if (cached && !(cached instanceof Texture)) return undefined;
  const url = getFishImageUrl(definition.id);
  if (!url) return undefined;
  // 大きな原画を小さく表示するため、ミップマップでちらつきを抑える。
  fishTextures.set(definition.id, loadTexture(url, { mipmaps: true }).then((texture) => {
    fishTextures.set(definition.id, texture);
  }).catch((error: unknown) => {
    fishTextures.delete(definition.id);
    console.error(`Fish texture failed: ${definition.id}`, error);
  }));
  return undefined;
}

function scaleColor(color: number, amount: number): number {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * amount) << shift;
  return channel(16) | channel(8) | channel(0);
}


function mixColor(from: number, to: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}
