import bubbleParticleUrl from "../content/environment/bubble.png";

const fishImageModules = import.meta.glob<string>("../content/fish/**/side.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const fishAnimationFrameModules = import.meta.glob<string>(
  "../content/fish/**/swim/*.png",
  { eager: true, import: "default", query: "?url" },
);

const environmentImageModules = import.meta.glob<string>(
  "../content/environment/{backgrounds,substrates,decor}/**/*.png",
  { eager: true, import: "default", query: "?url" },
);

export const environmentAssets = { bubbleParticleUrl };

export function getFishImageUrl(speciesId: string): string | undefined {
  return findBySuffix(fishImageModules, `/fish/${speciesId}/side.png`);
}

export function getFishAnimationFrameUrls(speciesId: string): string[] {
  const segment = `/fish/${speciesId}/swim/`;
  return Object.entries(fishAnimationFrameModules)
    .filter(([path]) => path.includes(segment))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

export function getEnvironmentAssetUrl(assetId: string): string | undefined {
  return findBySuffix(environmentImageModules, `/${assetId}.png`);
}

function findBySuffix(modules: Record<string, string>, suffix: string): string | undefined {
  return Object.entries(modules).find(([path]) => path.endsWith(suffix))?.[1];
}
