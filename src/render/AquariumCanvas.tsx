import { useEffect, useRef, type MutableRefObject } from "react";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import {
  getSceneById,
  stepSimulation,
  type AquariumLayout,
  type FishInstance,
  type FishSpeciesDefinition,
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
import { frameGlass, getGlassAspect, getMaxZoom } from "./tankFraming";
import { UnderwaterFilter } from "./underwaterFilter";

type AquariumCanvasProps = {
  fishRef: MutableRefObject<FishInstance[]>;
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  layout: AquariumLayout;
  /** false の間は描画だけ続け、魚の動きは進めない（画面を重ねて切り替えている間）。 */
  active?: boolean;
  /**
   * 前の画面との重ね合わせが終わり、この画面だけが見えている状態。
   * 水中の効果・泡・浮遊物・カメラの漂いは、ここから少しずつ出す。
   */
  revealed?: boolean;
  /** 画面上のボタンからズームを操作するための口。 */
  viewControlRef?: MutableRefObject<ViewControl | null>;
  onReady?: () => void;
};

export type ViewControl = { zoomBy: (factor: number) => void; resetZoom: () => void };

type CanvasHandle = { setScene: (sceneId: string) => void };

const SCENE_FADE_SEC = 0.9;
const KEY_PAN_PX = 90;
const EFFECTS_FADE_IN_SEC = 2.5;

export function AquariumCanvas({
  fishRef,
  species,
  tank,
  layout,
  active = true,
  revealed = true,
  viewControlRef,
  onReady,
}: AquariumCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<CanvasHandle | null>(null);
  const layoutRef = useRef(layout);
  const speciesRef = useRef(species);
  const onReadyRef = useRef(onReady);
  const activeRef = useRef(active);
  const revealedRef = useRef(revealed);
  activeRef.current = active;
  revealedRef.current = revealed;
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
    // 水景・魚・泡はすべて部屋のガラスと同じ形で切り抜く。
    const glassMask = new Graphics();
    world.addChild(
      plateLayer,
      bubbleLayer,
      fishBackLayer,
      foregroundLayer,
      fishFrontLayer,
      moteLayer,
      glassMask,
    );
    world.mask = glassMask;
    // 部屋から入った直後は部屋で見えていた絵のままにし、水中の効果は少しずつ効かせる。
    const underwater = new UnderwaterFilter(layoutRef.current.lighting, { startNeutral: true });
    const glassAspect = getGlassAspect(tank);
    // 最初は水槽の全体が入る大きさ。ホイール・ピンチ・キーで近づき、ドラッグで見回す。
    const view = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 1, targetZoom: 1 };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance: number | undefined;
    let revealedAtSec: number | undefined;
    let renderedFrames = 0;

    let bubbles: BubbleColumns | undefined;
    let motes: FloatingMotes | undefined;
    let currentSceneId: string | undefined;
    let sceneToken = 0;
    let structurePoints: Vec2[] = [];
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
      targetHost.addEventListener("dblclick", onDoubleClick);
      window.addEventListener("keydown", onKeyDown);

      const bubbleTexture = await Assets.load<Texture>(environmentAssets.bubbleParticleUrl);
      if (disposed) return;
      bubbles = new BubbleColumns(bubbleTexture);
      motes = new FloatingMotes(bubbleTexture);
      bubbleLayer.addChild(bubbles.container);
      moteLayer.addChild(motes.container);

      handleRef.current = { setScene: (sceneId) => void showScene(sceneId) };
      if (viewControlRef) {
        viewControlRef.current = {
          zoomBy: (factor) => zoomAt(view.targetZoom * factor, app.screen.width / 2, app.screen.height / 2),
          resetZoom: () => zoomAt(1, app.screen.width / 2, app.screen.height / 2),
        };
      }
      await showScene(layoutRef.current.sceneId);
      if (disposed) return;

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
        if (revealedRef.current && revealedAtSec === undefined) revealedAtSec = elapsedSec;
        const effects = revealedAtSec === undefined
          ? 0
          : smoothstep(0, EFFECTS_FADE_IN_SEC, elapsedSec - revealedAtSec);
        const glass = getGlassSize();
        driftCamera(glass.width, glass.height, deltaSec, effects);
        fadeScenes(deltaSec);
        fishLayer.update(
          fishRef.current,
          speciesRef.current,
          tank,
          { x: 0, y: 0, width: glass.width, height: glass.height },
          deltaSec,
          activeRef.current,
        );
        bubbles?.update(glass.width, glass.height, deltaSec, revealedAtSec !== undefined);
        motes?.update(glass.width, glass.height, elapsedSec, deltaSec, effects);
        underwater.setLighting(revealedAtSec === undefined ? null : layoutRef.current.lighting);
        underwater.update(elapsedSec % 3600, deltaSec);
        // 魚まで描き終えた2フレーム目から見せる。
        renderedFrames += 1;
        if (renderedFrames === 2) onReadyRef.current?.();
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

    }

    function getGlassSize() {
      return frameGlass(glassAspect, app.screen.width, app.screen.height);
    }

    function layoutSceneSprites() {
      const { width, height } = getGlassSize();
      glassMask.clear().rect(0, 0, width, height).fill(0xffffff);
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

    // 観賞中に気づかないほどゆっくりカメラを漂わせる。切り替えが終わってから効かせる。
    function driftCamera(width: number, height: number, deltaSec: number, effects: number) {
      const maxZoom = getMaxZoom({ width, height }, app.screen.width, app.screen.height);
      view.targetZoom = clamp(view.targetZoom, 1, maxZoom);
      const follow = pointers.size > 0 ? 1 : 1 - Math.exp(-10 * deltaSec);
      view.zoom += (view.targetZoom - view.zoom) * follow;
      const scale = view.zoom * (1 + (0.02 + Math.sin(elapsedSec / 41) * 0.005) * effects);
      const maxX = Math.max(0, (width * scale - app.screen.width) / 2);
      const maxY = Math.max(0, (height * scale - app.screen.height) / 2);
      view.targetX = clamp(view.targetX, -maxX, maxX);
      view.targetY = clamp(view.targetY, -maxY, maxY);
      view.x += (view.targetX - view.x) * follow;
      view.y += (view.targetY - view.y) * follow;
      world.scale.set(scale);
      world.pivot.set(
        width / 2 + Math.sin(elapsedSec / 67) * width * 0.005 * effects,
        height / 2 + Math.sin(elapsedSec / 53) * height * 0.004 * effects,
      );
      world.position.set(app.screen.width / 2 + view.x, app.screen.height / 2 + view.y);
    }

    // 指定した画面上の点を動かさずに拡大・縮小する。
    function zoomAt(nextZoom: number, anchorX: number, anchorY: number) {
      const glass = getGlassSize();
      const zoom = clamp(nextZoom, 1, getMaxZoom(glass, app.screen.width, app.screen.height));
      const offsetX = anchorX - app.screen.width / 2;
      const offsetY = anchorY - app.screen.height / 2;
      const ratio = zoom / view.targetZoom;
      view.targetX = offsetX - (offsetX - view.targetX) * ratio;
      view.targetY = offsetY - (offsetY - view.targetY) * ratio;
      view.targetZoom = zoom;
    }

    function localPoint(event: { clientX: number; clientY: number }) {
      const rect = targetHost.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, localPoint(event));
      targetHost.setPointerCapture(event.pointerId);
      pinchDistance = undefined;
    }

    function onPointerMove(event: PointerEvent) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchDistance) zoomAt(view.targetZoom * (distance / pinchDistance), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        pinchDistance = distance;
        return;
      }
      view.targetX += point.x - previous.x;
      view.targetY += point.y - previous.y;
    }

    function onPointerUp(event: PointerEvent) {
      pointers.delete(event.pointerId);
      pinchDistance = undefined;
    }

    function onDoubleClick(event: MouseEvent) {
      const point = localPoint(event);
      zoomAt(view.targetZoom > 1.2 ? 1 : 2.2, point.x, point.y);
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const point = localPoint(event);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(view.targetZoom * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), point.x, point.y);
      view.targetX -= event.deltaX;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("input, select, textarea, .control-panel")) return;
      const center = [app.screen.width / 2, app.screen.height / 2] as const;
      if (event.key === "+" || event.key === "=") zoomAt(view.targetZoom * 1.25, ...center);
      else if (event.key === "-") zoomAt(view.targetZoom / 1.25, ...center);
      else if (event.key === "0") zoomAt(1, ...center);
      else {
        const step = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
        if (!step) return;
        view.targetX += step[0]! * KEY_PAN_PX;
        view.targetY += step[1]! * KEY_PAN_PX;
      }
      event.preventDefault();
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
      targetHost.removeEventListener("dblclick", onDoubleClick);
      if (viewControlRef) viewControlRef.current = null;
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
