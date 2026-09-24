import { Container, Sprite, Texture } from "pixi.js";
import type { Vec2 } from "../core";

const MAX_BUBBLES = 70;
const MOTE_COUNT = 36;
const SURFACE_Y = 0.065;

type Bubble = {
  sprite: Sprite;
  sourceX: number;
  sourceY: number;
  ageSec: number;
  riseSpeed: number;
  wobbleSeed: number;
  size: number;
};

type Mote = { sprite: Sprite; x: number; y: number; vx: number; vy: number; seed: number };

// エアストーンから柱状に上がる泡。水面で消え、出方は小刻みなまとまりにする。
export class BubbleColumns {
  readonly container = new Container();
  private readonly texture: Texture;
  private readonly bubbles: Bubble[] = [];
  private sources: Vec2[] = [];
  private spawnTimers: number[] = [];

  constructor(texture: Texture) {
    this.texture = texture;
  }

  setSources(sources: Vec2[]) {
    this.sources = sources;
    this.spawnTimers = sources.map((_, index) => index * 0.3);
  }

  /** spawning が false の間は新しい泡を出さない（画面の切り替えが終わるまで）。 */
  update(width: number, height: number, deltaSec: number, spawning = true) {
    for (const [index, source] of spawning ? this.sources.entries() : []) {
      this.spawnTimers[index]! -= deltaSec;
      if (this.spawnTimers[index]! <= 0 && this.bubbles.length < MAX_BUBBLES) {
        this.spawn(source);
        // 泡はまとまって出たり途切れたりする。
        this.spawnTimers[index] = Math.random() < 0.72
          ? 0.05 + Math.random() * 0.12
          : 0.5 + Math.random() * 0.9;
      }
    }
    for (let index = this.bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = this.bubbles[index]!;
      bubble.ageSec += deltaSec;
      const startY = bubble.sourceY * height;
      const rise = bubble.riseSpeed * height * (bubble.ageSec + 0.35 * bubble.ageSec * bubble.ageSec);
      const y = startY - rise;
      const spread = Math.min(1, bubble.ageSec / 3);
      const x = bubble.sourceX * width +
        Math.sin(bubble.ageSec * 7 + bubble.wobbleSeed) * width * 0.0025 * (0.4 + spread) +
        Math.sin(bubble.ageSec * 1.3 + bubble.wobbleSeed * 2) * width * 0.01 * spread;
      const scale = (width * bubble.size * (1 + spread * 0.35)) / this.texture.width;
      bubble.sprite.position.set(x, y);
      bubble.sprite.scale.set(scale * (1 + Math.sin(bubble.ageSec * 11 + bubble.wobbleSeed) * 0.06), scale);
      const surfaceFade = Math.min(1, Math.max(0, (y / height - SURFACE_Y) / 0.04));
      bubble.sprite.alpha = 0.62 * Math.min(1, bubble.ageSec * 6) * surfaceFade;
      if (y / height < SURFACE_Y) {
        bubble.sprite.destroy();
        this.bubbles.splice(index, 1);
      }
    }
  }

  private spawn(source: Vec2) {
    const sprite = new Sprite(this.texture);
    sprite.anchor.set(0.5);
    sprite.alpha = 0;
    this.container.addChild(sprite);
    this.bubbles.push({
      sprite,
      sourceX: source.x + (Math.random() - 0.5) * 0.006,
      sourceY: source.y,
      ageSec: 0,
      riseSpeed: 0.1 + Math.random() * 0.05,
      wobbleSeed: Math.random() * Math.PI * 2,
      size: 0.0035 + Math.random() ** 2 * 0.006,
    });
  }
}

// 水中をゆっくり漂う細かな浮遊物。水の厚みを感じさせる程度に薄く。
export class FloatingMotes {
  readonly container = new Container();
  private readonly motes: Mote[] = [];

  constructor(texture: Texture) {
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.container.addChild(sprite);
      this.motes.push({
        sprite,
        x: Math.random(),
        y: 0.08 + Math.random() * 0.85,
        vx: (Math.random() - 0.5) * 0.004,
        vy: (Math.random() - 0.4) * 0.003,
        seed: Math.random() * Math.PI * 2,
      });
    }
  }

  /** opacity は全体の濃さ（0〜1）。切り替え直後は0から少しずつ出す。 */
  update(width: number, height: number, timeSec: number, deltaSec: number, opacity = 1) {
    for (const mote of this.motes) {
      mote.x = wrap(mote.x + (mote.vx + Math.sin(timeSec * 0.2 + mote.seed) * 0.002) * deltaSec);
      mote.y = 0.08 + wrap((mote.y - 0.08 + mote.vy * deltaSec) / 0.86) * 0.86;
      const size = 0.0012 + (mote.seed % 1) * 0.0014;
      mote.sprite.position.set(mote.x * width, mote.y * height);
      mote.sprite.scale.set((width * size) / mote.sprite.texture.width);
      mote.sprite.alpha = (0.1 + 0.08 * Math.sin(timeSec * 0.5 + mote.seed * 3)) * opacity;
    }
  }
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}
