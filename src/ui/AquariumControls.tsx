import {
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  type AquariumCustomization,
  type AquariumEnvironmentCustomization,
  type AquariumPreset,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import type { CSSProperties } from "react";

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  fish: FishInstance[];
  tank: TankDefinition;
  customization: AquariumCustomization;
  presets: AquariumPreset[];
  activePresetId: string;
  saveStatus: string;
  paused: boolean;
  viewMode: "tank" | "guide";
  selectedSpeciesId: string;
  onSelectedSpeciesChange: (speciesId: string) => void;
  onAddFish: () => void;
  onRemoveFish: (fishId: string) => void;
  onSpeciesCountChange: (speciesId: string, count: number) => void;
  onEnvironmentChange: (environment: Partial<AquariumEnvironmentCustomization>) => void;
  onPresetChange: (presetId: string) => void;
  onResetCustomization: () => void;
  onFeed: () => void;
  onTogglePaused: () => void;
  onViewModeChange: (mode: "tank" | "guide") => void;
};

type MeterStyle = CSSProperties & {
  "--hunger": string;
};

export function AquariumControls({
  speciesList,
  fish,
  tank,
  customization,
  presets,
  activePresetId,
  saveStatus,
  paused,
  viewMode,
  selectedSpeciesId,
  onSelectedSpeciesChange,
  onAddFish,
  onRemoveFish,
  onSpeciesCountChange,
  onEnvironmentChange,
  onPresetChange,
  onResetCustomization,
  onFeed,
  onTogglePaused,
  onViewModeChange,
}: AquariumControlsProps) {
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const selectedCount = getStockCount(customization, selectedSpeciesId);
  const lightingLabel = getLightingLabel(customization.environment.lighting);

  return (
    <aside className="control-panel">
      <div className="panel-heading">
        <p className="app-label">Kono-etto Aquarium</p>
        <h1>60cm水槽</h1>
        <p>
          {tank.widthCm} x {tank.heightCm} x {tank.depthCm}cm / {fish.length}匹 / {lightingLabel}
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
          className={viewMode === "guide" ? "active" : ""}
          onClick={() => onViewModeChange("guide")}
          type="button"
        >
          図鑑
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
        <button
          disabled={selectedCount >= MAX_FISH_PER_SPECIES || totalFish >= MAX_TOTAL_FISH}
          onClick={onAddFish}
          type="button"
        >
          <span className="button-icon" aria-hidden="true">+</span>
          魚を追加
        </button>
        <button onClick={onFeed} type="button">
          <span className="button-icon food-icon" aria-hidden="true" />
          エサやり
        </button>
        <button onClick={onTogglePaused} type="button">
          <span className="button-icon" aria-hidden="true">{paused ? ">" : "II"}</span>
          {paused ? "再開" : "一時停止"}
        </button>
      </div>

      <section className="settings-section" aria-label="水槽設定">
        <div className="section-heading">
          <h2>水槽設定</h2>
          <span className="save-status">{saveStatus}</span>
        </div>

        <label className="field">
          <span>プリセット</span>
          <select
            value={activePresetId}
            onChange={(event) => onPresetChange(event.currentTarget.value)}
          >
            <option disabled value="custom">現在の組み合わせ</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="stock-editor">
          <div className="stock-editor-heading">
            <span>魚種構成</span>
            <small>
              {totalFish} / {MAX_TOTAL_FISH}匹
            </small>
          </div>
          {speciesList.map((species) => {
            const count = getStockCount(customization, species.id);
            return (
              <label className="stock-row" key={species.id}>
                <span>{species.displayName}</span>
                <input
                  max={MAX_FISH_PER_SPECIES}
                  min={0}
                  onChange={(event) =>
                    onSpeciesCountChange(species.id, Number(event.currentTarget.value))
                  }
                  type="number"
                  value={count}
                />
              </label>
            );
          })}
        </div>

        <div className="environment-grid">
          <label className="field">
            <span>背景</span>
            <select
              value={customization.environment.backgroundStyle}
              onChange={(event) =>
                onEnvironmentChange({
                  backgroundStyle: event.currentTarget
                    .value as AquariumEnvironmentCustomization["backgroundStyle"],
                })
              }
            >
              <option value="clear">クリア</option>
              <option value="deep">深め</option>
              <option value="bright">明るめ</option>
            </select>
          </label>

          <label className="field">
            <span>照明</span>
            <select
              value={customization.environment.lighting}
              onChange={(event) =>
                onEnvironmentChange({
                  lighting: event.currentTarget
                    .value as AquariumEnvironmentCustomization["lighting"],
                })
              }
            >
              <option value="natural">自然光</option>
              <option value="cool">クール</option>
              <option value="evening">夕景</option>
              <option value="night">夜景</option>
            </select>
          </label>

          <label className="field">
            <span>後景水草</span>
            <select
              value={customization.environment.rearPlants}
              onChange={(event) =>
                onEnvironmentChange({
                  rearPlants: event.currentTarget
                    .value as AquariumEnvironmentCustomization["rearPlants"],
                })
              }
            >
              <option value="off">なし</option>
              <option value="subtle">控えめ</option>
              <option value="full">多め</option>
            </select>
          </label>

          <label className="field">
            <span>前景水草</span>
            <select
              value={customization.environment.foregroundPlants}
              onChange={(event) =>
                onEnvironmentChange({
                  foregroundPlants: event.currentTarget
                    .value as AquariumEnvironmentCustomization["foregroundPlants"],
                })
              }
            >
              <option value="off">なし</option>
              <option value="subtle">控えめ</option>
              <option value="full">多め</option>
            </select>
          </label>

          <label className="field">
            <span>水草の濃さ</span>
            <select
              value={customization.environment.plantDensity}
              onChange={(event) =>
                onEnvironmentChange({
                  plantDensity: event.currentTarget
                    .value as AquariumEnvironmentCustomization["plantDensity"],
                })
              }
            >
              <option value="low">薄め</option>
              <option value="medium">標準</option>
              <option value="high">濃いめ</option>
            </select>
          </label>
        </div>

        <button className="secondary-button" onClick={onResetCustomization} type="button">
          デフォルトに戻す
        </button>
      </section>

      <div className="fish-list">
        <div className="fish-list-heading">
          <h2>生体カード</h2>
          <span>{totalFish}匹</span>
        </div>
        {fish.map((item) => {
          const species = speciesList.find((candidate) => candidate.id === item.speciesId);
          const hungerPercent = Math.round(item.hunger * 100);
          return (
            <div className="fish-row" key={item.id}>
              <div className="fish-card-copy">
                <div className="fish-card-title">
                  <span>{species?.displayName ?? item.speciesId}</span>
                  <small>{getHungerLabel(item.hunger)}</small>
                </div>
                <p>{getLifeStatus(item, customization.environment.lighting, paused)}</p>
                <div className="fish-card-meta" aria-label="生体の様子">
                  <span>{getTargetKindLabel(item.targetKind)}</span>
                  <span>{getDepthLabel(item.depth)}</span>
                </div>
                <div
                  className="hunger-meter"
                  aria-label={`空腹度 ${hungerPercent}%`}
                  style={{ "--hunger": `${hungerPercent}%` } as MeterStyle}
                />
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

function getStockCount(customization: AquariumCustomization, speciesId: string): number {
  return customization.stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
}

function getTargetKindLabel(kind: FishInstance["targetKind"]): string {
  if (kind === "structure") {
    return "水草の影";
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
  if (kind === "tap") {
    return "タップ反応";
  }
  return "遊泳中";
}

function getHungerLabel(hunger: number): string {
  if (hunger >= 0.72) {
    return "ごはん待ち";
  }
  if (hunger <= 0.24) {
    return "満腹";
  }
  return "ほどよい";
}

function getLifeStatus(
  fish: FishInstance,
  lighting: AquariumEnvironmentCustomization["lighting"],
  paused: boolean,
): string {
  if (paused) {
    return "静かな水の中で待機中";
  }
  if (lighting === "night" && fish.behaviorMode !== "feed") {
    return fish.targetKind === "structure"
      ? "水草の影でおやすみ中"
      : "夜の水槽をゆっくり探索中";
  }
  if (fish.behaviorMode === "feed") {
    return "落ちてくるごはんへ移動中";
  }
  if (fish.behaviorMode === "tapFlee") {
    return "タップの波紋から退避中";
  }
  if (fish.behaviorMode === "tapFreeze") {
    return "タップの波紋を警戒中";
  }
  if (fish.behaviorMode === "tapApproach") {
    return "タップの波紋を観察中";
  }
  if (fish.behaviorMode === "pause") {
    return "水草の近くでひと休み";
  }
  if (fish.hunger >= 0.72) {
    return "水面を見ながらごはん待ち";
  }
  if (fish.targetKind === "surfaceVisit") {
    return "表層をのんびり回遊中";
  }
  if (fish.targetKind === "edgeCruise") {
    return "ガラス沿いを遊泳中";
  }
  if (fish.targetKind === "structure") {
    return "水草の影を巡回中";
  }
  return "のんびり遊泳中";
}

function getDepthLabel(depth: number): string {
  if (depth >= 0.68) {
    return "奥の層";
  }
  if (depth <= 0.28) {
    return "手前の層";
  }
  return "中層";
}

function getLightingLabel(lighting: AquariumEnvironmentCustomization["lighting"]): string {
  if (lighting === "cool") {
    return "クール照明";
  }
  if (lighting === "evening") {
    return "夕景照明";
  }
  if (lighting === "night") {
    return "夜景照明";
  }
  return "自然光";
}
