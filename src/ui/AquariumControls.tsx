import { useDeferredValue, useMemo, useState } from "react";
import {
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumScenes,
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
  onEnterAmbientMode: () => void;
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
  onEnterAmbientMode,
}: AquariumControlsProps) {
  const [tab, setTab] = useState<PanelTab>("fish");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [zone, setZone] = useState<"all" | SwimZoneId>("all");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("ja"));
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const regions = useMemo(() =>
    Array.from(new Map(speciesList.map((species) => [
      species.catalog.originRegionId,
      species.catalog.originRegionName,
    ])).entries()), [speciesList]);
  const visibleSpecies = useMemo(() => speciesList.filter((species) => {
    const speciesZone = getSwimZone(species);
    const searchable = [
      species.displayName,
      species.catalog.scientificName,
      species.catalog.originRegionName,
      ...(species.catalog.aliases ?? []),
    ].join(" ").toLocaleLowerCase("ja");
    return (
      (region === "all" || species.catalog.originRegionId === region) &&
      (zone === "all" || speciesZone === zone) &&
      (!deferredSearch || searchable.includes(deferredSearch))
    );
  }), [deferredSearch, region, speciesList, zone]);

  return (
    <aside className="control-panel">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">MY AQUARIUM</p>
          <h1>60cm水槽</h1>
        </div>
        <span className="save-status" role="status">{saveStatus}</span>
        <p className="tank-summary">
          {tank.widthCm} × {tank.heightCm} × {tank.depthCm}cm
          <span>{totalFish} / {MAX_TOTAL_FISH}匹</span>
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
            <p>世界の熱帯魚から、眺めたい魚を選んで水槽へ。</p>
          </div>
          <div className="catalog-filters">
            <label className="search-field">
              <span className="sr-only">魚を検索</span>
              <input
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="和名・学名で検索"
                type="search"
                value={search}
              />
            </label>
            <label>
              <span className="sr-only">原産地域</span>
              <select onChange={(event) => setRegion(event.currentTarget.value)} value={region}>
                <option value="all">すべての地域</option>
                {regions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">泳ぐ層</span>
              <select
                onChange={(event) => setZone(event.currentTarget.value as "all" | SwimZoneId)}
                value={zone}
              >
                <option value="all">すべての泳層</option>
                <option value="surface">上層</option>
                <option value="middle">中層</option>
                <option value="bottom">底層</option>
              </select>
            </label>
          </div>

          <div className="fish-catalog-list">
            {visibleSpecies.map((species) => {
              const count = getStockCount(customization.stock, species.id);
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
                      <strong><span>{count}</span>匹</strong>
                      <button
                        aria-label={`${species.displayName}を1匹増やす`}
                        disabled={count >= MAX_FISH_PER_SPECIES || totalFish >= MAX_TOTAL_FISH}
                        onClick={() => onSpeciesCountChange(species.id, count + 1)}
                        type="button"
                      >＋</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {visibleSpecies.length === 0 ? (
            <p className="empty-state">条件に合う魚はいません。絞り込みを戻してみてください。</p>
          ) : null}
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
            {aquariumScenes.map((scene) => {
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
            <p>光と音だけを整えて、水槽を画面いっぱいに。</p>
          </div>
          <button className="ambient-button" onClick={onEnterAmbientMode} type="button">
            <span className="ambient-icon" aria-hidden="true" />
            <span><strong>観賞モード</strong><small>操作パネルを隠して水槽だけを表示</small></span>
          </button>
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
