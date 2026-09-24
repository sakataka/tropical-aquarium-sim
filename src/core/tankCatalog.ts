import { z } from "zod";
import type { TankDefinition } from "./types";

type TankJsonModule = { default: unknown };

const SAFE_MARGIN_CM = 2;

const tankSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
  depthCm: z.number().finite().positive(),
  maxTotalFish: z.number().int().positive(),
  sceneIds: z.array(z.string().min(1)).min(1),
  species: z.array(z.object({
    speciesId: z.string().min(1),
    maxCount: z.number().int().positive(),
  })).min(1),
  defaultStock: z.array(z.object({
    speciesId: z.string().min(1),
    count: z.number().int().nonnegative(),
  })),
});

const tankModules = import.meta.glob<TankJsonModule>(
  "../content/tanks/*/tank.json",
  { eager: true },
);

function loadTanks(): TankDefinition[] {
  const tanks = Object.entries(tankModules).map(([path, module]) => {
    const tank = tankSchema.parse(module.default);
    if (!path.includes(`/tanks/${tank.id}/`)) {
      throw new Error(`Tank id "${tank.id}" must match its folder: ${path}`);
    }
    return { ...tank, safeMarginCm: SAFE_MARGIN_CM };
  });
  if (tanks.length === 0) throw new Error("No aquarium tanks found");
  return tanks.sort((a, b) => a.order - b.order);
}

export const aquariumTanks = loadTanks();

export function getTankById(tankId: string | null | undefined): TankDefinition | undefined {
  return aquariumTanks.find((tank) => tank.id === tankId);
}

export function getSpeciesLimit(tank: TankDefinition, speciesId: string): number {
  return tank.species.find((slot) => slot.speciesId === speciesId)?.maxCount ?? 0;
}
