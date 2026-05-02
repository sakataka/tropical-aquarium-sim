import { useEffect, useRef } from "react";
import {
  Application,
  Assets,
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import {
  getFishSpriteScale,
  getTargetBodyLengthPx,
  type FeedingEvent,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import { environmentAssets, getFishAnimationFrameUrls, getFishImageUrl } from "./assets";

type AquariumCanvasProps = {
  fish: FishInstance[];
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  paused: boolean;
  latestFeeding?: FeedingEvent;
};

type FishSpriteRecord = {
  sprite: AnimatedSprite;
  shadow: Graphics;
  fallback: Graphics;
  loadedAnimationKey?: string;
  visualX?: number;
  visualY?: number;
  visualScale?: number;
  visualAlpha?: number;
  visualRotation?: number;
};

export function AquariumCanvas({
  fish,
  species,
  tank,
  paused,
  latestFeeding,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<{
    root: Container;
    backplate: Container;
    rearDecor: Container;
    fish: Container;
    frontDecor: Container;
    glassEffects: Container;
    food: Container;
  } | null>(null);
  const fishSpritesRef = useRef<Map<string, FishSpriteRecord>>(new Map());
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const fishRef = useRef(fish);
  const speciesRef = useRef(species);
  const latestFeedingRef = useRef(latestFeeding);

  fishRef.current = fish;
  speciesRef.current = species;
  latestFeedingRef.current = latestFeeding;

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;

    if (!host) {
      return;
    }
    const hostElement = host;

    const app = new Application();
    appRef.current = app;

    async function setup() {
      await app.init({
        resizeTo: hostElement,
        preference: "webgl",
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });

      if (disposed) {
        app.destroy(true);
        return;
      }

      hostElement.appendChild(app.canvas);
      const root = new Container();
      const backplate = new Container();
      const rearDecor = new Container();
      const fishLayer = new Container();
      const food = new Container();
      const frontDecor = new Container();
      const glassEffects = new Container();

      root.addChild(backplate, rearDecor, fishLayer, food, frontDecor, glassEffects);
      app.stage.addChild(root);
      layerRef.current = {
        root,
        backplate,
        rearDecor,
        fish: fishLayer,
        frontDecor,
        glassEffects,
        food,
      };

      drawStaticTank(app, backplate, rearDecor, frontDecor, glassEffects);
      app.ticker.add((ticker) => {
        animateTankLayers(app, rearDecor, frontDecor, glassEffects, performance.now());
        updateFishSprites(
          app,
          fishLayer,
          textureCacheRef.current,
          Math.min(0.05, ticker.deltaMS / 1000),
          {
            fish: fishRef.current,
            species: speciesRef.current,
            tank,
          },
        );
        updateFood(app, food, latestFeedingRef.current);
        drawWaterOverlay(app, glassEffects, paused);
      });
    }

    setup();

    return () => {
      disposed = true;
      fishSpritesRef.current.clear();
      app.destroy(true, {
        children: true,
        texture: false,
      });
      appRef.current = null;
      layerRef.current = null;
    };
  }, [paused, tank]);

  return <div className="aquarium-canvas" ref={hostRef} />;

  function drawStaticTank(
    app: Application,
    backplateLayer: Container,
    rearDecorLayer: Container,
    frontDecorLayer: Container,
    glassEffectsLayer: Container,
  ) {
    backplateLayer.removeChildren();
    rearDecorLayer.removeChildren();
    frontDecorLayer.removeChildren();
    glassEffectsLayer.removeChildren();

    const waterFill = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0x0b4a52, alpha: 0.54 });
    backplateLayer.addChild(waterFill);

    const bg = new Sprite(Texture.EMPTY);
    bg.anchor.set(0.5);
    backplateLayer.addChild(bg);
    Assets.load<Texture>(environmentAssets.aquariumBackgroundUrl).then((texture) => {
      bg.texture = texture;
      resize();
    });

    const resize = () => {
      const width = app.screen.width;
      const height = app.screen.height;
      waterFill.clear().rect(0, 0, width, height).fill({ color: 0x0b4a52, alpha: 0.54 });
      bg.x = width / 2;
      bg.y = height / 2;
      if (bg.texture === Texture.EMPTY) {
        return;
      }
      bg.scale.set(
        Math.max(width / bg.texture.width, height / bg.texture.height),
      );
    };

    resize();
    app.renderer.on("resize", resize);

    const rearHaze = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0xbff4ed, alpha: 0.08 });
    rearDecorLayer.addChild(rearHaze);
    drawPlantCluster(rearDecorLayer, app.screen.width * 0.16, app.screen.height * 0.88, 0.84, 0.16);
    drawPlantCluster(rearDecorLayer, app.screen.width * 0.82, app.screen.height * 0.9, 0.72, 0.13);

    drawPlantCluster(frontDecorLayer, app.screen.width * 0.04, app.screen.height * 0.98, 1.24, 0.32);
    drawPlantCluster(frontDecorLayer, app.screen.width * 0.96, app.screen.height * 1.02, 1.12, 0.28);

    const surfaceSheen = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height * 0.22)
      .fill({ color: 0xe5ffff, alpha: 0.08 });
    surfaceSheen.name = "surface-sheen";
    glassEffectsLayer.addChild(surfaceSheen);

    const glass = new Graphics()
      .roundRect(10, 10, Math.max(0, app.screen.width - 20), Math.max(0, app.screen.height - 20), 18)
      .stroke({ color: 0xb8f0ff, alpha: 0.28, width: 2 });
    glass.name = "glass-frame";
    glassEffectsLayer.addChild(glass);

    drawGlassHighlights(glassEffectsLayer, app.screen.width, app.screen.height);

    for (let i = 0; i < 26; i += 1) {
      const bubble = new Graphics()
        .circle(0, 0, 1.2 + (i % 5) * 0.55)
        .stroke({ color: 0xd7fbff, alpha: 0.5, width: 1 });
      bubble.x = app.screen.width * (0.08 + ((i * 37) % 100) / 125);
      bubble.y = app.screen.height * (0.15 + ((i * 29) % 100) / 120);
      bubble.alpha = 0.35 + (i % 4) * 0.1;
      rearDecorLayer.addChild(bubble);
    }
  }

  function updateFishSprites(
    app: Application,
    fishLayer: Container,
    textureCache: Map<string, Texture>,
    deltaSec: number,
    state: {
      fish: FishInstance[];
      species: Record<string, FishSpeciesDefinition>;
      tank: TankDefinition;
    },
  ) {
    const liveIds = new Set(state.fish.map((item) => item.id));

    for (const [id, record] of fishSpritesRef.current.entries()) {
      if (!liveIds.has(id)) {
        record.sprite.destroy();
        record.shadow.destroy();
        fishSpritesRef.current.delete(id);
      }
    }

    for (const fishInstance of state.fish) {
      const definition = state.species[fishInstance.speciesId];
      if (!definition) {
        continue;
      }

      let record = fishSpritesRef.current.get(fishInstance.id);
      if (!record) {
        const sprite = new AnimatedSprite({
          textures: [Texture.EMPTY],
          autoUpdate: true,
          autoPlay: false,
          loop: true,
        });
        const fallback = new Graphics();
        const shadow = new Graphics().ellipse(0, 0, 28, 5).fill({
          color: 0x062c32,
          alpha: 0.16,
        });
        fallback
          .ellipse(0, 0, 44, 14)
          .fill({ color: fallbackFishColor(definition.id), alpha: 0.82 })
          .moveTo(-40, 0)
          .lineTo(-62, -14)
          .lineTo(-58, 0)
          .lineTo(-62, 14)
          .closePath()
          .fill({ color: fallbackFishColor(definition.id), alpha: 0.74 });
        sprite.anchor.set(0.5);
        fishLayer.addChild(shadow, fallback, sprite);
        record = { sprite, shadow, fallback };
        fishSpritesRef.current.set(fishInstance.id, record);
      }

      const url = getFishImageUrl(definition.id);
      const frameUrls = getFishAnimationFrameUrls(definition.id);
      const animationKey = frameUrls.join("|");
      if (
        definition.animation &&
        frameUrls.length >= 2 &&
        record.loadedAnimationKey !== animationKey
      ) {
        record.loadedAnimationKey = animationKey;
        loadImageTextures(frameUrls).then((textures) => {
          if (textures.length < 2) {
            return;
          }
          record.sprite.textures = textures;
          record.sprite.currentFrame = Math.floor(
            (fishInstance.seed % textures.length + textures.length) % textures.length,
          );
          record.sprite.play();
        });
      } else if (url && record.sprite.texture === Texture.EMPTY) {
        const cached = textureCache.get(url);
        if (cached) {
          record.sprite.textures = [cached];
        } else {
          loadImageTexture(url).then((texture) => {
            textureCache.set(url, texture);
            if (!record) {
              return;
            }
            record.sprite.textures = [texture];
          });
        }
      }

      const x = (fishInstance.position.x / state.tank.widthCm) * app.screen.width;
      const y = (fishInstance.position.y / state.tank.heightCm) * app.screen.height;
      const scale = getFishSpriteScale({
        viewportWidthPx: app.screen.width,
        tankWidthCm: state.tank.widthCm,
        species: definition,
        bodyLengthVariance: fishInstance.bodyLengthVariance,
        depth: fishInstance.depth,
      });
      const depthAlpha = 1 - fishInstance.depth * 0.22;
      const directionScale = fishInstance.facing === 1 ? -scale : scale;
      const fallbackBodyLengthPx =
        getTargetBodyLengthPx({
          viewportWidthPx: app.screen.width,
          tankWidthCm: state.tank.widthCm,
          realBodyLengthCm: definition.realBodyLengthCm,
        }) *
        fishInstance.bodyLengthVariance *
        (1.04 - fishInstance.depth * 0.1);
      const fallbackScale = fallbackBodyLengthPx / 88;

      const tailPulse = getTailPulse(fishInstance, performance.now());
      const targetRotation = getBodyRotation(fishInstance);
      const positionEase = fishInstance.behaviorMode === "kick" ? 9.5 : 5.2;
      const transformEase = fishInstance.behaviorMode === "kick" ? 11 : 6.4;
      record.sprite.animationSpeed = getAnimationSpeed(fishInstance, definition);
      if (fishInstance.behaviorMode === "pause" && record.sprite.playing) {
        record.sprite.stop();
      } else if (fishInstance.behaviorMode !== "pause" && !record.sprite.playing) {
        record.sprite.play();
      }

      record.visualX = smooth(record.visualX ?? x, x, positionEase, deltaSec);
      record.visualY = smooth(
        record.visualY ?? y,
        y + tailPulse.bodyBob,
        positionEase,
        deltaSec,
      );
      record.visualScale = smooth(
        record.visualScale ?? scale,
        scale * tailPulse.lengthPulse,
        transformEase,
        deltaSec,
      );
      record.visualAlpha = smooth(
        record.visualAlpha ?? depthAlpha,
        depthAlpha,
        4.8,
        deltaSec,
      );
      record.visualRotation = smoothAngle(
        record.visualRotation ?? targetRotation,
        targetRotation,
        transformEase,
        deltaSec,
      );

      const smoothedDirectionScale =
        fishInstance.facing === 1 ? -record.visualScale : record.visualScale;

      record.sprite.x = record.visualX;
      record.sprite.y = record.visualY;
      record.sprite.rotation = record.visualRotation;
      record.sprite.skew.y = tailPulse.skew;
      record.sprite.scale.set(smoothedDirectionScale, record.visualScale);
      record.sprite.alpha = record.visualAlpha;
      record.sprite.tint = fishInstance.depth > 0.65 ? 0xb6d9df : 0xffffff;
      record.fallback.x = record.visualX;
      record.fallback.y = record.visualY;
      record.fallback.rotation = record.visualRotation;
      record.fallback.scale.set(
        fishInstance.facing === 1 ? -fallbackScale : fallbackScale,
        fallbackScale,
      );
      record.fallback.alpha = record.sprite.texture === Texture.EMPTY ? record.visualAlpha : 0;
      record.fallback.tint = record.sprite.tint;

      record.shadow.x = record.visualX;
      record.shadow.y = app.screen.height * 0.91;
      record.shadow.scale.set(0.7 + (1 - fishInstance.depth) * 0.4, 0.55);
      record.shadow.alpha = 0.05 + (1 - fishInstance.depth) * 0.12;

      const sortKey = fishInstance.depth * 10000 + y;
      record.sprite.zIndex = sortKey + 1;
      record.fallback.zIndex = sortKey + 1;
      record.shadow.zIndex = sortKey;
    }

    fishLayer.sortableChildren = true;
    fishLayer.sortChildren();
  }

  function updateFood(
    app: Application,
    foodLayer: Container,
    feeding?: FeedingEvent,
  ) {
    foodLayer.removeChildren();
    if (!feeding) {
      return;
    }

    const ageSec =
      (performance.now() - (feeding.createdAtMs ?? performance.now())) / 1000;
    const x = (feeding.position.x / tank.widthCm) * app.screen.width;
    const y = (feeding.position.y / tank.heightCm) * app.screen.height;
    const plume = new Graphics()
      .ellipse(x, y + 28, 44, 78)
      .fill({ color: 0xd6bd79, alpha: Math.max(0.04, 0.16 - ageSec * 0.018) });
    foodLayer.addChild(plume);

    for (let i = 0; i < 24; i += 1) {
      const drift = Math.sin(ageSec * 1.6 + i * 1.9) * (6 + (i % 5) * 2);
      const pellet = new Graphics()
        .circle(0, 0, 2.2 + (i % 3) * 0.45)
        .fill({ color: i % 2 === 0 ? 0xe0bd6b : 0xba8140, alpha: 0.92 });
      pellet.x = x + drift + Math.sin(i * 2.4) * 18;
      pellet.y = y - 18 + i * 5.6 + ageSec * (5 + (i % 4));
      foodLayer.addChild(pellet);
    }

    const ripple = new Graphics()
      .ellipse(x, Math.max(14, app.screen.height * 0.04), 34 + ageSec * 5, 6)
      .stroke({ color: 0xf7e6ae, alpha: Math.max(0.05, 0.44 - ageSec * 0.06), width: 2 });
    foodLayer.addChild(ripple);
  }

  function drawWaterOverlay(
    app: Application,
    foregroundLayer: Container,
    isPaused: boolean,
  ) {
    const labelName = "pause-label";
    const existing = foregroundLayer.getChildByName(labelName);
    if (!isPaused) {
      existing?.destroy();
      return;
    }

    if (!existing) {
      const text = new Text({
        text: "PAUSED",
        style: {
          fill: "#d8f8ff",
          fontFamily: "system-ui, sans-serif",
          fontSize: 18,
          fontWeight: "700",
          letterSpacing: 0,
        },
      });
      text.name = labelName;
      text.alpha = 0.72;
      text.x = app.screen.width - 96;
      text.y = 24;
      foregroundLayer.addChild(text);
    }
  }
}

