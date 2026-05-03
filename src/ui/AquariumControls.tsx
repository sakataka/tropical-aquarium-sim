import type { FishInstance, FishSpeciesDefinition, TankDefinition } from "../core";

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  fish: FishInstance[];
  tank: TankDefinition;
  paused: boolean;
  viewMode: "tank" | "dev";
  selectedSpeciesId: string;
  onSelectedSpeciesChange: (speciesId: string) => void;
  onAddFish: () => void;
  onRemoveFish: (fishId: string) => void;
  onFeed: () => void;
  onTogglePaused: () => void;
  onViewModeChange: (mode: "tank" | "dev") => void;
};

export function AquariumControls({
  speciesList,
  fish,
  tank,
  paused,
  viewMode,
  selectedSpeciesId,
  onSelectedSpeciesChange,
  onAddFish,
  onRemoveFish,
  onFeed,
  onTogglePaused,
  onViewModeChange,
}: AquariumControlsProps) {
  return (
    <aside className="control-panel">
      <div className="panel-heading">
        <p className="app-label">2D Tropical Aquarium</p>
        <h1>60cm水槽</h1>
        <p>
          {tank.widthCm} x {tank.heightCm} x {tank.depthCm}cm / {fish.length}匹
        </p>
      </div>

      <div className="segmented-control" aria-label="表示切替">
        <button
          className={viewMode === "tank" ? "active" : ""}
          onClick={() => onViewModeChange("tank")}
          type="button"
        >
          水槽
        </button>
        <button
          className={viewMode === "dev" ? "active" : ""}
          onClick={() => onViewModeChange("dev")}
          type="button"
        >
          Dev
        </button>
      </div>

      <label className="field">
        <span>追加する魚種</span>
        <select
          value={selectedSpeciesId}
          onChange={(event) => onSelectedSpeciesChange(event.currentTarget.value)}
        >
          {speciesList.map((species) => (
            <option key={species.id} value={species.id}>
              {species.displayName} / {species.realBodyLengthCm}cm
            </option>
          ))}
        </select>
      </label>

      <div className="button-grid">
        <button onClick={onAddFish} type="button">
          魚を追加
        </button>
        <button onClick={onFeed} type="button">
          エサやり
        </button>
        <button onClick={onTogglePaused} type="button">
          {paused ? "再開" : "一時停止"}
        </button>
      </div>

      <div className="fish-list">
        <h2>魚一覧</h2>
        {fish.map((item) => {
          const species = speciesList.find((candidate) => candidate.id === item.speciesId);
          return (
            <div className="fish-row" key={item.id}>
              <div>
                <span>{species?.displayName ?? item.speciesId}</span>
                <small>
                  {getBehaviorLabel(item.behaviorMode)} /{" "}
                  {getTargetKindLabel(item.targetKind)} / z {item.depth.toFixed(2)}
                </small>
              </div>
              <button
                aria-label={`${species?.displayName ?? item.speciesId}を削除`}
                className="remove-fish-button"
                onClick={() => onRemoveFish(item.id)}
                type="button"
              >
                削除
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function getBehaviorLabel(mode: FishInstance["behaviorMode"]): string {
  if (mode === "kick") {
    return "キック";
  }
  if (mode === "coast") {
    return "惰性";
  }
  if (mode === "feed") {
    return "餌へ";
  }
  return "停止";
}

function getTargetKindLabel(kind: FishInstance["targetKind"]): string {
  if (kind === "structure") {
    return "構造物";
  }
  if (kind === "edgeCruise") {
    return "壁沿い";
  }
  if (kind === "surfaceVisit") {
    return "表層";
  }
  if (kind === "feed") {
    return "餌";
  }
  return "遊泳";
}
