import { z } from "zod";
import { getGlassAspectForTank } from "./room";
import type { TankDefinition } from "./types";

type TankJsonModule = { default: unknown };

const SAFE_MARGIN_CM = 2;

const tankSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
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
    // 部屋の絵のガラスは実寸より横長なことがある。縦を縮めて描くと上下の動きが潰れるので、
    // 横幅とガラスの縦横比から「見えている水の高さ」を求め、縦横の縮尺をそろえる。
    const aspect = getGlassAspectForTank(tank.id);
    const waterHeightCm = aspect ? Math.min(tank.heightCm, tank.widthCm / aspect) : tank.heightCm;
    return { ...tank, heightCm: waterHeightCm, specHeightCm: tank.heightCm, safeMarginCm: SAFE_MARGIN_CM };
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