function fallbackFishColor(speciesId: string): number {
  if (speciesId === "neon-tetra") {
    return 0x35c7e8;
  }
  if (speciesId === "guppy") {
    return 0x2b8fe8;
  }
  if (speciesId === "angelfish") {
    return 0xd8d4c8;
  }
  return 0x8bd7d3;
}

function drawPlantCluster(
  layer: Container,
  originX: number,
  originY: number,
  scaleAmount: number,
  alpha: number,
) {
  const cluster = new Container();
  cluster.name = "plant-cluster";
  cluster.x = originX;
  cluster.y = originY;
  cluster.alpha = alpha;
  cluster.scale.set(scaleAmount);
  layer.addChild(cluster);

  for (let stemIndex = 0; stemIndex < 7; stemIndex += 1) {
    const height = 160 + (stemIndex % 4) * 34;
    const lean = -42 + stemIndex * 14;
    const stem = new Graphics()
      .moveTo(0, 0)
      .bezierCurveTo(lean * 0.18, -height * 0.36, lean * 0.76, -height * 0.68, lean, -height)
      .stroke({ color: stemIndex % 2 === 0 ? 0x295f39 : 0x6c7d38, alpha: 0.78, width: 3 });
    stem.x = -46 + stemIndex * 16;
    stem.y = 0;
    cluster.addChild(stem);

    for (let leafIndex = 0; leafIndex < 5; leafIndex += 1) {
      const side = leafIndex % 2 === 0 ? -1 : 1;
      const leaf = new Graphics()
        .ellipse(0, 0, 7 + leafIndex * 1.5, 24 + (stemIndex % 3) * 3)
        .fill({ color: leafIndex % 3 === 0 ? 0xaedb4c : 0x58b36c, alpha: 0.74 });
      leaf.x = stem.x + lean * ((leafIndex + 1) / 6) + side * (12 + leafIndex * 2);
      leaf.y = -height * ((leafIndex + 1) / 6);
      leaf.rotation = side * 0.82 - lean * 0.006;
      cluster.addChild(leaf);
    }
  }
}

