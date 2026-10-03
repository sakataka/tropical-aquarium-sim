import { z } from "zod";
import type { AquariumScene } from "./types";

type SceneJsonModule = { default: unknown };

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
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
  shelters: z.array(surfacePointSchema.extend({ id: z.string().min(1) })).optional(),
}).refine((terrain) => new Set(terrain.surfaces.map((s) => s.id)).size === terrain.surfaces.length,
{ message: "Surface ids must be unique" })
  .refine((terrain) => [terrain.occluders, terrain.obstacles ?? [], terrain.shelters ?? []]
    .every((items) => new Set(items.map((s) => s.id)).size === items.length),
  { message: "Terrain ids must be unique within each collection" });

const sceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  description: z.string().min(1),
  defaultLighting: z.enum(["natural", "cool", "evening", "night"]),
  waterColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  structurePoints: z.array(pointSchema),
  bubbleSources: z.array(z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })),
  terrain: terrainSchema.optional(),
}) satisfies z.ZodType<AquariumScene>;

const sceneModules = import.meta.glob<SceneJsonModule>(
  "../content/environment/scenes/*/scene.json",
  { eager: true },
);

function loadScenes(): AquariumScene[] {
  const scenes = Object.entries(sceneModules).map(([path, module]) => {
    const scene = sceneSchema.parse(module.default);
    if (!path.includes(`/scenes/${scene.id}/`)) {
      throw new Error(`Scene id "${scene.id}" must match its folder: ${path}`);
    }
    return scene;
  });
  if (scenes.length === 0) throw new Error("No aquarium scenes found");
  return scenes.sort((a, b) => a.order - b.order);
}

export const aquariumScenes = loadScenes();

export function getSceneById(sceneId: string | null | undefined): AquariumScene | undefined {
  return aquariumScenes.find((scene) => scene.id === sceneId);
}
