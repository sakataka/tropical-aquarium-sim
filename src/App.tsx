import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
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
  getSceneHeader,
  getTankById,
  migrateLegacyAquariumState,
  normalizeAquariumPersistedState,
  reconcileFishStock,
  setStockCount,
  speciesDirectory,
  type AquariumCustomization,
  type AquariumPersistedState,
  type FishInstance,
  type LightingId,
  type TankDefinition,
} from "./core";
import type { ViewControl } from "./render/AquariumCanvas";
import { forgetMotionState } from "./render/motionState";
import { RENDER_PROBLEM_EVENT } from "./render/renderProblems";
import { getRoomForTank } from "./core/room";
import { loadHallContent } from "./core/hallContent";
import { getHallById } from "./core/museum";
import { MuseumMap } from "./ui/MuseumMap";
import { getHallTextureUrls, getScenePlateUrl } from "./render/assetUrls";
import { AquariumControls, LIGHTING_OPTIONS } from "./ui/AquariumControls";
import { SoundToggle } from "./ui/SoundToggle";
import { configureSfx, playSfx } from "./audio/sfx";
import {
  BackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  FitIcon,
  MapIcon,
  MinusIcon,
  PlusIcon,
  SettingsIcon,
} from "./ui/icons";
import "./styles.css";
import waterAmbienceLoop from "./content/audio/water-ambience.json";
import waterAmbienceUrl from "./content/audio/water-ambience.m4a?url";


// 展示室と水槽の描画（PixiJS）は、館内図では使わないので、展示室に入るときに読む。
// 館内図にいる間に先読みしておき、展示室を選んだときに待たせないようにする。
const loadFishRoom = () => import("./render/FishRoom");
const loadAquariumCanvas = () => import("./render/AquariumCanvas");
const FishRoom = lazy(() => loadFishRoom().then((module) => ({ default: module.FishRoom })));
const AquariumCanvas = lazy(() => loadAquariumCanvas().then((module) => ({ default: module.AquariumCanvas })));
// 図鑑は開いたときに読む。
const Zukan = lazy(() => import("./ui/Zukan").then((module) => ({ default: module.Zukan })));

/** 図鑑を開いているときの表示。speciesId が null なら一覧。 */
type ZukanView = { speciesId: string | null };

type FishRefs = Record<string, MutableRefObject<FishInstance[]>>;
// 画面を切り替える間は、次の画面の準備ができるまで前の画面を重ねて残す。
type Phase =
  | { kind: "map" }
  | { kind: "room"; returningFrom?: string }
  | { kind: "toTank"; tankReady: boolean }
  | { kind: "tank" }
  | { kind: "toRoom"; returningFrom: string; roomReady: boolean }
  // 部屋に戻らず隣の水槽へ。今の水槽を流し消してから、次の水槽を反対側から出す。
  | { kind: "leaveTank"; to: string; direction: SwitchDirection }
  | { kind: "switchTank"; direction: SwitchDirection; tankReady: boolean };
type SwitchDirection = "next" | "previous";

const TANK_LEAVE_MS = 420;

const CROSSFADE_MS = 400;
const HUD_IDLE_MS = 3500;
const EDIT_IDLE_MS = 45_000;

