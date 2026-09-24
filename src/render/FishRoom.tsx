import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  fishCatalog,
  getSceneById,
  getStructurePoints,
  getTankById,
  stepSimulation,
  type AquariumCustomization,
  type FishInstance,
} from "../core";
import { fishRoom, type RoomRect } from "../core/room";
import { getScenePlateUrl, roomImageUrl } from "./assets";
import { FishLayer, getWaterTint, type ViewRect } from "./fishLayer";

type FishRoomProps = {
  tanks: Record<string, AquariumCustomization>;
  fishRefs: Record<string, MutableRefObject<FishInstance[]>>;
  /** 水槽画面から戻ったときは、その水槽に寄った状態から引いて始める。 */
  returningFrom?: string;
  onEnterTank: (tankId: string) => void;
};

type TankView = {
  tankId: string;
  container: Container;
  plate: Sprite;
  mask: Graphics;
  fish: FishLayer;
  sceneId?: string;
};

type Camera = { centerX: number; centerY: number; width: number; height: number };
type ZoomAnimation = { from: Camera; to: Camera; elapsedSec: number; onDone?: () => void };

const ZOOM_SEC = 0.95;

export function FishRoom({ tanks, fishRefs, returningFrom, onEnterTank }: FishRoomProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tanksRef = useRef(tanks);
  const zoomRef = useRef<((tankId: string, onDone: () => void) => void) | null>(null);
  const [zoomingTo, setZoomingTo] = useState<string | null>(null);
  tanksRef.current = tanks;

  // 横長の部屋を狭い画面で見るときは、中央の水槽から見えるようにする。
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (shell) shell.scrollLeft = (shell.scrollWidth - shell.clientWidth) / 2;
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const host = stage;
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    const app = new Application();
    const world = new Container();
    const views: TankView[] = [];
    let zoom: ZoomAnimation | undefined;
    let roomSprite: Sprite | undefined;

    async function setup() {
      await app.init({
        resizeTo: host,
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
      host.prepend(app.canvas);
      app.stage.addChild(world);

      for (const placement of fishRoom.tanks) {
        const container = new Container();
        const plate = new Sprite(Texture.EMPTY);
        plate.anchor.set(0.5);
        const fishContainer = new Container();
        const mask = new Graphics();
        container.addChild(plate, fishContainer, mask);
        container.mask = mask;
        world.addChild(container);
        views.push({
          tankId: placement.tankId,
          container,
          plate,
          mask,
          fish: new FishLayer(fishContainer, fishContainer),
        });
      }
      const roomTexture = await Assets.load<Texture>(roomImageUrl);
      if (disposed) return;
      roomSprite = new Sprite(roomTexture);
      world.addChild(roomSprite);

      zoomRef.current = (tankId, onDone) => {
        const placement = fishRoom.tanks.find((item) => item.tankId === tankId);
        if (!placement) return;
        zoom = { from: getVisibleCamera(), to: getGlassCamera(placement.glass), elapsedSec: 0, onDone };
      };
      const returning = fishRoom.tanks.find((item) => item.tankId === returningFrom);
      if (returning) {
        zoom = { from: getGlassCamera(returning.glass), to: getVisibleCamera(), elapsedSec: 0 };
      }

      app.ticker.add((ticker) => {
        const deltaSec = Math.min(0.05, ticker.deltaMS / 1000);
        const { width, height } = app.screen;
        if (roomSprite) {
          roomSprite.width = width;
          roomSprite.height = height;
        }
        for (const view of views) updateTank(view, width, height, deltaSec);
        updateCamera(deltaSec);
      });
    }

    function updateTank(view: TankView, width: number, height: number, deltaSec: number) {
      const tank = getTankById(view.tankId);
      const placement = fishRoom.tanks.find((item) => item.tankId === view.tankId);
      const customization = tanksRef.current[view.tankId];
      const fishRef = fishRefs[view.tankId];
      if (!tank || !placement || !customization || !fishRef) return;
      if (customization.layout.sceneId !== view.sceneId) loadPlate(view, customization.layout.sceneId);

      const windowRect = toPixels(placement.window, width, height);
      const glassRect = toPixels(placement.glass, width, height);
      view.mask.clear().rect(windowRect.x, windowRect.y, windowRect.width, windowRect.height).fill(0xffffff);
      if (view.plate.texture !== Texture.EMPTY) {
        view.plate.position.set(glassRect.x + glassRect.width / 2, glassRect.y + glassRect.height / 2);
        // 前面ガラスを基準に、側面ガラスから見える部分まで水景を広げる。
        view.plate.scale.set(Math.max(
          windowRect.width / view.plate.texture.width,
          windowRect.height / view.plate.texture.height,
        ));
      }
      fishRef.current = stepSimulation({
        tank,
        species: fishCatalog,
        fish: fishRef.current,
        deltaSec,
        structurePoints: getStructurePoints(tank, customization.layout),
        lighting: customization.layout.lighting,
      }).fish;
      view.fish.update(fishRef.current, fishCatalog, tank, glassRect, deltaSec);
    }

    function loadPlate(view: TankView, sceneId: string) {
      view.sceneId = sceneId;
      const scene = getSceneById(sceneId);
      const url = getScenePlateUrl(sceneId);
      if (scene) view.fish.waterTint = getWaterTint(scene.waterColor);
      if (!url) return;
      void Assets.load<Texture>(url).then((texture) => {
        if (!disposed && view.sceneId === sceneId) view.plate.texture = texture;
      });
    }

    // カメラは「部屋のどこを画面いっぱいに映すか」で表し、寄る・引くを補間する。
    function updateCamera(deltaSec: number) {
      if (!zoom) {
        world.scale.set(1);
        world.position.set(0, 0);
        return;
      }
      zoom.elapsedSec += deltaSec;
      const t = easeInOutCubic(Math.min(1, zoom.elapsedSec / ZOOM_SEC));
      const camera: Camera = {
        centerX: lerp(zoom.from.centerX, zoom.to.centerX, t),
        centerY: lerp(zoom.from.centerY, zoom.to.centerY, t),
        width: zoom.from.width * (zoom.to.width / zoom.from.width) ** t,
        height: zoom.from.height * (zoom.to.height / zoom.from.height) ** t,
      };
      applyCamera(camera);
      if (zoom.elapsedSec >= ZOOM_SEC) {
        const done = zoom.onDone;
        if (!done) zoom = undefined;
        done?.();
      }
    }

    function applyCamera(camera: Camera) {
      const visible = getVisibleCamera();
      const scale = visible.width / camera.width;
      world.scale.set(scale);
      world.position.set(
        visible.centerX - camera.centerX * scale,
        visible.centerY - camera.centerY * scale,
      );
    }

    // 部屋の絵のうち、いま画面に見えている範囲（スクロールや上下のはみ出しを除く）。
    function getVisibleCamera(): Camera {
      const rect = host.getBoundingClientRect();
      const left = Math.max(0, -rect.left);
      const top = Math.max(0, -rect.top);
      const right = Math.min(rect.width, window.innerWidth - rect.left);
      const bottom = Math.min(rect.height, window.innerHeight - rect.top);
      return {
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
    }

    // 前面ガラスが画面いっぱいに収まるカメラ。画面の縦横比に合わせて広げる。
    function getGlassCamera(glass: RoomRect): Camera {
      const visible = getVisibleCamera();
      const rect = toPixels(glass, app.screen.width, app.screen.height);
      const aspect = visible.width / visible.height;
      const width = Math.min(rect.width, rect.height * aspect);
      return {
        centerX: rect.x + rect.width / 2,
        centerY: rect.y + rect.height / 2,
        width,
        height: width / aspect,
      };
    }

    void setup().catch((error: unknown) => {
      if (!disposed) console.error("Fish room rendering failed", error);
    });
    return () => {
      disposed = true;
      zoomRef.current = null;
      for (const view of views) view.fish.destroy();
      if (initialized) destroyApp();
    };

    function destroyApp() {
      if (destroyed) return;
      destroyed = true;
      app.destroy(true, { children: true, texture: false });
    }
  }, [fishRefs, returningFrom]);

  function enter(tankId: string) {
    if (zoomingTo) return;
    setZoomingTo(tankId);
    if (zoomRef.current) zoomRef.current(tankId, () => onEnterTank(tankId));
    else onEnterTank(tankId);
  }

  return (
    <div className={`room-scroll${zoomingTo ? " zooming" : ""}`} ref={shellRef}>
      <div
        className="room-stage"
        ref={stageRef}
        style={{ aspectRatio: String(fishRoom.aspectRatio) }}
      >
        {fishRoom.tanks.map((placement) => {
          const tank = getTankById(placement.tankId);
          if (!tank) return null;
          const count = (tanks[tank.id]?.stock ?? []).reduce((sum, entry) => sum + entry.count, 0);
          return (
            <button
              aria-label={`${tank.displayName}を眺める`}
              className="room-tank"
              key={tank.id}
              onClick={() => enter(tank.id)}
              style={{
                left: `${placement.glass.x * 100}%`,
                top: `${placement.glass.y * 100}%`,
                width: `${placement.glass.width * 100}%`,
                height: `${placement.glass.height * 100}%`,
              }}
              type="button"
            >
              <span className="room-tank-label">
                <strong>{tank.displayName}</strong>
                <small>{tank.widthCm}cm · {count}匹</small>
              </span>
            </button>
          );
        })}
      </div>
      <header className="room-heading">
        <p>FISH ROOM</p>
        <h1>フィッシュルーム</h1>
      </header>
    </div>
  );
}

function toPixels(rect: RoomRect, width: number, height: number): ViewRect {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
