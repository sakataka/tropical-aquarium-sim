import { useEffect, useRef, type MutableRefObject } from "react";
import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
} from "pixi.js";
import {
  getFishSpriteScale,
  getSceneById,
  stepSimulation,
  type AquariumLayout,
  type FishInstance,
  type FishSpeciesDefinition,
  type LightingId,
  type TankDefinition,
  type Vec2,
} from "../core";
import {
  environmentAssets,
  getFishImageUrl,
  getSceneForegroundUrl,
  getScenePlateUrl,
} from "./assets";
import { BubbleColumns, FloatingMotes } from "./bubbles";
import { FishBody, getBodyTexture } from "./fishBody";
import { UnderwaterFilter } from "./underwaterFilter";

type AquariumCanvasProps = {
  fishRef: MutableRefObject<FishInstance[]>;
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  layout: AquariumLayout;
  onReady?: () => void;
};

type CanvasHandle = {
  setScene: (sceneId: string) => void;
  setLighting: (lighting: LightingId) => void;
};

type FishRecord = { body: FishBody; visualScale: number };

const BACK_DEPTH = 0.56;
const SCENE_FADE_SEC = 0.9;

export function AquariumCanvas({
  fishRef,
  species,
  tank,
  layout,
  onReady,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CanvasHandle | null>(null);
  const layoutRef = useRef(layout);
  const speciesRef = useRef(species);
  const onReadyRef = useRef(onReady);
  layoutRef.current = layout;
  speciesRef.current = species;
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const targetHost = host;
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    const app = new Application();
    const records = new Map<string, FishRecord>();
    const fishTextures = new Map<string, Texture | Promise<void>>();

    const world = new Container();
    const plateLayer = new Container();
    const bubbleLayer = new Container();
    const fishBackLayer = new Container();
    const foregroundLayer = new Container();
    const fishFrontLayer = new Container();
    const moteLayer = new Container();
    fishBackLayer.sortableChildren = true;
    fishFrontLayer.sortableChildren = true;
    world.addChild(
      plateLayer,
      bubbleLayer,
      fishBackLayer,
      foregroundLayer,
      fishFrontLayer,
      moteLayer,
    );
    const underwater = new UnderwaterFilter(layoutRef.current.lighting);

    let bubbles: BubbleColumns | undefined;
    let motes: FloatingMotes | undefined;
    let currentSceneId: string | undefined;
    let sceneToken = 0;
    let structurePoints: Vec2[] = [];
    let waterTint = 0xffffff;
    let readyNotified = false;
    let elapsedSec = 0;

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
      app.stage.addChild(world);
      app.stage.filters = [underwater];
      app.stage.filterArea = app.screen;
      targetHost.appendChild(app.canvas);
      app.renderer.on("resize", layoutSceneSprites);

      const bubbleTexture = await Assets.load<Texture>(environmentAssets.bubbleParticleUrl);
      if (disposed) return;
      bubbles = new BubbleColumns(bubbleTexture);
      motes = new FloatingMotes(bubbleTexture);
      bubbleLayer.addChild(bubbles.container);
      moteLayer.addChild(motes.container);

      handleRef.current = {
        setScene: (sceneId) => void showScene(sceneId),
        setLighting: (lighting) => underwater.setLighting(lighting),
      };
      await showScene(layoutRef.current.sceneId);
      if (disposed) return;
      underwater.setLighting(layoutRef.current.lighting);

      app.ticker.add((ticker) => {
        const deltaSec = Math.min(0.05, ticker.deltaMS / 1000);
        elapsedSec += deltaSec;
        fishRef.current = stepSimulation({
          tank,
          species: speciesRef.current,
          fish: fishRef.current,
          deltaSec,
          structurePoints,
        }).fish;
        const { width, height } = app.screen;
        driftCamera(width, height);
        fadeScenes(deltaSec);
        updateFish(deltaSec);
        bubbles?.update(width, height, deltaSec);
        motes?.update(width, height, elapsedSec, deltaSec);
        underwater.update(elapsedSec % 3600, deltaSec);
      });
    }

    async function showScene(sceneId: string) {
      const scene = getSceneById(sceneId);
      const plateUrl = getScenePlateUrl(sceneId);
      if (!scene || !plateUrl || sceneId === currentSceneId) return;
      currentSceneId = sceneId;
      const token = ++sceneToken;
      const foregroundUrl = getSceneForegroundUrl(sceneId);
      const [plateTexture, foregroundTexture] = await Promise.all([
        Assets.load<Texture>(plateUrl),
        foregroundUrl ? Assets.load<Texture>(foregroundUrl) : Promise.resolve(undefined),
      ]);
      if (disposed || token !== sceneToken) return;

      const immediate = plateLayer.children.length === 0;
      for (const [layer, texture] of [
        [plateLayer, plateTexture],
        [foregroundLayer, foregroundTexture],
      ] as const) {
        if (!texture) continue;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.alpha = immediate ? 1 : 0;
        layer.addChild(sprite);
      }
      layoutSceneSprites();
      structurePoints = scene.structurePoints;
      waterTint = getWaterTint(scene.waterColor);
      bubbles?.setSources(scene.bubbleSources);

      if (!readyNotified) {
        readyNotified = true;
        requestAnimationFrame(() => !disposed && onReadyRef.current?.());
      }
    }

    function layoutSceneSprites() {
      const { width, height } = app.screen;
      for (const layer of [plateLayer, foregroundLayer]) {
        for (const child of layer.children) {
          if (!(child instanceof Sprite)) continue;
          child.position.set(width / 2, height / 2);
          child.scale.set(Math.max(width / child.texture.width, height / child.texture.height));
        }
      }
    }

    // 新しい水景をフェードインし、重なりきったら古い水景を外す。
    function fadeScenes(deltaSec: number) {
      for (const layer of [plateLayer, foregroundLayer]) {
        const newest = layer.children[layer.children.length - 1];
        if (!newest || layer.children.length < 2) continue;
        newest.alpha = Math.min(1, newest.alpha + deltaSec / SCENE_FADE_SEC);
        if (newest.alpha >= 1) {
          for (const old of layer.children.slice(0, -1)) old.destroy();
        }
      }
    }

    // 観賞中に気づかないほどゆっくりカメラを漂わせる。
    function driftCamera(width: number, height: number) {
      const zoom = 1.03 + Math.sin(elapsedSec / 41) * 0.006;
      world.scale.set(zoom);
      world.pivot.set(
        width / 2 + Math.sin(elapsedSec / 67) * width * 0.006,
        height / 2 + Math.sin(elapsedSec / 53) * height * 0.005,
      );
      world.position.set(width / 2, height / 2);
    }

    function updateFish(deltaSec: number) {
      const fish = fishRef.current;
      const catalog = speciesRef.current;
      const activeIds = new Set(fish.map((item) => item.id));
      for (const [id, record] of records) {
        if (!activeIds.has(id)) {
          record.body.destroy();
          records.delete(id);
        }
      }
      const { width, height } = app.screen;
      for (const item of fish) {
        const definition = catalog[item.speciesId];
        if (!definition) continue;
        let record = records.get(item.id);
        if (!record) {
          const texture = getFishTexture(definition);
          if (!texture) continue;
          record = {
            body: new FishBody(getBodyTexture(texture, definition), definition, item),
            visualScale: 0,
          };
          records.set(item.id, record);
        }
        const mesh = record.body.mesh;
        const targetLayer = item.depth > BACK_DEPTH ? fishBackLayer : fishFrontLayer;
        if (mesh.parent !== targetLayer) targetLayer.addChild(mesh);

        const scale = getFishSpriteScale({
          viewportWidthPx: width,
          tankWidthCm: tank.widthCm,
          species: definition,
          bodyLengthVariance: item.bodyLengthVariance,
          depth: item.depth,
        });
        record.visualScale = record.visualScale === 0
          ? scale
          : record.visualScale + (scale - record.visualScale) * (1 - Math.exp(-4 * deltaSec));
        mesh.position.set(
          (item.position.x / tank.widthCm) * width,
          (item.position.y / tank.heightCm) * height,
        );
        mesh.scale.set(record.visualScale);
        // 奥の魚はぼかさず、水の色と透明度だけで距離を出す。
        mesh.tint = mixColor(0xffffff, waterTint, 0.06 + item.depth * 0.26);
        mesh.alpha = 1 - item.depth * 0.08;
        mesh.zIndex = -item.depth;
        record.body.update(item, deltaSec);
      }
    }

    function getFishTexture(definition: FishSpeciesDefinition): Texture | undefined {
      const cached = fishTextures.get(definition.id);
      if (cached instanceof Texture) return cached;
      if (cached) return undefined;
      const url = getFishImageUrl(definition.id);
      if (!url) return undefined;
      // 大きな原画を小さく表示するため、ミップマップでちらつきを抑える。
      fishTextures.set(definition.id, Assets.load<Texture>({
        src: url,
        data: { autoGenerateMipmaps: true },
      }).then((texture) => {
        fishTextures.set(definition.id, texture);
      }).catch((error: unknown) => {
        console.error(`Fish texture failed: ${definition.id}`, error);
      }));
      return undefined;
    }

    void setup().catch((error: unknown) => {
      if (!disposed) console.error("Aquarium rendering failed", error);
    });
    return () => {
      disposed = true;
      handleRef.current = null;
      for (const record of records.values()) record.body.destroy();
      records.clear();
      if (initialized) destroyApp();
    };

    function destroyApp() {
      if (destroyed) return;
      destroyed = true;
      app.destroy(true, { children: true, texture: false });
    }
  }, [fishRef, tank]);

  useEffect(() => {
    handleRef.current?.setScene(layout.sceneId);
  }, [layout.sceneId]);

  useEffect(() => {
    handleRef.current?.setLighting(layout.lighting);
  }, [layout.lighting]);

  return <div className="aquarium-canvas" ref={hostRef} />;
}

// 水の色を明るく正規化し、魚にかける乗算色にする。
function getWaterTint(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const max = Math.max(...channels, 1);
  const [r, g, b] = channels.map((channel) => Math.round((channel / max) * 255));
  return (r! << 16) | (g! << 8) | b!;
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
