import bubbleParticleUrl from "../content/environment/bubble.png";
import roomUrl from "../content/room/room.webp";

// 描画とカタログには、原画 side.png から体だけを切り出した軽い body.webp を使う
// （scripts/build-fish-sprites.py で作る）。
const fishImageModules = import.meta.glob<string>("../content/fish/**/body.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

const sceneImageModules = import.meta.glob<string>(
  "../content/environment/scenes/*/{plate,foreground}.webp",
  { eager: true, import: "default", query: "?url" },
);

export const environmentAssets = { bubbleParticleUrl };
export const roomImageUrl = roomUrl;

export function getFishImageUrl(speciesId: string): string | undefined {
  return findBySuffix(fishImageModules, `/fish/${speciesId}/body.webp`);
}

export function getScenePlateUrl(sceneId: string): string | undefined {
  return findBySuffix(sceneImageModules, `/scenes/${sceneId}/plate.webp`);
}

export function getSceneForegroundUrl(sceneId: string): string | undefined {
  return findBySuffix(sceneImageModules, `/scenes/${sceneId}/foreground.webp`);
}

function findBySuffix(modules: Record<string, string>, suffix: string): string | undefined {
  return Object.entries(modules).find(([path]) => path.endsWith(suffix))?.[1];
}
