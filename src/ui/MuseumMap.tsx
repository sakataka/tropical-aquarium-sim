import type { CSSProperties } from "react";
import { getTankById } from "../core";
import { getHallsOnFloor, museum } from "../core/museum";
import { playSfx } from "../audio/sfx";
import { SoundToggle } from "./SoundToggle";

// 館内図。地上から下へ階を重ねた断面で、下りるほど遠く深い水になる。
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
  const floorCount = museum.floors.length;
  return (
    <main className="museum-map">
      <header className="map-heading">
        <p className="map-eyebrow">{museum.exhibitName}</p>
        <h1>{museum.displayName}</h1>
        <p className="map-lede">{museum.lede}</p>
      </header>
      <ol aria-label="館内図" className="map-section">
        {museum.floors.map((floor, index) => {
          const halls = getHallsOnFloor(floor.id);
          return (
            <li
              className={halls.length > 0 ? "map-floor" : "map-floor empty"}
              data-floor={floor.id}
              key={floor.id}
              style={{ "--depth": floorCount > 1 ? index / (floorCount - 1) : 0 } as CSSProperties}
            >
              <div className="floor-tag">
                <strong>{floor.label}</strong>
                <em>{floor.exhibitLabel}</em>
              </div>
              <div className="floor-body">
                <h2>{floor.displayName}<em>{floor.exhibitName}</em></h2>
                <p>{floor.description}</p>
                {halls.length > 0 ? (
                  <div className="floor-halls">
                    {halls.map((hall) => {
                      const tanks = hall.tanks.map((placement) => getTankById(placement.tankId)!);
                      const species = new Set(tanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId))).size;
                      return (
                        <button
                          className={hall.id === lastHallId ? "hall-card last" : "hall-card"}
                          key={hall.id}
                          onClick={() => { playSfx("tank_switch"); onEnterHall(hall.id); }}
                          type="button"
                        >
                          <strong>{hall.displayName}</strong>
                          <small>{tanks.length}水槽 · {species}種</small>
                          <span className="hall-tanks">{tanks.map((tank) => tank.displayName).join("、")}</span>
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
          );
        })}
      </ol>
      <SoundToggle className="map-sound" enabled={soundEnabled} onToggle={onToggleSound} />
    </main>
  );
}
