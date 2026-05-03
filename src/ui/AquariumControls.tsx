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

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  fish: FishInstance[];
  tank: TankDefinition;
  customization: AquariumCustomization;
  presets: AquariumPreset[];
  activePresetId: string;
  saveStatus: string;
  paused: boolean;
  viewMode: "tank" | "dev";
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
  onViewModeChange: (mode: "tank" | "dev") => void;
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
        <button
          disabled={selectedCount >= MAX_FISH_PER_SPECIES || totalFish >= MAX_TOTAL_FISH}
          onClick={onAddFish}
          type="button"
        >
          魚を追加
        </button>
        <button onClick={onFeed} type="button">
          エサやり
        </button>
        <button onClick={onTogglePaused} type="button">
          {paused ? "再開" : "一時停止"}
        </button>
      </div>

      <section className="settings-section" aria-label="水槽設定">
        <div className="section-heading">
          <h2>水槽設定</h2>
          <span>{saveStatus}</span>
        </div>

        <label className="field">
          <span>プリセット</span>
          <select
            value={activePresetId}
            onChange={(event) => onPresetChange(event.currentTarget.value)}
          >
            <option disabled value="custom">カスタム</option>
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
        <h2>魚一覧</h2>
        {fish.map((item) => {
          const species = speciesList.find((candidate) => candidate.id === item.speciesId);
          return (
            <div className="fish-row" key={item.id}>
              <div>
                <span>{species?.displayName ?? item.speciesId}</span>
                <small>
                  {getBehaviorLabel(item.behaviorMode)} /{" "}
                  {getTargetKindLabel(item.targetKind)} / {getHungerLabel(item.hunger)} / z{" "}
                  {item.depth.toFixed(2)}
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

function getStockCount(customization: AquariumCustomization, speciesId: string): number {
  return customization.stock.find((entry) => entry.speciesId === speciesId)?.count ?? 0;
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
  if (mode === "tapFlee") {
    return "退避";
  }
  if (mode === "tapFreeze") {
    return "警戒";
  }
  if (mode === "tapApproach") {
    return "様子見";
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
  if (kind === "tap") {
    return "タップ";
  }
  return "遊泳";
}

function getHungerLabel(hunger: number): string {
  if (hunger >= 0.72) {
    return "空腹";
  }
  if (hunger <= 0.24) {
    return "満腹";
  }
  return "ふつう";
}
