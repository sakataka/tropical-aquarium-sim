import {
  lazy,
  startTransition,
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
  createFishFromStock,
  getDefaultLayout,
  getTankById,
  loadHall,
  normalizeHallCustomizations,
  reconcileFishStock,
  type AquariumCustomization,
  type FishInstance,
} from "./core";
import { forgetMotionState } from "./render/motionState";
import { RENDER_PROBLEM_EVENT } from "./render/renderProblems";
import {
  getFloorById,
  getHallById,
  getHallLayout,
  getHallOfTank,
  getTankSummary,
  tankSummaries,
} from "./core/museum";
import { MuseumMap } from "./ui/MuseumMap";
import { getHallTextureUrls } from "./render/assetUrls";
import { SoundToggle } from "./ui/SoundToggle";
import { configureSfx, playSfx } from "./audio/sfx";
import { MapIcon } from "./ui/icons";
import { TankScreen } from "./ui/TankScreen";
import { useAmbientSound } from "./audio/useAmbientSound";
import { loadInitialState, useHistorySync, type Phase, type ZukanView, type SwitchDirection } from "./navigation";
import { useSeenTanks } from "./useSeenTanks";
import "./styles.css";


// 展示室と水槽の描画（PixiJS）は、館内図では使わないので、展示室に入るときに読む。
// 館内図にいる間に先読みしておき、展示室を選んだときに待たせないようにする。
const loadFishRoom = () => import("./render/FishRoom");
const loadAquariumCanvas = () => import("./render/AquariumCanvas");
const FishRoom = lazy(() => loadFishRoom().then((module) => ({ default: module.FishRoom })));
// 図鑑は開いたときに読む。
const Zukan = lazy(() => import("./ui/Zukan").then((module) => ({ default: module.Zukan })));

type FishRefs = Record<string, MutableRefObject<FishInstance[]>>;

const TANK_LEAVE_MS = 420;

