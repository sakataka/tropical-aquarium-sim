import { useState, type CSSProperties } from "react";
import {
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  getStockCount,
  type AquariumCustomization,
  type AquariumEnvironmentCustomization,
  type AquariumPreferences,
  type AquariumPreset,
  type FishInstance,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import { getFishImageUrl } from "../render/assets";

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
  selectedFishId?: string;
  preferences: AquariumPreferences;
  effectiveLighting: AquariumEnvironmentCustomization["lighting"];
  nowMs: number;
  dayNumber: number;
  observation: string;
  onSelectedSpeciesChange: (speciesId: string) => void;
  onSelectedFishChange: (fishId: string) => void;
  onAddFish: () => void;
  onRemoveFish: (fishId: string) => void;
  onUpdateFish: (
    fishId: string,
    update: Pick<Partial<FishInstance>, "nickname" | "favorite">,
  ) => void;
  onSpeciesCountChange: (speciesId: string, count: number) => void;
  onEnvironmentChange: (environment: Partial<AquariumEnvironmentCustomization>) => void;
  onPresetChange: (presetId: string) => void;
  onResetCustomization: () => void;
  onFeed: () => void;
  onTogglePaused: () => void;
  onViewModeChange: (mode: "tank" | "guide") => void;
  onTankNameChange: (name: string) => void;
  onLightingModeChange: (mode: AquariumPreferences["lightingMode"]) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onSoundVolumeChange: (volume: number) => void;
  onEnterAmbientMode: () => void;
};