function drawGlassHighlights(layer: Container, width: number, height: number) {
  for (let i = 0; i < 5; i += 1) {
    const highlight = new Graphics()
      .roundRect(0, 0, width * (0.16 + i * 0.035), 2, 2)
      .fill({ color: 0xffffff, alpha: 0.1 - i * 0.012 });
    highlight.name = "glass-highlight";
    highlight.x = width * (0.08 + i * 0.16);
    highlight.y = height * (0.06 + i * 0.025);
    highlight.rotation = -0.04 + i * 0.012;
    layer.addChild(highlight);
  }
}

function animateTankLayers(
  app: Application,
  rearDecorLayer: Container,
  frontDecorLayer: Container,
  glassEffectsLayer: Container,
  nowMs: number,
) {
  const slowWave = Math.sin(nowMs / 2600);
  const fastWave = Math.sin(nowMs / 1500);
  rearDecorLayer.x = slowWave * app.screen.width * 0.002;
  rearDecorLayer.skew.x = slowWave * 0.004;
  frontDecorLayer.x = fastWave * app.screen.width * 0.003;
  frontDecorLayer.skew.x = fastWave * 0.006;

  const sheen = glassEffectsLayer.getChildByName("surface-sheen");
  if (sheen) {
    sheen.alpha = 0.72 + Math.sin(nowMs / 1800) * 0.08;
  }
}

