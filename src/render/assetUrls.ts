// 画像の URL の表。描画ライブラリ（PixiJS）に依存しないので、館内図や設定パネルからも使える。
import bubbleParticleUrl from "../content/environment/bubble.png";
import { getHallContentIds } from "../core/hallContent";
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

// 館内図の縮小版に映す、展示室の絵の小さな版（scripts/build-room-thumbs.py で作る）。
const roomThumbModules = import.meta.glob<string>(
  "../content/room/thumbs/*.webp",
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

export const environmentAssets = { bubbleParticleUrl };
export function getRoomImageUrl(room: FishRoomDefinition): string {
  const url = findBySuffix(roomImageModules, `/room/${room.image}`);
  if (!url) throw new Error(`Room image not found: ${room.image}`);
  return url;
}

export function getRoomThumbUrl(room: FishRoomDefinition): string {
  return findBySuffix(roomThumbModules, `/room/thumbs/${room.image}`) ?? getRoomImageUrl(room);
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

/** 展示室の部屋の絵、水景、魚の画像の URL。泡の画像はどの展示室でも使う。 */
export function getHallTextureUrls(room: FishRoomDefinition): Set<string> {
  const { speciesIds, sceneIds } = getHallContentIds(room);
  return new Set([
    environmentAssets.bubbleParticleUrl,
    getRoomImageUrl(room),
    ...sceneIds.flatMap((id) => getScenePlateUrl(id) ?? []),
    ...speciesIds.flatMap((id) => getFishImageUrl(id) ?? []),
  ]);
}
