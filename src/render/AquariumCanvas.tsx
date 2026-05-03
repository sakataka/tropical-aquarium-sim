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
  paused,
  latestFeeding,
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

      drawStaticTank(app, backplate, rearDecor, frontDecor, glassEffects);
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
    addEnvironmentLayerSprite(rearDecorLayer, environmentAssets.rearPlantsUrl, app.screen.width, app.screen.height, "rear-plants");
    drawLightBeams(rearDecorLayer, app.screen.width, app.screen.height);
    drawPlantCluster(rearDecorLayer, app.screen.width * 0.16, app.screen.height * 0.88, 0.84, 0.16);
    drawPlantCluster(rearDecorLayer, app.screen.width * 0.82, app.screen.height * 0.9, 0.72, 0.13);
    drawMidgroundPlants(rearDecorLayer, app.screen.width, app.screen.height);
    drawDriftwood(rearDecorLayer, app.screen.width, app.screen.height);
    drawSubstrate(rearDecorLayer, app.screen.width, app.screen.height);

    addEnvironmentLayerSprite(frontDecorLayer, environmentAssets.foregroundPlantsUrl, app.screen.width, app.screen.height, "foreground-plants");
    drawPlantCluster(frontDecorLayer, app.screen.width * 0.04, app.screen.height * 0.98, 1.24, 0.32);
    drawPlantCluster(frontDecorLayer, app.screen.width * 0.96, app.screen.height * 1.02, 1.12, 0.28);
    drawForegroundPebbles(frontDecorLayer, app.screen.width, app.screen.height);

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
    drawCausticOverlay(glassEffectsLayer, app.screen.width, app.screen.height);
    drawFineParticles(glassEffectsLayer, app.screen.width, app.screen.height);

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

function drawMidgroundPlants(layer: Container, width: number, height: number) {
  const bed = new Container();
  bed.name = "midground-plants";
  bed.alpha = 0.34;
  layer.addChild(bed);

  for (let clusterIndex = 0; clusterIndex < 5; clusterIndex += 1) {
    const originX = width * (0.22 + clusterIndex * 0.13);
    const originY = height * (0.9 + (clusterIndex % 2) * 0.035);
    const bladeCount = 9 + (clusterIndex % 3) * 2;
    for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex += 1) {
      const bladeHeight = height * (0.13 + ((bladeIndex * 7 + clusterIndex * 3) % 10) / 120);
      const lean = (-20 + bladeIndex * 4.5 + clusterIndex * 2) * (height / 900);
      const blade = new Graphics()
        .moveTo(0, 0)
        .bezierCurveTo(
          lean * 0.14,
          -bladeHeight * 0.34,
          lean * 0.72,
          -bladeHeight * 0.72,
          lean,
          -bladeHeight,
        )
        .stroke({
          color: bladeIndex % 3 === 0 ? 0x9ec95f : 0x4e9b62,
          alpha: 0.62,
          width: 1.4 + (bladeIndex % 2) * 0.8,
        });
      blade.x = originX + (bladeIndex - bladeCount / 2) * width * 0.006;
      blade.y = originY;
      bed.addChild(blade);
    }
  }
}

function drawSubstrate(layer: Container, width: number, height: number) {
  const substrate = new Container();
  substrate.name = "substrate";
  substrate.alpha = 0.72;
  layer.addChild(substrate);

  const sand = new Graphics()
    .moveTo(0, height * 0.9)
    .bezierCurveTo(width * 0.24, height * 0.875, width * 0.42, height * 0.925, width * 0.62, height * 0.895)
    .bezierCurveTo(width * 0.8, height * 0.87, width * 0.92, height * 0.91, width, height * 0.885)
    .lineTo(width, height)
    .lineTo(0, height)
    .closePath()
    .fill({ color: 0x9a8155, alpha: 0.5 });
  substrate.addChild(sand);

  for (let i = 0; i < 70; i += 1) {
    const pebble = new Graphics()
      .ellipse(0, 0, 3 + (i % 6) * 1.7, 1.4 + (i % 4) * 0.8)
      .fill({
        color: i % 5 === 0 ? 0x4f594f : i % 3 === 0 ? 0xb59b70 : 0x76664b,
        alpha: 0.42 + (i % 4) * 0.07,
      });
    pebble.x = width * (((i * 37) % 100) / 100);
    pebble.y = height * (0.905 + ((i * 19) % 100) / 1050);
    pebble.rotation = -0.2 + (i % 9) * 0.05;
    substrate.addChild(pebble);
  }
}

