import { useState } from "react";
import {
  getSceneById,
  getSpeciesLimit,
  getStockCount,
  type AquariumCustomization,
  type AquariumPreferences,
  type FishSpeciesDefinition,
  type LightingId,
  type SwimZoneId,
  type TankDefinition,
} from "../core";
import { getFishImageUrl, getScenePlateUrl } from "../render/assets";

type PanelTab = "fish" | "layout" | "viewing";

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  tank: TankDefinition;
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
  saveStatus: string;
  onSpeciesCountChange: (speciesId: string, count: number) => void;
  onSceneChange: (sceneId: string) => void;
  onLightingChange: (lighting: LightingId) => void;
  onPreferencesChange: (update: Partial<AquariumPreferences>) => void;
  onClose: () => void;
};

export function AquariumControls({
  speciesList,
  tank,
  customization,
  preferences,
  saveStatus,
  onSpeciesCountChange,
  onSceneChange,
  onLightingChange,
  onPreferencesChange,
  onClose,
}: AquariumControlsProps) {
  const [tab, setTab] = useState<PanelTab>("fish");
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const scenes = tank.sceneIds.map((sceneId) => getSceneById(sceneId)).filter((scene) => scene !== undefined);

  return (
    <aside aria-label="水槽の設定" className="control-panel" id="tank-settings">
      <header className="panel-heading">
        <div>
          <button className="close-panel" onClick={onClose} type="button">
            閉じて眺める
          </button>
          <p className="eyebrow">{tank.category}</p>
          <h1>{tank.displayName}</h1>
        </div>
        <span className="save-status" role="status">{saveStatus}</span>
        <p className="tank-summary">
          {tank.widthCm} × {tank.heightCm} × {tank.depthCm}cm
          <span>{totalFish} / {tank.maxTotalFish}匹</span>
        </p>
      </header>

      <nav className="panel-tabs" aria-label="水槽の編集">
        <TabButton active={tab === "fish"} onClick={() => setTab("fish")}>魚</TabButton>
        <TabButton active={tab === "layout"} onClick={() => setTab("layout")}>レイアウト</TabButton>
        <TabButton active={tab === "viewing"} onClick={() => setTab("viewing")}>鑑賞設定</TabButton>
      </nav>

      {tab === "fish" ? (
        <section className="panel-content fish-shop" aria-label="魚屋カタログ">
          <div className="section-intro">
            <p className="eyebrow">FISH CATALOG</p>
            <h2>魚屋カタログ</h2>
            <p>{tank.description}</p>
          </div>
          <div className="fish-catalog-list">
            {speciesList.map((species) => {
              const count = getStockCount(customization.stock, species.id);
              const limit = getSpeciesLimit(tank, species.id);
              return (
                <article className="fish-catalog-card" key={species.id}>
                  <div className="fish-portrait">
                    <img alt={species.displayName} loading="lazy" src={getFishImageUrl(species.id)} />
                    <span>{getZoneLabel(getSwimZone(species))}</span>
                  </div>
                  <div className="fish-catalog-copy">
                    <div className="fish-card-title">
                      <div>
                        <h3>{species.displayName}</h3>
                        <p>{species.catalog.scientificName}</p>
                      </div>
                      <span>{species.realBodyLengthCm}cm</span>
                    </div>
                    <p className="origin">{species.catalog.originRegionName} · {species.catalog.origin}</p>
                    <ul className="trait-list" aria-label={`${species.displayName}の習性`}>
                      {getTraitLabels(species).map((label) => <li key={label}>{label}</li>)}
                    </ul>
                    <p>{species.catalog.movement}</p>
                    <div className="count-control" aria-label={`${species.displayName}の匹数`}>
                      <button
                        aria-label={`${species.displayName}を1匹減らす`}
                        disabled={count === 0}
                        onClick={() => onSpeciesCountChange(species.id, count - 1)}
                        type="button"
                      >−</button>
                      <strong><span>{count}</span>匹<small> / {limit}</small></strong>
                      <button
                        aria-label={`${species.displayName}を1匹増やす`}
                        disabled={count >= limit || totalFish >= tank.maxTotalFish}
                        onClick={() => onSpeciesCountChange(species.id, count + 1)}
                        type="button"
                      >＋</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "layout" ? (
        <section className="panel-content layout-editor" aria-label="水景">
          <div className="section-intro">
            <p className="eyebrow">AQUASCAPE</p>
            <h2>水景を選ぶ</h2>
            <p>ひとつの景色として仕上げた水景から、今日眺めたいものを。</p>
          </div>

          <div className="theme-grid">
            {scenes.map((scene) => {
              const active = customization.layout.sceneId === scene.id;
              return (
                <button
                  aria-pressed={active}
                  className={active ? "theme-card active" : "theme-card"}
                  key={scene.id}
                  onClick={() => onSceneChange(scene.id)}
                  type="button"
                >
                  <img alt="" loading="lazy" src={getScenePlateUrl(scene.id)} />
                  <span><strong>{scene.displayName}</strong><small>{scene.description}</small></span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "viewing" ? (
        <section className="panel-content viewing-settings" aria-label="鑑賞設定">
          <div className="section-intro">
            <p className="eyebrow">VIEWING</p>
            <h2>静かに眺める</h2>
            <p>照明と環境音を整えます。</p>
          </div>
          <fieldset className="setting-group">
            <legend>照明</legend>
            <div className="lighting-grid">
              {([
                ["natural", "自然光"],
                ["cool", "クール"],
                ["evening", "夕景"],
                ["night", "夜景"],
              ] as const).map(([id, label]) => (
                <button
                  aria-pressed={customization.layout.lighting === id}
                  className={customization.layout.lighting === id ? "active" : ""}
                  key={id}
                  onClick={() => onLightingChange(id)}
                  type="button"
                >{label}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="setting-group sound-settings">
            <legend>環境音</legend>
            <button
              aria-pressed={preferences.soundEnabled}
              className="sound-toggle"
              onClick={() => onPreferencesChange({ soundEnabled: !preferences.soundEnabled })}
              type="button"
            >
              <span><strong>水とフィルターの音</strong><small>静かな低音を重ねます</small></span>
              <span>{preferences.soundEnabled ? "ON" : "OFF"}</span>
            </button>
            <label>
              <span>音量</span>
              <input
                aria-label="環境音の音量"
                disabled={!preferences.soundEnabled}
                max={1}
                min={0}
                onChange={(event) => onPreferencesChange({
                  soundVolume: Number(event.currentTarget.value),
                })}
                step={0.05}
                type="range"
                value={preferences.soundVolume}
              />
            </label>
          </fieldset>
        </section>
      ) : null}
    </aside>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button aria-pressed={active} className={active ? "active" : ""} onClick={onClick} type="button">
      {children}
    </button>
  );
}

const ACTIVITY_LABELS = { diurnal: "昼行性", crepuscular: "朝夕に活発", nocturnal: "夜行性" } as const;
const GROUPING_LABELS = {
  school: "群泳",
  shoal: "ゆるい群れ",
  group: "仲間と過ごす",
  solitary: "単独で泳ぐ",
} as const;
const HABIT_LABELS = {
  airBreathing: "空気呼吸",
  bottomRest: "底で休む",
  bottomForage: "底を探る",
  grazing: "ついばむ",
  hideByDay: "昼は隠れる",
  follow: "追いかける",
} as const;

function getTraitLabels(species: FishSpeciesDefinition): string[] {
  const { activityPeriod, social, habits } = species.ecology;
  return [
    ACTIVITY_LABELS[activityPeriod],
    GROUPING_LABELS[social.grouping],
    ...habits.map((habit) => HABIT_LABELS[habit.type]),
  ];
}

function getSwimZone(species: FishSpeciesDefinition): SwimZoneId {
  const center = (species.preferredZone.minY + species.preferredZone.maxY) / 2;
  if (center < 0.42) return "surface";
  if (center > 0.68) return "bottom";
  return "middle";
}

function getZoneLabel(zone: SwimZoneId): string {
  if (zone === "surface") return "上層";
  if (zone === "bottom") return "底層";
  return "中層";
}
