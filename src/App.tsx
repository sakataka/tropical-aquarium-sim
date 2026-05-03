import { useEffect, useMemo, useRef, useState } from "react";
import {
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  aquariumPresets,
  fishCatalog,
  getPresetById,
  normalizeAquariumCustomization,
  setStockCount,
  stepSimulation,
  TANK_60CM,
  type AquariumCustomization,
  type AquariumPreset,
  type FeedingEvent,
  type FishInstance,
  type FishStockEntry,
  type TapEvent,
  type Vec2,
} from "./core";
import { AquariumCanvas } from "./render/AquariumCanvas";
import { AquariumControls } from "./ui/AquariumControls";
import { SizeDevView } from "./ui/SizeDevView";
import "./styles.css";

export default function App() {
  const speciesList = useMemo(
    () => Object.values(fishCatalog).sort((a, b) => a.realBodyLengthCm - b.realBodyLengthCm),
    [],
  );
  const [customization, setCustomization] = useState<AquariumCustomization>(() =>
    loadInitialCustomization(),
  );
  const [fish, setFish] = useState<FishInstance[]>(() =>
    createFishFromStock(customization.stock),
  );
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(
    speciesList[0]?.id ?? "neon-tetra",
  );
  const [saveStatus, setSaveStatus] = useState("保存済み");
  const [paused, setPaused] = useState(false);
  const [viewMode, setViewMode] = useState<"tank" | "dev">(() =>
    new URLSearchParams(window.location.search).get("view") === "dev"
      ? "dev"
      : "tank",
  );
  const [latestFeeding, setLatestFeeding] = useState<FeedingEvent | undefined>(() =>
    new URLSearchParams(window.location.search).get("feed") === "1"
      ? createFeedingEvent()
      : undefined,
  );
  const [latestTap, setLatestTap] = useState<TapEvent | undefined>();
  const [viewportWidthPx, setViewportWidthPx] = useState(960);
  const aquariumShellRef = useRef<HTMLDivElement | null>(null);
  const activePresetId = getMatchingPresetId(customization) ?? "custom";

  useEffect(() => {
    const element = aquariumShellRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportWidthPx(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CUSTOMIZATION_STORAGE_KEY,
        JSON.stringify(customization),
      );
      setSaveStatus("保存済み");
    } catch {
      setSaveStatus("保存できません");
    }
  }, [customization]);

  useEffect(() => {
    setFish((current) => reconcileFishStock(current, customization.stock));
  }, [customization.stock]);

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const deltaSec = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;

      if (!paused && viewMode === "tank") {
        const feeding = getActiveFeeding(latestFeeding);
        const tapEvent = getActiveTap(latestTap);
        setFish((current) =>
          stepSimulation({
            tank: TANK_60CM,
            species: fishCatalog,
            fish: current,
            deltaSec,
            feeding,
            tapEvent,
          }).fish,
        );
      }

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [latestFeeding, latestTap, paused, viewMode]);

  useEffect(() => {
    if (!latestFeeding) {
      return;
    }

    const timeout = window.setTimeout(() => setLatestFeeding(undefined), 6200);
    return () => window.clearTimeout(timeout);
  }, [latestFeeding]);

  useEffect(() => {
    if (!latestTap) {
      return;
    }

    const timeout = window.setTimeout(() => setLatestTap(undefined), 1800);
    return () => window.clearTimeout(timeout);
  }, [latestTap]);

  return (
    <main className="app-shell">
      <section className="aquarium-stage" ref={aquariumShellRef}>
        {viewMode === "tank" ? (
          <AquariumCanvas
            fish={fish}
            species={fishCatalog}
            tank={TANK_60CM}
            environment={customization.environment}
            paused={paused}
            latestFeeding={getActiveFeeding(latestFeeding)}
            latestTap={getActiveTap(latestTap)}
            onDoubleTapTank={(position) => setLatestTap(createTapEvent(position))}
          />
        ) : (
          <SizeDevView
            speciesList={speciesList}
            tank={TANK_60CM}
            viewportWidthPx={viewportWidthPx}
          />
        )}
      </section>
      <AquariumControls
        speciesList={speciesList}
        fish={fish}
        tank={TANK_60CM}
        customization={customization}
        presets={aquariumPresets}
        activePresetId={activePresetId}
        saveStatus={saveStatus}
        paused={paused}
        viewMode={viewMode}
        selectedSpeciesId={selectedSpeciesId}
        onSelectedSpeciesChange={setSelectedSpeciesId}
        onAddFish={() => updateSpeciesCount(selectedSpeciesId, getStockCount(customization.stock, selectedSpeciesId) + 1)}
        onRemoveFish={removeFish}
        onSpeciesCountChange={updateSpeciesCount}
        onEnvironmentChange={(environment) =>
          setCustomization((current) =>
            normalizeAquariumCustomization(
              {
                ...current,
                environment: {
                  ...current.environment,
                  ...environment,
                },
              },
              fishCatalog,
            ),
          )
        }
        onPresetChange={applyPreset}
        onResetCustomization={() => applyPreset(DEFAULT_CUSTOMIZATION.id)}
        onFeed={() =>
          setLatestFeeding(createFeedingEvent())
        }
        onTogglePaused={() => setPaused((value) => !value)}
        onViewModeChange={setViewMode}
      />
    </main>
  );

  function updateSpeciesCount(speciesId: string, count: number) {
    setCustomization((current) =>
      normalizeAquariumCustomization(
        {
          ...current,
          stock: setStockCount(current.stock, speciesId, count, fishCatalog),
        },
        fishCatalog,
      ),
    );
  }

  function applyPreset(presetId: string) {
    const preset = getPresetById(presetId) ?? DEFAULT_CUSTOMIZATION;
    setCustomization(normalizeAquariumCustomization(preset, fishCatalog));
  }

  function removeFish(fishId: string) {
    const target = fish.find((item) => item.id === fishId);
    if (!target) {
      return;
    }

    updateSpeciesCount(
      target.speciesId,
      Math.max(0, getStockCount(customization.stock, target.speciesId) - 1),
    );
  }
}

