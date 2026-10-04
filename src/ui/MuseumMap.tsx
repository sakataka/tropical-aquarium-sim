import { useState, type CSSProperties } from "react";
import { getTankById } from "../core";
import { getHallsOnFloor, museum, type MuseumFloor } from "../core/museum";
import type { FishRoomDefinition } from "../core/room";
import { playSfx } from "../audio/sfx";
import { getMuseumMapImageUrl } from "../render/assets";
import { SoundToggle } from "./SoundToggle";

const mapImageUrl = getMuseumMapImageUrl(museum.map.image);

// 館内図。館の断面図の絵に、階ごとの展示フロアを重ねて選べるようにする。
// 横のフロアガイドと断面図は、どちらかに触れると同じ階が光る。
// まだ展示室のない階も、館の構成として「準備中」で見せる。
export function MuseumMap({
  lastHallId,
  soundEnabled,
  onEnterHall,
  onToggleSound,
}: {
  /** 前回見ていた展示室。目印を付ける。 */
  lastHallId?: string;
  soundEnabled: boolean;
  onEnterHall: (hallId: string) => void;
  onToggleSound: () => void;
}) {
  const [activeFloorId, setActiveFloorId] = useState<string>();
  const enter = (hallId: string) => { playSfx("tank_switch"); onEnterHall(hallId); };
  const floors = museum.floors.map((floor) => ({ floor, halls: getHallsOnFloor(floor.id) }));
  const highlight = (floorId: string) => ({
    onPointerEnter: () => setActiveFloorId(floorId),
    onPointerLeave: () => setActiveFloorId((current) => (current === floorId ? undefined : current)),
  });

  return (
    <main className="museum-map">
      <div className="map-layout">
        <header className="map-heading">
          <p className="map-eyebrow">{museum.exhibitName}</p>
          <h1>{museum.displayName}</h1>
          <p className="map-lede">{museum.lede}</p>
        </header>
        <figure
          className="map-plate"
          style={{ aspectRatio: `${museum.map.width} / ${museum.map.height}` }}
        >
          <img alt="水の生き物館の断面図。地上から地下4階まで、階ごとに水槽の並ぶ展示フロアがある。" draggable={false} src={mapImageUrl} />
          {floors.map(({ floor, halls }) => (
            <MapZone
              active={floor.id === activeFloorId}
              floor={floor}
              halls={halls}
              key={floor.id}
              lastHallId={lastHallId}
              onEnter={enter}
              {...highlight(floor.id)}
            />
          ))}
        </figure>
        <ol aria-label="フロアガイド" className="map-directory">
          {floors.map(({ floor, halls }) => (
            <li
              className={[
                "map-floor",
                halls.length > 0 ? "" : "empty",
                floor.id === activeFloorId ? "active" : "",
              ].filter(Boolean).join(" ")}
              data-floor={floor.id}
              key={floor.id}
              onFocus={() => setActiveFloorId(floor.id)}
              onBlur={() => setActiveFloorId(undefined)}
              {...highlight(floor.id)}
            >
              <div className="floor-tag">
                <strong>{floor.shortLabel}</strong>
                <span>{floor.label}</span>
              </div>
              <div className="floor-body">
                <h2>{floor.displayName}<em>{floor.exhibitName}</em></h2>
                <p>{floor.description}</p>
                {halls.length > 0 ? (
                  <div className="floor-halls">
                    {halls.map((hall) => {
                      const { tanks, species } = hallStats(hall);
                      const tankNames = tanks.map((tank) => tank.displayName).join("、");
                      return (
                        <button
                          className={hall.id === lastHallId ? "hall-card last" : "hall-card"}
                          key={hall.id}
                          onClick={() => enter(hall.id)}
                          type="button"
                        >
                          <strong>{hall.displayName}</strong>
                          <small>{tanks.length}水槽 · {species}種</small>
                          <span className="hall-tanks" title={tankNames}>{tankNames}</span>
                          {hall.id === lastHallId ? <em className="hall-last">前回の展示室</em> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="floor-soon">準備中</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <SoundToggle className="map-sound" enabled={soundEnabled} onToggle={onToggleSound} />
    </main>
  );
}

// 断面図の上の、ひとつの階の展示フロア。展示室が複数あれば横に等分する。
// 操作はフロアガイドのボタンでもできるので、こちらはポインター用にしてフォーカス順に入れない。
function MapZone({
  active,
  floor,
  halls,
  lastHallId,
  onEnter,
  onPointerEnter,
  onPointerLeave,
}: {
  active: boolean;
  floor: MuseumFloor;
  halls: FishRoomDefinition[];
  lastHallId?: string;
  onEnter: (hallId: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const { width, height } = museum.map;
  const area = floor.mapArea;
  const style = {
    left: `${(area.x / width) * 100}%`,
    top: `${(area.y / height) * 100}%`,
    width: `${(area.width / width) * 100}%`,
    height: `${(area.height / height) * 100}%`,
  } satisfies CSSProperties;
  const className = ["map-zone", halls.length > 0 ? "open" : "soon", active ? "active" : ""].filter(Boolean).join(" ");

  return (
    <div className={className} data-floor={floor.id} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={style}>
      <span aria-hidden="true" className="zone-sign">{floor.shortLabel}</span>
      {halls.length > 0 ? halls.map((hall) => {
        const { tanks, species } = hallStats(hall);
        return (
          <button
            aria-hidden="true"
            className={hall.id === lastHallId ? "map-hotspot last" : "map-hotspot"}
            key={hall.id}
            onClick={() => onEnter(hall.id)}
            tabIndex={-1}
            type="button"
          >
            <span className="hotspot-plate">
              <strong>{hall.displayName}</strong>
              <small>{tanks.length}水槽 · {species}種{hall.id === lastHallId ? " · 前回" : ""}</small>
            </span>
          </button>
        );
      }) : (
        <span aria-hidden="true" className="zone-soon">{floor.displayName} · 準備中</span>
      )}
    </div>
  );
}

function hallStats(hall: FishRoomDefinition) {
  const tanks = hall.tanks.map((placement) => getTankById(placement.tankId)!);
  const species = new Set(tanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId))).size;
  return { tanks, species };
}