function drawForegroundPebbles(layer: Container, width: number, height: number) {
  const pebbles = new Container();
  pebbles.name = "foreground-pebbles";
  pebbles.alpha = 0.58;
  layer.addChild(pebbles);

  for (let i = 0; i < 22; i += 1) {
    const stone = new Graphics()
      .ellipse(0, 0, 10 + (i % 5) * 4, 4 + (i % 3) * 2.4)
      .fill({
        color: i % 4 === 0 ? 0x39493f : i % 4 === 1 ? 0x8f7b58 : 0x5b604c,
        alpha: 0.48,
      });
    stone.x = width * (((i * 43) % 100) / 100);
    stone.y = height * (0.94 + ((i * 11) % 100) / 2100);
    stone.rotation = -0.16 + (i % 7) * 0.05;
    pebbles.addChild(stone);
  }
}

function drawDriftwood(layer: Container, width: number, height: number) {
  const wood = new Container();
  wood.name = "driftwood";
  wood.x = width * 0.67;
  wood.y = height * 0.84;
  wood.rotation = -0.12;
  wood.alpha = 0.45;
  layer.addChild(wood);

  const trunk = new Graphics()
    .moveTo(-width * 0.15, 10)
    .bezierCurveTo(-width * 0.08, -height * 0.06, width * 0.05, -height * 0.045, width * 0.17, 8)
    .bezierCurveTo(width * 0.08, height * 0.035, -width * 0.06, height * 0.04, -width * 0.15, 10)
    .fill({ color: 0x533824, alpha: 0.72 });
  wood.addChild(trunk);

  for (let branchIndex = 0; branchIndex < 4; branchIndex += 1) {
    const branch = new Graphics()
      .moveTo(-width * 0.035 + branchIndex * width * 0.032, 0)
      .bezierCurveTo(
        width * (0.005 + branchIndex * 0.018),
        -height * (0.035 + branchIndex * 0.013),
        width * (0.055 + branchIndex * 0.012),
        -height * (0.055 + branchIndex * 0.008),
        width * (0.08 + branchIndex * 0.028),
        -height * (0.035 + branchIndex * 0.012),
      )
      .stroke({ color: branchIndex % 2 === 0 ? 0x6c472b : 0x3e2c20, alpha: 0.62, width: 8 - branchIndex });
    wood.addChild(branch);
  }
}

function addEnvironmentLayerSprite(
  layer: Container,
  url: string,
  width: number,
  height: number,
  name: string,
) {
  const sprite = new Sprite(Texture.EMPTY);
  sprite.name = name;
  sprite.anchor.set(0.5, 0.5);
  sprite.x = width / 2;
  sprite.y = height / 2;
  sprite.alpha = name === "foreground-plants" ? 0.82 : 0.52;
  layer.addChild(sprite);
  Assets.load<Texture>(url).then((texture) => {
    sprite.texture = texture;
    sprite.scale.set(Math.max(width / texture.width, height / texture.height));
  });
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

  const fineParticles = glassEffectsLayer.getChildByName("fine-particles");
  if (fineParticles) {
    fineParticles.x = Math.sin(nowMs / 3600) * app.screen.width * 0.006;
    fineParticles.y = Math.cos(nowMs / 4400) * app.screen.height * 0.004;
    fineParticles.alpha = 0.28 + Math.sin(nowMs / 2300) * 0.035;
  }

  const lightBeams = rearDecorLayer.getChildByName("light-beams");
  if (lightBeams) {
    lightBeams.x = Math.sin(nowMs / 5200) * app.screen.width * 0.01;
    lightBeams.alpha = 0.17 + Math.sin(nowMs / 3100) * 0.028;
  }
}

function drawLightBeams(layer: Container, width: number, height: number) {
  const beams = new Container();
  beams.name = "light-beams";
  beams.alpha = 0.17;
  layer.addChild(beams);

  for (let i = 0; i < 5; i += 1) {
    const beam = new Graphics()
      .moveTo(width * (0.04 + i * 0.19), 0)
      .lineTo(width * (0.18 + i * 0.18), 0)
      .lineTo(width * (0.3 + i * 0.16), height)
      .lineTo(width * (0.13 + i * 0.17), height)
      .closePath()
      .fill({ color: 0xd9fff0, alpha: 0.025 + (i % 2) * 0.012 });
    beams.addChild(beam);
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

function drawFineParticles(layer: Container, width: number, height: number) {
  const particles = new Container();
  particles.name = "fine-particles";
  particles.alpha = 0.28;
  layer.addChild(particles);

  for (let i = 0; i < 95; i += 1) {
    const particle = new Graphics()
      .circle(0, 0, 0.7 + (i % 4) * 0.22)
      .fill({
        color: i % 5 === 0 ? 0xf8fff6 : 0xb9f0e5,
        alpha: 0.08 + (i % 6) * 0.015,
      });
    particle.x = width * (((i * 41) % 100) / 100);
    particle.y = height * (0.08 + (((i * 67) % 100) / 100) * 0.82);
    particles.addChild(particle);
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