export default function App() {
  const [initial] = useState(loadInitialState);
  const [state, setState] = useState(initial.state);
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [zukan, setZukan] = useState<ZukanView | null>(initial.zukan);
  // 魚の位置は毎フレーム描画側で進めるため、React の state には載せない。
  // 部屋の画面と水槽画面で同じ魚を泳がせ続ける。魚は、その展示室の魚種を読み込んでから生まれる。
  // useMemo だと開発時の差し替え（Fast Refresh）で作り直され、読み込み済みの展示室の魚が消えるので useRef で持つ。
  const fishRefs = useRef<FishRefs>({}).current;
  const [loadedHalls, setLoadedHalls] = useState<ReadonlySet<string>>(() => new Set());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [saveFailed, setSaveFailed] = useState(false);
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
  const room = getRoomForTank(tank.id);
  const roomTanks = room.tanks.map((placement) => getTankById(placement.tankId)!);
  const hallReady = loadedHalls.has(room.id);

  // 展示室に入るときに、その展示室の魚種と水景の地形を読み、魚を生む。
  useEffect(() => {
    if (phase.kind === "map" || hallReady) return;
    let cancelled = false;
    loadHallContent(room)
      .then(() => {
        if (cancelled) return;
        for (const placement of room.tanks) {
          const item = getTankById(placement.tankId)!;
          fishRefs[item.id] ??= { current: createFishFromStock(stateRef.current.tanks[item.id]!.stock, item) };
        }
        setLoadedHalls((current) => new Set(current).add(room.id));
      })
      .catch((error: unknown) => setRenderProblem((current) =>
        current ?? `content: ${error instanceof Error ? error.message : String(error)}`));
    return () => { cancelled = true; };
  }, [fishRefs, hallReady, phase.kind, room]);

  // 展示室や水槽の画面が落ち着いたら、ほかの展示室のテクスチャを外す。
  // 館内図にいる間は、戻ってくることが多い直前の展示室の分を残す。
  useEffect(() => {
    if (!hallReady || (phase.kind !== "room" && phase.kind !== "tank")) return;
    void import("./render/assets").then(({ releaseTexturesExcept }) => releaseTexturesExcept(getHallTextureUrls(room)));
  }, [hallReady, phase.kind, room]);

  // 館内図を見ている間に、展示室の描画部品を先読みしておく。
  useEffect(() => {
    if (phase.kind !== "map") return;
    const idle = window.setTimeout(() => { void loadFishRoom(); void loadAquariumCanvas(); }, 1200);
    return () => window.clearTimeout(idle);
  }, [phase.kind]);
  const lastTankByRoom = useRef<Record<string, string>>({});
  // 館内図の「前回の展示室」は、保存データがあるか、この回に展示室を見たあとだけ付ける。
  const visitedRef = useRef(initial.restored);
  if (phase.kind !== "map") visitedRef.current = true;
  lastTankByRoom.current[room.id] = tank.id;

  useAmbientSound(
    state.preferences.soundEnabled && audioUnlocked,
    state.preferences.soundVolume,
  );
  useEffect(() => configureSfx({
    enabled: state.preferences.soundEnabled && audioUnlocked,
    volume: state.preferences.soundVolume,
  }), [state.preferences.soundEnabled, state.preferences.soundVolume, audioUnlocked]);
  const toggleSound = useCallback(() => {
    setAudioUnlocked(true);
    setState((current) => ({
      ...current,
      preferences: { ...current.preferences, soundEnabled: !current.preferences.soundEnabled },
    }));
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
    for (const item of aquariumTanks) {
      const ref = fishRefs[item.id];
      if (!ref) continue;
      const next = reconcileFishStock(ref.current, state.tanks[item.id]!.stock, item);
      const kept = new Set(next.map((fish) => fish.id));
      for (const fish of ref.current) if (!kept.has(fish.id)) forgetMotionState(fish.id);
      ref.current = next;
    }
  }, [fishRefs, state.tanks, loadedHalls]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(AQUARIUM_STATE_STORAGE_KEY, JSON.stringify(state));
        for (const key of [...LEGACY_STORAGE_KEYS, ...DISCARDED_STORAGE_KEYS]) window.localStorage.removeItem(key);
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [state]);

  // 重ねた画面の準備ができたら、フェードが終わるのを待って前の画面を外す。
  useEffect(() => {
    const done = ((phase.kind === "toTank" || phase.kind === "switchTank") && phase.tankReady) ||
      (phase.kind === "toRoom" && phase.roomReady);
    if (!done) return;
    const timeout = window.setTimeout(() => setPhase((current) => {
      if (current.kind === "toTank" || current.kind === "switchTank") return { kind: "tank" };
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
    current.kind === "toTank" || current.kind === "switchTank" ? { ...current, tankReady: true } : current
  ), []);
  const switchTank = useCallback((direction: SwitchDirection) => {
    setPhase((current) => {
      if (current.kind !== "tank") return current;
      const index = roomTanks.findIndex((item) => item.id === state.activeTankId);
      const step = direction === "next" ? 1 : -1;
      const to = roomTanks[(index + step + roomTanks.length) % roomTanks.length]!.id;
      playSfx("tank_switch");
      return { kind: "leaveTank", to, direction };
    });
  }, [state.activeTankId]);
  useEffect(() => {
    if (phase.kind !== "leaveTank") return;
    const timeout = window.setTimeout(() => {
      setState((current) => ({ ...current, activeTankId: phase.to }));
      setPhase({ kind: "switchTank", direction: phase.direction, tankReady: false });
    }, TANK_LEAVE_MS);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  // 展示室に入るときは、その展示室で最後に見ていた水槽を選んでおく。
  const enterHall = useCallback((hallId: string) => {
    const hall = getHallById(hallId);
    if (!hall) return;
    setState((current) => {
      const last = lastTankByRoom.current[hall.id];
      const saved = hall.tanks.some((item) => item.tankId === current.activeTankId) ? current.activeTankId : undefined;
      return { ...current, activeTankId: last ?? saved ?? hall.tanks[0]!.tankId };
    });
    setPhase({ kind: "room" });
  }, []);
  const showMap = useCallback(() => {
    playSfx("room_return");
    setPhase({ kind: "map" });
  }, []);
  // 展示室で Esc を押すと館内図へ戻る（水槽画面の Esc は TankScreen が扱う）。
  useEffect(() => {
    if (phase.kind !== "room") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) showMap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, showMap]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const activeTankRef = useRef(state.activeTankId);
  activeTankRef.current = state.activeTankId;
  const closingZukanRef = useRef(false);
  const openZukan = useCallback((speciesId: string | null) => {
    playSfx("panel_open");
    setZukan({ speciesId });
  }, []);
  // 図鑑の中で進んだ分だけ履歴を戻して閉じる。直接開いた図鑑は、下の画面に置き換えて閉じる。
  const closeZukan = useCallback(() => {
    playSfx("panel_close");
    const depth = Number((window.history.state as { zukanDepth?: number } | null)?.zukanDepth ?? 0);
    if (depth > 0) window.history.go(-depth);
    else {
      closingZukanRef.current = true;
      setZukan(null);
    }
  }, []);
  const visitTankFromZukan = useCallback((tankId: string) => {
    setZukan(null);
    setState((current) => ({ ...current, activeTankId: tankId }));
    setPhase({ kind: "tank" });
  }, []);
  useHistorySync(phase, state.activeTankId, zukan, closingZukanRef, {
    toZukan: (speciesId) => setZukan(speciesId === undefined ? null : { speciesId }),
    toMap: () => setPhase({ kind: "map" }),
    toHall: (hallId) => {
      const current = phaseRef.current;
      // 水槽から、その水槽のある展示室へ戻るときは引く演出を使う。
      if (current.kind === "tank" && getRoomForTank(activeTankRef.current).id === hallId) {
        setPhase({ kind: "toRoom", returningFrom: activeTankRef.current, roomReady: false });
      } else enterHall(hallId);
    },
    toTank: (tankId) => {
      const current = phaseRef.current;
      setState((value) => ({ ...value, activeTankId: tankId }));
      if (current.kind === "room" && getRoomForTank(tankId).id === getRoomForTank(activeTankRef.current).id) {
        setPhase({ kind: "toTank", tankReady: false });
      } else setPhase({ kind: "tank" });
    },
  });

  const showRoom = phase.kind === "room" || phase.kind === "toTank" || phase.kind === "toRoom";
  const showTank = phase.kind !== "room" && phase.kind !== "map";
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
      {phase.kind === "map" ? (
        <MuseumMap
          lastHallId={visitedRef.current ? room.id : undefined}
          onEnterHall={enterHall}
          onOpenZukan={() => openZukan(null)}
          onToggleSound={toggleSound}
          soundEnabled={state.preferences.soundEnabled}
          tanks={state.tanks}
        />
      ) : null}
      {phase.kind !== "map" && !hallReady ? <HallLoading /> : null}
      <Suspense fallback={<HallLoading />}>
      {showRoom && hallReady ? (
        <FishRoom
          active={phase.kind === "room" || phase.kind === "toRoom"}
          fishRefs={fishRefs}
          key={`room-${room.id}`}
          room={room}
          onEnterTank={enterTank}
          onReady={handleRoomReady}
          returningFrom={returningFrom}
          tanks={state.tanks}
        />
      ) : null}
      {/* 部屋の後ろに置き、寄っている間は .room-scroll.zooming から隠す。 */}
      {phase.kind === "room" ? (
        <>
          <button className="hud-button room-map-button" onClick={showMap} title="館内図へ（Esc）" type="button">
            <MapIcon /><span className="hud-label">館内図</span>
          </button>
          <SoundToggle className="room-sound" enabled={state.preferences.soundEnabled} onToggle={toggleSound} />
        </>
      ) : null}
      {showTank && hallReady ? (
        <TankScreen
          active={phase.kind !== "toRoom"}
          leaving={phase.kind === "leaveTank" ? phase.direction : undefined}
          arriving={phase.kind === "switchTank" ? phase.direction : undefined}
          onSwitchTank={switchTank}
          customization={customization}
          fishRef={fishRefs[tank.id]!}
          hidden={phase.kind === "toRoom" && phase.roomReady}
          revealed={phase.kind === "tank"}
          key={`tank-${tank.id}`}
          onBackToRoom={() => setPhase((current) => {
            if (current.kind === "toRoom") return current;
            playSfx("room_return");
            return { kind: "toRoom", returningFrom: tank.id, roomReady: false };
          })}
          onToggleSound={toggleSound}
          onOpenZukan={openZukan}
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
          saveFailed={saveFailed}
          tank={tank}
        />
      ) : null}
      {zukan ? (
        <Zukan
          onClose={closeZukan}
          onSelect={(speciesId) => setZukan({ speciesId })}
          onVisitTank={visitTankFromZukan}
          speciesId={zukan.speciesId}
        />
      ) : null}
      </Suspense>
    </>
  );
}

function HallLoading() {
  return <div aria-live="polite" className="hall-loading" role="status">展示室を準備しています</div>;
}

function TankScreen({
  tank,
  customization,
  fishRef,
  preferences,
  saveFailed,
  active,
  hidden,
  revealed,
  onReady,
  onCustomizationChange,
  onPreferencesChange,
  onBackToRoom,
  onSwitchTank,
  onToggleSound,
  onOpenZukan,
  leaving,
  arriving,
}: {
  tank: TankDefinition;
  customization: AquariumCustomization;
  fishRef: MutableRefObject<FishInstance[]>;
  preferences: AquariumPersistedState["preferences"];
  saveFailed: boolean;
  active: boolean;
  hidden: boolean;
  revealed: boolean;
  onReady: () => void;
  onCustomizationChange: (update: (current: AquariumCustomization) => AquariumCustomization) => void;
  onPreferencesChange: (update: Partial<AquariumPersistedState["preferences"]>) => void;
  onBackToRoom: () => void;
  onSwitchTank: (direction: SwitchDirection) => void;
  onToggleSound: () => void;
  onOpenZukan: (speciesId: string) => void;
  /** 隣の水槽へ移るため、この水槽を流し消しているところ。 */
  leaving?: SwitchDirection;
  /** 隣の水槽から移ってきたところ。 */
  arriving?: SwitchDirection;
}) {
  const [ready, setReady] = useState(false);
  // 水槽に入ったら、まず水槽だけを眺める鑑賞モード。設定は必要なときだけ開く。
  const [editing, setEditing] = useState(false);
  const [hudIdle, setHudIdle] = useState(false);
  const viewControlRef = useRef<ViewControl | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const fullscreen = useFullscreen();
  const editingRef = useRef(editing);
  const onBackToRoomRef = useRef(onBackToRoom);
  const onSwitchTankRef = useRef(onSwitchTank);
  editingRef.current = editing;
  onBackToRoomRef.current = onBackToRoom;
  onSwitchTankRef.current = onSwitchTank;
  const activeScene = getSceneHeader(customization.layout.sceneId);
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
        if (editingRef.current) {
          playSfx("panel_close");
          setEditing(false);
        } else onBackToRoomRef.current();
      }
      const target = event.target;
      const typing = target instanceof Element && target.closest("input, select, textarea");
      if (!typing && !editingRef.current && (event.key === "[" || event.key === "]")) {
        onSwitchTankRef.current(event.key === "]" ? "next" : "previous");
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

  // 開いたらパネルへ（Tab で最初に閉じるボタンへ進む）、閉じたら「設定」ボタンへフォーカスを移し、キーボードでも見失わない。
  // 放置で閉じたときは、パネルの中にフォーカスがあったときだけ戻す。
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (editing) {
      panelRef.current?.focus({ preventScroll: true });
    } else if (wasEditingRef.current) {
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.closest(".control-panel")) {
        settingsButtonRef.current?.focus({ preventScroll: true });
      }
    }
    wasEditingRef.current = editing;
  }, [editing]);

  const handleReady = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);

  const plateUrl = getScenePlateUrl(customization.layout.sceneId);
  const roomTanks = getRoomForTank(tank.id).tanks.map((placement) => getTankById(placement.tankId)!);
  const tankIndex = roomTanks.indexOf(tank);
  const exhibitNumber = String(tankIndex + 1).padStart(2, "0");
  const neighbor = (step: number) =>
    roomTanks[(tankIndex + step + roomTanks.length) % roomTanks.length]!;
  const lightingLabel = LIGHTING_OPTIONS.find((item) => item.id === customization.layout.lighting)?.label;

  const className = [
    "tank-screen",
    ready && !hidden && !leaving ? "visible" : "",
    leaving ? `leaving-${leaving}` : "",
    arriving && !ready ? `arriving-${arriving}` : "",
    revealed ? "revealed" : "",
    editing ? "editing" : "",
    hudIdle && !editing ? "hud-idle" : "",
  ].filter(Boolean).join(" ");

  return (
    <main
      className={className}
      data-lighting={customization.layout.lighting}
      ref={screenRef}
    >
      {/* 水槽の外は暗い部屋。水景の色がガラスからにじむように、同じ一枚絵をぼかして敷く。 */}
      {plateUrl ? (
        <div aria-hidden="true" className="tank-glow" key={plateUrl}>
          <img alt="" src={plateUrl} />
        </div>
      ) : null}
      {/* 水槽を置いた台の艶に、水景がうっすら映り込む。 */}
      {plateUrl ? (
        <div aria-hidden="true" className="tank-reflection">
          <span key={plateUrl} style={{ backgroundImage: `url("${plateUrl}")` }} />
        </div>
      ) : null}
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
            glassFrameRef={screenRef}
          />
        </section>
      </div>
      {/* ガラスの縁と表面の照り返し。水中の揺らぎの外側に重ねる。 */}
      <div aria-hidden="true" className="tank-glass" />

      <div className="tank-hud">
        <div className="hud-bar">
          <button className="hud-button" onClick={onBackToRoom} title="展示室に戻る（Esc）" type="button">
            <BackIcon /><span className="hud-label">展示室に戻る</span>
          </button>
          <nav aria-label="ほかの水槽へ" className="hud-stepper">
            <button
              aria-label={`前の水槽（${neighbor(-1).displayName}）`}
              onClick={() => onSwitchTank("previous")}
              title={`${neighbor(-1).displayName}（[）`}
              type="button"
            ><ChevronLeftIcon /></button>
            <span aria-hidden="true"><b>{exhibitNumber}</b> / {String(roomTanks.length).padStart(2, "0")}</span>
            <button
              aria-label={`次の水槽（${neighbor(1).displayName}）`}
              onClick={() => onSwitchTank("next")}
              title={`${neighbor(1).displayName}（]）`}
              type="button"
            ><ChevronRightIcon /></button>
          </nav>
          <div className="hud-actions">
            <SoundToggle enabled={preferences.soundEnabled} onToggle={onToggleSound} />
            {fullscreen.supported ? (
              <button
                aria-label={fullscreen.active ? "全画面を解除" : "全画面"}
                aria-pressed={fullscreen.active}
                className="hud-button icon-only"
                onClick={() => { playSfx("ui_tap"); fullscreen.toggle(); }}
                title={fullscreen.active ? "全画面を解除" : "全画面"}
                type="button"
              >
                {fullscreen.active ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            ) : null}
            {editing ? null : (
              <button
                aria-controls="tank-settings"
                aria-expanded={editing}
                className="hud-button"
                onClick={() => { playSfx("panel_open"); setEditing(true); }}
                ref={settingsButtonRef}
                type="button"
              ><SettingsIcon /><span className="hud-label">設定</span></button>
            )}
          </div>
        </div>
        <div className="hud-caption">
          <p className="caption-eyebrow"><span>No. {exhibitNumber}</span>{tank.exhibitName}</p>
          <strong>{tank.displayName}</strong>
          <span>{activeScene?.displayName} · {lightingLabel} · {totalFish}匹</span>
          {/* 展示ラベルのように、いま水槽にいる生き物の名前を添える。 */}
          {customization.stock.length > 0 ? (
            <p className="caption-species" aria-label="展示中の生き物">
              {customization.stock.map((entry) => (
                <span key={entry.speciesId}>
                  {fishCatalog[entry.speciesId]?.displayName}<small>{entry.count}</small>
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="hud-zoom" role="group" aria-label="水槽の拡大と縮小">
          <button
            aria-label="離れる"
            onClick={() => { playSfx("ui_tap", 0.7); viewControlRef.current?.zoomBy(1 / 1.4); }}
            title="離れる（−）"
            type="button"
          ><MinusIcon /></button>
          <button
            aria-label="全体を見る"
            onClick={() => { playSfx("ui_tap", 0.7); viewControlRef.current?.resetZoom(); }}
            title="全体を見る（0）"
            type="button"
          ><FitIcon /></button>
          <button
            aria-label="近づく"
            onClick={() => { playSfx("ui_tap", 0.7); viewControlRef.current?.zoomBy(1.4); }}
            title="近づく（＋）"
            type="button"
          ><PlusIcon /></button>
        </div>
      </div>
      {/* 左端から始まるスワイプは Safari の「戻る」に使われるので、水槽の操作に渡さない。 */}
      <div aria-hidden="true" className="edge-guard" />

      <AquariumControls
        customization={customization}
        onClose={() => { playSfx("panel_close"); setEditing(false); }}
        panelRef={panelRef}
        onOpenZukan={onOpenZukan}
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
          stock: setStockCount(current.stock, speciesId, count, tank, speciesDirectory),
        }))}
        preferences={preferences}
        saveFailed={saveFailed}
        speciesList={speciesList}
        tank={tank}
      />
    </main>
  );
}

type HistoryTargets = {
  /** 図鑑を開く（speciesId が null なら一覧）。undefined なら閉じる。 */
  toZukan: (speciesId: string | null | undefined) => void;
  toMap: () => void;
  toHall: (hallId: string) => void;
  toTank: (tankId: string) => void;
};

/** 館内図は ""、展示室は ?hall=、水槽は ?tank=、図鑑は ?zukan と ?zukan=<種>。切り替えの途中は URL を書き換えない。 */
function searchForPhase(phase: Phase, tankId: string, zukan: ZukanView | null): string | null {
  if (zukan) return zukan.speciesId ? `?zukan=${zukan.speciesId}` : "?zukan";
  if (phase.kind === "map") return "";
  if (phase.kind === "room") return `?hall=${getRoomForTank(tankId).id}`;
  if (phase.kind === "tank") return `?tank=${tankId}`;
  return null;
}

// 見ている画面を URL に映し、ブラウザの戻る・進むで館内図・展示室・水槽を行き来できるようにする。
// GitHub Pages で動くよう、パスではなくクエリで表す。
function useHistorySync(phase: Phase, tankId: string, zukan: ZukanView | null,
  closingZukanRef: MutableRefObject<boolean>, targets: HistoryTargets) {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const syncedRef = useRef(false);
  const search = searchForPhase(phase, tankId, zukan);

  useEffect(() => {
    if (search === null) return;
    const current = window.location.search;
    if (search !== current) {
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      // 開いた直後の正規化（?theme= など）、同じ展示室の隣の水槽への移動、直接開いた図鑑を閉じるときは履歴を増やさない。
      const sideways = search.startsWith("?tank=") && current.startsWith("?tank=");
      const depth = Number((window.history.state as { zukanDepth?: number } | null)?.zukanDepth ?? 0);
      // 図鑑の中で進んだ数を履歴に残し、閉じるときにその分だけ戻れるようにする。
      const state = zukan ? { zukanDepth: depth + 1 } : null;
      if (!syncedRef.current || sideways || closingZukanRef.current) window.history.replaceState(zukan ? { zukanDepth: depth } : null, "", url);
      else window.history.pushState(state, "", url);
    }
    closingZukanRef.current = false;
    syncedRef.current = true;
  }, [closingZukanRef, search, zukan]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("zukan")) {
        targetsRef.current.toZukan(params.get("zukan") || null);
        return;
      }
      targetsRef.current.toZukan(undefined);
      const tank = getTankById(params.get("tank"));
      const hall = getHallById(params.get("hall"));
      if (tank) targetsRef.current.toTank(tank.id);
      else if (hall) targetsRef.current.toHall(hall.id);
      else targetsRef.current.toMap();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
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

function loadInitialState(): { state: AquariumPersistedState; phase: Phase; restored: boolean; zukan: ZukanView | null } {
  const params = new URLSearchParams(window.location.search);
  let state = createDefaultState(speciesDirectory);
  let restored = false;
  try {
    const currentValue = window.localStorage.getItem(AQUARIUM_STATE_STORAGE_KEY);
    const current = currentValue
      ? normalizeAquariumPersistedState(JSON.parse(currentValue), speciesDirectory)
      : undefined;
    const legacyKey = LEGACY_STORAGE_KEYS.find((key) => window.localStorage.getItem(key));
    const legacy = !current && legacyKey
      ? migrateLegacyAquariumState(JSON.parse(window.localStorage.getItem(legacyKey)!), speciesDirectory)
      : undefined;
    state = current ?? legacy ?? state;
    restored = Boolean(current ?? legacy);
  } catch {
    // 壊れた保存データは初期状態から始める。
  }
  // ?tank=<id> で水槽を、?theme=<水景id> でその水景を持つ水槽を、?hall=<id> で展示室を直接開く。
  // ?zukan で図鑑の一覧を、?zukan=<種> でその種の解説を、館内図の上に開く。
  // 何も指定がなければ館内図から始める。
  if (params.has("zukan")) return { state, phase: { kind: "map" }, restored, zukan: { speciesId: params.get("zukan") || null } };
  const sceneId = params.get("theme");
  const sceneTank = aquariumTanks.find((item) => sceneId && item.sceneIds.includes(sceneId));
  const requestedTank = getTankById(params.get("tank")) ?? sceneTank;
  if (!requestedTank) {
    const hall = getHallById(params.get("hall"));
    if (!hall) return { state, phase: { kind: "map" }, restored, zukan: null };
    const saved = hall.tanks.some((item) => item.tankId === state.activeTankId);
    return {
      state: saved ? state : { ...state, activeTankId: hall.tanks[0]!.tankId },
      phase: { kind: "room" },
      restored,
      zukan: null,
    };
  }
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
    restored,
    zukan: null,
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
