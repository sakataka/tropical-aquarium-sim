import { z } from "zod";
import type { AquariumScene } from "./types";

type SceneJsonModule = { default: unknown };

const unit = z.number().finite().min(0).max(1);
const surfacePointSchema = z.object({ x: unit, y: unit, depth: unit });
export const terrainSchema = z.object({
  surfaces: z.array(z.object({
    id: z.string().min(1),
    material: z.enum(["sand", "stone", "wood", "leaf"]),
    points: z.array(surfacePointSchema).min(2).refine((points) =>
      points.slice(1).every((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y) > 0.0001),
    { message: "Surface segments must have visible length" }),
  })).min(1),
  occluders: z.array(z.object({
    id: z.string().min(1),
    depth: unit,
    polygon: z.array(z.object({ x: unit, y: unit })).min(3),
  })),
  obstacles: z.array(z.object({
    id: z.string().min(1), center: surfacePointSchema,
    radius: z.object({ x: unit.gt(0), y: unit.gt(0) }), depthRadius: unit.gt(0),
  })).optional(),
  shelters: z.array(surfacePointSchema.extend({
    id: z.string().min(1),
    kind: z.enum(["anemone", "burrow", "crevice", "cave"]).optional(),
  })).optional(),
}).refine((terrain) => new Set(terrain.surfaces.map((s) => s.id)).size === terrain.surfaces.length,
{ message: "Surface ids must be unique" })
  .refine((terrain) => [terrain.occluders, terrain.obstacles ?? [], terrain.shelters ?? []]
    .every((items) => new Set(items.map((s) => s.id)).size === items.length),
  { message: "Terrain ids must be unique within each collection" });

// 見出し（scene.json）は館内図や設定パネルで使うので、起動時にすべて読む。
// 地形（terrain.json）は重いので、展示室に入るときにその展示室の分だけ読む。
const sceneHeaderSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  description: z.string().min(1),
  defaultLighting: z.enum(["natural", "cool", "evening", "night"]),
  waterColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  framing: z.object({ plateBottom: unit.gt(0) }).optional(),
}) satisfies z.ZodType<SceneHeader>;

const sceneTerrainSchema = z.object({
  structurePoints: z.array(z.object({ x: unit, y: unit })),
  bubbleSources: z.array(z.object({ x: unit, y: unit })),
  terrain: terrainSchema,
});

export type SceneHeader = Omit<AquariumScene, "structurePoints" | "bubbleSources" | "terrain">;

const headerModules = import.meta.glob<SceneJsonModule>(
  "../content/environment/scenes/*/scene.json",
  { eager: true },
);
const terrainLoaders = import.meta.glob<SceneJsonModule>("../content/environment/scenes/*/terrain.json");

function loadHeaders(): SceneHeader[] {
  const headers = Object.entries(headerModules).map(([path, module]) => {
    const header = sceneHeaderSchema.parse(module.default);
    if (!path.includes(`/scenes/${header.id}/`)) {
      throw new Error(`Scene id "${header.id}" must match its folder: ${path}`);
    }
    return header;
  });
  if (headers.length === 0) throw new Error("No aquarium scenes found");
  return headers.sort((a, b) => a.order - b.order);
}

export const sceneHeaders = loadHeaders();
const loadedScenes = new Map<string, AquariumScene>();
const pendingScenes = new Map<string, Promise<void>>();

export function getSceneHeader(sceneId: string | null | undefined): SceneHeader | undefined {
  return sceneHeaders.find((scene) => scene.id === sceneId);
}

/** 地形まで読み込んだ水景。まだ読んでいなければ undefined（loadScenes で読む）。 */
export function getSceneById(sceneId: string | null | undefined): AquariumScene | undefined {
  return sceneId ? loadedScenes.get(sceneId) : undefined;
}

export function loadScenes(sceneIds: Iterable<string>): Promise<void> {
  return Promise.all([...sceneIds].map(loadScene)).then(() => undefined);
}

/** すべての水景の地形を読む。テストと、全水景を検査するときに使う。 */
export function loadAllScenes(): Promise<void> {
  return loadScenes(sceneHeaders.map((scene) => scene.id));
}

/** 地形まで読み込んだ水景の一覧。 */
export function getLoadedScenes(): AquariumScene[] {
  return sceneHeaders.flatMap((header) => loadedScenes.get(header.id) ?? []);
}

function loadScene(sceneId: string): Promise<void> {
  if (loadedScenes.has(sceneId)) return Promise.resolve();
  const pending = pendingScenes.get(sceneId);
  if (pending) return pending;
  const header = getSceneHeader(sceneId);
  const loader = Object.entries(terrainLoaders).find(([path]) => path.includes(`/scenes/${sceneId}/`))?.[1];
  if (!header || !loader) return Promise.reject(new Error(`Scene not found: ${sceneId}`));
  const promise = loader().then((module) => {
    loadedScenes.set(sceneId, { ...header, ...sceneTerrainSchema.parse(module.default) });
  }).finally(() => pendingScenes.delete(sceneId));
  pendingScenes.set(sceneId, promise);
  return promise;
}