const CROSSFADE_MS = 400;
const NO_SPECIES: readonly string[] = [];

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
  // まだ見ていない水槽と生き物。館内図・展示室・水槽の画面に NEW の印を出し、水槽の画面に入ると既読にする。
  const { unseen, markSeen } = useSeenTanks();

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
  // 館内図にいる間も、選んでいる水槽と展示室は館の索引で分かる。水槽の定義と設定は、展示室を読んでから使う。
  const activeTankId = getTankSummary(state.activeTankId)?.id ?? tankSummaries[0]!.id;
  const room = getHallOfTank(activeTankId);
  const roomTankIds = room.tankIds;
  const hallReady = loadedHalls.has(room.id);
  const tank = hallReady ? getTankById(activeTankId) : undefined;
  const customization = state.tanks[activeTankId];
  const pendingSceneRef = useRef(initial.pendingScene);

  // 展示室に入るときに、その展示室の水槽・水景・生き物を読み、水槽の設定をそろえて魚を生む。
  useEffect(() => {
    if (phase.kind === "map" || hallReady) return;
    let cancelled = false;
    loadHall(room.id)
      .then(() => {
        if (cancelled) return;
        const hallTanks = room.tankIds.map((tankId) => getTankById(tankId)!);
        const prepare = (saved: Record<string, AquariumCustomization>) => {
          const tanks = normalizeHallCustomizations(saved, hallTanks);
          // ?theme= で開いた水景は、その水槽の設定がそろってから当てる。
          const pending = pendingSceneRef.current;
          const themed = pending && hallTanks.find((item) => item.id === pending.tankId);
          if (themed && tanks[themed.id]!.layout.sceneId !== pending.sceneId) {
            tanks[themed.id] = { ...tanks[themed.id]!, layout: getDefaultLayout(themed, pending.sceneId) };
          }
          return tanks;
        };
        const tanks = prepare(stateRef.current.tanks);
        for (const item of hallTanks) {
          fishRefs[item.id] ??= { current: createFishFromStock(tanks[item.id]!.stock, item) };
        }
        setState((current) => ({ ...current, tanks: prepare(current.tanks) }));
        pendingSceneRef.current = undefined;
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
    void import("./render/assets").then(({ releaseTexturesExcept }) => releaseTexturesExcept(getHallTextureUrls(room.id)));
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
  lastTankByRoom.current[room.id] = activeTankId;

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
    for (const [tankId, ref] of Object.entries(fishRefs)) {
      const item = getTankById(tankId);
      const saved = state.tanks[tankId];
      if (!item || !saved) continue;
      const next = reconcileFishStock(ref.current, saved.stock, item);
      const kept = new Set(next.map((fish) => fish.id));
      for (const fish of ref.current) if (!kept.has(fish.id)) forgetMotionState(fish.id);
      ref.current = next;
    }
  }, [fishRefs, state.tanks, loadedHalls]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(AQUARIUM_STATE_STORAGE_KEY, JSON.stringify(state));
        for (const key of DISCARDED_STORAGE_KEYS) window.localStorage.removeItem(key);
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
    // 水槽の描画部品を初めて読むときも、寄り終えた展示室を映したまま、読めたらすぐ水槽を重ねる
    // （トランジションにしないと、React が待つ表示を挟むぶん、初回だけ 0.3 秒ほど重ねるのが遅れる）。
    startTransition(() => {
      setState((current) => ({ ...current, activeTankId: tankId }));
      setPhase({ kind: "toTank", tankReady: false });
    });
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
      const index = roomTankIds.indexOf(state.activeTankId);
      const step = direction === "next" ? 1 : -1;
      const to = roomTankIds[(index + step + roomTankIds.length) % roomTankIds.length]!;
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
      const saved = hall.tankIds.includes(current.activeTankId) ? current.activeTankId : undefined;
      return { ...current, activeTankId: last ?? saved ?? hall.tankIds[0]! };
    });
    setPhase({ kind: "room" });
  }, []);
  // 展示室から館内図へは、その展示室の階の一覧に戻る。
  const showMap = useCallback(() => {
    playSfx("room_return");
    setPhase({ kind: "map", floorId: getHallOfTank(stateRef.current.activeTankId).floorId });
  }, []);
  const showFloor = useCallback((floorId: string) => setPhase({ kind: "map", floorId }), []);
  const showBuilding = useCallback((buildingId?: string) => setPhase({ kind: "map", buildingId }), []);
  // 展示室で Esc を押すと、その階の一覧へ、階の一覧ではその建物の断面図へ戻る（水槽画面の Esc は TankScreen が扱う）。
  const mapFloorId = phase.kind === "map" ? phase.floorId : undefined;
  useEffect(() => {
    if (phase.kind !== "room" && !(mapFloorId && !zukan)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      if (phase.kind === "room") showMap();
      else showBuilding(getFloorById(mapFloorId)?.buildingId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapFloorId, phase.kind, showBuilding, showMap, zukan]);

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
    toMap: (floorId, buildingId) => setPhase({ kind: "map", floorId, buildingId }),
    toHall: (hallId) => {
      const current = phaseRef.current;
      // 水槽から、その水槽のある展示室へ戻るときは引く演出を使う。
      if (current.kind === "tank" && getHallOfTank(activeTankRef.current).id === hallId) {
        setPhase({ kind: "toRoom", returningFrom: activeTankRef.current, roomReady: false });
      } else enterHall(hallId);
    },
    toTank: (tankId) => {
      const current = phaseRef.current;
      setState((value) => ({ ...value, activeTankId: tankId }));
      if (current.kind === "room" && getHallOfTank(tankId).id === getHallOfTank(activeTankRef.current).id) {
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
          buildingId={phase.buildingId}
          floorId={phase.floorId}
          lastHallId={visitedRef.current ? room.id : undefined}
          onSelectBuilding={showBuilding}
          onSelectFloor={showFloor}
          onEnterHall={enterHall}
          onOpenZukan={() => openZukan(null)}
          onToggleSound={toggleSound}
          soundEnabled={state.preferences.soundEnabled}
          tanks={state.tanks}
          unseen={unseen}
        />
      ) : null}
      {phase.kind !== "map" && !hallReady ? <HallLoading /> : null}
      {/* 遅れて読む画面（展示室・水槽・図鑑）は、それぞれ自分の Suspense で待つ。ひとつにまとめると、
          ある画面の描画部品を初めて読む間、すでに映っている画面まで React に隠される（展示室から初めて
          水槽へ寄り終えた瞬間に暗転し、戻った展示室が灯る演出をやり直して明るく光る）。
          前の画面を重ねて残している間は、待つ表示を出さない。 */}
      <Suspense fallback={showTank ? null : <HallLoading />}>
      {showRoom && hallReady ? (
        <FishRoom
          active={phase.kind === "room" || phase.kind === "toRoom"}
          fishRefs={fishRefs}
          key={`room-${room.id}`}
          room={getHallLayout(room.id)!}
          onEnterTank={enterTank}
          onReady={handleRoomReady}
          returningFrom={returningFrom}
          tanks={state.tanks}
          unseen={unseen}
        />
      ) : null}
      </Suspense>
      {/* 部屋の後ろに置き、寄っている間は .room-scroll.zooming から隠す。 */}
      {phase.kind === "room" ? (
        <>
          <button className="hud-button room-map-button" onClick={showMap} title="館内図へ（Esc）" type="button">
            <MapIcon /><span className="hud-label">館内図</span>
          </button>
          <SoundToggle className="room-sound" enabled={state.preferences.soundEnabled} onToggle={toggleSound} />
        </>
      ) : null}
      <Suspense fallback={showRoom ? null : <HallLoading />}>
      {showTank && tank && customization ? (
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
          onSeen={() => markSeen(tank.id)}
          preferences={state.preferences}
          saveFailed={saveFailed}
          tank={tank}
          unseenSpeciesIds={unseen ? unseen[tank.id] ?? NO_SPECIES : undefined}
        />
      ) : null}
      </Suspense>
      {/* 図鑑は館内図か水槽の上に開くので、読む間は下の画面をそのまま見せる。 */}
      <Suspense fallback={null}>
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
