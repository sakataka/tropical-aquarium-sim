import { useState, type RefObject } from "react";
import {
  getSceneHeader,
  getSpeciesLimit,
  getStockCount,
  type AquariumCustomization,
  type AquariumPreferences,
  type FishSpeciesDefinition,
  type LightingId,
  type SwimZoneId,
  type TankDefinition,
} from "../core";
import { getFishImageUrl, getSceneThumbUrl } from "../render/assetUrls";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "./icons";
import { playSfx } from "../audio/sfx";

type PanelTab = "fish" | "scene" | "viewing";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "fish", label: "生き物" },
  { id: "scene", label: "水景" },
  { id: "viewing", label: "照明と音" },
];

export const LIGHTING_OPTIONS: { id: LightingId; label: string; note: string }[] = [
  { id: "natural", label: "自然光", note: "昼のやわらかな光" },
  { id: "cool", label: "クール", note: "青みの澄んだ光" },
  { id: "evening", label: "夕景", note: "暖かく沈む光" },
  { id: "night", label: "夜景", note: "月明かりの暗さ" },
];

type AquariumControlsProps = {
  speciesList: FishSpeciesDefinition[];
  /** その種の図鑑のページを開く。 */
  onOpenZukan: (speciesId: string) => void;
  tank: TankDefinition;
  customization: AquariumCustomization;
  preferences: AquariumPreferences;
  saveFailed: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onSpeciesCountChange: (speciesId: string, count: number) => void;
  onSceneChange: (sceneId: string) => void;
  onLightingChange: (lighting: LightingId) => void;
  onPreferencesChange: (update: Partial<AquariumPreferences>) => void;
  onClose: () => void;
};

