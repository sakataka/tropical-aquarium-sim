import { useEffect, useMemo, useRef, useState } from "react";
import {
  AQUARIUM_STATE_STORAGE_KEY,
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
  hydrateFishResidents,
  normalizeAquariumCustomization,
  normalizeAquariumPersistedState,
  reconcileFishStock,
  setStockCount,
  stepSimulation,
  TANK_60CM,
  toFishResidents,
  type AquariumCustomization,
  type AquariumEnvironmentCustomization,
  type AquariumPersistedState,
  type AquariumPreferences,
  type FeedingEvent,
  type FishInstance,
  type TapEvent,
} from "./core";
import { AquariumCanvas } from "./render/AquariumCanvas";
import { AquariumControls } from "./ui/AquariumControls";
import { FishGuideView } from "./ui/FishGuideView";
import "./styles.css";

const DEFAULT_TANK_NAME = "木漏れ日の水槽";
const IDLE_AMBIENT_DELAY_MS = 45_000;

type InitialAquariumState = {
  customization: AquariumCustomization;
  fish: FishInstance[];
  preferences: AquariumPreferences;
  selectedFishId?: string;
};

export default function App() {
  const speciesList = useMemo(
    () => Object.values(fishCatalog).sort((a, b) => a.realBodyLengthCm - b.realBodyLengthCm),
    [],
  );
  const [initialState] = useState(loadInitialAquariumState);
  const [customization, setCustomization] = useState(initialState.customization);
  const [fish, setFish] = useState(initialState.fish);
  const [preferences, setPreferences] = useState(initialState.preferences);
  const [selectedFishId, setSelectedFishId] = useState(
    initialState.selectedFishId ?? initialState.fish[0]?.id,
  );
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(
    speciesList[0]?.id ?? "neon-tetra",
  );
  const [saveStatus, setSaveStatus] = useState("保存済み");
  const [paused, setPaused] = useState(false);
  const [aquariumReady, setAquariumReady] = useState(false);
  const [viewMode, setViewMode] = useState<"tank" | "guide">(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    return view === "guide" || view === "dev" ? "guide" : "tank";
  });
  const [latestFeeding, setLatestFeeding] = useState<FeedingEvent | undefined>(() =>
    new URLSearchParams(window.location.search).get("feed") === "1"
      ? createFeedingEvent()
      : undefined,
  );
  const [latestTap, setLatestTap] = useState<TapEvent | undefined>();
  const [viewportWidthPx, setViewportWidthPx] = useState(960);
  const [nowMs, setNowMs] = useState(Date.now);
  const [ambientMode, setAmbientMode] = useState<"off" | "manual" | "idle">("off");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [arrivalNotice, setArrivalNotice] = useState<string>();
  const [metadataRevision, setMetadataRevision] = useState(0);
  const aquariumShellRef = useRef<HTMLDivElement | null>(null);
  const pendingArrivalSpeciesRef = useRef<string | undefined>(undefined);
  const fishRef = useRef(fish);
  const customizationRef = useRef(customization);
  const preferencesRef = useRef(preferences);
  const selectedFishIdRef = useRef(selectedFishId);

  fishRef.current = fish;
  customizationRef.current = customization;
  preferencesRef.current = preferences;
  selectedFishIdRef.current = selectedFishId;

  const effectiveLighting = preferences.lightingMode === "auto"
    ? getAutomaticLighting(nowMs)
    : customization.environment.lighting;
  const effectiveEnvironment = useMemo<AquariumEnvironmentCustomization>(
    () => ({ ...customization.environment, lighting: effectiveLighting }),
    [customization.environment, effectiveLighting],
  );
  const activePresetId = getMatchingPresetId(aquariumPresets, customization) ?? "custom";
  const selectedFish = fish.find((item) => item.id === selectedFishId) ?? fish[0];
  const dayNumber = Math.max(
    1,
    Math.floor((nowMs - preferences.createdAtMs) / 86_400_000) + 1,
  );
  const observation = getObservationText(selectedFish, effectiveLighting, dayNumber);
  const isAmbient = ambientMode !== "off";

  useAmbientSound(
    preferences.soundEnabled && audioUnlocked,
    preferences.soundVolume,
  );

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
    const updateTime = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(updateTime);
  }, []);

  useEffect(() => {
    const unlock = () => setAudioUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (viewMode !== "tank" || paused || ambientMode === "manual") {
      return;
    }

    let timer = window.setTimeout(
      () => setAmbientMode("idle"),
      IDLE_AMBIENT_DELAY_MS,
    );
    const wake = () => {
      setAmbientMode((current) => current === "idle" ? "off" : current);
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => setAmbientMode("idle"),
        IDLE_AMBIENT_DELAY_MS,
      );
    };

    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [ambientMode, paused, viewMode]);

  useEffect(() => {
    const persist = () => {
      const state: AquariumPersistedState = {
        version: 2,
        customization: customizationRef.current,
        residents: toFishResidents(fishRef.current),
        preferences: {
          ...preferencesRef.current,
          tankName: preferencesRef.current.tankName.trim() || DEFAULT_TANK_NAME,
          lastSeenAtMs: Date.now(),
        },
        selectedFishId: selectedFishIdRef.current,
      };

      try {
        window.localStorage.setItem(AQUARIUM_STATE_STORAGE_KEY, JSON.stringify(state));
        window.localStorage.removeItem(CUSTOMIZATION_STORAGE_KEY);
        setSaveStatus("保存済み");
      } catch {
        setSaveStatus("保存できません");
      }
    };

    persist();
    const interval = window.setInterval(persist, 5_000);
    window.addEventListener("pagehide", persist);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", persist);
    };
  }, [customization, metadataRevision, preferences, selectedFishId]);

  useEffect(() => {
    setFish((current) => {
      const next = reconcileFishStock(current, customization.stock);
      fishRef.current = next;
      const pendingSpecies = pendingArrivalSpeciesRef.current;
      if (pendingSpecies) {
        const currentIds = new Set(current.map((item) => item.id));
        const arrival = next.find(
          (item) => item.speciesId === pendingSpecies && !currentIds.has(item.id),
        );
        if (arrival) {
          setSelectedFishId(arrival.id);
          setArrivalNotice(`${fishCatalog[pendingSpecies].displayName}を新しい住人として迎えました`);
        }
        pendingArrivalSpeciesRef.current = undefined;
      }
      setSelectedFishId((currentId) =>
        next.some((item) => item.id === currentId) ? currentId : next[0]?.id,
      );
      return next;
    });
    setMetadataRevision((current) => current + 1);
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
        setFish((current) => {
          const next = stepSimulation({
            tank: TANK_60CM,
            species: fishCatalog,
            fish: current,
            deltaSec,
            feeding,
            tapEvent,
          }).fish;
          fishRef.current = next;
          return next;
        });
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
    const timeout = window.setTimeout(() => setLatestFeeding(undefined), 6_200);
    return () => window.clearTimeout(timeout);
  }, [latestFeeding]);

  useEffect(() => {
    if (!latestTap) {
      return;
    }
    const timeout = window.setTimeout(() => setLatestTap(undefined), 1_800);
    return () => window.clearTimeout(timeout);
  }, [latestTap]);

  useEffect(() => {
    if (!arrivalNotice) {
      return;
    }
    const timeout = window.setTimeout(() => setArrivalNotice(undefined), 4_200);
    return () => window.clearTimeout(timeout);
  }, [arrivalNotice]);

  return (
    <main
      className={`app-shell${isAmbient ? " ambient-active" : ""}`}
      data-lighting={effectiveLighting}
    >
      <section className="aquarium-stage" ref={aquariumShellRef}>
        {viewMode === "tank" ? (
          <>
            <AquariumCanvas
              key={isAmbient ? "ambient" : "standard"}
              fish={fish}
              species={fishCatalog}
              tank={TANK_60CM}
              environment={effectiveEnvironment}
              paused={paused}
              latestFeeding={getActiveFeeding(latestFeeding)}
              latestTap={getActiveTap(latestTap)}
              worldDay={dayNumber}
              onDoubleTapTank={(position) => setLatestTap(createTapEvent(position))}
              onReady={() => setAquariumReady(true)}
            />
            {!aquariumReady ? (
              <div className="aquarium-loading" aria-live="polite">
                <div className="loading-bubbles" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p>注水中...</p>
              </div>
            ) : null}
            {arrivalNotice ? (
              <p className="arrival-notice" role="status">{arrivalNotice}</p>
            ) : null}
            {isAmbient ? (
              <div className="ambient-hud">
                <div>
                  <strong>{preferences.tankName}</strong>
                  <span>{formatClock(nowMs)} · {dayNumber}日目</span>
                </div>
                <button onClick={() => setAmbientMode("off")} type="button">
                  操作画面に戻る
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <FishGuideView
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
        selectedFishId={selectedFish?.id}
        preferences={preferences}
        effectiveLighting={effectiveLighting}
        nowMs={nowMs}
        dayNumber={dayNumber}
        observation={observation}
        onSelectedSpeciesChange={setSelectedSpeciesId}
        onSelectedFishChange={setSelectedFishId}
        onAddFish={handleAddFish}
        onRemoveFish={removeFish}
        onUpdateFish={updateFishIdentity}
        onSpeciesCountChange={updateSpeciesCount}
        onEnvironmentChange={(environment) =>
          setCustomization((current) =>
            normalizeAquariumCustomization(
              {
                ...current,
                environment: { ...current.environment, ...environment },
              },
              fishCatalog,
            ),
          )
        }
        onPresetChange={applyPreset}
        onResetCustomization={() => applyPreset(DEFAULT_CUSTOMIZATION.id)}
        onFeed={handleFeed}
        onTogglePaused={() => setPaused((value) => !value)}
        onViewModeChange={setViewMode}
        onTankNameChange={(tankName) =>
          setPreferences((current) => ({
            ...current,
            tankName: tankName.slice(0, 32),
          }))
        }
        onLightingModeChange={(lightingMode) =>
          setPreferences((current) => ({ ...current, lightingMode }))
        }
        onSoundEnabledChange={(soundEnabled) => {
          setAudioUnlocked(true);
          setPreferences((current) => ({ ...current, soundEnabled }));
        }}
        onSoundVolumeChange={(soundVolume) =>
          setPreferences((current) => ({ ...current, soundVolume }))
        }
        onEnterAmbientMode={() => setAmbientMode("manual")}
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

  function handleAddFish() {
    pendingArrivalSpeciesRef.current = selectedSpeciesId;
    updateSpeciesCount(
      selectedSpeciesId,
      getStockCount(customization.stock, selectedSpeciesId) + 1,
    );
  }

  function handleFeed() {
    setLatestFeeding(createFeedingEvent());
    setMetadataRevision((current) => current + 1);
  }

  function applyPreset(presetId: string) {
    const preset = getPresetById(presetId) ?? DEFAULT_CUSTOMIZATION;
    setCustomization(normalizeAquariumCustomization(preset, fishCatalog));
  }

  function removeFish(fishId: string) {
    const target = fishRef.current.find((item) => item.id === fishId);
    if (!target) {
      return;
    }
    updateSpeciesCount(
      target.speciesId,
      Math.max(0, getStockCount(customization.stock, target.speciesId) - 1),
    );
  }

  function updateFishIdentity(
    fishId: string,
    update: Pick<Partial<FishInstance>, "nickname" | "favorite">,
  ) {
    setFish((current) => {
      const next = current.map((item) =>
        item.id === fishId ? { ...item, ...update } : item,
      );
      fishRef.current = next;
      return next;
    });
    setMetadataRevision((current) => current + 1);
  }
}

function loadInitialAquariumState(): InitialAquariumState {
  const nowMs = Date.now();
  const params = new URLSearchParams(window.location.search);
  const preset = getPresetById(params.get("preset"));
  if (preset) {
    const customization = normalizeAquariumCustomization(preset, fishCatalog);
    const fish = createFishFromStock(customization.stock, nowMs);
    return {
      customization,
      fish,
      preferences: createDefaultPreferences(nowMs),
      selectedFishId: fish[0]?.id,
    };
  }

  try {
    const storedState = window.localStorage.getItem(AQUARIUM_STATE_STORAGE_KEY);
    if (storedState) {
      const normalized = normalizeAquariumPersistedState(
        JSON.parse(storedState),
        fishCatalog,
      );
      if (normalized) {
        const fish = hydrateFishResidents(
          normalized.residents,
          normalized.customization.stock,
          nowMs - normalized.preferences.lastSeenAtMs,
          nowMs,
        );
        return {
          customization: normalized.customization,
          fish,
          preferences: normalized.preferences,
          selectedFishId: normalized.selectedFishId,
        };
      }
    }

    const legacy = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    if (legacy) {
      const customization = normalizeAquariumCustomization(JSON.parse(legacy), fishCatalog);
      const fish = createFishFromStock(customization.stock, nowMs);
      return {
        customization,
        fish,
        preferences: createDefaultPreferences(nowMs),
        selectedFishId: fish[0]?.id,
      };
    }
  } catch {
    // Corrupt local state falls back to a calm new aquarium.
  }

  const customization = normalizeAquariumCustomization(DEFAULT_CUSTOMIZATION, fishCatalog);
  const fish = createFishFromStock(customization.stock, nowMs);
  return {
    customization,
    fish,
    preferences: createDefaultPreferences(nowMs),
    selectedFishId: fish[0]?.id,
  };
}

function createDefaultPreferences(nowMs: number): AquariumPreferences {
  return {
    tankName: DEFAULT_TANK_NAME,
    createdAtMs: nowMs,
    lastSeenAtMs: nowMs,
    lightingMode: "auto",
    soundEnabled: false,
    soundVolume: 0.42,
  };
}

function getAutomaticLighting(
  nowMs: number,
): AquariumEnvironmentCustomization["lighting"] {
  const hour = new Date(nowMs).getHours();
  if (hour >= 6 && hour < 17) {
    return "natural";
  }
  if (hour >= 17 && hour < 21) {
    return "evening";
  }
  return "night";
}

function getObservationText(
  fish: FishInstance | undefined,
  lighting: AquariumEnvironmentCustomization["lighting"],
  dayNumber: number,
): string {
  if (!fish) {
    return "水草の間を泡がゆっくり上っています。";
  }
  const name = fish.nickname || fishCatalog[fish.speciesId]?.displayName || fish.speciesId;
  if (lighting === "night") {
    return `${name}は暗くなった水槽で、落ち着ける場所を探しています。`;
  }
  if (fish.targetKind === "structure") {
    return `${name}が流木と水草の境目を何度も確かめています。`;
  }
  if (fish.targetKind === "surfaceVisit") {
    return `${name}が水面近くの光を追いながらゆっくり泳いでいます。`;
  }
  if (fish.targetKind === "edgeCruise") {
    return `${name}がガラス沿いを静かに巡回しています。`;
  }
  const variations = [
    `${name}は群れとの距離を保ちながら中央を泳いでいます。`,
    `${name}が木漏れ日の下で短い休息を繰り返しています。`,
    `${name}は泡の流れを横切って、いつもの泳層へ戻りました。`,
    `${name}が水草の影から開けた場所へ出てきました。`,
  ];
  return variations[dayNumber % variations.length];
}

function formatClock(nowMs: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(nowMs);
}

function useAmbientSound(active: boolean, volume: number) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const AudioContextConstructor = window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    const context = new AudioContextConstructor();
    const master = context.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.12;
    master.connect(context.destination);

    const hum = context.createOscillator();
    const humGain = context.createGain();
    hum.type = "sine";
    hum.frequency.value = 58;
    humGain.gain.value = 0.08;
    hum.connect(humGain).connect(master);

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const water = context.createBufferSource();
    const waterFilter = context.createBiquadFilter();
    const waterGain = context.createGain();
    water.buffer = buffer;
    water.loop = true;
    waterFilter.type = "lowpass";
    waterFilter.frequency.value = 760;
    waterFilter.Q.value = 0.7;
    waterGain.gain.value = 0.13;
    water.connect(waterFilter).connect(waterGain).connect(master);

    hum.start();
    water.start();
    void context.resume().catch(() => undefined);

    return () => {
      hum.stop();
      water.stop();
      void context.close();
    };
  }, [active, volume]);
}
