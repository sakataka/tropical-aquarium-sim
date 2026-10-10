import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AquariumCustomization } from "../core";
import {
  buildings,
  defaultBuilding,
  getBuildingById,
  getBuildingOfFloor,
  getFloorById,
  getFloorOfHall,
  getFloorSpeciesCount,
  getHallById,
  getHallLayout,
  getHallSlotsOnFloor,
  getMapImageUrl,
  getTankSummary,
  isFloorLoaded,
  loadFloor,
  museum,
  type HallSlot,
  type HallSummary,
  type MuseumBuilding,
  type MuseumFloor,
} from "../core/museum";
import { playSfx } from "../audio/sfx";
import { HallPreview } from "./HallPreview";
import { BackIcon, BookIcon, ChevronRightIcon } from "./icons";
import { SoundToggle } from "./SoundToggle";

/** 階の一覧の縮小版の縦横比。展示室の絵より少し横長にして、水槽の並びを大きく見せる。 */
const PREVIEW_ASPECT = 2;

// 館内図。2段になっている。
// 1段目は建物の断面図とフロアガイドで、階を選ぶ。建物が複数あれば、上の切り替えで建物を選ぶ。
// 展示室が増えても、ここに並ぶのは1つの建物の階の数だけ。
// 2段目は選んだ階の展示室の一覧で、開いている展示室には、その展示室の画面の縮小版を映す。
// 縮小版に要る部屋の絵とガラスの位置は、階を開くときにその階の分だけ読む。
export function MuseumMap({
  buildingId,
  floorId,
  lastHallId,
  soundEnabled,
  tanks,
  onEnterHall,
  onOpenZukan,
  onSelectBuilding,
  onSelectFloor,
  onToggleSound,
}: {
  /** 断面図を見せる建物。なければ最初の建物（本館）。階を開いている間は使わない。 */
  buildingId?: string;
  /** 開いている階。なければ建物の断面図。 */
  floorId?: string;
  /** 前回見ていた展示室。目印を付ける。 */
  lastHallId?: string;
  soundEnabled: boolean;
  /** 水槽ごとの今の設定。縮小版に今の水景を映す（入ったことのない水槽は既定の水景）。 */
  tanks: Record<string, AquariumCustomization>;
  onEnterHall: (hallId: string) => void;
  onOpenZukan: () => void;
  /** 建物の断面図へ。 */
  onSelectBuilding: (buildingId: string) => void;
  onSelectFloor: (floorId: string) => void;
  onToggleSound: () => void;
}) {
  const floor = getFloorById(floorId);
  const building = getBuildingById(buildingId) ?? defaultBuilding;
  const scrollRef = useRef<HTMLElement>(null);
  // 階から建物の断面図へ戻ったら、いま見ていた階のフロアガイドにフォーカスを戻す。
  const returnFloorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (floor) {
      returnFloorRef.current = floor.id;
      return;
    }
    const back = returnFloorRef.current;
    returnFloorRef.current = undefined;
    if (back) scrollRef.current?.querySelector<HTMLElement>(`.map-floor[data-floor="${back}"] button`)?.focus({ preventScroll: true });
  }, [floor]);

  const enter = (hallId: string) => { playSfx("tank_switch"); onEnterHall(hallId); };
  const selectFloor = (next: string) => { playSfx("ui_tap"); onSelectFloor(next); };
  const selectBuilding = (next: string) => { playSfx("ui_tap"); onSelectBuilding(next); };

  return (
    <main className={floor ? "museum-map floor-view" : "museum-map"} ref={scrollRef}>
      {floor ? (
        <FloorView
          floor={floor}
          key={floor.id}
          lastHallId={lastHallId}
          onBack={() => selectBuilding(floor.buildingId)}
          onEnterHall={enter}
          onSelectFloor={selectFloor}
          tanks={tanks}
        />
      ) : (
        <MuseumOverview
          building={building}
          lastHallId={lastHallId}
          onEnterHall={enter}
          onOpenZukan={onOpenZukan}
          onSelectBuilding={selectBuilding}
          onSelectFloor={selectFloor}
        />
      )}
      <SoundToggle className="map-sound" enabled={soundEnabled} onToggle={onToggleSound} />
    </main>
  );
}

