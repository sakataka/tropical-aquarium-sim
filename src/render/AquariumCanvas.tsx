import { useEffect, useRef, type MouseEvent } from "react";
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
  type AquariumEnvironmentCustomization,
  type FeedingEvent,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
  type TapEvent,
  type Vec2,
} from "../core";
import { environmentAssets, getFishAnimationFrameUrls, getFishImageUrl } from "./assets";

type AquariumCanvasProps = {
  fish: FishInstance[];
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  environment: AquariumEnvironmentCustomization;
  paused: boolean;
  latestFeeding?: FeedingEvent;
  latestTap?: TapEvent;
  onDoubleTapTank?: (position: Vec2) => void;
};

type FishSpriteRecord = {
  sprite: AnimatedSprite;
  shadow: Graphics;
  fallback: Graphics;
  pectoralFins: Graphics;
  tailFlutter: Graphics;
  loadedAnimationKey?: string;
  visualX?: number;
  visualY?: number;
  visualScale?: number;
  visualAlpha?: number;
  visualRotation?: number;
};

type BubbleParticleRecord = {
  sprite: Sprite;
  originXRatio: number;
  yRatio: number;
  radius: number;
  speedRatioPerSec: number;
  driftPx: number;
  columnPx: number;
  phase: number;
  depth: number;
};

