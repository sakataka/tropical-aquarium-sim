import { Assets } from "pixi.js";
import bubbleParticleUrl from "../content/environment/bubble.png";
import type { FishRoomDefinition } from "../core/room";

// 描画とカタログには、原画 side.png から体だけを切り出した軽い body.webp を使う
// （scripts/build-fish-sprites.py で作る）。
const fishImageModules = import.meta.glob<string>("../content/fish/**/body.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

const sceneImageModules = import.meta.glob<string>(
  "../content/environment/scenes/*/plate.webp",
  { eager: true, import: "default", query: "?url" },
);

// 部屋の一枚絵。部屋の JSON の image で参照する。
const roomImageModules = import.meta.glob<string>(
  "../content/room/*.webp",
  { eager: true, import: "default", query: "?url" },
);

// 館内図の縮小版に映す、水景の小さな画像（scripts/build-scene-thumbs.py で作る）。
// 館内図では plate.webp を読まず、こちらだけを読む。
const sceneThumbModules = import.meta.glob<string>(
  "../content/environment/scenes/*/thumb.webp",
  { eager: true, import: "default", query: "?url" },
);

// 館内図の断面図。museum.json の map.image で参照する。
const museumImageModules = import.meta.glob<string>(
  "../content/museum/*.webp",
  { eager: true, import: "default", query: "?url" },
);

// PixiJS は既定で Web Worker の中で fetch と createImageBitmap を使って画像を読む。
// iPhone の Safari ではこれが失敗することがあったため、<img> と同じ通常の読み込みにする。
Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });

export const environmentAssets = { bubbleParticleUrl };
export function getRoomImageUrl(room: FishRoomDefinition): string {
  const url = findBySuffix(roomImageModules, `/room/${room.image}`);
  if (!url) throw new Error(`Room image not found: ${room.image}`);
  return url;
}

export function getMuseumMapImageUrl(image: string): string {
  const url = findBySuffix(museumImageModules, `/museum/${image}`);
  if (!url) throw new Error(`Museum map image not found: ${image}`);
  return url;
}

export function getFishImageUrl(speciesId: string): string | undefined {
  return findBySuffix(fishImageModules, `/fish/${speciesId}/body.webp`);
}

export function getSceneThumbUrl(sceneId: string): string | undefined {
  return findBySuffix(sceneThumbModules, `/scenes/${sceneId}/thumb.webp`);
}

export function getScenePlateUrl(sceneId: string): string | undefined {
  return findBySuffix(sceneImageModules, `/scenes/${sceneId}/plate.webp`);
}

function findBySuffix(modules: Record<string, string>, suffix: string): string | undefined {
  return Object.entries(modules).find(([path]) => path.endsWith(suffix))?.[1];
}
