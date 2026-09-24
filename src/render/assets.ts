import bubbleParticleUrl from "../content/environment/bubble.png";
import roomUrl from "../content/room/room.webp";

const fishImageModules = import.meta.glob<string>("../content/fish/**/side.png", {
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
  return findBySuffix(fishImageModules, `/fish/${speciesId}/side.png`);
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
