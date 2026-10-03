import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { framePlate } from "../core/plateFraming";
import type { AquariumScene, SurfaceFrame } from "../core/types";
import type { ViewRect } from "./fishLayer";

/** 水景の一枚絵（anchor 0.5）を、部屋と水槽画面で同じ切り取り方でガラスへ敷く。 */
export function placePlate(sprite: Sprite, glass: ViewRect, overscan: { x: number; y: number },
  scene: AquariumScene | undefined) {
  const rect = framePlate(sprite.texture, glass, overscan, scene);
  sprite.scale.set(rect.width / sprite.texture.width);
  sprite.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

/** cover 表示の画像座標を、前面ガラスに対する比率へ変換する。 */
export function getSurfaceFrame(plate: Sprite, glass: ViewRect): SurfaceFrame {
  return {
    x: (plate.x - plate.width / 2 - glass.x) / glass.width,
    y: (plate.y - plate.height / 2 - glass.y) / glass.height,
    width: plate.width / glass.width,
    height: plate.height / glass.height,
  };
}

// 同じ生成背景の該当箇所だけを重ねる。独立した素材を生成せず、輪郭と光を一致させる。
export class TerrainLayer {
  private readonly patches: Container[] = [];

  constructor(private readonly layer: Container) {
    layer.sortableChildren = true;
  }

  setScene(scene: AquariumScene, texture: Texture) {
    this.clear();
    for (const occluder of scene.terrain?.occluders ?? []) {
      const patch = new Container();
      const sprite = new Sprite(texture);
      const mask = new Graphics().poly(occluder.polygon.flatMap((point) =>
        [point.x * texture.width, point.y * texture.height])).fill(0xffffff);
      patch.addChild(sprite, mask);
      sprite.mask = mask;
      patch.zIndex = -occluder.depth;
      this.layer.addChild(patch);
      this.patches.push(patch);
    }
  }

  layout(plate: Sprite) {
    for (const patch of this.patches) {
      patch.position.set(plate.x - plate.width / 2, plate.y - plate.height / 2);
      patch.scale.copyFrom(plate.scale);
      patch.alpha = plate.alpha;
    }
  }

  clear() {
    for (const patch of this.patches) patch.destroy({ children: true });
    this.patches.length = 0;
  }
}
