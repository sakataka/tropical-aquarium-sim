import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  aquariumTanks,
  createDefaultState,
  createFishFromStock,
  fishCatalog,
  getDefaultLayout,
  getSceneById,
  getTankById,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  reconcileFishStock,
  setStockCount,
  type AquariumCustomization,
  type AquariumPersistedState,
  type FishInstance,
  type LightingId,
  type TankDefinition,
} from "./core";
import { AquariumCanvas, type ViewControl } from "./render/AquariumCanvas";
import { forgetMotionState } from "./render/fishBody";
import { FishRoom } from "./render/FishRoom";
import { AquariumControls } from "./ui/AquariumControls";
import "./styles.css";


type FishRefs = Record<string, MutableRefObject<FishInstance[]>>;
// 画面を切り替える間は、次の画面の準備ができるまで前の画面を重ねて残す。
type Phase =
  | { kind: "room"; returningFrom?: string }
  | { kind: "toTank"; tankReady: boolean }
  | { kind: "tank" }
  | { kind: "toRoom"; returningFrom: string; roomReady: boolean };

const CROSSFADE_MS = 400;
const HUD_IDLE_MS = 3500;
const EDIT_IDLE_MS = 45_000;

export default function App() {
  const [initial] = useState(loadInitialState);
  const [state, setState] = useState(initial.state);
  const [phase, setPhase] = useState<Phase>(initial.phase);
  // 魚の位置は毎フレーム描画側で進めるため、React の state には載せない。
  // 部屋の画面と水槽画面で同じ魚を泳がせ続ける。
  const fishRefs = useMemo<FishRefs>(() => Object.fromEntries(aquariumTanks.map((tank) => [
    tank.id,
    { current: createFishFromStock(initial.state.tanks[tank.id]!.stock, tank) },
  ])), [initial]);
  const [saveStatus, setSaveStatus] = useState("保存済み");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const tank = getTankById(state.activeTankId) ?? aquariumTanks[0]!;
  const customization = state.tanks[tank.id]!;

  useAmbientSound(
    state.preferences.soundEnabled && audioUnlocked,
    state.preferences.soundVolume,
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
    for (const item of aquariumTanks) {
      const ref = fishRefs[item.id]!;
      const next = reconcileFishStock(ref.current, state.tanks[item.id]!.stock, item);
      const kept = new Set(next.map((fish) => fish.id));
      for (const fish of ref.current) if (!kept.has(fish.id)) forgetMotionState(fish.id);
      ref.current = next;
    }
  }, [fishRefs, state.tanks]);

  useEffect(() => {
    setSaveStatus("保存中…");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(AQUARIUM_STATE_STORAGE_KEY, JSON.stringify(state));
        for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
        setSaveStatus("保存済み");
      } catch {
        setSaveStatus("保存できません");
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [state]);

  // 重ねた画面の準備ができたら、フェードが終わるのを待って前の画面を外す。
  useEffect(() => {
    const done = (phase.kind === "toTank" && phase.tankReady) ||
      (phase.kind === "toRoom" && phase.roomReady);
    if (!done) return;
    const timeout = window.setTimeout(() => setPhase((current) => {
      if (current.kind === "toTank") return { kind: "tank" };
      if (current.kind === "toRoom") return { kind: "room", returningFrom: current.returningFrom };
      return current;
    }), CROSSFADE_MS);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  const enterTank = useCallback((tankId: string) => {
    setState((current) => ({ ...current, activeTankId: tankId }));
    setPhase({ kind: "toTank", tankReady: false });
  }, []);
  const handleRoomReady = useCallback(() => setPhase((current) =>
    current.kind === "toRoom" ? { ...current, roomReady: true } : current
  ), []);
  const handleTankReady = useCallback(() => setPhase((current) =>
    current.kind === "toTank" ? { ...current, tankReady: true } : current
  ), []);

  const showRoom = phase.kind !== "tank";
  const showTank = phase.kind !== "room";
  const returningFrom = phase.kind === "room" || phase.kind === "toRoom"
    ? phase.returningFrom
    : undefined;

  return (
    <>
      {showRoom ? (
        <FishRoom
          active={phase.kind === "room" || phase.kind === "toRoom"}
          fishRefs={fishRefs}
          key="room"
          onEnterTank={enterTank}
          onReady={handleRoomReady}
          returningFrom={returningFrom}
          tanks={state.tanks}
        />
      ) : null}
      {showTank ? (
        <TankScreen
          active={phase.kind === "tank" || phase.kind === "toTank"}
          customization={customization}
          fishRef={fishRefs[tank.id]!}
          hidden={phase.kind === "toRoom" && phase.roomReady}
          revealed={phase.kind === "tank"}
          key={`tank-${tank.id}`}
          onBackToRoom={() => setPhase((current) => current.kind === "toRoom"
            ? current
            : { kind: "toRoom", returningFrom: tank.id, roomReady: false })}
          onCustomizationChange={(update) => setState((current) => ({
            ...current,
            tanks: { ...current.tanks, [tank.id]: update(current.tanks[tank.id]!) },
          }))}
          onPreferencesChange={(update) => setState((current) => ({
            ...current,
            preferences: { ...current.preferences, ...update },
          }))}
          onReady={handleTankReady}
          preferences={state.preferences}
          saveStatus={saveStatus}
          tank={tank}
        />
      ) : null}
    </>
  );
}

function TankScreen({
  tank,
  customization,
  fishRef,
  preferences,
  saveStatus,
  active,
  hidden,
  revealed,
  onReady,
  onCustomizationChange,
  onPreferencesChange,
  onBackToRoom,
}: {
  tank: TankDefinition;
  customization: AquariumCustomization;
  fishRef: MutableRefObject<FishInstance[]>;
  preferences: AquariumPersistedState["preferences"];
  saveStatus: string;
  active: boolean;
  hidden: boolean;
  revealed: boolean;
  onReady: () => void;
  onCustomizationChange: (update: (current: AquariumCustomization) => AquariumCustomization) => void;
  onPreferencesChange: (update: Partial<AquariumPersistedState["preferences"]>) => void;
  onBackToRoom: () => void;
}) {
  const [ready, setReady] = useState(false);
  // 水槽に入ったら、まず水槽だけを眺める鑑賞モード。設定は必要なときだけ開く。
  const [editing, setEditing] = useState(false);
  const [hudIdle, setHudIdle] = useState(false);
  const viewControlRef = useRef<ViewControl | null>(null);
  const editingRef = useRef(editing);
  const onBackToRoomRef = useRef(onBackToRoom);
  editingRef.current = editing;
  onBackToRoomRef.current = onBackToRoom;
  const activeScene = getSceneById(customization.layout.sceneId);
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const speciesList = useRef(tank.species
    .map((slot) => fishCatalog[slot.speciesId])
    .filter((species) => species !== undefined)).current;

  // 操作がしばらくないと、鑑賞モードの操作ボタンを消し、設定パネルも閉じる。
  useEffect(() => {
    let hudTimer = 0;
    let editTimer = 0;
    const wake = () => {
      setHudIdle(false);
      window.clearTimeout(hudTimer);
      window.clearTimeout(editTimer);
      hudTimer = window.setTimeout(() => setHudIdle(true), HUD_IDLE_MS);
      editTimer = window.setTimeout(() => setEditing(false), EDIT_IDLE_MS);
    };
    // Esc で一段戻る。設定を開いていれば閉じ、鑑賞中なら部屋へ戻る。
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editingRef.current) setEditing(false);
        else onBackToRoomRef.current();
      }
      wake();
    };
    wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hudTimer);
      window.clearTimeout(editTimer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleReady = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);

  const className = [
    "tank-screen",
    ready && !hidden ? "visible" : "",
    revealed ? "revealed" : "",
    editing ? "editing" : "",
    hudIdle && !editing ? "hud-idle" : "",
  ].filter(Boolean).join(" ");

  return (
    <main
      className={className}
      data-lighting={customization.layout.lighting}
    >
      <div className="tank-view">
        <section aria-label={`${tank.displayName}の水槽`} className="aquarium-stage">
          <AquariumCanvas
            active={active}
            fishRef={fishRef}
            layout={customization.layout}
            onReady={handleReady}
            revealed={revealed}
            species={fishCatalog}
            tank={tank}
            viewControlRef={viewControlRef}
          />
        </section>
      </div>

      <div className="tank-hud">
        <div className="hud-bar">
          <button onClick={onBackToRoom} type="button">‹ 部屋に戻る</button>
          {editing ? null : (
            <button
              aria-controls="tank-settings"
              aria-expanded={editing}
              onClick={() => setEditing(true)}
              type="button"
            >設定</button>
          )}
        </div>
        <div className="hud-caption">
          <strong>{tank.displayName}</strong>
          <span>{activeScene?.displayName} · {totalFish}匹</span>
        </div>
        <div className="hud-zoom" role="group" aria-label="水槽の拡大と縮小">
          <button aria-label="離れる" onClick={() => viewControlRef.current?.zoomBy(1 / 1.4)} type="button">−</button>
          <button onClick={() => viewControlRef.current?.resetZoom()} type="button">全体</button>
          <button aria-label="近づく" onClick={() => viewControlRef.current?.zoomBy(1.4)} type="button">＋</button>
        </div>
      </div>

      <AquariumControls
        customization={customization}
        onClose={() => setEditing(false)}
        onLightingChange={(lighting: LightingId) => onCustomizationChange((current) => ({
          ...current,
          layout: { ...current.layout, lighting },
        }))}
        onPreferencesChange={onPreferencesChange}
        onSceneChange={(sceneId) => onCustomizationChange((current) => ({
          ...current,
          layout: getDefaultLayout(tank, sceneId),
        }))}
        onSpeciesCountChange={(speciesId, count) => onCustomizationChange((current) => ({
          ...current,
          stock: setStockCount(current.stock, speciesId, count, tank, fishCatalog),
        }))}
        preferences={preferences}
        saveStatus={saveStatus}
        speciesList={speciesList}
        tank={tank}
      />
    </main>
  );
}

