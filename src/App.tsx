import { useEffect, useMemo, useRef, useState } from "react";
import {
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  aquariumPresets,
  createFeedingEvent,
  createFishFromStock,
  createTapEvent,
  fishCatalog,
  getActiveFeeding,
  getActiveTap,
  getMatchingPresetId,
  getPresetById,
  getStockCount,
  normalizeAquariumCustomization,
  reconcileFishStock,
  setStockCount,
  stepSimulation,
  TANK_60CM,
  type AquariumCustomization,
  type FeedingEvent,
  type FishInstance,
  type TapEvent,
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
  const activePresetId = getMatchingPresetId(aquariumPresets, customization) ?? "custom";

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