// 1段目。建物の断面図に階の帯を重ね、横（狭い画面では下）にフロアガイドを置く。
function MuseumOverview({ building, lastHallId, onEnterHall, onOpenZukan, onSelectBuilding, onSelectFloor }: {
  building: MuseumBuilding;
  lastHallId?: string;
  onEnterHall: (hallId: string) => void;
  onOpenZukan: () => void;
  onSelectBuilding: (buildingId: string) => void;
  onSelectFloor: (floorId: string) => void;
}) {
  const [activeFloor, setActiveFloor] = useState<string>();
  const lastHall = getHallById(lastHallId);
  const lastFloor = lastHallId ? getFloorOfHall(lastHallId) : undefined;
  const lastFloorId = lastFloor?.id;
  // 触れた階は、開く前に配置を先読みしておく（小さなチャンク）。
  const highlight = (id: string) => ({
    onPointerEnter: () => { setActiveFloor(id); void loadFloor(id).catch(() => undefined); },
    onPointerLeave: () => setActiveFloor((current) => current === id ? undefined : current),
  });
  const { width, height, focus } = building.map;
  const plateStyle = {
    "--map-aspect": `${width} / ${height}`,
    "--map-ratio": width / height,
    "--focus-aspect": `${focus.width} / ${height}`,
    "--focus-scale": width / focus.width,
    "--focus-left": -focus.x / focus.width,
  } as CSSProperties;

  return (
    <div className="map-layout map-level">
      <header className="map-heading">
        <p className="map-eyebrow">{museum.exhibitName}</p>
        <h1>{museum.displayName}</h1>
        <p className="map-lede">{museum.lede}</p>
        <div className="map-actions">
          <button className="map-zukan" onClick={onOpenZukan} type="button">
            <BookIcon /><span>図鑑</span><small>館の生き物を調べる</small>
          </button>
          {lastHall ? (
            <button className="map-resume" onClick={() => onEnterHall(lastHall.id)} type="button">
              <small>前回の展示室</small><span>{lastHall.displayName}</span><ChevronRightIcon />
            </button>
          ) : null}
        </div>
        {buildings.length > 1 ? (
          <nav aria-label="建物を選ぶ" className="map-buildings">
            {buildings.map((item) => {
              const open = buildingStats(item).open;
              return (
                <button
                  aria-current={item.id === building.id ? "page" : undefined}
                  data-building={item.id}
                  key={item.id}
                  onClick={() => item.id !== building.id && onSelectBuilding(item.id)}
                  type="button"
                >
                  <span>{item.displayName}</span>
                  <small>{open === 0 ? "準備中" : `${open}展示室`}{item.id === lastFloor?.buildingId ? " · 前回" : ""}</small>
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>
      <figure className="map-plate map-swap" key={building.id} style={plateStyle}>
        <div className="map-canvas">
          <img
            alt={`${building.displayName}の断面図。${building.floors.map((floor) => `${floor.label}「${floor.displayName}」`).join("、")}。`}
            draggable={false}
            src={getMapImageUrl(building.id)}
          />
          {/* 階の帯。操作はフロアガイドのボタンでもできるので、こちらはポインター用にしてフォーカス順に入れない。 */}
          {building.floors.map((floor) => {
            const { open } = floorStats(floor);
            return (
              <button
                aria-hidden="true"
                className={[
                  "map-zone",
                  open === 0 ? "soon" : "",
                  floor.id === activeFloor ? "active" : "",
                ].filter(Boolean).join(" ")}
                data-floor={floor.id}
                key={floor.id}
                onClick={() => onSelectFloor(floor.id)}
                style={toPercent(floor.mapArea, building)}
                tabIndex={-1}
                type="button"
                {...highlight(floor.id)}
              >
                <span className="zone-sign">{floor.shortLabel}</span>
                <span className="zone-label">
                  {floor.displayName}
                  <small>{open === 0 ? "準備中" : `${open}室`}{floor.id === lastFloorId ? " · 前回" : ""}</small>
                </span>
              </button>
            );
          })}
        </div>
      </figure>
      <ol aria-label={`${building.displayName}のフロアガイド`} className="map-directory map-swap" key={`guide-${building.id}`}>
        {buildings.length > 1 ? (
          <li className="map-building-note">
            <strong>{building.displayName}<em>{building.exhibitName}</em></strong>
            <span>{building.description}</span>
          </li>
        ) : null}
        {building.floors.map((floor) => {
          const { slots, open, tankCount, speciesCount } = floorStats(floor);
          return (
            <li
              className={[
                "map-floor",
                open === 0 ? "empty" : "",
                floor.id === activeFloor ? "active" : "",
              ].filter(Boolean).join(" ")}
              data-floor={floor.id}
              key={floor.id}
              {...highlight(floor.id)}
            >
              <button
                onBlur={() => setActiveFloor(undefined)}
                onClick={() => onSelectFloor(floor.id)}
                onFocus={() => setActiveFloor(floor.id)}
                type="button"
              >
                <span className="floor-tag">
                  <strong>{floor.shortLabel}</strong>
                  <span>{floor.label}</span>
                </span>
                <span className="floor-body">
                  <span className="floor-name">{floor.displayName}<em>{floor.exhibitName}</em></span>
                  <span className="floor-meta">
                    {open === 0 ? "準備中" : `${open}展示室 · ${tankCount}水槽 · ${speciesCount}種`}
                    {floor.id === lastFloorId ? <em className="hall-last">前回</em> : null}
                  </span>
                  <span className="floor-hall-names">
                    {slots.map((slot) => (
                      <span className={slot.room ? undefined : "soon"} key={slot.id}>{slot.displayName}</span>
                    ))}
                  </span>
                </span>
                <ChevronRightIcon />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// 2段目。階の展示室を、縮小版つきのカードで並べる。上に階の切り替えを置く。
function FloorView({ floor, lastHallId, onBack, onEnterHall, onSelectFloor, tanks }: {
  floor: MuseumFloor;
  lastHallId?: string;
  onBack: () => void;
  onEnterHall: (hallId: string) => void;
  onSelectFloor: (floorId: string) => void;
  tanks: Record<string, AquariumCustomization>;
}) {
  const layoutReady = useFloorLayout(floor.id);
  const building = getBuildingOfFloor(floor);
  const { slots, open, tankCount, speciesCount } = floorStats(floor);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 階を開いたら見出しにフォーカスを移し、読み上げでも階が変わったと分かるようにする。
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <div className="floor-layout map-level">
      <nav aria-label="階を選ぶ" className="floor-nav">
        <button className="floor-back" onClick={onBack} title={`${building.displayName}の館内図へ（Esc）`} type="button">
          <BackIcon /><span>{buildings.length > 1 ? building.displayName : "館内図"}</span>
        </button>
        <ol className="floor-switch">
          {building.floors.map((item) => (
            <li key={item.id}>
              <button
                aria-current={item.id === floor.id ? "page" : undefined}
                data-floor={item.id}
                onClick={() => item.id !== floor.id && onSelectFloor(item.id)}
                onPointerEnter={() => void loadFloor(item.id).catch(() => undefined)}
                type="button"
              >
                <strong>{item.shortLabel}</strong><span>{item.displayName}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <header className="floor-heading">
        <p className="map-eyebrow">
          {buildings.length > 1 ? `${building.exhibitName} · ` : ""}{floor.exhibitLabel} · {floor.exhibitName}
        </p>
        <h1 ref={headingRef} tabIndex={-1}>{floor.label}<span>{floor.displayName}</span></h1>
        <p className="map-lede">{floor.description}</p>
        <p className="floor-summary">{open === 0 ? "準備中" : `${open}展示室 · ${tankCount}水槽 · ${speciesCount}種`}</p>
      </header>
      <ul aria-label={`${floor.label}の展示室`} className="floor-halls">
        {slots.map((slot) => (
          <li key={slot.id}>
            {slot.room ? (
              <HallCard
                last={slot.id === lastHallId}
                layoutReady={layoutReady}
                onEnter={onEnterHall}
                room={slot.room}
                tanks={tanks}
              />
            ) : (
              <SoonCard slot={slot} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 階の配置を読み、読み終えたら true。 */
function useFloorLayout(floorId: string): boolean {
  const [ready, setReady] = useState(() => isFloorLoaded(floorId));
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadFloor(floorId).then(() => { if (!cancelled) setReady(true); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [floorId, ready]);
  return ready;
}

function HallCard({ last, layoutReady, onEnter, room, tanks }: {
  last: boolean;
  layoutReady: boolean;
  onEnter: (hallId: string) => void;
  room: HallSummary;
  tanks: Record<string, AquariumCustomization>;
}) {
  const layout = layoutReady ? getHallLayout(room.id) : undefined;
  const tankNames = room.tankIds.flatMap((tankId) => getTankSummary(tankId)?.displayName ?? []);
  return (
    <button className={last ? "hall-card last" : "hall-card"} data-hall={room.id} onClick={() => onEnter(room.id)} type="button">
      <span className="hall-card-view">
        {layout ? <HallPreview aspect={PREVIEW_ASPECT} hall={layout} tanks={tanks} /> : null}
        {last ? <em className="hall-last">前回の展示室</em> : null}
      </span>
      <span className="hall-card-text">
        <strong>{room.displayName}</strong>
        <small>{room.tankIds.length}水槽 · {room.speciesCount}種</small>
        <span className="hall-tanks">{tankNames.join("、")}</span>
      </span>
    </button>
  );
}

function SoonCard({ slot }: { slot: HallSlot }) {
  return (
    <div className="hall-card soon">
      <span className="hall-card-view"><span>準備中</span></span>
      <span className="hall-card-text">
        <strong>{slot.displayName}</strong>
        <small>展示の準備をしています</small>
      </span>
    </div>
  );
}

function floorStats(floor: MuseumFloor) {
  const slots = getHallSlotsOnFloor(floor.id);
  const rooms = slots.flatMap((slot) => slot.room ?? []);
  return {
    slots,
    open: rooms.length,
    tankCount: rooms.reduce((sum, room) => sum + room.tankIds.length, 0),
    speciesCount: getFloorSpeciesCount(floor.id),
  };
}

function buildingStats(building: MuseumBuilding) {
  return { open: building.floors.reduce((sum, floor) => sum + floorStats(floor).open, 0) };
}

function toPercent(area: { x: number; y: number; width: number; height: number }, building: MuseumBuilding): CSSProperties {
  const { width, height } = building.map;
  return {
    left: `${(area.x / width) * 100}%`,
    top: `${(area.y / height) * 100}%`,
    width: `${(area.width / width) * 100}%`,
    height: `${(area.height / height) * 100}%`,
  };
}