function getTailPulse(
  fish: FishInstance,
  nowMs: number,
): { bodyBob: number; lengthPulse: number; skew: number } {
  const speed = Math.hypot(fish.velocity.x, fish.velocity.y);
  const speedAmount = Math.min(1, speed / 12);
  const modeAmount =
    fish.behaviorMode === "kick" || fish.behaviorMode === "feed" ? 1 : 0.35;
  const phase = nowMs / (fish.behaviorMode === "kick" ? 72 : 145) + fish.seed * 0.017;
  const wave = Math.sin(phase);

  return {
    bodyBob: wave * speedAmount * modeAmount * 1.4,
    lengthPulse: 1 + Math.abs(wave) * speedAmount * modeAmount * 0.018,
    skew: wave * speedAmount * modeAmount * 0.025,
  };
}

function getAnimationSpeed(
  fish: FishInstance,
  species: FishSpeciesDefinition,
): number {
  const fps = species.animation?.framesPerSecond ?? 8;
  const modeMultiplier =
    fish.behaviorMode === "feed" ? 1.55
      : fish.behaviorMode === "kick" ? 1.25
        : fish.behaviorMode === "coast" ? 0.56
          : 0.12;

  return (fps / 60) * modeMultiplier;
}

function getBodyRotation(fish: FishInstance): number {
  const speed = Math.hypot(fish.velocity.x, fish.velocity.y);
  if (speed <= 0.05) {
    return 0;
  }

  const pitch = Math.asin(Math.max(-1, Math.min(1, fish.velocity.y / speed))) * 0.22;
  return Math.max(-0.16, Math.min(0.16, pitch));
}

function smooth(current: number, target: number, responsiveness: number, deltaSec: number): number {
  const amount = 1 - Math.exp(-responsiveness * deltaSec);
  return current + (target - current) * amount;
}

function smoothAngle(
  current: number,
  target: number,
  responsiveness: number,
  deltaSec: number,
): number {
  const amount = 1 - Math.exp(-responsiveness * deltaSec);
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * amount;
}

function loadImageTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(Texture.from(image));
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

async function loadImageTextures(urls: string[]): Promise<Texture[]> {
  return Promise.all(urls.map((url) => loadImageTexture(url)));
}