export function AquariumControls({
  speciesList,
  onOpenZukan,
  tank,
  customization,
  preferences,
  saveFailed,
  panelRef,
  onSpeciesCountChange,
  onSceneChange,
  onLightingChange,
  onPreferencesChange,
  onClose,
}: AquariumControlsProps) {
  const [tab, setTab] = useState<PanelTab>("fish");
  const totalFish = customization.stock.reduce((sum, entry) => sum + entry.count, 0);
  const tankFull = totalFish >= tank.maxTotalFish;
  const scenes = tank.sceneIds.map((sceneId) => getSceneHeader(sceneId)).filter((scene) => scene !== undefined);

  return (
    <aside aria-label="水槽の設定" className="control-panel" id="tank-settings" ref={panelRef} tabIndex={-1}>
      <header className="panel-heading">
        <div className="panel-title">
          <p className="panel-eyebrow">{tank.exhibitName}</p>
          <h1>{tank.displayName}</h1>
          <p className="panel-spec">{tank.category} · {tank.widthCm}×{tank.specHeightCm}×{tank.depthCm}cm</p>
        </div>
        <button
          aria-label="閉じて眺める"
          className="panel-close"
          onClick={onClose}
          title="閉じて眺める（Esc）"
          type="button"
        >
          <CloseIcon />
        </button>
        {saveFailed ? (
          <p className="save-error" role="alert">
            この端末に保存できません。閉じると変更が失われます。
          </p>
        ) : null}
      </header>

      <div className="panel-tabs" role="tablist" aria-label="設定の種類">
        {TABS.map((item) => (
          <button
            aria-controls={`panel-${item.id}`}
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            id={`tab-${item.id}`}
            key={item.id}
            onClick={() => { if (tab !== item.id) playSfx("ui_tap"); setTab(item.id); }}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {tab === "fish" ? (
          <section aria-labelledby="tab-fish" className="panel-content" id="panel-fish" role="tabpanel">
            <div className={tankFull ? "capacity full" : "capacity"}>
              <div className="capacity-text">
                <span>{tankFull ? "表示数の上限です" : "水槽の生き物"}</span>
                <strong>{totalFish}<small> / {tank.maxTotalFish}匹</small></strong>
              </div>
              <div
                aria-label="水槽の生き物の数"
                aria-valuemax={tank.maxTotalFish}
                aria-valuemin={0}
                aria-valuenow={totalFish}
                className="capacity-bar"
                role="meter"
              >
                <span style={{ width: `${Math.min(100, (totalFish / tank.maxTotalFish) * 100)}%` }} />
              </div>
            </div>
            <p className="panel-lead">{tank.description}</p>
            <ul className="fish-catalog-list">
              {speciesList.map((species) => {
                const count = getStockCount(customization.stock, species.id);
                const limit = getSpeciesLimit(tank, species.id);
                const addBlocked = count >= limit || tankFull;
                return (
                  <li className={count > 0 ? "fish-catalog-card stocked" : "fish-catalog-card"} key={species.id}>
                    <div className="fish-portrait">
                      <img alt="" loading="lazy" src={getFishImageUrl(species.id)} />
                    </div>
                    <div className="fish-catalog-copy">
                      <h3>{species.displayName}</h3>
                      <p className="scientific">{species.catalog.scientificName}</p>
                      <ul className="trait-list" aria-label={`${species.displayName}の特徴`}>
                        <li>{species.realBodyLengthCm}cm</li>
                        <li>{getZoneLabel(getSwimZone(species))}</li>
                        {getTraitLabels(species).map((label) => <li key={label}>{label}</li>)}
                      </ul>
                      <p className="movement">{species.catalog.movement}</p>
                      <div className="fish-card-footer">
                        <button className="zukan-link" onClick={() => onOpenZukan(species.id)} type="button">
                          図鑑で見る
                        </button>
                        <div className="count-control" role="group" aria-label={`${species.displayName}の匹数`}>
                          <button
                            aria-label={`${species.displayName}を1匹減らす`}
                            disabled={count === 0}
                            onClick={() => { playSfx("fish_remove"); onSpeciesCountChange(species.id, count - 1); }}
                            type="button"
                          ><MinusIcon /></button>
                          <strong aria-live="polite"><span>{count}</span><small>/{limit}</small></strong>
                          <button
                            aria-label={`${species.displayName}を1匹増やす`}
                            disabled={addBlocked}
                            onClick={() => { playSfx("fish_add"); onSpeciesCountChange(species.id, count + 1); }}
                            title={count >= limit
                              ? `この水槽には${limit}匹まで`
                              : tankFull ? "表示数の上限です" : undefined}
                            type="button"
                          ><PlusIcon /></button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {tab === "scene" ? (
          <section aria-labelledby="tab-scene" className="panel-content" id="panel-scene" role="tabpanel">
            <p className="panel-lead">この水槽のために仕上げた水景から選べます。</p>
            <div className="theme-grid">
              {scenes.map((scene) => {
                const active = customization.layout.sceneId === scene.id;
                return (
                  <button
                    aria-pressed={active}
                    className={active ? "theme-card active" : "theme-card"}
                    key={scene.id}
                    onClick={() => { if (!active) playSfx("scene_change"); onSceneChange(scene.id); }}
                    type="button"
                  >
                    <span className="theme-thumb">
                      <img alt="" loading="lazy" src={getSceneThumbUrl(scene.id)} />
                      {active ? <span className="theme-check"><CheckIcon /></span> : null}
                    </span>
                    <strong>{scene.displayName}</strong>
                    <small>{scene.description}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {tab === "viewing" ? (
          <section aria-labelledby="tab-viewing" className="panel-content" id="panel-viewing" role="tabpanel">
            <h2 className="setting-title">照明</h2>
            <div className="lighting-grid">
              {LIGHTING_OPTIONS.map(({ id, label, note }) => (
                <button
                  aria-pressed={customization.layout.lighting === id}
                  className={customization.layout.lighting === id ? "active" : ""}
                  key={id}
                  onClick={() => { if (customization.layout.lighting !== id) playSfx("light_switch"); onLightingChange(id); }}
                  type="button"
                >
                  <span aria-hidden="true" className={`lighting-swatch ${id}`} />
                  <span><strong>{label}</strong><small>{note}</small></span>
                </button>
              ))}
            </div>

            <h2 className="setting-title">環境音</h2>
            <div className="sound-settings">
              <button
                aria-checked={preferences.soundEnabled}
                className="sound-toggle"
                onClick={() => onPreferencesChange({ soundEnabled: !preferences.soundEnabled })}
                role="switch"
                type="button"
              >
                <span><strong>水とエアストーンの音</strong><small>開くたびにOFFから始まります</small></span>
                <span aria-hidden="true" className="switch" />
              </button>
              <label className="volume">
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
            </div>
            <p className="sound-credit">
              水音と一部の効果音は Woosh (Sony AI) で生成。効果音素材は Freesound の
              beman87、PrimeJunt、Glaneur de sons、audiolarx（CC BY）、junggle（CC BY-NC）、wrenshep098（CC0）による。
            </p>
          </section>
        ) : null}
      </div>
    </aside>
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
  homeShelter: "住みかを持つ",
} as const;
const SHELTER_LABELS = {
  anemone: "イソギンチャクに住む",
  burrow: "巣穴に住む",
  crevice: "岩の隙間で休む",
  cave: "物陰を住みかにする",
} as const;

function getTraitLabels(species: FishSpeciesDefinition): string[] {
  const { activityPeriod, social, habits } = species.ecology;
  return [
    ACTIVITY_LABELS[activityPeriod],
    GROUPING_LABELS[social.grouping],
    ...habits.map((habit) => habit.type === "homeShelter" ? SHELTER_LABELS[habit.kind] : HABIT_LABELS[habit.type]),
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
