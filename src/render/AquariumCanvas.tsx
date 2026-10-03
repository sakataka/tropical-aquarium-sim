import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
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
  imageToGlass,
  startleFish,
  stepSimulation,
  type AquariumLayout,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import { environmentAssets, getScenePlateUrl } from "./assets";
import { reportRenderProblem, watchContextLoss, watchSetup } from "./renderProblems";
import { BubbleColumns, FloatingMotes } from "./bubbles";
import { FishLayer, getWaterTint } from "./fishLayer";
import {
  frameGlass,
  getInitialZoom,
  getMaxZoom,
  getRenderOptions,
} from "./tankFraming";
import { UnderwaterFilter } from "./underwaterFilter";
import { playSfx } from "../audio/sfx";
import { getGlassAspect, getWindowOverscan } from "../core/room";
import { getSurfaceFrame, placePlate, TerrainLayer } from "./terrainLayer";
import type { AquariumScene } from "../core/types";
import { clamp, smoothstep } from "../core/math";

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
  /**
   * ガラスがいま画面のどこに映っているかを --glass-x/y/w/h（ビューポートの px）として書き込む要素。
   * ガラスの縁や映り込みなど、水中フィルターの外に重ねる演出が追従する。
   */
  glassFrameRef?: RefObject<HTMLElement | null>;
  onReady?: () => void;
};

export type ViewControl = { zoomBy: (factor: number) => void; resetZoom: () => void };

type CanvasHandle = { setScene: (sceneId: string) => void };

