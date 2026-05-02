import aquariumBackgroundUrl from "../content/environment/aquarium-background.png";

const fishImageModules = import.meta.glob<string>(
  "../content/fish/**/side.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

const fishAnimationFrameModules = import.meta.glob<string>(
  "../content/fish/**/swim/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

export const environmentAssets = {
  aquariumBackgroundUrl,
};

export function getFishImageUrl(speciesId: string): string | undefined {
  const suffix = `/fish/${speciesId}/side.png`;
  const match = Object.entries(fishImageModules).find(([path]) =>
    path.endsWith(suffix),
  );

  return match?.[1];
}

export function getFishAnimationFrameUrls(speciesId: string): string[] {
  const segment = `/fish/${speciesId}/swim/`;

  return Object.entries(fishAnimationFrameModules)
    .filter(([path]) => path.includes(segment))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}
