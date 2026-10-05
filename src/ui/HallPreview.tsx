import { useState, type CSSProperties } from "react";
import { getSceneHeader, type AquariumCustomization } from "../core";
import { framePlate } from "../core/plateFraming";
import { getWindowOverscan, type FishRoomDefinition, type RoomRect } from "../core/room";
import { getRoomThumbUrl, getSceneThumbUrl } from "../render/assetUrls";

/** 水槽の並びの上下左右に残す余白（水槽の並びの大きさに対する比率）。 */
const MARGIN = { x: 0.06, y: 0.35 };

// 館内図の展示フロアに映す、展示室の画面の縮小版。
// 展示室の絵を水槽の並びのあたりで切り取り、各水槽のガラスに今の水景（の小さな画像）を、
// 展示室の画面と同じ置き方で重ねる。水景を変えればここも変わる。
// 魚はこの大きさでは数画素にしかならないので描かない。
export function HallPreview({
  hall,
  aspect,
  tanks,
}: {
  hall: FishRoomDefinition;
  /** 映す枠の縦横比（幅 / 高さ）。 */
  aspect: number;
  tanks: Record<string, AquariumCustomization>;
}) {
  const crop = cropAroundTanks(hall, aspect);
  // 展示室の絵が届くまでは、断面図の水の色をそのまま見せる。
  const [roomLoaded, setRoomLoaded] = useState(false);
  const roomStyle = {
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
  } satisfies CSSProperties;

  return (
    <span aria-hidden="true" className="hall-preview">
      <span className={roomLoaded ? "hall-preview-room loaded" : "hall-preview-room"} style={roomStyle}>
        <img alt="" decoding="async" draggable={false} loading="lazy" onLoad={() => setRoomLoaded(true)} src={getRoomThumbUrl(hall)} />
        {hall.tanks.map((placement) => (
          <GlassPlate
            aspect={hall.aspectRatio}
            glass={placement.glass}
            // 水景が変わったら、前の画像の大きさを持ち越さないよう作り直す。
            key={`${placement.tankId}:${tanks[placement.tankId]?.layout.sceneId}`}
            sceneId={tanks[placement.tankId]?.layout.sceneId}
            tankId={placement.tankId}
          />
        ))}
      </span>
    </span>
  );
}

// ひとつの水槽のガラスと、その中の水景。画像の大きさが分かってから置く。
function GlassPlate({ aspect, glass, sceneId, tankId }: {
  /** 展示室の絵の縦横比。ガラスの比率を画素の比に直すのに使う。 */
  aspect: number;
  glass: RoomRect;
  sceneId?: string;
  tankId: string;
}) {
  const [plateSize, setPlateSize] = useState<{ width: number; height: number }>();
  // 縮小版用の小さな画像。縦横比は plate.webp と同じなので、置き方も同じになる。
  const url = sceneId ? getSceneThumbUrl(sceneId) : undefined;
  // 絵の高さを1とした座標でガラスを表し、展示室の画面と同じく cover で水景を置く。
  const glassRect = { x: 0, y: 0, width: glass.width * aspect, height: glass.height };
  const plate = plateSize
    ? framePlate(plateSize, glassRect, getWindowOverscan(tankId), getSceneHeader(sceneId ?? ""))
    : undefined;

  return (
    <span
      className="hall-preview-glass"
      style={{
        left: `${glass.x * 100}%`,
        top: `${glass.y * 100}%`,
        width: `${glass.width * 100}%`,
        height: `${glass.height * 100}%`,
      }}
    >
      {url ? (
        <img
          alt=""
          decoding="async"
          draggable={false}
          loading="lazy"
          onLoad={(event) => setPlateSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          src={url}
          style={plate ? {
            left: `${(plate.x / glassRect.width) * 100}%`,
            top: `${(plate.y / glassRect.height) * 100}%`,
            width: `${(plate.width / glassRect.width) * 100}%`,
            height: `${(plate.height / glassRect.height) * 100}%`,
            opacity: 1,
          } : undefined}
        />
      ) : null}
    </span>
  );
}

/**
 * 展示室の絵から、水槽の並びを中心に、枠の縦横比で切り取る範囲（絵に対する 0〜1 の比率）。
 * 水槽の並びが枠に収まる大きさにし、絵からはみ出さないよう寄せる。
 */
export function cropAroundTanks(hall: FishRoomDefinition, aspect: number) {
  const left = Math.min(...hall.tanks.map((tank) => tank.glass.x));
  const right = Math.max(...hall.tanks.map((tank) => tank.glass.x + tank.glass.width));
  const top = Math.min(...hall.tanks.map((tank) => tank.glass.y));
  const bottom = Math.max(...hall.tanks.map((tank) => tank.glass.y + tank.glass.height));
  const roomAspect = hall.aspectRatio;
  // 切り取る幅 w と高さ h（絵に対する比率）は w * roomAspect / h = aspect を満たす。
  let width = Math.max((right - left) * (1 + MARGIN.x * 2), (bottom - top) * (1 + MARGIN.y * 2) * aspect / roomAspect);
  let height = width * roomAspect / aspect;
  if (width > 1) { width = 1; height = roomAspect / aspect; }
  if (height > 1) { height = 1; width = aspect / roomAspect; }
  const clamp = (value: number, size: number) => Math.min(Math.max(value, 0), Math.max(0, 1 - size));
  return {
    x: clamp((left + right) / 2 - width / 2, width),
    y: clamp((top + bottom) / 2 - height / 2, height),
    width,
    height,
  };
}
