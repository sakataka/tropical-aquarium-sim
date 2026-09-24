import { useEffect, useRef, type MutableRefObject } from "react";
import {
  Application,
  Assets,
  Container,
  Sprite,
  Texture,
} from "pixi.js";
import {
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
  getSceneForegroundUrl,
  getScenePlateUrl,
} from "./assets";
import { BubbleColumns, FloatingMotes } from "./bubbles";
import { FishLayer, getWaterTint } from "./fishLayer";
import { UnderwaterFilter } from "./underwaterFilter";

type AquariumCanvasProps = {
  fishRef: MutableRefObject<FishInstance[]>;
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  layout: AquariumLayout;
  /** false の間は描画だけ続け、魚の動きは進めない（画面を重ねて切り替えている間）。 */
  active?: boolean;
  onReady?: () => void;
};

type CanvasHandle = {
  setScene: (sceneId: string) => void;
  setLighting: (lighting: LightingId) => void;
};

const SCENE_FADE_SEC = 0.9;

export function AquariumCanvas({
  fishRef,
  species,
  tank,
  layout,
  active = true,
  onReady,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CanvasHandle | null>(null);
  const layoutRef = useRef(layout);
  const speciesRef = useRef(species);
  const onReadyRef = useRef(onReady);
  const activeRef = useRef(active);
  activeRef.current = active;
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

    const world = new Container();
    const plateLayer = new Container();
    const bubbleLayer = new Container();
    const fishBackLayer = new Container();
    const foregroundLayer = new Container();
    const fishFrontLayer = new Container();
    const moteLayer = new Container();
    const fishLayer = new FishLayer(fishBackLayer, fishFrontLayer);
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
    let readyNotified = false;
    let elapsedSec = 0;
    let resizeObserver: ResizeObserver | undefined;

    async function setup() {
      await app.init({
        width: Math.max(1, targetHost.clientWidth),
        height: Math.max(1, targetHost.clientHeight),
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
      // パネルの開閉など、ウィンドウ以外の理由で枠の大きさが変わっても追従する。
      resizeObserver = new ResizeObserver(() => {
        detachFilterInput(app);
        app.renderer.resize(Math.max(1, targetHost.clientWidth), Math.max(1, targetHost.clientHeight));
      });
      resizeObserver.observe(targetHost);
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
        if (activeRef.current) fishRef.current = stepSimulation({
          tank,
          species: speciesRef.current,
          fish: fishRef.current,
          deltaSec,
          structurePoints,
          lighting: layoutRef.current.lighting,
        }).fish;
        const { width, height } = app.screen;
        driftCamera(width, height);
        fadeScenes(deltaSec);
        fishLayer.update(fishRef.current, speciesRef.current, tank, { x: 0, y: 0, width, height }, deltaSec);
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
      fishLayer.waterTint = getWaterTint(scene.waterColor);
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

    void setup().catch((error: unknown) => {
      if (!disposed) console.error("Aquarium rendering failed", error);
    });
    return () => {
      disposed = true;
      handleRef.current = null;
      resizeObserver?.disconnect();
      fishLayer.destroy();
      if (initialized) destroyApp();
    };

    function destroyApp() {
      if (destroyed) return;
      destroyed = true;
      // フィルターは子要素と一緒には破棄されないため、自分で外して破棄する。
      app.stage.filters = null;
      underwater.destroy();
      detachFilterInput(app);
      // true を渡すと全レンダラー共有の資源まで解放され、同時に動く別画面が壊れる。
      app.destroy({ removeView: true }, { children: true, texture: false });
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

// PixiJS 8.21 の FilterSystem は、最後にフィルターへ渡した入力テクスチャ（共有の
// 作業用テクスチャ）を内部の BindGroup に持ち続ける。リサイズやレンダラー破棄で
// そのテクスチャが破棄されると「破棄済みテクスチャを参照している」警告が出るため、
// 先に破棄されない空テクスチャへ付け替えておく。
function detachFilterInput(app: Application) {
  const filterSystem = app.renderer?.filter as unknown as
    | { _globalFilterBindGroup?: { resources: unknown; setResource: (resource: unknown, index: number) => void } }
    | undefined;
  const group = filterSystem?._globalFilterBindGroup;
  if (!group?.resources) return;
  group.setResource(Texture.EMPTY.source, 1);
  group.setResource(Texture.EMPTY.source.style, 2);
}
