import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_CUSTOMIZATION,
  DEFAULT_PREFERENCES,
  LEGACY_AQUARIUM_STATE_STORAGE_KEY,
  PREVIOUS_AQUARIUM_STATE_STORAGE_KEY,
  aquariumScenes,
  createFishFromStock,
  fishCatalog,
  getDefaultLayout,
  getSceneById,
  migrateLegacyAquariumState,
  normalizeAquariumCustomization,
  normalizeAquariumPersistedState,
  reconcileFishStock,
  setStockCount,
  TANK_60CM,
  type AquariumCustomization,
  type AquariumPersistedState,
  type AquariumPreferences,
  type FishInstance,
  type LightingId,
} from "./core";
import { AquariumCanvas } from "./render/AquariumCanvas";
import { AquariumControls } from "./ui/AquariumControls";
import "./styles.css";

const IDLE_AMBIENT_DELAY_MS = 45_000;

type InitialState = {
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
};

export default function App() {
  const speciesList = useMemo(
    () => [...Object.values(fishCatalog)].sort((a, b) =>
      a.realBodyLengthCm - b.realBodyLengthCm
    ),
    [],
  );
  const [initialState] = useState<InitialState>(loadInitialState);
  const [customization, setCustomization] = useState(initialState.customization);
  const [preferences, setPreferences] = useState(initialState.preferences);
  // 魚の位置は毎フレーム描画側で進めるため、React の state には載せない。
  const fishRef = useRef<FishInstance[]>(
    createFishFromStock(initialState.customization.stock),
  );
  const [saveStatus, setSaveStatus] = useState("保存済み");
  const [ready, setReady] = useState(false);
  const [ambientMode, setAmbientMode] = useState<"off" | "manual" | "idle">("off");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const isAmbient = ambientMode !== "off";
  const activeScene = getSceneById(customization.layout.sceneId) ?? aquariumScenes[0];
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);

  useAmbientSound(
    preferences.soundEnabled && audioUnlocked,
    preferences.soundVolume,
  );

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
    if (ambientMode === "manual") return;
    let timer = window.setTimeout(() => setAmbientMode("idle"), IDLE_AMBIENT_DELAY_MS);
    const wake = () => {
      setAmbientMode((current) => current === "idle" ? "off" : current);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAmbientMode("idle"), IDLE_AMBIENT_DELAY_MS);
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
  }, [ambientMode]);

  useEffect(() => {
    fishRef.current = reconcileFishStock(fishRef.current, customization.stock);
  }, [customization.stock]);

  useEffect(() => {
    setSaveStatus("保存中…");
    const timeout = window.setTimeout(() => {
      const state: AquariumPersistedState = {
        version: 4,
        customization,
        preferences,
      };
      try {
        window.localStorage.setItem(AQUARIUM_STATE_STORAGE_KEY, JSON.stringify(state));
        window.localStorage.removeItem(CUSTOMIZATION_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_AQUARIUM_STATE_STORAGE_KEY);
        window.localStorage.removeItem(PREVIOUS_AQUARIUM_STATE_STORAGE_KEY);
        setSaveStatus("保存済み");
      } catch {
        setSaveStatus("保存できません");
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [customization, preferences]);

  const handleReady = useCallback(() => setReady(true), []);

  return (
    <main
      className={`app-shell${isAmbient ? " ambient-active" : ""}`}
      data-lighting={customization.layout.lighting}
    >
      <section className="aquarium-stage">
        <AquariumCanvas
          fishRef={fishRef}
          layout={customization.layout}
          onReady={handleReady}
          species={fishCatalog}
          tank={TANK_60CM}
        />
        {!ready ? (
          <div className="aquarium-loading" aria-live="polite">
            <span />
            <p>水景を整えています</p>
          </div>
        ) : null}
        {isAmbient ? (
          <div className="ambient-hud">
            <div>
              <strong>60cm水槽</strong>
              <span>{activeScene.displayName} · {totalFish}匹</span>
            </div>
            <button onClick={() => setAmbientMode("off")} type="button">
              編集画面に戻る
            </button>
          </div>
        ) : null}
      </section>

      <AquariumControls
        customization={customization}
        onEnterAmbientMode={() => setAmbientMode("manual")}
        onLightingChange={updateLighting}
        onPreferencesChange={(update) =>
          setPreferences((current) => ({ ...current, ...update }))
        }
        onSceneChange={applyScene}
        onSpeciesCountChange={updateSpeciesCount}
        preferences={preferences}
        saveStatus={saveStatus}
        speciesList={speciesList}
        tank={TANK_60CM}
      />
    </main>
  );

  function updateSpeciesCount(speciesId: string, count: number) {
    setCustomization((current) => ({
      ...current,
      stock: setStockCount(current.stock, speciesId, count, fishCatalog),
    }));
  }

  function applyScene(sceneId: string) {
    if (!getSceneById(sceneId)) return;
    setCustomization((current) => ({
      ...current,
      layout: getDefaultLayout(sceneId),
    }));
  }

  function updateLighting(lighting: LightingId) {
    setCustomization((current) => ({
      ...current,
      layout: { ...current.layout, lighting },
    }));
  }
}

function loadInitialState(): InitialState {
  const params = new URLSearchParams(window.location.search);
  const requestedSceneId = mapUrlScene(params.get("theme"), params.get("preset"));
  try {
    const currentValue = window.localStorage.getItem(AQUARIUM_STATE_STORAGE_KEY);
    const current = currentValue
      ? normalizeAquariumPersistedState(JSON.parse(currentValue), fishCatalog)
      : undefined;
    const previousStateValue = window.localStorage.getItem(PREVIOUS_AQUARIUM_STATE_STORAGE_KEY);
    const previousState = previousStateValue
      ? migrateLegacyAquariumState(JSON.parse(previousStateValue), fishCatalog)
      : undefined;
    const legacyStateValue = window.localStorage.getItem(LEGACY_AQUARIUM_STATE_STORAGE_KEY);
    const legacyState = legacyStateValue
      ? migrateLegacyAquariumState(JSON.parse(legacyStateValue), fishCatalog)
      : undefined;
    const legacyCustomizationValue = window.localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    const legacyCustomization = legacyCustomizationValue
      ? migrateLegacyAquariumState(JSON.parse(legacyCustomizationValue), fishCatalog)
      : undefined;
    const state = current ?? previousState ?? legacyState ?? legacyCustomization;
    const customization = state?.customization ?? DEFAULT_CUSTOMIZATION;
    const preferences = state?.preferences ?? DEFAULT_PREFERENCES;
    if (!requestedSceneId) return { customization, preferences };
    return {
      customization: normalizeAquariumCustomization({
        stock: customization.stock,
        layout: getDefaultLayout(requestedSceneId),
      }, fishCatalog),
      preferences,
    };
  } catch {
    return {
      customization: DEFAULT_CUSTOMIZATION,
      preferences: DEFAULT_PREFERENCES,
    };
  }
}

function mapUrlScene(
  scene: string | null,
  legacyPreset: string | null,
): string | undefined {
  if (getSceneById(scene)) return scene!;
  if (legacyPreset === "community") return "planted";
  if (legacyPreset === "school") return "iwagumi";
  if (legacyPreset === "calm") return "driftwood";
  return undefined;
}

function useAmbientSound(active: boolean, volume: number) {
  useEffect(() => {
    if (!active) return;
    const AudioContextConstructor = window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
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
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    water.buffer = buffer;
    water.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 720;
    gain.gain.value = 0.12;
    water.connect(filter).connect(gain).connect(master);
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