const SCENE_FADE_SEC = 0.9;
/** これより短く、動きの少ない押し下げをガラスを叩いた操作として扱う。 */
const TAP_MAX_MS = 320;
const TAP_MAX_MOVE_PX = 8;
const TAP_RIPPLE_SEC = 0.7;
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
  glassFrameRef,
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const app = new Application();

    const world = new Container();
    const plateLayer = new Container();
    const bubbleLayer = new Container();
    // 生き物と、背景から切り抜いた石・流木を同じ層で奥行き順に並べる。
    const creatureLayer = new Container();
    const moteLayer = new Container();
    const fishLayer = new FishLayer(creatureLayer);
    const terrainLayer = new TerrainLayer(creatureLayer);
    let scenePlate: Sprite | undefined;
    let activeScene: AquariumScene | undefined;
    // フェード中の古い水景は、その水景の切り取り方のまま残す。
    const spriteScenes = new WeakMap<Sprite, AquariumScene>();
    // 水景・魚・泡はすべて部屋のガラスと同じ形で切り抜く。
    const glassMask = new Graphics();
    world.addChild(
      plateLayer,
      bubbleLayer,
      creatureLayer,
      moteLayer,
      glassMask,
    );
    world.mask = glassMask;
    // 部屋から入った直後は部屋で見えていた絵のままにし、水中の効果は少しずつ効かせる。
    const underwater = new UnderwaterFilter(layoutRef.current.lighting, { startNeutral: true });
    const glassAspect = getGlassAspect(tank);
    const overscan = getWindowOverscan(tank.id);
    // 最初は水槽の全体が入る大きさ。ホイール・ピンチ・キーで近づき、ドラッグで見回す。
    const view = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 1, targetZoom: 1 };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance: number | undefined;
    // ガラスを叩いた操作の判定と、続けて叩いたときの慣れ（魚の驚き方が弱まり、しばらくで戻る）。
    let tapStart: { id: number; x: number; y: number; time: number } | undefined;
    let habituation = 0;
    const ripples: { ring: Graphics; ageSec: number }[] = [];
    let revealedAtSec: number | undefined;
    let renderedFrames = 0;

    let bubbles: BubbleColumns | undefined;
    let motes: FloatingMotes | undefined;
    let currentSceneId: string | undefined;
    let sceneToken = 0;
    let elapsedSec = 0;
    let resizeObserver: ResizeObserver | undefined;
    const publishedGlass = { x: NaN, y: NaN, width: NaN, height: NaN };

    const progress = watchSetup("水槽");

    async function setup() {
      progress.mark("WebGLの初期化");
      const width = Math.max(1, targetHost.clientWidth);
      const height = Math.max(1, targetHost.clientHeight);
      await app.init({
        width,
        height,
        preference: "webgl",
        backgroundAlpha: 0,
        autoDensity: true,
        ...getRenderOptions(),
      });
      initialized = true;
      if (disposed) {
        destroyApp();
        return;
      }
      const initialZoom = getInitialZoom(getGlassSize(), app.screen.width, app.screen.height);
      view.zoom = initialZoom;
      view.targetZoom = initialZoom;
      app.stage.addChild(world);
      app.stage.filters = [underwater];
      app.stage.filterArea = app.screen;
      targetHost.appendChild(app.canvas);
      watchContextLoss(app.canvas, "水槽", () => disposed);
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

      progress.mark("泡の画像の読み込み");
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
      progress.mark("水景の画像の読み込み");
      await showScene(layoutRef.current.sceneId);
      if (disposed) return;
      progress.mark("最初の描画");

      app.ticker.add((ticker) => {
        const deltaSec = Math.min(0.05, ticker.deltaMS / 1000);
        elapsedSec += deltaSec;
        habituation = Math.max(0, habituation - deltaSec * 0.025);
        updateRipples(deltaSec);
        if (activeRef.current) fishRef.current = stepSimulation({
          tank,
          species: speciesRef.current,
          fish: fishRef.current,
          deltaSec,
          scene: activeScene,
          surfaceFrame: scenePlate ? getSurfaceFrame(scenePlate,
            { x: 0, y: 0, ...getGlassSize() }) : undefined,
          lighting: layoutRef.current.lighting,
        }).fish;
        if (revealedRef.current && revealedAtSec === undefined) revealedAtSec = elapsedSec;
        const effects = reducedMotion.matches || revealedAtSec === undefined
          ? 0
          : smoothstep(0, EFFECTS_FADE_IN_SEC, elapsedSec - revealedAtSec);
        const glass = getGlassSize();
        driftCamera(glass.width, glass.height, deltaSec, effects);
        publishGlass(glass.width, glass.height);
        fadeScenes(deltaSec);
        if (scenePlate) terrainLayer.layout(scenePlate);
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
        if (renderedFrames === 2) {
          progress.done();
          onReadyRef.current?.();
        }
      });
    }

    async function showScene(sceneId: string) {
      const scene = getSceneById(sceneId);
      const plateUrl = getScenePlateUrl(sceneId);
      if (!scene || !plateUrl || sceneId === currentSceneId) return;
      currentSceneId = sceneId;
      const token = ++sceneToken;
      const plateTexture = await Assets.load<Texture>(plateUrl);
      if (disposed || token !== sceneToken) return;

      const immediate = plateLayer.children.length === 0;
      activeScene = scene;
      terrainLayer.setScene(scene, plateTexture);
      const sprite = new Sprite(plateTexture);
      sprite.anchor.set(0.5);
      sprite.alpha = immediate ? 1 : 0;
      spriteScenes.set(sprite, scene);
      plateLayer.addChild(sprite);
      scenePlate = sprite;
      layoutSceneSprites();
      fishLayer.waterTint = getWaterTint(scene.waterColor);
      // エアストーンの位置は背景画像に対する比率なので、敷いた位置からガラス上の比率へ直す。
      const frame = getSurfaceFrame(sprite, { x: 0, y: 0, ...getGlassSize() });
      bubbles?.setSources(scene.bubbleSources.map((point) => imageToGlass(point, frame)));
    }

    function getGlassSize() {
      return frameGlass(glassAspect, app.screen.width, app.screen.height);
    }

    function layoutSceneSprites() {
      const { width, height } = getGlassSize();
      glassMask.clear().rect(0, 0, width, height).fill(0xffffff);
      for (const child of plateLayer.children) {
        if (child instanceof Sprite) placePlate(child, { x: 0, y: 0, width, height }, overscan, spriteScenes.get(child));
      }
    }

    // 新しい水景をフェードインし、重なりきったら古い水景を外す。
    function fadeScenes(deltaSec: number) {
      const newest = plateLayer.children[plateLayer.children.length - 1];
      if (!newest || plateLayer.children.length < 2) return;
      newest.alpha = reducedMotion.matches ? 1 : Math.min(1, newest.alpha + deltaSec / SCENE_FADE_SEC);
      if (newest.alpha >= 1) {
        for (const old of plateLayer.children.slice(0, -1)) old.destroy();
      }
    }

    // 観賞中に気づかないほどゆっくりカメラを漂わせる。切り替えが終わってから効かせる。
    function driftCamera(width: number, height: number, deltaSec: number, effects: number) {
      const maxZoom = getMaxZoom({ width, height }, app.screen.width, app.screen.height);
      view.targetZoom = clamp(view.targetZoom, 1, maxZoom);
      const follow = reducedMotion.matches || pointers.size > 0 ? 1 : 1 - Math.exp(-10 * deltaSec);
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

    function publishGlass(width: number, height: number) {
      const target = glassFrameRef?.current;
      if (!target) return;
      // 隣の水槽へ移るときは枠ごと平行移動するので、毎フレーム見えている位置を測る。
      const host = targetHost.getBoundingClientRect();
      const topLeft = world.toGlobal({ x: 0, y: 0 });
      const bottomRight = world.toGlobal({ x: width, y: height });
      const next = {
        x: host.left + topLeft.x,
        y: host.top + topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      };
      for (const key of ["x", "y", "width", "height"] as const) {
        if (Math.abs(next[key] - publishedGlass[key]) < 0.25) continue;
        publishedGlass[key] = next[key];
        target.style.setProperty(`--glass-${key[0]}`, `${next[key].toFixed(2)}px`);
      }
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
      const point = localPoint(event);
      tapStart = pointers.size === 0 ? { id: event.pointerId, ...point, time: performance.now() } : undefined;
      pointers.set(event.pointerId, point);
      // ポインターがすでに離れている（合成イベントなど）と例外になるので、捕捉できなくても続ける。
      try { targetHost.setPointerCapture(event.pointerId); } catch { /* 捕捉なしでも操作できる */ }
      pinchDistance = undefined;
    }

    function onPointerMove(event: PointerEvent) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      if (tapStart && Math.hypot(point.x - tapStart.x, point.y - tapStart.y) > TAP_MAX_MOVE_PX) tapStart = undefined;
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
      const tap = tapStart;
      tapStart = undefined;
      if (event.type === "pointerup" && tap?.id === event.pointerId && performance.now() - tap.time < TAP_MAX_MS) {
        tapGlass(tap.x, tap.y);
      }
    }

    // ガラスを指先で軽く叩く。近くの魚ほど驚き、住みかや物陰へ逃げ込み、エビは後ろへ跳ねる。
    function tapGlass(screenX: number, screenY: number) {
      if (!activeRef.current || !activeScene || !scenePlate) return;
      const glass = getGlassSize();
      const local = world.toLocal({ x: screenX, y: screenY });
      if (local.x < 0 || local.y < 0 || local.x > glass.width || local.y > glass.height) return;
      const strength = Math.max(0.2, 1 - habituation);
      habituation = Math.min(0.8, habituation + 0.22);
      fishRef.current = startleFish({
        fish: fishRef.current,
        species: speciesRef.current,
        tank,
        scene: activeScene,
        frame: getSurfaceFrame(scenePlate, { x: 0, y: 0, ...glass }),
        point: { x: local.x / glass.width * tank.widthCm, y: local.y / glass.height * tank.heightCm },
        strength,
      });
      playSfx("ui_tap", 0.6 + strength * 0.4);
      // 画面検証で、叩いた操作が届いたことを確かめられるようにする。
      targetHost.dataset.glassTaps = String(Number(targetHost.dataset.glassTaps ?? 0) + 1);
      if (reducedMotion.matches) return;
      const ring = new Graphics();
      ring.position.set(local.x, local.y);
      moteLayer.addChild(ring);
      ripples.push({ ring, ageSec: 0 });
    }

    // 叩いた所に、ガラスに伝わる小さな波紋を短く出す。
    function updateRipples(deltaSec: number) {
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index]!;
        ripple.ageSec += deltaSec;
        const t = ripple.ageSec / TAP_RIPPLE_SEC;
        if (t >= 1) {
          ripple.ring.destroy();
          ripples.splice(index, 1);
          continue;
        }
        ripple.ring.clear().circle(0, 0, 6 + t * 34)
          .stroke({ color: 0xffffff, width: 1.5 / world.scale.x, alpha: 0.32 * (1 - t) ** 2 });
      }
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
      if (!disposed) reportRenderProblem("水槽", error);
    });
    return () => {
      disposed = true;
      progress.done();
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
      terrainLayer.clear();
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
  }, [fishRef, tank, glassFrameRef]);

  useEffect(() => {
    handleRef.current?.setScene(layout.sceneId);
  }, [layout.sceneId]);


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
