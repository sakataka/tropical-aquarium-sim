import { useEffect, useMemo, useRef, useState } from "react";
import {
  fishCatalog,
  stepSimulation,
  TANK_60CM,
  type FeedingEvent,
  type FishInstance,
} from "./core";
import { AquariumCanvas } from "./render/AquariumCanvas";
import { AquariumControls } from "./ui/AquariumControls";
import { SizeDevView } from "./ui/SizeDevView";
import "./styles.css";

const INITIAL_STOCK: Array<{ speciesId: string; count: number }> = [
  { speciesId: "neon-tetra", count: 4 },
  { speciesId: "harlequin-rasbora", count: 4 },
  { speciesId: "corydoras", count: 3 },
  { speciesId: "guppy", count: 2 },
  { speciesId: "dwarf-gourami", count: 1 },
  { speciesId: "angelfish", count: 1 },
];

export default function App() {
  const speciesList = useMemo(
    () => Object.values(fishCatalog).sort((a, b) => a.realBodyLengthCm - b.realBodyLengthCm),
    [],
  );
  const [fish, setFish] = useState<FishInstance[]>(() =>
    INITIAL_STOCK.flatMap(({ speciesId, count }, speciesIndex) =>
      Array.from({ length: count }, (_, index) =>
        createFish(speciesId, speciesIndex * 5 + index),
      ),
    ),
  );
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(
    speciesList[0]?.id ?? "neon-tetra",
  );
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
  const [viewportWidthPx, setViewportWidthPx] = useState(960);
  const aquariumShellRef = useRef<HTMLDivElement | null>(null);

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
    let animationFrame = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const deltaSec = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;

      if (!paused && viewMode === "tank") {
        const feeding = getActiveFeeding(latestFeeding);
        setFish((current) =>
          stepSimulation({
            tank: TANK_60CM,
            species: fishCatalog,
            fish: current,
            deltaSec,
            feeding,
          }).fish,
        );
      }

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [latestFeeding, paused, viewMode]);

  useEffect(() => {
    if (!latestFeeding) {
      return;
    }

    const timeout = window.setTimeout(() => setLatestFeeding(undefined), 6200);
    return () => window.clearTimeout(timeout);
  }, [latestFeeding]);

  return (
    <main className="app-shell">
      <section className="aquarium-stage" ref={aquariumShellRef}>
        {viewMode === "tank" ? (
          <AquariumCanvas
            fish={fish}
            species={fishCatalog}
            tank={TANK_60CM}
            paused={paused}
            latestFeeding={getActiveFeeding(latestFeeding)}
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
        paused={paused}
        viewMode={viewMode}
        selectedSpeciesId={selectedSpeciesId}
        onSelectedSpeciesChange={setSelectedSpeciesId}
        onAddFish={() =>
          setFish((current) => [
            ...current,
            createFish(selectedSpeciesId, current.length + 11),
          ])
        }
        onRemoveFish={(fishId) =>
          setFish((current) => current.filter((item) => item.id !== fishId))
        }
        onFeed={() =>
          setLatestFeeding(createFeedingEvent())
        }
        onTogglePaused={() => setPaused((value) => !value)}
        onViewModeChange={setViewMode}
      />
    </main>
  );
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
