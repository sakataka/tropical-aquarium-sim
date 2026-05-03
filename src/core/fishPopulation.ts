import { fishCatalog } from "./catalog";
import { TANK_60CM } from "./tank";
import type {
  AquariumCustomization,
  AquariumPreset,
  FishInstance,
  FishStockEntry,
} from "./types";

const FALLBACK_ZONE = {
  minX: 0.14,
  maxX: 0.86,
  minY: 0.18,
  maxY: 0.78,
};

export function createFishFromStock(stock: FishStockEntry[]): FishInstance[] {
  return stock.flatMap(({ speciesId, count }, speciesIndex) =>
    Array.from({ length: count }, (_, index) =>
      createFish(speciesId, speciesIndex * 7 + index),
    ),
  );
}

export function reconcileFishStock(
  current: FishInstance[],
  stock: FishStockEntry[],
): FishInstance[] {
  const next: FishInstance[] = [];

  for (const [speciesIndex, entry] of stock.entries()) {
    const existing = current.filter(
      (fishInstance) => fishInstance.speciesId === entry.speciesId,
    );
    next.push(...existing.slice(0, entry.count));

    for (let index = existing.length; index < entry.count; index += 1) {
      next.push(createFish(entry.speciesId, speciesIndex * 7 + index + current.length));
    }
  }

  return next;
}

export function getStockCount(stock: FishStockEntry[], speciesId: string): number {
  return stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
}

export function getMatchingPresetId(
  presets: AquariumPreset[],
  customization: AquariumCustomization,
): string | undefined {
  return presets.find((preset) => customizationsMatch(preset, customization))?.id;
}

function customizationsMatch(
  preset: AquariumPreset,
  customization: AquariumCustomization,
): boolean {
  return (
    stockKey(preset.stock) === stockKey(customization.stock) &&
    JSON.stringify(preset.environment) === JSON.stringify(customization.environment)
  );
}

function stockKey(stock: FishStockEntry[]): string {
  return stock
    .map((entry) => `${entry.speciesId}:${entry.count}`)
    .sort()
    .join("|");
}

function createFish(speciesId: string, index: number): FishInstance {
  const species = fishCatalog[speciesId];
  const zone = species?.preferredZone ?? FALLBACK_ZONE;
  const xRatio = zone.minX + (((index * 37) % 100) / 100) * (zone.maxX - zone.minX);
  const yRatio = zone.minY + (((index * 29) % 100) / 100) * (zone.maxY - zone.minY);
  const x = TANK_60CM.widthCm * xRatio;
  const y = TANK_60CM.heightCm * yRatio;
  const depth = 0.12 + ((index * 0.19) % 0.76);
  const speedAngle = index % 2 === 0 ? 0 : Math.PI;

  return {
    id: `${speciesId}-${Date.now().toString(36)}-${index}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    speciesId,
    position: { x, y },
    velocity: {
      x: Math.cos(speedAngle) * 1.6,
      y: Math.sin(index) * 0.35,
    },
    facing: index % 2 === 0 ? 1 : -1,
    depth,
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
    hunger: 0.35 + Math.random() * 0.45,
    seed: 1000 + index * 7919,
  };
}