function loadInitialCustomization(): AquariumCustomization {
  const params = new URLSearchParams(window.location.search);
  const preset = getPresetById(params.get("preset"));
  if (preset) {
    return normalizeAquariumCustomization(preset, fishCatalog);
  }

  const stored = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
  if (stored) {
    try {
      return normalizeAquariumCustomization(JSON.parse(stored), fishCatalog);
    } catch {
      return normalizeAquariumCustomization(DEFAULT_CUSTOMIZATION, fishCatalog);
    }
  }

  return normalizeAquariumCustomization(DEFAULT_CUSTOMIZATION, fishCatalog);
}

function createFishFromStock(stock: FishStockEntry[]): FishInstance[] {
  return stock.flatMap(({ speciesId, count }, speciesIndex) =>
    Array.from({ length: count }, (_, index) =>
      createFish(speciesId, speciesIndex * 7 + index),
    ),
  );
}

function reconcileFishStock(
  current: FishInstance[],
  stock: FishStockEntry[],
): FishInstance[] {
  const next: FishInstance[] = [];

  for (const [speciesIndex, entry] of stock.entries()) {
    const existing = current.filter((fishInstance) => fishInstance.speciesId === entry.speciesId);
    next.push(...existing.slice(0, entry.count));

    for (let index = existing.length; index < entry.count; index += 1) {
      next.push(createFish(entry.speciesId, speciesIndex * 7 + index + current.length));
    }
  }

  return next;
}

function getStockCount(stock: FishStockEntry[], speciesId: string): number {
  return stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
}

function getMatchingPresetId(customization: AquariumCustomization): string | undefined {
  return aquariumPresets.find((preset) => customizationsMatch(preset, customization))?.id;
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
  const zone = species?.preferredZone ?? {
    minX: 0.14,
    maxX: 0.86,
    minY: 0.18,
    maxY: 0.78,
  };
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

function createFeedingEvent(): FeedingEvent {
  return {
    position: {
      x: 18 + Math.random() * 24,
      y: 3,
    },
    strength: 1,
    createdAtMs: performance.now(),
  };
}

function createTapEvent(position: Vec2): TapEvent {
  return {
    position,
    strength: 1,
    createdAtMs: performance.now(),
  };
}

function getActiveFeeding(feeding?: FeedingEvent): FeedingEvent | undefined {
  if (!feeding) {
    return undefined;
  }

  const ageSec = (performance.now() - (feeding.createdAtMs ?? performance.now())) / 1000;
  if (ageSec > 6.2) {
    return undefined;
  }

  return {
    ...feeding,
    position: {
      x: feeding.position.x,
      y: Math.min(TANK_60CM.heightCm - 4, feeding.position.y + ageSec * 4.8),
    },
    strength: Math.max(0.15, 1 - ageSec / 7),
  };
}

function getActiveTap(tapEvent?: TapEvent): TapEvent | undefined {
  if (!tapEvent) {
    return undefined;
  }

  const ageSec = (performance.now() - (tapEvent.createdAtMs ?? performance.now())) / 1000;
  if (ageSec > 1.2) {
    return undefined;
  }

  return {
    ...tapEvent,
    strength: Math.max(0.12, 1 - ageSec / 1.35),
  };
}
