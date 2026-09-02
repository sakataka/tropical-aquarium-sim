import { fishCatalog } from "./catalog";
import { TANK_60CM } from "./tank";
import type { FishInstance, FishStockEntry } from "./types";

export function createFishFromStock(stock: FishStockEntry[]): FishInstance[] {
  return stock.flatMap(({ speciesId, count }, speciesIndex) =>
    Array.from({ length: count }, (_, index) =>
      createFish(speciesId, speciesIndex * 17 + index),
    ),
  );
}

export function reconcileFishStock(
  current: FishInstance[],
  stock: FishStockEntry[],
): FishInstance[] {
  const next: FishInstance[] = [];
  for (const [speciesIndex, entry] of stock.entries()) {
    const existing = current.filter((fish) => fish.speciesId === entry.speciesId);
    next.push(...existing.slice(0, entry.count));
    for (let index = existing.length; index < entry.count; index += 1) {
      next.push(createFish(entry.speciesId, speciesIndex * 17 + index + current.length));
    }
  }
  return next;
}

export function getStockCount(stock: FishStockEntry[], speciesId: string): number {
  return stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
}

function createFish(speciesId: string, index: number): FishInstance {
  const species = fishCatalog[speciesId];
  const zone = species.preferredZone;
  const xRatio = zone.minX + (((index * 37) % 100) / 100) * (zone.maxX - zone.minX);
  const yRatio = zone.minY + (((index * 29) % 100) / 100) * (zone.maxY - zone.minY);
  const seed = Math.floor(Math.random() * 1_000_000) + index * 7919;

  return {
    id: `${speciesId}-${seed.toString(36)}-${index}`,
    speciesId,
    position: {
      x: TANK_60CM.widthCm * xRatio,
      y: TANK_60CM.heightCm * yRatio,
    },
    velocity: {
      x: index % 2 === 0 ? 1.6 : -1.6,
      y: Math.sin(index) * 0.35,
    },
    facing: index % 2 === 0 ? 1 : -1,
    depth: 0.12 + ((index * 0.19) % 0.76),
    bodyLengthVariance: 0.94 + Math.random() * 0.12,
    behaviorMode: "coast",
    behaviorTimeRemainingSec: 0.4 + Math.random() * 1.2,
    target: {
      x: TANK_60CM.widthCm *
        (zone.minX + (((index * 17) % 100) / 100) * (zone.maxX - zone.minX)),
      y: TANK_60CM.heightCm *
        (zone.minY + (((index * 13) % 100) / 100) * (zone.maxY - zone.minY)),
    },
    targetKind: "openWater",
    seed,
  };
}
