import { z } from "zod";
import type { AquariumScene } from "./types";

type SceneJsonModule = { default: unknown };

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

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