export function AquariumCanvas({
  fish,
  species,
  tank,
  environment,
  paused,
  latestFeeding,
  latestTap,
  onDoubleTapTank,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<{
    root: Container;
    backplate: Container;
    rearDecor: Container;
    bubbles: Container;
    fish: Container;
    frontDecor: Container;
    glassEffects: Container;
    food: Container;
  } | null>(null);
  const fishSpritesRef = useRef<Map<string, FishSpriteRecord>>(new Map());
  const bubblesRef = useRef<BubbleParticleRecord[]>([]);
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const fishRef = useRef(fish);
  const speciesRef = useRef(species);
  const latestFeedingRef = useRef(latestFeeding);
  const latestTapRef = useRef(latestTap);

  fishRef.current = fish;
  speciesRef.current = species;
  latestFeedingRef.current = latestFeeding;
  latestTapRef.current = latestTap;

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
      const bubbles = new Container();
      const fishLayer = new Container();
      const food = new Container();
      const frontDecor = new Container();
      const glassEffects = new Container();

      root.addChild(backplate, rearDecor, bubbles, fishLayer, food, frontDecor, glassEffects);
      app.stage.addChild(root);
      layerRef.current = {
        root,
        backplate,
        rearDecor,
        bubbles,
        fish: fishLayer,
        frontDecor,
        glassEffects,
        food,
      };

      drawStaticTank(app, backplate, rearDecor, frontDecor, glassEffects, environment);
      ensureBubbleParticles(app, bubbles, bubblesRef.current);
      app.ticker.add((ticker) => {
        const deltaSec = Math.min(0.05, ticker.deltaMS / 1000);
        animateTankLayers(app, rearDecor, frontDecor, glassEffects, performance.now());
        updateBubbleParticles(app, bubbles, bubblesRef.current, deltaSec, performance.now());
        updateFishSprites(
          app,
          fishLayer,
          textureCacheRef.current,
          deltaSec,
          {
            fish: fishRef.current,
            species: speciesRef.current,
            tank,
          },
        );
        updateFood(app, food, latestFeedingRef.current);
        updateTapRipple(app, glassEffects, latestTapRef.current);
        drawWaterOverlay(app, glassEffects, paused);
      });
    }

    setup();

    return () => {
      disposed = true;
      fishSpritesRef.current.clear();
      bubblesRef.current = [];
      app.destroy(true, {
        children: true,
        texture: false,
      });
      appRef.current = null;
      layerRef.current = null;
    };
  }, [environment, paused, tank]);

  return (
    <div
      className="aquarium-canvas"
      onDoubleClick={handleDoubleClick}
      ref={hostRef}
    />
  );

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (!onDoubleTapTank) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    onDoubleTapTank({
      x: ((event.clientX - rect.left) / rect.width) * tank.widthCm,
      y: ((event.clientY - rect.top) / rect.height) * tank.heightCm,
    });
  }

  function drawStaticTank(
    app: Application,
    backplateLayer: Container,
    rearDecorLayer: Container,
    frontDecorLayer: Container,
    glassEffectsLayer: Container,
    currentEnvironment: AquariumEnvironmentCustomization,
  ) {
    backplateLayer.removeChildren();
    rearDecorLayer.removeChildren();
    frontDecorLayer.removeChildren();
    glassEffectsLayer.removeChildren();
    const lighting = getLightingProfile(currentEnvironment.lighting);
    const background = getBackgroundProfile(currentEnvironment.backgroundStyle);
    const rearPlantsAlpha = getPlantLayerAlpha(currentEnvironment.rearPlants, 0.52);
    const foregroundPlantsAlpha = getPlantLayerAlpha(currentEnvironment.foregroundPlants, 0.82);
    const clusterCount = getPlantClusterCount(currentEnvironment.plantDensity);

    const waterFill = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: background.waterColor, alpha: background.waterAlpha });
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
      waterFill.clear().rect(0, 0, width, height).fill({
        color: background.waterColor,
        alpha: background.waterAlpha,
      });
      bg.x = width / 2;
      bg.y = height / 2;
      bg.tint = background.tint;
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
      .fill({ color: lighting.hazeColor, alpha: lighting.hazeAlpha });
    rearDecorLayer.addChild(rearHaze);
    if (rearPlantsAlpha > 0) {
      addEnvironmentLayerSprite(
        rearDecorLayer,
        environmentAssets.rearPlantsUrl,
        app.screen.width,
        app.screen.height,
        "rear-plants",
        rearPlantsAlpha,
      );
      if (clusterCount >= 2) {
        drawPlantCluster(rearDecorLayer, app.screen.width * 0.16, app.screen.height * 0.88, 0.84, 0.16);
        drawPlantCluster(rearDecorLayer, app.screen.width * 0.82, app.screen.height * 0.9, 0.72, 0.13);
      }
    }

    if (foregroundPlantsAlpha > 0) {
      addEnvironmentLayerSprite(
        frontDecorLayer,
        environmentAssets.foregroundPlantsUrl,
        app.screen.width,
        app.screen.height,
        "foreground-plants",
        foregroundPlantsAlpha,
      );
      if (clusterCount >= 1) {
        drawPlantCluster(frontDecorLayer, app.screen.width * 0.04, app.screen.height * 0.98, 1.24, 0.32);
      }
      if (clusterCount >= 2) {
        drawPlantCluster(frontDecorLayer, app.screen.width * 0.96, app.screen.height * 1.02, 1.12, 0.28);
      }
      if (clusterCount >= 3) {
        drawPlantCluster(frontDecorLayer, app.screen.width * 0.52, app.screen.height * 1.03, 0.9, 0.18);
      }
    }

    const surfaceSheen = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height * 0.22)
      .fill({ color: lighting.sheenColor, alpha: lighting.sheenAlpha });
    surfaceSheen.name = "surface-sheen";
    glassEffectsLayer.addChild(surfaceSheen);

    const lightingOverlay = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: lighting.overlayColor, alpha: lighting.overlayAlpha });
    lightingOverlay.name = "lighting-overlay";
    glassEffectsLayer.addChild(lightingOverlay);

    const glass = new Graphics()
      .roundRect(10, 10, Math.max(0, app.screen.width - 20), Math.max(0, app.screen.height - 20), 18)
      .stroke({ color: 0xb8f0ff, alpha: 0.28, width: 2 });
    glass.name = "glass-frame";
    glassEffectsLayer.addChild(glass);

    drawGlassHighlights(glassEffectsLayer, app.screen.width, app.screen.height);
    drawCausticOverlay(glassEffectsLayer, app.screen.width, app.screen.height);

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
        record.pectoralFins.destroy();
        record.tailFlutter.destroy();
        record.fallback.destroy();
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
        const pectoralFins = new Graphics()
          .ellipse(-7, 8, 6, 15)
          .fill({ color: 0xe8ffff, alpha: 0.18 })
          .ellipse(-6, -8, 5, 12)
          .fill({ color: 0xe8ffff, alpha: 0.12 });
        const tailFlutter = new Graphics()
          .moveTo(-34, 0)
          .lineTo(-60, -18)
          .lineTo(-52, 0)
          .lineTo(-60, 18)
          .closePath()
          .fill({ color: 0xd8ffff, alpha: 0.16 });
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
        fishLayer.addChild(shadow, fallback, tailFlutter, pectoralFins, sprite);
        record = { sprite, shadow, fallback, pectoralFins, tailFlutter };
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
      record.sprite.skew.x = tailPulse.sideFlex;
      record.sprite.scale.set(smoothedDirectionScale, record.visualScale);
      record.sprite.alpha = record.visualAlpha;
      record.sprite.tint = fishInstance.depth > 0.65 ? 0xb6d9df : 0xffffff;
      record.pectoralFins.x = record.visualX;
      record.pectoralFins.y = record.visualY;
      record.pectoralFins.rotation = record.visualRotation + tailPulse.finFlutter;
      record.pectoralFins.scale.set(smoothedDirectionScale * 0.78, record.visualScale * 0.78);
      record.pectoralFins.alpha =
        record.sprite.texture === Texture.EMPTY ? 0 : record.visualAlpha * tailPulse.finAlpha;
      record.tailFlutter.x = record.visualX;
      record.tailFlutter.y = record.visualY;
      record.tailFlutter.rotation = record.visualRotation + tailPulse.tailFlutter;
      record.tailFlutter.scale.set(
        smoothedDirectionScale * 0.82,
        record.visualScale * (0.72 + tailPulse.tailFan),
      );
      record.tailFlutter.alpha =
        record.sprite.texture === Texture.EMPTY ? 0 : record.visualAlpha * tailPulse.tailAlpha;
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
      record.pectoralFins.zIndex = sortKey + 0.8;
      record.tailFlutter.zIndex = sortKey + 0.7;
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

  function updateTapRipple(
    app: Application,
    foregroundLayer: Container,
    tapEvent?: TapEvent,
  ) {
    const rippleName = "tap-ripple";
    foregroundLayer.getChildByName(rippleName)?.destroy();
    if (!tapEvent) {
      return;
    }

    const ageSec =
      (performance.now() - (tapEvent.createdAtMs ?? performance.now())) / 1000;
    if (ageSec > 1.2) {
      return;
    }

    const progress = Math.min(1, ageSec / 1.2);
    const x = (tapEvent.position.x / tank.widthCm) * app.screen.width;
    const y = (tapEvent.position.y / tank.heightCm) * app.screen.height;
    const ripple = new Graphics();
    ripple.name = rippleName;
    ripple
      .ellipse(x, y, 22 + progress * 82, 7 + progress * 28)
      .stroke({
        color: 0xd8fbff,
        alpha: 0.42 * (1 - progress),
        width: 2,
      })
      .ellipse(x, y, 8 + progress * 28, 3 + progress * 10)
      .stroke({
        color: 0xffffff,
        alpha: 0.28 * (1 - progress),
        width: 1,
      });
    foregroundLayer.addChild(ripple);
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

function addEnvironmentLayerSprite(
  layer: Container,
  url: string,
  width: number,
  height: number,
  name: string,
  alpha: number,
) {
  const sprite = new Sprite(Texture.EMPTY);
  sprite.name = name;
  sprite.anchor.set(0.5, 0.5);
  sprite.x = width / 2;
  sprite.y = height / 2;
  sprite.alpha = alpha;
  layer.addChild(sprite);
  Assets.load<Texture>(url).then((texture) => {
    sprite.texture = texture;
    sprite.scale.set(Math.max(width / texture.width, height / texture.height));
  });
}

function getPlantLayerAlpha(
  visibility: AquariumEnvironmentCustomization["rearPlants"],
  fullAlpha: number,
): number {
  if (visibility === "off") {
    return 0;
  }
  if (visibility === "subtle") {
    return fullAlpha * 0.48;
  }
  return fullAlpha;
}

function getPlantClusterCount(
  density: AquariumEnvironmentCustomization["plantDensity"],
): number {
  if (density === "low") {
    return 1;
  }
  if (density === "high") {
    return 3;
  }
  return 2;
}

function getBackgroundProfile(
  style: AquariumEnvironmentCustomization["backgroundStyle"],
): {
  waterColor: number;
  waterAlpha: number;
  tint: number;
} {
  if (style === "deep") {
    return {
      waterColor: 0x062f3a,
      waterAlpha: 0.68,
      tint: 0x9bdbe7,
    };
  }
  if (style === "bright") {
    return {
      waterColor: 0x1f6570,
      waterAlpha: 0.38,
      tint: 0xf0ffef,
    };
  }
  return {
    waterColor: 0x0b4a52,
    waterAlpha: 0.54,
    tint: 0xffffff,
  };
}

function getLightingProfile(
  lighting: AquariumEnvironmentCustomization["lighting"],
): {
  hazeColor: number;
  hazeAlpha: number;
  sheenColor: number;
  sheenAlpha: number;
  overlayColor: number;
  overlayAlpha: number;
} {
  if (lighting === "cool") {
    return {
      hazeColor: 0xc7fbff,
      hazeAlpha: 0.11,
      sheenColor: 0xd7ffff,
      sheenAlpha: 0.1,
      overlayColor: 0x9fe8ff,
      overlayAlpha: 0.08,
    };
  }
  if (lighting === "evening") {
    return {
      hazeColor: 0xffd7aa,
      hazeAlpha: 0.11,
      sheenColor: 0xffefcf,
      sheenAlpha: 0.09,
      overlayColor: 0x9a4f28,
      overlayAlpha: 0.16,
    };
  }
  if (lighting === "night") {
    return {
      hazeColor: 0x89c7ff,
      hazeAlpha: 0.08,
      sheenColor: 0xb9dcff,
      sheenAlpha: 0.055,
      overlayColor: 0x020917,
      overlayAlpha: 0.32,
    };
  }
  return {
    hazeColor: 0xbff4ed,
    hazeAlpha: 0.08,
    sheenColor: 0xe5ffff,
    sheenAlpha: 0.08,
    overlayColor: 0xffffff,
    overlayAlpha: 0,
  };
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
  rearDecorLayer.x = 0;
  rearDecorLayer.skew.x = 0;
  frontDecorLayer.x = 0;
  frontDecorLayer.skew.x = 0;

  const sheen = glassEffectsLayer.getChildByName("surface-sheen");
  if (sheen) {
    sheen.alpha = 0.64 + slowWave * 0.045;
  }

  const causticsFar = glassEffectsLayer.getChildByName("caustics-far");
  if (causticsFar) {
    causticsFar.x = Math.sin(nowMs / 4200) * app.screen.width * 0.006;
    causticsFar.y = Math.cos(nowMs / 5200) * app.screen.height * 0.0025;
    causticsFar.alpha = 0.18 + Math.sin(nowMs / 2600) * 0.035;
  }

  const causticsNear = glassEffectsLayer.getChildByName("caustics-near");
  if (causticsNear) {
    causticsNear.x = Math.sin(nowMs / 3000 + 1.4) * app.screen.width * 0.008;
    causticsNear.y = Math.cos(nowMs / 3400) * app.screen.height * 0.003;
    causticsNear.alpha = 0.16 + Math.sin(nowMs / 2100) * 0.03;
  }

  const surfaceRipples = glassEffectsLayer.getChildByName("surface-ripples");
  if (surfaceRipples) {
    surfaceRipples.x = Math.sin(nowMs / 1800) * app.screen.width * 0.004;
    surfaceRipples.alpha = 0.32 + fastWave * 0.05;
  }
}

function drawCausticOverlay(layer: Container, width: number, height: number) {
  const far = new Container();
  far.name = "caustics-far";
  far.alpha = 0.18;
  layer.addChild(far);
  for (let i = 0; i < 22; i += 1) {
    const y = height * (0.2 + ((i * 37) % 100) / 145);
    const line = new Graphics()
      .moveTo(width * -0.02, y)
      .bezierCurveTo(
        width * 0.18,
        y + Math.sin(i) * 7,
        width * 0.52,
        y - Math.cos(i * 0.7) * 9,
        width * 1.02,
        y + Math.sin(i * 1.4) * 6,
      )
      .stroke({ color: 0xeafff9, alpha: 0.028 + (i % 4) * 0.006, width: 0.75 + (i % 3) * 0.25 });
    far.addChild(line);
  }

  const near = new Container();
  near.name = "caustics-near";
  near.alpha = 0.16;
  layer.addChild(near);
  for (let i = 0; i < 15; i += 1) {
    const y = height * (0.64 + ((i * 23) % 100) / 360);
    const line = new Graphics()
      .moveTo(width * 0.04, y)
      .bezierCurveTo(width * 0.25, y - 5, width * 0.45, y + 4, width * 0.72, y - 3)
      .bezierCurveTo(width * 0.84, y - 6, width * 0.96, y + 3, width * 1.02, y - 4)
      .stroke({ color: 0xf6fff2, alpha: 0.026 + (i % 3) * 0.007, width: 0.9 });
    near.addChild(line);
  }

  const ripples = new Container();
  ripples.name = "surface-ripples";
  layer.addChild(ripples);
  for (let i = 0; i < 9; i += 1) {
    const ripple = new Graphics()
      .ellipse(width * (0.12 + i * 0.105), height * (0.058 + (i % 3) * 0.018), 28 + i * 4, 2.2 + (i % 2) * 0.6)
      .stroke({ color: 0xeaffff, alpha: 0.105, width: 0.75 });
    ripple.rotation = -0.025 + i * 0.006;
    ripples.addChild(ripple);
  }
}

async function ensureBubbleParticles(
  app: Application,
  bubbleLayer: Container,
  particles: BubbleParticleRecord[],
) {
  if (bubblesNeedReset(app, bubbleLayer, particles)) {
    bubbleLayer.removeChildren();
    particles.length = 0;
  }

  if (particles.length > 0) {
    return;
  }

  const texture = await Assets.load<Texture>(environmentAssets.bubbleParticleUrl);

  for (let i = 0; i < 165; i += 1) {
    const source = i % 5;
    const originXRatio =
      source === 0 ? 0.07
        : source === 1 ? 0.18
          : source === 2 ? 0.49
            : source === 3 ? 0.78
              : 0.92;
    const radius = 0.85 + ((i * 13) % 9) * 0.32 + (source === 1 || source === 4 ? 0.42 : 0);
    const depth = ((i * 17) % 100) / 100;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    bubbleLayer.addChild(sprite);
    particles.push({
      sprite,
      originXRatio,
      yRatio: ((i * 29) % 100) / 100,
      radius,
      speedRatioPerSec: 0.024 + source * 0.006 + (i % 7) * 0.003,
      driftPx: 1.2 + source * 0.55 + (i % 6) * 0.5,
      columnPx: ((i * 31) % 25) - 12,
      phase: i * 1.73,
      depth,
    });
  }
}

function updateBubbleParticles(
  app: Application,
  bubbleLayer: Container,
  particles: BubbleParticleRecord[],
  deltaSec: number,
  nowMs: number,
) {
  if (particles.length === 0) {
    void ensureBubbleParticles(app, bubbleLayer, particles);
  }

  for (const bubble of particles) {
    bubble.yRatio -= bubble.speedRatioPerSec * deltaSec * (0.75 + bubble.depth * 0.6);
    if (bubble.yRatio < -0.06) {
      bubble.yRatio = 1.02 + bubble.depth * 0.08;
    }

    const lifeFade = bubble.yRatio < 0.08 ? Math.max(0, bubble.yRatio / 0.08) : 1;
    const depthScale = 0.74 + bubble.depth * 0.62;
    const thermalWobble = Math.sin(nowMs / (860 + bubble.depth * 520) + bubble.phase);
    const fineWobble = Math.sin(nowMs / 240 + bubble.phase * 1.9) * 0.45;
    bubble.sprite.x =
      app.screen.width * bubble.originXRatio +
      bubble.columnPx * depthScale +
      (thermalWobble + fineWobble) * bubble.driftPx;
    bubble.sprite.y = app.screen.height * bubble.yRatio;
    bubble.sprite.rotation = thermalWobble * 0.08;
    bubble.sprite.scale.set(((bubble.radius * 2) / 96) * depthScale);
    bubble.sprite.alpha = Math.max(
      0,
      Math.min(0.42, (0.08 + bubble.depth * 0.22 + bubble.yRatio * 0.1) * lifeFade),
    );
  }
}

function bubblesNeedReset(
  app: Application,
  bubbleLayer: Container,
  particles: BubbleParticleRecord[],
): boolean {
  const first = particles[0];
  return Boolean(first && first.sprite.parent !== bubbleLayer && app.screen.width > 0);
}

function getTailPulse(
  fish: FishInstance,
  nowMs: number,
): {
  bodyBob: number;
  lengthPulse: number;
  skew: number;
  sideFlex: number;
  finFlutter: number;
  finAlpha: number;
  tailFlutter: number;
  tailFan: number;
  tailAlpha: number;
} {
  const speed = Math.hypot(fish.velocity.x, fish.velocity.y);
  const speedAmount = Math.min(1, speed / 12);
  const modeAmount =
    fish.behaviorMode === "kick" || fish.behaviorMode === "feed" ? 1 : 0.35;
  const phase = nowMs / (fish.behaviorMode === "kick" ? 54 : 118) + fish.seed * 0.017;
  const wave = Math.sin(phase);
  const flutter = Math.sin(phase * 2.6 + 0.7);

  return {
    bodyBob: wave * speedAmount * modeAmount * 2.6,
    lengthPulse: 1 + Math.abs(wave) * speedAmount * modeAmount * 0.045,
    skew: wave * speedAmount * modeAmount * 0.09,
    sideFlex: flutter * speedAmount * modeAmount * 0.018,
    finFlutter: flutter * speedAmount * 0.18,
    finAlpha: 0.26 + Math.abs(flutter) * 0.22,
    tailFlutter: wave * speedAmount * modeAmount * 0.28,
    tailFan: Math.abs(wave) * speedAmount * modeAmount * 0.45,
    tailAlpha: 0.13 + Math.abs(wave) * speedAmount * modeAmount * 0.18,
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
