import { useState, type CSSProperties } from "react";
import type { AquariumCustomization } from "../core";
import {
  getHallSlotsOnFloor,
  getTankSummary,
  mapImageUrl,
  museum,
  type HallSlot,
  type HallSummary,
} from "../core/museum";
import { playSfx } from "../audio/sfx";
import { HallPreview } from "./HallPreview";
import { BookIcon } from "./icons";
import { SoundToggle } from "./SoundToggle";

/** 触れている階と展示室。断面図とフロアガイドで同じものを光らせる。 */
type Active = { floorId: string; hallId?: string };

// 館内図。館の断面図の絵に、階ごとの展示室の枠を重ねて選べるようにする。
// 開いている展示室には、その展示室の画面の縮小版を映す。
// まだ展示室のない枠も、館の構成として「準備中」で見せる。
export function MuseumMap({
  lastHallId,
  soundEnabled,
  tanks,
  onEnterHall,
  onOpenZukan,
  onToggleSound,
}: {
  /** 前回見ていた展示室。目印を付ける。 */
  lastHallId?: string;
  soundEnabled: boolean;
  /** 水槽ごとの今の設定。縮小版に今の水景を映す（入ったことのない水槽は既定の水景）。 */
  tanks: Record<string, AquariumCustomization>;
  onEnterHall: (hallId: string) => void;
  onOpenZukan: () => void;
  onToggleSound: () => void;
}) {
  const [active, setActive] = useState<Active>();
  const enter = (hallId: string) => { playSfx("tank_switch"); onEnterHall(hallId); };
  const floors = museum.floors.map((floor) => ({ floor, slots: getHallSlotsOnFloor(floor.id) }));
  const highlight = (next: Active) => ({
    onPointerEnter: () => setActive(next),
    onPointerLeave: () => setActive((current) =>
      current?.floorId === next.floorId && current.hallId === next.hallId ? undefined : current),
  });
  const { width, height, focus } = museum.map;
  const plateStyle = {
    "--map-aspect": `${width} / ${height}`,
    "--map-ratio": width / height,
    "--focus-aspect": `${focus.width} / ${height}`,
    "--focus-scale": width / focus.width,
    "--focus-left": -focus.x / focus.width,
  } as CSSProperties;

  return (
    <main className="museum-map">
      <div className="map-layout">
        <header className="map-heading">
          <p className="map-eyebrow">{museum.exhibitName}</p>
          <h1>{museum.displayName}</h1>
          <p className="map-lede">{museum.lede}</p>
          <button className="map-zukan" onClick={onOpenZukan} type="button">
            <BookIcon /><span>図鑑</span><small>館の生き物を調べる</small>
          </button>
        </header>
        <figure className="map-plate" style={plateStyle}>
          <div className="map-canvas">
            <img alt="水の生き物館の断面図。地上4階と地下2階に、展示室が並ぶ。" draggable={false} src={mapImageUrl} />
            {floors.map(({ floor, slots }) => (
              <div
                className={floor.id === active?.floorId ? "map-zone active" : "map-zone"}
                data-floor={floor.id}
                key={floor.id}
                style={toPercent(floor.mapArea)}
              >
                <span aria-hidden="true" className="zone-sign">{floor.shortLabel}</span>
              </div>
            ))}
            {floors.flatMap(({ slots }) => slots.map((slot) => (
              <MapHall
                active={slot.id === active?.hallId}
                key={slot.id}
                last={slot.id === lastHallId}
                onEnter={enter}
                slot={slot}
                tanks={tanks}
                {...highlight({ floorId: slot.floor.id, hallId: slot.id })}
              />
            )))}
          </div>
        </figure>
        <ol aria-label="フロアガイド" className="map-directory">
          {floors.map(({ floor, slots }) => (
            <li
              className={[
                "map-floor",
                slots.some((slot) => slot.room) ? "" : "empty",
                floor.id === active?.floorId ? "active" : "",
              ].filter(Boolean).join(" ")}
              data-floor={floor.id}
              key={floor.id}
              onBlur={() => setActive(undefined)}
              {...highlight({ floorId: floor.id })}
            >
              <div className="floor-tag">
                <strong>{floor.shortLabel}</strong>
                <span>{floor.label}</span>
              </div>
              <div className="floor-body">
                <h2>{floor.displayName}<em>{floor.exhibitName}</em></h2>
                <p>{floor.description}</p>
                <div className="floor-halls">
                  {slots.map((slot) => slot.room ? (
                    <HallCard
                      key={slot.id}
                      last={slot.id === lastHallId}
                      onEnter={enter}
                      onFocus={() => setActive({ floorId: floor.id, hallId: slot.id })}
                      room={slot.room}
                      {...highlight({ floorId: floor.id, hallId: slot.id })}
                    />
                  ) : (
                    <p className="hall-soon" key={slot.id}>{slot.displayName}<span>準備中</span></p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <SoundToggle className="map-sound" enabled={soundEnabled} onToggle={onToggleSound} />
    </main>
  );
}

// 断面図の上の、ひとつの展示室の枠。開いている展示室は縮小版を映して入れるようにする。
// 操作はフロアガイドのボタンでもできるので、こちらはポインター用にしてフォーカス順に入れない。
function MapHall({ active, last, onEnter, onPointerEnter, onPointerLeave, slot, tanks }: {
  active: boolean;
  last: boolean;
  onEnter: (hallId: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  slot: HallSlot;
  tanks: Record<string, AquariumCustomization>;
}) {
  const className = ["map-hall", slot.room ? "open" : "soon", active ? "active" : "", last ? "last" : ""]
    .filter(Boolean).join(" ");
  const style = toPercent(slot.mapArea);
  if (!slot.room) {
    return (
      <div className={className} data-hall={slot.id} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={style}>
        <span aria-hidden="true" className="hall-label soon">{slot.displayName}<small>準備中</small></span>
      </div>
    );
  }
  const room = slot.room;
  const { tanks: hallTanks, species } = hallStats(room);
  return (
    <button
      aria-hidden="true"
      className={className}
      data-hall={slot.id}
      onClick={() => onEnter(room.id)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={style}
      tabIndex={-1}
      type="button"
    >
      <HallPreview aspect={slot.mapArea.width / slot.mapArea.height} hall={room} tanks={tanks} />
      <span className="hall-label">
        {room.displayName}
        <small>{hallTanks.length}水槽 · {species}種{last ? " · 前回" : ""}</small>
      </span>
    </button>
  );
}

function HallCard({ last, onEnter, onFocus, onPointerEnter, onPointerLeave, room }: {
  last: boolean;
  onEnter: (hallId: string) => void;
  onFocus: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  room: HallSummary;
}) {
  const { tanks, species } = hallStats(room);
  const tankNames = tanks.map((tank) => tank.displayName).join("、");
  return (
    <button
      className={last ? "hall-card last" : "hall-card"}
      onClick={() => onEnter(room.id)}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      type="button"
    >
      <strong>{room.displayName}</strong>
      <small>{tanks.length}水槽 · {species}種</small>
      <span className="hall-tanks" title={tankNames}>{tankNames}</span>
      {last ? <em className="hall-last">前回の展示室</em> : null}
    </button>
  );
}

function toPercent(area: { x: number; y: number; width: number; height: number }): CSSProperties {
  const { width, height } = museum.map;
  return {
    left: `${(area.x / width) * 100}%`,
    top: `${(area.y / height) * 100}%`,
    width: `${(area.width / width) * 100}%`,
    height: `${(area.height / height) * 100}%`,
  };
}

function hallStats(hall: HallSummary) {
  return { tanks: hall.tanks.flatMap((placement) => getTankSummary(placement.tankId) ?? []), species: hall.speciesCount };
}
