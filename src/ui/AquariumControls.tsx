import { useDeferredValue, useMemo, useState } from "react";
import {
  DECOR_SLOT_IDS,
  DECOR_SLOT_LABELS,
  MAX_FISH_PER_SPECIES,
  MAX_TOTAL_FISH,
  aquariumThemes,
  decorAssets,
  getAssetsForSlot,
  getStockCount,
  type AquariumCustomization,
  type AquariumPreferences,
  type DecorPlacement,
  type DecorSlotId,
  type FishSpeciesDefinition,
  type LightingId,
  type SwimZoneId,
  type TankDefinition,
} from "../core";
import { getEnvironmentAssetUrl, getFishImageUrl } from "../render/assets";

type PanelTab = "fish" | "layout" | "viewing";

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  tank: TankDefinition;
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
  saveStatus: string;
  onSpeciesCountChange: (speciesId: string, count: number) => void;
  onThemeChange: (themeId: AquariumCustomization["layout"]["themeId"]) => void;
  onBackgroundChange: (assetId: string) => void;
  onSubstrateChange: (assetId: string) => void;
  onSlotChange: (slotId: DecorSlotId, placement: DecorPlacement | null) => void;
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
  onThemeChange,
  onBackgroundChange,
  onSubstrateChange,
  onSlotChange,
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
        <section className="panel-content layout-editor" aria-label="水槽レイアウト">
          <div className="section-intro">
            <p className="eyebrow">AQUASCAPE</p>
            <h2>水景を組み立てる</h2>
            <p>完成テーマから始めて、7つの場所を好みに合わせます。</p>
          </div>

          <div className="theme-grid">
            {aquariumThemes.map((theme) => (
              <button
                aria-pressed={customization.layout.themeId === theme.id}
                className={customization.layout.themeId === theme.id ? "theme-card active" : "theme-card"}
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                type="button"
              >
                <img alt="" src={getEnvironmentAssetUrl(theme.layout.backgroundId)} />
                <span><strong>{theme.displayName}</strong><small>{theme.description}</small></span>
              </button>
            ))}
          </div>

          <div className="base-selectors">
            <AssetSelect
              category="background"
              label="水の背景"
              onChange={onBackgroundChange}
              value={customization.layout.backgroundId}
            />
            <AssetSelect
              category="substrate"
              label="底床"
              onChange={onSubstrateChange}
              value={customization.layout.substrateId}
            />
          </div>

          <div className="slot-editor">
            <div className="slot-editor-heading">
              <h3>配置スロット</h3>
              <span>7か所</span>
            </div>
            {DECOR_SLOT_IDS.map((slotId) => (
              <SlotRow
                key={slotId}
                onChange={(placement) => onSlotChange(slotId, placement)}
                placement={customization.layout.slots[slotId]}
                slotId={slotId}
              />
            ))}
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

function AssetSelect({
  category,
  label,
  onChange,
  value,
}: {
  category: "background" | "substrate";
  label: string;
  onChange: (assetId: string) => void;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.currentTarget.value)} value={value}>
        {decorAssets.filter((asset) => asset.category === category).map((asset) => (
          <option key={asset.id} value={asset.id}>{asset.displayName}</option>
        ))}
      </select>
    </label>
  );
}

function SlotRow({
  slotId,
  placement,
  onChange,
}: {
  slotId: DecorSlotId;
  placement: DecorPlacement | null;
  onChange: (placement: DecorPlacement | null) => void;
}) {
  const assets = getAssetsForSlot(slotId);
  return (
    <div className="slot-row">
      <div className="slot-label">
        <span>{DECOR_SLOT_LABELS[slotId]}</span>
        <small>{slotId.startsWith("rear") ? "魚の奥" : slotId.startsWith("mid") ? "魚の間" : "魚の手前"}</small>
      </div>
      <select
        aria-label={`${DECOR_SLOT_LABELS[slotId]}の部品`}
        onChange={(event) => onChange(
          event.currentTarget.value
            ? { assetId: event.currentTarget.value, flipped: placement?.flipped ?? false }
            : null,
        )}
        value={placement?.assetId ?? ""}
      >
        <option value="">何も置かない</option>
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>{asset.displayName}</option>
        ))}
      </select>
      <button
        aria-label={`${DECOR_SLOT_LABELS[slotId]}の部品を左右反転`}
        className="flip-button"
        disabled={!placement}
        onClick={() => placement && onChange({ ...placement, flipped: !placement.flipped })}
        type="button"
      >
        {placement?.flipped ? "反転済み" : "左右反転"}
      </button>
    </div>
  );
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