function loadInitialState(): { state: AquariumPersistedState; phase: Phase } {
  const params = new URLSearchParams(window.location.search);
  let state = createDefaultState(fishCatalog);
  try {
    const currentValue = window.localStorage.getItem(AQUARIUM_STATE_STORAGE_KEY);
    const current = currentValue
      ? normalizeAquariumPersistedState(JSON.parse(currentValue), fishCatalog)
      : undefined;
    const legacyKey = LEGACY_STORAGE_KEYS.find((key) => window.localStorage.getItem(key));
    const legacy = !current && legacyKey
      ? migrateLegacyAquariumState(JSON.parse(window.localStorage.getItem(legacyKey)!), fishCatalog)
      : undefined;
    state = current ?? legacy ?? state;
  } catch {
    // 壊れた保存データは初期状態から始める。
  }
  // ?tank=<id> で水槽を、?theme=<水景id> でその水景を持つ水槽を直接開く。
  const sceneId = params.get("theme");
  const sceneTank = aquariumTanks.find((item) => sceneId && item.sceneIds.includes(sceneId));
  const requestedTank = getTankById(params.get("tank")) ?? sceneTank;
  if (!requestedTank) return { state, phase: { kind: "room" } };
  const tanks = { ...state.tanks };
  if (sceneTank && sceneId) {
    tanks[sceneTank.id] = {
      ...tanks[sceneTank.id]!,
      layout: getDefaultLayout(sceneTank, sceneId),
    };
  }
  return {
    state: { ...state, tanks, activeTankId: requestedTank.id },
    phase: { kind: "tank" },
  };
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
