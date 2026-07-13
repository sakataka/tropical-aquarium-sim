import { fishCatalog } from "./catalog";
import { TANK_60CM } from "./tank";
import type {
  AquariumCustomization,
  AquariumPreset,
  FishInstance,
  FishResident,
  FishStockEntry,
} from "./types";

export function createFishFromStock(
  stock: FishStockEntry[],
  nowMs = Date.now(),
): FishInstance[] {
  return stock.flatMap(({ speciesId, count }, speciesIndex) =>
    Array.from({ length: count }, (_, index) =>
      createFish(speciesId, speciesIndex * 7 + index, nowMs),
    ),
  );
}

export function hydrateFishResidents(
  residents: FishResident[],
  stock: FishStockEntry[],
  elapsedMs: number,
  nowMs = Date.now(),
): FishInstance[] {
  const elapsedHours = Math.min(48, Math.max(0, elapsedMs) / 3_600_000);
  const hydrated: FishInstance[] = [];

  for (const [speciesIndex, entry] of stock.entries()) {
    const matching = residents
      .filter((resident) => resident.speciesId === entry.speciesId)
      .slice(0, entry.count);
    matching.forEach((resident, index) => {
      hydrated.push(createFish(
        resident.speciesId,
        speciesIndex * 7 + index,
        nowMs,
        {
          ...resident,
          hunger: Math.min(0.9, resident.hunger + elapsedHours * 0.015),
        },
      ));
    });
  }

  return reconcileFishStock(hydrated, stock, nowMs);
}

export function toFishResidents(fish: FishInstance[]): FishResident[] {
  return fish.map((item) => ({
    id: item.id,
    speciesId: item.speciesId,
    arrivedAtMs: item.arrivedAtMs,
    nickname: item.nickname,
    favorite: item.favorite,
    lastFedAtMs: item.lastFedAtMs,
    bodyLengthVariance: item.bodyLengthVariance,
    hunger: item.hunger,
    seed: item.seed,
  }));
}

export function reconcileFishStock(
  current: FishInstance[],
  stock: FishStockEntry[],
  nowMs = Date.now(),
): FishInstance[] {
  const next: FishInstance[] = [];

  for (const [speciesIndex, entry] of stock.entries()) {
    const existing = current.filter(
      (fishInstance) => fishInstance.speciesId === entry.speciesId,
    );
    next.push(...existing.slice(0, entry.count));

    for (let index = existing.length; index < entry.count; index += 1) {
      next.push(createFish(
        entry.speciesId,
        speciesIndex * 7 + index + current.length,
        nowMs,
      ));
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

function createFish(
  speciesId: string,
  index: number,
  nowMs: number,
  resident?: FishResident,
): FishInstance {
  const species = fishCatalog[speciesId];
  const zone = species.preferredZone;
  const xRatio = zone.minX + (((index * 37) % 100) / 100) * (zone.maxX - zone.minX);
  const yRatio = zone.minY + (((index * 29) % 100) / 100) * (zone.maxY - zone.minY);
  const x = TANK_60CM.widthCm * xRatio;
  const y = TANK_60CM.heightCm * yRatio;
  const depth = 0.12 + ((index * 0.19) % 0.76);
  const speedAngle = index % 2 === 0 ? 0 : Math.PI;

  return {
    id: resident?.id ?? `${speciesId}-${nowMs.toString(36)}-${index}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    speciesId,
    arrivedAtMs: resident?.arrivedAtMs ?? nowMs,
    nickname: resident?.nickname,
    favorite: resident?.favorite ?? false,
    lastFedAtMs: resident?.lastFedAtMs,
    position: { x, y },
    velocity: {
      x: Math.cos(speedAngle) * 1.6,
      y: Math.sin(index) * 0.35,
    },
    facing: index % 2 === 0 ? 1 : -1,
    depth,
    bodyLengthVariance: resident?.bodyLengthVariance ?? 0.94 + Math.random() * 0.12,
    behaviorMode: "coast",
    behaviorTimeRemainingSec: 0.4 + Math.random() * 1.2,
    target: {
      x: TANK_60CM.widthCm *
        (zone.minX + (((index * 17) % 100) / 100) * (zone.maxX - zone.minX)),
      y: TANK_60CM.heightCm *
        (zone.minY + (((index * 13) % 100) / 100) * (zone.maxY - zone.minY)),
    },
    targetKind: "openWater",
    hunger: resident?.hunger ?? 0.35 + Math.random() * 0.45,
    seed: resident?.seed ?? 1000 + index * 7919,
  };
}
