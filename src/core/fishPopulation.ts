import { fishCatalog } from "./catalog";
import type { FishInstance, FishPersonality, FishStockEntry, TankDefinition } from "./types";

/** 初期の乱数から一度だけ作る。移動用 seed が進んでも性格は変わらない。 */
export function createFishPersonality(birthSeed: number): FishPersonality {
  let state = (birthSeed ^ 0x9e3779b9) >>> 0;
  const variation = (spread: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 1 + (state / 0x100000000 * 2 - 1) * spread;
  };
  return Object.freeze({ pace: variation(.08), responsiveness: variation(.15),
    restfulness: variation(.2), sociability: variation(.2), personalSpace: variation(.15), exploration: variation(.2) });
}

export function createFishFromStock(stock: FishStockEntry[], tank: TankDefinition): FishInstance[] {
  return stock.flatMap(({ speciesId, count }, speciesIndex) =>
    Array.from({ length: count }, (_, index) =>
      createFish(speciesId, speciesIndex * 17 + index, tank),
    ),
  );
}

export function reconcileFishStock(
  current: FishInstance[],
  stock: FishStockEntry[],
  tank: TankDefinition,
): FishInstance[] {
  const next: FishInstance[] = [];
  for (const [speciesIndex, entry] of stock.entries()) {
    const existing = current.filter((fish) => fish.speciesId === entry.speciesId);
    next.push(...existing.slice(0, entry.count));
    for (let index = existing.length; index < entry.count; index += 1) {
      next.push(createFish(entry.speciesId, speciesIndex * 17 + index + current.length, tank));
    }
  }
  return next;
}

export function getStockCount(stock: FishStockEntry[], speciesId: string): number {
  return stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
}

function createFish(speciesId: string, index: number, tank: TankDefinition): FishInstance {
  const species = fishCatalog[speciesId];
  const zone = species.preferredZone;
  const xRatio = zone.minX + (((index * 37) % 100) / 100) * (zone.maxX - zone.minX);
  const yRatio = zone.minY + (((index * 29) % 100) / 100) * (zone.maxY - zone.minY);
  const seed = Math.floor(Math.random() * 1_000_000) + index * 7919;
  const personality = createFishPersonality(seed);
  const crustacean = species.swim?.bodyPlan === "crustacean";
  const y = crustacean ? tank.heightCm - tank.safeMarginCm : tank.heightCm * yRatio;
  const initialSpeed = crustacean
    ? species.realBodyLengthCm * species.ecology.speedBodyLengthsPerSec.cruise * personality.pace
    : 1.6 * personality.pace;

  return {
    id: `${speciesId}-${seed.toString(36)}-${index}`,
    speciesId,
    position: {
      x: tank.widthCm * xRatio,
      y,
    },
    velocity: {
      x: index % 2 === 0 ? initialSpeed : -initialSpeed,
      y: crustacean ? 0 : Math.sin(index) * 0.35,
    },
    facing: index % 2 === 0 ? 1 : -1,
    depth: lerp(species.ecology.depthRange[0], species.ecology.depthRange[1], (index * 0.37) % 1),
    bodyLengthVariance: 0.94 + Math.random() * 0.12,
    personality,
    behaviorMode: "coast",
    behaviorTimeRemainingSec: 0.4 + Math.random() * 1.2,
    target: {
      x: tank.widthCm *
        (zone.minX + (((index * 17) % 100) / 100) * (zone.maxX - zone.minX)),
      y: crustacean ? y : tank.heightCm *
        (zone.minY + (((index * 13) % 100) / 100) * (zone.maxY - zone.minY)),
    },
    targetKind: "openWater",
    seed,
  };
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
