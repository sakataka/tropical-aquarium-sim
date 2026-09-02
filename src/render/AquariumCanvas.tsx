import { useEffect, useRef } from "react";
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import {
  DECOR_SLOT_IDS,
  decorAssetsById,
  getFishSpriteScale,
  type AquariumLayout,
  type DecorSlotId,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import {
  environmentAssets,
  getEnvironmentAssetUrl,
  getFishAnimationFrameUrls,
  getFishImageUrl,
} from "./assets";

type AquariumCanvasProps = {
  fish: FishInstance[];
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  layout: AquariumLayout;
  onReady?: () => void;
};

type FishSpriteRecord = {
  sprite: AnimatedSprite;
  loadedKey?: string;
  visualX?: number;
  visualY?: number;
  visualScale?: number;
  visualRotation?: number;
};

const SLOT_POSITIONS: Record<DecorSlotId, { x: number; y: number }> = {
  "rear-left": { x: 0.18, y: 0.94 },
  "rear-right": { x: 0.82, y: 0.94 },
  "mid-left": { x: 0.29, y: 0.94 },
  "mid-right": { x: 0.71, y: 0.94 },
  "front-left": { x: 0.16, y: 1 },
  "front-center": { x: 0.5, y: 1 },
  "front-right": { x: 0.84, y: 1 },
};

export function AquariumCanvas({
  fish,
  species,
  tank,
  layout,
  onReady,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fishRef = useRef(fish);
  const speciesRef = useRef(species);
  fishRef.current = fish;
  speciesRef.current = species;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const targetHost = host;
    let disposed = false;
    let initialized = false;
    let setupComplete = false;
    let destroyed = false;
    const app = new Application();
    const records = new Map<string, FishSpriteRecord>();

    const root = new Container();
    const backgroundLayer = new Container();
    const rearLayer = new Container();
    const fishBackLayer = new Container();
    const midLayer = new Container();
    const fishFrontLayer = new Container();
    const frontLayer = new Container();
    const bubbleLayer = new Container();
    const glassLayer = new Container();
    fishBackLayer.sortableChildren = true;
    fishFrontLayer.sortableChildren = true;
    root.addChild(
      backgroundLayer,
      rearLayer,
      fishBackLayer,
      midLayer,
      fishFrontLayer,
      frontLayer,
      bubbleLayer,
      glassLayer,
    );

    async function setup() {
      await app.init({
        resizeTo: targetHost,
        preference: "webgl",
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      initialized = true;
      if (disposed) {
        destroyApp();
        return;
      }
      app.stage.addChild(root);
      targetHost.appendChild(app.canvas);
      await drawEnvironment(
        app,
        layout,
        backgroundLayer,
        rearLayer,
        midLayer,
        frontLayer,
        bubbleLayer,
        glassLayer,
      );
      setupComplete = true;
      if (disposed) {
        destroyApp();
        return;
      }

      app.ticker.add((ticker) => {
        const deltaSec = Math.min(0.05, ticker.deltaMS / 1000);
        updateFishSprites(
          app,
          records,
          fishBackLayer,
          fishFrontLayer,
          fishRef.current,
          speciesRef.current,
          tank,
          deltaSec,
        );
        animateWater(app, bubbleLayer, glassLayer, performance.now(), deltaSec);
      });
      updateFishSprites(
        app,
        records,
        fishBackLayer,
        fishFrontLayer,
        fishRef.current,
        speciesRef.current,
        tank,
        0,
      );
      requestAnimationFrame(() => !disposed && onReady?.());
    }

    void setup().catch((error: unknown) => {
      if (!disposed) console.error("Aquarium rendering failed", error);
    });
    return () => {
      disposed = true;
      records.clear();
      if (initialized && setupComplete) destroyApp();
    };

    function destroyApp() {
      if (destroyed) return;
      destroyed = true;
      app.destroy(true, { children: true, texture: false });
    }
  }, [layout, onReady, tank]);

  return <div className="aquarium-canvas" ref={hostRef} />;
}

async function drawEnvironment(
  app: Application,
  layout: AquariumLayout,
  backgroundLayer: Container,
  rearLayer: Container,
  midLayer: Container,
  frontLayer: Container,
  bubbleLayer: Container,
  glassLayer: Container,
) {
  const backgroundUrl = getEnvironmentAssetUrl(layout.backgroundId);
  const substrateUrl = getEnvironmentAssetUrl(layout.substrateId);
  const promises: Promise<unknown>[] = [];
  if (backgroundUrl) {
    promises.push(addFullFrameSprite(backgroundLayer, backgroundUrl, app.screen.width, app.screen.height));
  }
  if (substrateUrl) {
    promises.push(addFullFrameSprite(backgroundLayer, substrateUrl, app.screen.width, app.screen.height));
  }

  for (const slotId of DECOR_SLOT_IDS) {
    const placement = layout.slots[slotId];
    if (!placement) continue;
    const asset = decorAssetsById[placement.assetId];
    const url = getEnvironmentAssetUrl(placement.assetId);
    if (!asset || !url) continue;
    const layer = asset.category === "rear"
      ? rearLayer
      : asset.category === "mid"
        ? midLayer
        : frontLayer;
    promises.push(addDecorSprite(
      layer,
      url,
      app.screen.width,
      app.screen.height,
      slotId,
      asset.scale,
      asset.anchorY,
      placement.flipped,
    ));
  }

  promises.push(createBubbles(app, bubbleLayer));
  drawGlass(app, glassLayer, layout.lighting);
  await Promise.allSettled(promises);
}

async function addFullFrameSprite(
  layer: Container,
  url: string,
  width: number,
  height: number,
) {
  const texture = await Assets.load<Texture>(url);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(width / 2, height / 2);
  sprite.scale.set(Math.max(width / texture.width, height / texture.height));
  layer.addChild(sprite);
}

async function addDecorSprite(
  layer: Container,
  url: string,
  width: number,
  height: number,
  slotId: DecorSlotId,
  widthRatio: number,
  anchorY: number,
  flipped: boolean,
) {
  const texture = await Assets.load<Texture>(url);
  const sprite = new Sprite(texture);
  const slot = SLOT_POSITIONS[slotId];
  const targetScale = (width * widthRatio) / texture.width;
  sprite.anchor.set(0.5, anchorY);
  sprite.position.set(width * slot.x, height * slot.y);
  sprite.scale.set(flipped ? -targetScale : targetScale, targetScale);
  layer.addChild(sprite);
}

function updateFishSprites(
  app: Application,
  records: Map<string, FishSpriteRecord>,
  backLayer: Container,
  frontLayer: Container,
  fish: FishInstance[],
  species: Record<string, FishSpeciesDefinition>,
  tank: TankDefinition,
  deltaSec: number,
) {
  const activeIds = new Set(fish.map((item) => item.id));
  for (const [id, record] of records) {
    if (!activeIds.has(id)) {
      record.sprite.destroy();
      records.delete(id);
    }
  }
  for (const item of fish) {
    const definition = species[item.speciesId];
    if (!definition) continue;
    const targetLayer = item.depth > 0.56 ? backLayer : frontLayer;
    let record = records.get(item.id);
    if (!record) {
      const sprite = new AnimatedSprite({
        textures: [Texture.EMPTY],
        autoPlay: false,
        loop: true,
      });
      sprite.anchor.set(0.5);
      targetLayer.addChild(sprite);
      record = { sprite };
      records.set(item.id, record);
      void loadFishTextures(record, definition, item.seed).catch(() => {
        if (!record?.sprite.destroyed) record!.loadedKey = undefined;
      });
    } else if (record.sprite.parent !== targetLayer) {
      targetLayer.addChild(record.sprite);
    }

    const x = (item.position.x / tank.widthCm) * app.screen.width;
    const y = (item.position.y / tank.heightCm) * app.screen.height;
    const scale = getFishSpriteScale({
      viewportWidthPx: app.screen.width,
      tankWidthCm: tank.widthCm,
      species: definition,
      bodyLengthVariance: item.bodyLengthVariance,
      depth: item.depth,
    });
    const ease = deltaSec === 0 ? 1 : 1 - Math.exp(-7 * deltaSec);
    record.visualX = lerp(record.visualX ?? x, x, ease);
    record.visualY = lerp(record.visualY ?? y, y, ease);
    record.visualScale = lerp(record.visualScale ?? scale, scale, ease);
    const speed = Math.hypot(item.velocity.x, item.velocity.y);
    const rotation = speed > 0.05
      ? Math.max(-0.14, Math.min(0.14, Math.asin(item.velocity.y / speed) * 0.2))
      : 0;
    record.visualRotation = lerp(record.visualRotation ?? rotation, rotation, ease);

    record.sprite.position.set(record.visualX, record.visualY);
    record.sprite.rotation = record.visualRotation;
    record.sprite.scale.set(
      item.facing === 1 ? -record.visualScale : record.visualScale,
      record.visualScale,
    );
    record.sprite.alpha = 1 - item.depth * 0.18;
    record.sprite.tint = item.depth > 0.65 ? 0xbcdde1 : 0xffffff;
    record.sprite.zIndex = y;
    const fps = definition.animation?.framesPerSecond ?? 8;
    const modeMultiplier = item.behaviorMode === "kick"
      ? 1.25
      : item.behaviorMode === "coast"
        ? 0.58
        : 0.1;
    record.sprite.animationSpeed = (fps / 60) * modeMultiplier;
    if (item.behaviorMode === "pause") record.sprite.stop();
    else if (!record.sprite.playing) record.sprite.play();
  }
  backLayer.sortChildren();
  frontLayer.sortChildren();
}

async function loadFishTextures(
  record: FishSpriteRecord,
  species: FishSpeciesDefinition,
  seed: number,
) {
  const frameUrls = getFishAnimationFrameUrls(species.id);
  const urls = species.animation && frameUrls.length >= 2
    ? frameUrls
    : [getFishImageUrl(species.id)].filter((url): url is string => Boolean(url));
  const key = urls.join("|");
  if (!key || record.loadedKey === key) return;
  record.loadedKey = key;
  const textures = await Promise.all(urls.map((url) => Assets.load<Texture>(url)));
  if (textures.length === 0 || record.sprite.destroyed) return;
  record.sprite.textures = textures;
  record.sprite.currentFrame = Math.abs(seed) % textures.length;
  if (textures.length > 1) record.sprite.play();
}

async function createBubbles(app: Application, layer: Container) {
  const texture = await Assets.load<Texture>(environmentAssets.bubbleParticleUrl);
  for (let index = 0; index < 56; index += 1) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.name = `bubble-${index}`;
    sprite.x = app.screen.width * (0.07 + ((index * 29) % 88) / 100);
    sprite.y = app.screen.height * (((index * 37) % 100) / 100);
    const size = 0.014 + (index % 6) * 0.004;
    sprite.scale.set((app.screen.width * size) / texture.width);
    sprite.alpha = 0.08 + (index % 5) * 0.035;
    layer.addChild(sprite);
  }
}

function drawGlass(app: Application, layer: Container, lighting: AquariumLayout["lighting"]) {
  const tint = lighting === "night"
    ? { color: 0x061323, alpha: 0.32 }
    : lighting === "evening"
      ? { color: 0x9a4f28, alpha: 0.14 }
      : lighting === "cool"
        ? { color: 0x9fe8ff, alpha: 0.07 }
        : { color: 0xffffff, alpha: 0 };
  layer.addChild(
    new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill(tint),
    new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height * 0.18)
      .fill({ color: 0xe6ffff, alpha: 0.07 }),
    new Graphics()
      .roundRect(10, 10, app.screen.width - 20, app.screen.height - 20, 18)
      .stroke({ color: 0xc5f3ff, alpha: 0.28, width: 2 }),
  );
  const caustics = new Graphics();
  caustics.name = "caustics";
  for (let index = 0; index < 18; index += 1) {
    const y = app.screen.height * (0.2 + ((index * 31) % 65) / 100);
    caustics
      .moveTo(0, y)
      .bezierCurveTo(
        app.screen.width * 0.3,
        y + Math.sin(index) * 7,
        app.screen.width * 0.7,
        y - Math.cos(index) * 8,
        app.screen.width,
        y + Math.sin(index * 1.4) * 5,
      )
      .stroke({ color: 0xeafff9, alpha: 0.026, width: 1 });
  }
  layer.addChild(caustics);
}

function animateWater(
  app: Application,
  bubbles: Container,
  glass: Container,
  nowMs: number,
  deltaSec: number,
) {
  for (const [index, child] of bubbles.children.entries()) {
    child.y -= app.screen.height * (0.012 + (index % 5) * 0.002) * deltaSec;
    child.x += Math.sin(nowMs / 700 + index) * 0.05;
    if (child.y < -10) child.y = app.screen.height + 10;
  }
  const caustics = glass.getChildByName("caustics");
  if (caustics) {
    caustics.x = Math.sin(nowMs / 3500) * app.screen.width * 0.004;
    caustics.alpha = 0.8 + Math.sin(nowMs / 2200) * 0.12;
  }
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