type MeterStyle = CSSProperties & { "--hunger": string };

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
  selectedFishId,
  preferences,
  effectiveLighting,
  nowMs,
  dayNumber,
  observation,
  onSelectedSpeciesChange,
  onSelectedFishChange,
  onAddFish,
  onRemoveFish,
  onUpdateFish,
  onSpeciesCountChange,
  onEnvironmentChange,
  onPresetChange,
  onResetCustomization,
  onFeed,
  onTogglePaused,
  onViewModeChange,
  onTankNameChange,
  onLightingModeChange,
  onSoundEnabledChange,
  onSoundVolumeChange,
  onEnterAmbientMode,
}: AquariumControlsProps) {
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [residentsExpanded, setResidentsExpanded] = useState(false);
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const selectedCount = getStockCount(customization.stock, selectedSpeciesId);
  const lightingLabel = getLightingLabel(effectiveLighting);
  const selectedFish = fish.find((item) => item.id === selectedFishId) ?? fish[0];
  const selectedDefinition = selectedFish
    ? speciesList.find((item) => item.id === selectedFish.speciesId)
    : undefined;

  return (
    <aside className="control-panel">
      <header className="panel-heading">
        <div className="tank-name-row">
          <label>
            <span className="sr-only">水槽の名前</span>
            <input
              aria-label="水槽の名前"
              className="tank-name-input"
              maxLength={32}
              onBlur={(event) => {
                if (!event.currentTarget.value.trim()) {
                  onTankNameChange("木漏れ日の水槽");
                }
              }}
              onChange={(event) => onTankNameChange(event.currentTarget.value)}
              value={preferences.tankName}
            />
          </label>
          <span className="save-status">{saveStatus}</span>
        </div>
        <h1>60cm水槽</h1>
        <p>
          {tank.widthCm} × {tank.heightCm} × {tank.depthCm}cm / {fish.length}匹 / {lightingLabel}
        </p>
        <p className="tank-clock">{formatClock(nowMs)} · 設置から{dayNumber}日目</p>
      </header>

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

      <section className="presence-controls" aria-label="観賞環境">
        <button className="ambient-button" onClick={onEnterAmbientMode} type="button">
          <span aria-hidden="true" className="viewfinder-icon" />
          <span>
            <strong>観賞モード</strong>
            <small>水槽だけを画面に残す</small>
          </span>
        </button>
        <button
          aria-pressed={preferences.lightingMode === "auto"}
          className="presence-toggle"
          onClick={() => onLightingModeChange(
            preferences.lightingMode === "auto" ? "manual" : "auto",
          )}
          type="button"
        >
          <span>
            <strong>自動照明</strong>
            <small>{preferences.lightingMode === "auto" ? "現在時刻に連動" : "手動設定"}</small>
          </span>
          <span className="toggle-state">{preferences.lightingMode === "auto" ? "ON" : "OFF"}</span>
        </button>
        <div className="sound-control">
          <button
            aria-pressed={preferences.soundEnabled}
            className="presence-toggle"
            onClick={() => onSoundEnabledChange(!preferences.soundEnabled)}
            type="button"
          >
            <span>
              <strong>環境音</strong>
              <small>水とフィルターの静かな音</small>
            </span>
            <span className="toggle-state">{preferences.soundEnabled ? "ON" : "OFF"}</span>
          </button>
          <label className="volume-field">
            <span className="sr-only">環境音の音量</span>
            <input
              aria-label="環境音の音量"
              disabled={!preferences.soundEnabled}
              max={1}
              min={0}
              onChange={(event) => onSoundVolumeChange(Number(event.currentTarget.value))}
              step={0.05}
              type="range"
              value={preferences.soundVolume}
            />
          </label>
        </div>
      </section>

      <section className="observation-card" aria-label="今日の観察">
        <div>
          <h2>今日の観察</h2>
          <time>{formatClock(nowMs)}</time>
        </div>
        <p>{observation}</p>
      </section>

      {selectedFish && selectedDefinition ? (
        <section className="selected-resident" aria-label="選択中の住人">
          <div className="selected-resident-heading">
            <h2>選択中の住人</h2>
            <button
              aria-pressed={selectedFish.favorite}
              onClick={() => onUpdateFish(selectedFish.id, { favorite: !selectedFish.favorite })}
              type="button"
            >
              {selectedFish.favorite ? "お気に入り済み" : "お気に入り"}
            </button>
          </div>
          <div className="resident-portrait">
            <img alt="" src={getFishImageUrl(selectedFish.speciesId)} />
            <div>
              <strong>{selectedFish.nickname || selectedDefinition.displayName}</strong>
              <span>{selectedDefinition.displayName} · {getArrivalLabel(selectedFish.arrivedAtMs, nowMs)}</span>
            </div>
          </div>
          <label className="field compact-field">
            <span>愛称（任意）</span>
            <input
              maxLength={24}
              onChange={(event) => onUpdateFish(selectedFish.id, {
                nickname: event.currentTarget.value || undefined,
              })}
              placeholder="この子の呼び名"
              type="text"
              value={selectedFish.nickname ?? ""}
            />
          </label>
        </section>
      ) : null}

      <section className="care-section" aria-label="水槽とのふれあい">
        <label className="field">
          <span>新しく迎える魚</span>
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
            新しい住人を迎える
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
      </section>

      <section className="settings-section" aria-label="水槽設定">
        <div className="section-heading">
          <h2>水槽設定</h2>
          <button
            aria-expanded={settingsExpanded}
            className="text-button"
            onClick={() => setSettingsExpanded((current) => !current)}
            type="button"
          >
            {settingsExpanded ? "閉じる" : "開く"}
          </button>
        </div>
        <div className="settings-content" hidden={!settingsExpanded}>
          <label className="field">
            <span>プリセット</span>
            <select
              value={activePresetId}
              onChange={(event) => onPresetChange(event.currentTarget.value)}
            >
              <option disabled value="custom">現在の組み合わせ</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.displayName}</option>
              ))}
            </select>
          </label>

          <div className="stock-editor">
            <div className="stock-editor-heading">
              <span>魚種構成</span>
              <small>{totalFish} / {MAX_TOTAL_FISH}匹</small>
            </div>
            {speciesList.map((species) => {
              const count = getStockCount(customization.stock, species.id);
              return (
                <label className="stock-row" key={species.id}>
                  <span>{species.displayName}</span>
                  <input
                    max={MAX_FISH_PER_SPECIES}
                    min={0}
                    onChange={(event) => onSpeciesCountChange(
                      species.id,
                      Number(event.currentTarget.value),
                    )}
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
                onChange={(event) => onEnvironmentChange({
                  backgroundStyle: event.currentTarget.value as AquariumEnvironmentCustomization["backgroundStyle"],
                })}
              >
                <option value="clear">クリア</option>
                <option value="deep">深め</option>
                <option value="bright">明るめ</option>
              </select>
            </label>
            <label className="field">
              <span>照明</span>
              <select
                disabled={preferences.lightingMode === "auto"}
                value={customization.environment.lighting}
                onChange={(event) => onEnvironmentChange({
                  lighting: event.currentTarget.value as AquariumEnvironmentCustomization["lighting"],
                })}
              >
                <option value="natural">自然光</option>
                <option value="cool">クール</option>
                <option value="evening">夕景</option>
                <option value="night">夜景</option>
              </select>
            </label>
            <PlantSelect
              label="後景水草"
              value={customization.environment.rearPlants}
              onChange={(rearPlants) => onEnvironmentChange({ rearPlants })}
            />
            <PlantSelect
              label="前景水草"
              value={customization.environment.foregroundPlants}
              onChange={(foregroundPlants) => onEnvironmentChange({ foregroundPlants })}
            />
            <label className="field">
              <span>水草の濃さ</span>
              <select
                value={customization.environment.plantDensity}
                onChange={(event) => onEnvironmentChange({
                  plantDensity: event.currentTarget.value as AquariumEnvironmentCustomization["plantDensity"],
                })}
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
        </div>
      </section>

      <section className="fish-list">
        <div className="fish-list-heading">
          <h2>住人一覧</h2>
          <button
            aria-expanded={residentsExpanded}
            className="text-button"
            onClick={() => setResidentsExpanded((current) => !current)}
            type="button"
          >
            {residentsExpanded ? "閉じる" : `${totalFish}匹を見る`}
          </button>
        </div>
        <div className="resident-list-content" hidden={!residentsExpanded}>
          {fish.map((item) => {
            const species = speciesList.find((candidate) => candidate.id === item.speciesId);
            const hungerPercent = Math.round(item.hunger * 100);
            return (
              <div
                className={`fish-row${item.id === selectedFish?.id ? " selected" : ""}`}
                key={item.id}
              >
                <div className="fish-card-copy">
                  <button
                    className="fish-card-title"
                    onClick={() => onSelectedFishChange(item.id)}
                    type="button"
                  >
                    <span>{item.nickname || species?.displayName || item.speciesId}</span>
                    <small>{getHungerLabel(item.hunger)}</small>
                  </button>
                  <p>{getLifeStatus(item, effectiveLighting, paused)}</p>
                  <div className="fish-card-meta" aria-label="生体の様子">
                    <span>{getTargetKindLabel(item.targetKind)}</span>
                    <span>{getDepthLabel(item.depth)}</span>
                    {item.favorite ? <span>お気に入り</span> : null}
                  </div>
                  <div
                    className="hunger-meter"
                    aria-label={`空腹度 ${hungerPercent}%`}
                    style={{ "--hunger": `${hungerPercent}%` } as MeterStyle}
                  />
                </div>
                <button
                  aria-label={`${species?.displayName ?? item.speciesId}を水槽から移す`}
                  className="remove-fish-button"
                  onClick={() => onRemoveFish(item.id)}
                  type="button"
                >
                  水槽から移す
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function PlantSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AquariumEnvironmentCustomization["rearPlants"];
  onChange: (value: AquariumEnvironmentCustomization["rearPlants"]) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(
          event.currentTarget.value as AquariumEnvironmentCustomization["rearPlants"],
        )}
      >
        <option value="off">なし</option>
        <option value="subtle">控えめ</option>
        <option value="full">多め</option>
      </select>
    </label>
  );
}

function getTargetKindLabel(kind: FishInstance["targetKind"]): string {
  if (kind === "structure") return "水草の影";
  if (kind === "edgeCruise") return "壁沿い";
  if (kind === "surfaceVisit") return "表層";
  if (kind === "feed") return "餌";
  if (kind === "tap") return "タップ反応";
  return "遊泳中";
}

function getHungerLabel(hunger: number): string {
  if (hunger >= 0.72) return "ごはん待ち";
  if (hunger <= 0.24) return "満腹";
  return "ほどよい";
}

function getLifeStatus(
  fish: FishInstance,
  lighting: AquariumEnvironmentCustomization["lighting"],
  paused: boolean,
): string {
  if (paused) return "静かな水の中で待機中";
  if (lighting === "night" && fish.behaviorMode !== "feed") {
    return fish.targetKind === "structure"
      ? "水草の影でおやすみ中"
      : "夜の水槽をゆっくり探索中";
  }
  if (fish.behaviorMode === "feed") return "落ちてくるごはんへ移動中";
  if (fish.behaviorMode === "tapFlee") return "タップの波紋から退避中";
  if (fish.behaviorMode === "tapFreeze") return "タップの波紋を警戒中";
  if (fish.behaviorMode === "tapApproach") return "タップの波紋を観察中";
  if (fish.behaviorMode === "pause") return "水草の近くでひと休み";
  if (fish.hunger >= 0.72) return "水面を見ながらごはん待ち";
  if (fish.targetKind === "surfaceVisit") return "表層をのんびり回遊中";
  if (fish.targetKind === "edgeCruise") return "ガラス沿いを遊泳中";
  if (fish.targetKind === "structure") return "水草の影を巡回中";
  return "のんびり遊泳中";
}

function getDepthLabel(depth: number): string {
  if (depth <= 0.34) return "手前の層";
  if (depth >= 0.67) return "奥の層";
  return "中層";
}

function getLightingLabel(lighting: AquariumEnvironmentCustomization["lighting"]): string {
  if (lighting === "cool") return "クール照明";
  if (lighting === "evening") return "夕景照明";
  if (lighting === "night") return "夜景照明";
  return "自然光";
}

function getArrivalLabel(arrivedAtMs: number, nowMs: number): string {
  const days = Math.max(1, Math.floor((nowMs - arrivedAtMs) / 86_400_000) + 1);
  return days === 1 ? "今日迎えた住人" : `迎えて${days}日目`;
}

function formatClock(nowMs: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(nowMs);
}
