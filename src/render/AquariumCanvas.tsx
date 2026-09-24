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
import { frameGlass, getGlassAspect } from "./tankFraming";
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
const KEY_PAN_PX = 90;

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
    // 部屋から入った直後は部屋で見えていた絵のままにし、水中の効果は少しずつ効かせる。
    const underwater = new UnderwaterFilter(layoutRef.current.lighting, { startNeutral: true });
    const glassAspect = getGlassAspect(tank);
    // 画面からはみ出したガラスの範囲は、ドラッグ・ホイール・矢印キーで見回す。
    const pan = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let dragPointer: number | undefined;

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
      targetHost.addEventListener("pointerdown", onPointerDown);
      targetHost.addEventListener("pointermove", onPointerMove);
      targetHost.addEventListener("pointerup", onPointerUp);
      targetHost.addEventListener("pointercancel", onPointerUp);
      targetHost.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKeyDown);

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
        const glass = getGlassSize();
        driftCamera(glass.width, glass.height, deltaSec);
        fadeScenes(deltaSec);
        fishLayer.update(
          fishRef.current,
          speciesRef.current,
          tank,
          { x: 0, y: 0, width: glass.width, height: glass.height },
          deltaSec,
        );
        bubbles?.update(glass.width, glass.height, deltaSec);
        motes?.update(glass.width, glass.height, elapsedSec, deltaSec);
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

    function getGlassSize() {
      return frameGlass(glassAspect, app.screen.width, app.screen.height);
    }

    function layoutSceneSprites() {
      const { width, height } = getGlassSize();
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

    // 観賞中に気づかないほどゆっくりカメラを漂わせる。入った直後は漂いなしから始める。
    function driftCamera(width: number, height: number, deltaSec: number) {
      const ramp = smoothstep(0, 6, elapsedSec);
      const zoom = 1 + (0.03 + Math.sin(elapsedSec / 41) * 0.006) * ramp;
      const maxX = Math.max(0, (width * zoom - app.screen.width) / 2);
      const maxY = Math.max(0, (height * zoom - app.screen.height) / 2);
      pan.targetX = clamp(pan.targetX, -maxX, maxX);
      pan.targetY = clamp(pan.targetY, -maxY, maxY);
      const follow = dragPointer === undefined ? 1 - Math.exp(-10 * deltaSec) : 1;
      pan.x += (pan.targetX - pan.x) * follow;
      pan.y += (pan.targetY - pan.y) * follow;
      world.scale.set(zoom);
      world.pivot.set(
        width / 2 + Math.sin(elapsedSec / 67) * width * 0.006 * ramp,
        height / 2 + Math.sin(elapsedSec / 53) * height * 0.005 * ramp,
      );
      world.position.set(app.screen.width / 2 + pan.x, app.screen.height / 2 + pan.y);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      dragPointer = event.pointerId;
      targetHost.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== dragPointer) return;
      pan.targetX += event.movementX;
      pan.targetY += event.movementY;
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== dragPointer) return;
      dragPointer = undefined;
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      pan.targetX -= event.deltaX;
      pan.targetY -= event.deltaY;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("input, select, textarea, .control-panel")) return;
      const step = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
      if (!step) return;
      event.preventDefault();
      pan.targetX += step[0]! * KEY_PAN_PX;
      pan.targetY += step[1]! * KEY_PAN_PX;
    }

    void setup().catch((error: unknown) => {
      if (!disposed) console.error("Aquarium rendering failed", error);
    });
    return () => {
      disposed = true;
      handleRef.current = null;
      resizeObserver?.disconnect();
      targetHost.removeEventListener("pointerdown", onPointerDown);
      targetHost.removeEventListener("pointermove", onPointerMove);
      targetHost.removeEventListener("pointerup", onPointerUp);
      targetHost.removeEventListener("pointercancel", onPointerUp);
      targetHost.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
