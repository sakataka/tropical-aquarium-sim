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
  DISCARDED_STORAGE_KEYS,
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
import { RENDER_PROBLEM_EVENT } from "./render/renderProblems";
import { FishRoom } from "./render/FishRoom";
import { AquariumControls } from "./ui/AquariumControls";
import "./styles.css";
import waterAmbienceLoop from "./content/audio/water-ambience.json";
import waterAmbienceUrl from "./content/audio/water-ambience.m4a?url";


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
  const [renderProblem, setRenderProblem] = useState<string | null>(null);

  useEffect(() => {
    const onProblem = (event: Event) => setRenderProblem((current) =>
      current ?? String((event as CustomEvent<string>).detail)
    );
    const onError = (event: ErrorEvent) => setRenderProblem((current) => current ?? `script: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => setRenderProblem((current) =>
      current ?? `promise: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`
    );
    window.addEventListener(RENDER_PROBLEM_EVENT, onProblem);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener(RENDER_PROBLEM_EVENT, onProblem);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
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
        for (const key of [...LEGACY_STORAGE_KEYS, ...DISCARDED_STORAGE_KEYS]) window.localStorage.removeItem(key);
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
      {renderProblem ? (
        <div className="render-problem" role="alert">
          <strong>水槽を表示できませんでした</strong>
          <span>{renderProblem}</span>
          <small>{navigator.userAgent}</small>
        </div>
      ) : null}
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
  const fullscreen = useFullscreen();
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
      // 全画面中の Esc はブラウザが全画面の解除に使う。
      if (event.key === "Escape" && !document.fullscreenElement) {
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
          <div className="hud-actions">
            {fullscreen.supported ? (
              <button aria-pressed={fullscreen.active} onClick={fullscreen.toggle} type="button">
                {fullscreen.active ? "全画面を解除" : "全画面"}
              </button>
            ) : null}
            {editing ? null : (
              <button
                aria-controls="tank-settings"
                aria-expanded={editing}
                onClick={() => setEditing(true)}
                type="button"
              >設定</button>
            )}
          </div>
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

// iPhone の Safari は要素の全画面表示に対応していないので、そのときはボタンを出さない。
function useFullscreen() {
  const supported = typeof document.documentElement.requestFullscreen === "function" &&
    document.fullscreenEnabled;
  const [active, setActive] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void request.catch(() => undefined);
  }, []);
  return { supported, active, toggle };
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
  // すでにその水景なら、選んである照明を残す。
  if (sceneTank && sceneId && tanks[sceneTank.id]!.layout.sceneId !== sceneId) {
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

type AmbientAudio = { context: AudioContext; master: GainNode; suspendTimer: number };

const ambientLevel = (volume: number) => Math.max(0, Math.min(1, volume)) * 0.6;

// 生成した水音のループを流す。音量の変更では鳴らし直さず、ゲインだけを動かす。
function useAmbientSound(active: boolean, volume: number) {
  const audioRef = useRef<AmbientAudio | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !active) return;
    audio.master.gain.setTargetAtTime(ambientLevel(volume), audio.context.currentTime, 0.08);
  }, [active, volume]);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current ?? createAmbientAudio();
    if (!audio) return;
    audioRef.current = audio;
    window.clearTimeout(audio.suspendTimer);
    // タブが裏へ回ったら止め、戻ったら続きから鳴らす。
    const sync = () => {
      if (document.hidden) void audio.context.suspend().catch(() => undefined);
      else void audio.context.resume().catch(() => undefined);
    };
    sync();
    audio.master.gain.setTargetAtTime(ambientLevel(volumeRef.current), audio.context.currentTime, 0.4);
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.12);
      audio.suspendTimer = window.setTimeout(
        () => void audio.context.suspend().catch(() => undefined),
        800,
      );
    };
  }, [active]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    window.clearTimeout(audio.suspendTimer);
    void audio.context.close();
  }, []);
}

function createAmbientAudio(): AmbientAudio | undefined {
  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return undefined;
  const context = new AudioContextConstructor();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  void fetch(waterAmbienceUrl)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      if (context.state === "closed") return;
      // 前後の余白は同じ波形の複製。デコーダーが先頭に無音を足しても継ぎ目が出ない。
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = waterAmbienceLoop.padSec;
      source.loopEnd = waterAmbienceLoop.padSec + waterAmbienceLoop.loopSec;
      source.connect(master);
      source.start(0, waterAmbienceLoop.padSec);
    })
    .catch(() => undefined);
  return { context, master, suspendTimer: 0 };
}
