import { lazy, useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  fishCatalog,
  getDefaultLayout,
  getSceneById,
  getTankById,
  setStockCount,
  type AquariumCustomization,
  type AquariumPersistedState,
  type FishInstance,
  type LightingId,
  type TankDefinition,
} from "../core";
import { getHallOfTank } from "../core/museum";
import type { SwitchDirection } from "../navigation";
import type { ViewControl } from "../render/AquariumCanvas";
import { getScenePlateUrl } from "../render/assetUrls";
import { playSfx } from "../audio/sfx";
import { AquariumControls, LIGHTING_OPTIONS } from "./AquariumControls";
import { SoundToggle } from "./SoundToggle";
import {
  BackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  FitIcon,
  MinusIcon,
  PlusIcon,
  SettingsIcon,
} from "./icons";

const AquariumCanvas = lazy(() => import("../render/AquariumCanvas").then((module) => ({ default: module.AquariumCanvas })));
const HUD_IDLE_MS = 3500;
const EDIT_IDLE_MS = 45_000;

export function TankScreen({
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
  onSeen,
  unseenSpeciesIds,
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
  /** この水槽を見た。今の種を既読にする。 */
  onSeen: () => void;
  /** この水槽の、まだ見ていない種。水槽ごとの種の並びを読めるまでは undefined。 */
  unseenSpeciesIds: readonly string[] | undefined;
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
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  editingRef.current = editing;
  onBackToRoomRef.current = onBackToRoom;
  onSwitchTankRef.current = onSwitchTank;
  const activeScene = getSceneById(customization.layout.sceneId);
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const speciesList = useRef(tank.species
    .map((slot) => fishCatalog[slot.speciesId])
    .filter((species) => species !== undefined)).current;

  // 水槽に入った時点で未読だった種を控えてから、この水槽を既読にする（館内図や展示室の NEW は、ここで消える）。
  // この画面は水槽ごとに作り直すので、隣の水槽へ移ったときや URL で直接開いたときも、入ったことになる。
  // 控えた種の行には、水槽を出るまで NEW を出し続ける（何が新しいかを見られるように）。
  const [newSpeciesIds, setNewSpeciesIds] = useState<readonly string[]>();
  useEffect(() => {
    if (newSpeciesIds || !unseenSpeciesIds) return;
    setNewSpeciesIds(unseenSpeciesIds);
    onSeenRef.current();
  }, [newSpeciesIds, unseenSpeciesIds]);

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
  const roomTanks = getHallOfTank(tank.id).tankIds.map((tankId) => getTankById(tankId)!);
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
        newSpeciesIds={newSpeciesIds}
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
          stock: setStockCount(current.stock, speciesId, count, tank),
        }))}
        preferences={preferences}
        saveFailed={saveFailed}
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
