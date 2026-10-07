import { useEffect, useMemo, useRef, useState } from "react";
import { fishCatalog } from "../core";
import {
  getFirstExhibitHallName,
  getSpeciesExhibits,
  loadSpeciesDefinition,
  loadSpeciesIndex,
  searchSpeciesIndex,
  type SpeciesIndexEntry,
} from "../core/speciesIndex";
import type { ConservationStatus, FishProfile, FishSpeciesDefinition } from "../core/types";
import { playSfx } from "../audio/sfx";
import { BackIcon, CloseIcon } from "./icons";
import "./zukan.css";

type Salinity = NonNullable<SpeciesIndexEntry["salinity"]>;
type SortKey = "exhibit" | "taxonomy" | "name";

const SALINITY_LABELS: Record<Salinity, string> = { freshwater: "淡水", brackish: "汽水", marine: "海水" };
const SORT_LABELS: Record<SortKey, string> = { exhibit: "展示順", taxonomy: "分類順", name: "名前順" };
const KEEPING_LABELS: Record<FishProfile["keeping"], string> = {
  home: "家庭でも飼育されます",
  publicAquarium: "主に公共の水族館で展示されます",
  rarelyDisplayed: "生きた姿の展示はほとんどありません",
};
// IUCN レッドリストの区分の日本語名。
const STATUS_LABELS: Record<ConservationStatus, string> = {
  LC: "低懸念", NT: "準絶滅危惧", VU: "危急", EN: "絶滅危惧", CR: "深刻な危機", EW: "野生絶滅", DD: "情報不足", NE: "未評価",
};

/**
 * 図鑑。館の全種を一覧・検索し、1種ずつの解説と、その生き物を見られる水槽へ移れるようにする。
 * 一覧はビルド時に作った全種の見出しだけで描き、解説を開いたときにその種の species.json を読む。
 */
export function Zukan({ speciesId, onSelect, onClose, onVisitTank }: {
  /** 開いている種。null なら一覧。 */
  speciesId: string | null;
  onSelect: (speciesId: string | null) => void;
  onClose: () => void;
  onVisitTank: (tankId: string) => void;
}) {
  const [entries, setEntries] = useState<SpeciesIndexEntry[]>();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [salinity, setSalinity] = useState<Salinity | "all">("all");
  const [sort, setSort] = useState<SortKey>("exhibit");

  useEffect(() => {
    let cancelled = false;
    loadSpeciesIndex().then((items) => { if (!cancelled) setEntries(items); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Esc で一段戻る（解説 → 一覧 → 閉じる）。展示室や水槽の Esc より先に受け取る。
  const stateRef = useRef({ speciesId, onSelect, onClose });
  stateRef.current = { speciesId, onSelect, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      event.stopImmediatePropagation();
      const current = stateRef.current;
      if (current.speciesId) current.onSelect(null);
      else current.onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const groups = useMemo(() => {
    if (!entries) return [];
    const found = searchSpeciesIndex(entries, query)
      .filter((entry) => salinity === "all" || entry.salinity === salinity);
    return groupEntries(found, sort);
  }, [entries, query, salinity, sort]);
  const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const counted = entries ? new Set(entries.flatMap((entry) => entry.speciesKey ?? [])).size : 0;
  const entry = speciesId ? entries?.find((item) => item.id === speciesId) : undefined;

  return (
    <div aria-label="図鑑" aria-modal="true" className={speciesId ? "zukan detail-open" : "zukan"} role="dialog">
      <div className="zukan-list" aria-hidden={speciesId ? true : undefined} inert={speciesId ? true : undefined}>
        <div className="zukan-inner">
        <header className="zukan-header">
          <div>
            <p className="zukan-eyebrow">Field Guide</p>
            <h1>図鑑</h1>
            <p className="zukan-count">
              {entries ? <>館の生き物 <strong>{entries.length}</strong> · 種として数えると {counted}種</> : "読み込んでいます"}
            </p>
          </div>
          <button aria-label="図鑑を閉じる" className="hud-button icon-only zukan-close" onClick={onClose} title="閉じる（Esc）" type="button">
            <CloseIcon />
          </button>
        </header>
        <div className="zukan-tools">
          <input
            aria-label="図鑑を探す"
            className="zukan-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名前・学名・科・原産地で探す"
            type="search"
            value={query}
          />
          <div className="zukan-filters">
            <div aria-label="水" className="zukan-segment" role="group">
              {(["all", "freshwater", "brackish", "marine"] as const).map((value) => (
                <button
                  aria-pressed={salinity === value}
                  key={value}
                  onClick={() => setSalinity(value)}
                  type="button"
                >{value === "all" ? "すべて" : SALINITY_LABELS[value]}</button>
              ))}
            </div>
            <label className="zukan-sort">
              <span>並び</span>
              <select onChange={(event) => setSort(event.target.value as SortKey)} value={sort}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
              </select>
            </label>
          </div>
        </div>
        {failed ? <p className="zukan-empty">図鑑を読み込めませんでした。</p> : null}
        {entries && shown === 0 ? <p className="zukan-empty">見つかりませんでした。</p> : null}
        {entries && shown > 0 && shown < entries.length ? <p className="zukan-hits">{shown}件</p> : null}
        {groups.map((group) => (
          <section className="zukan-group" key={group.key}>
            {group.heading ? <h2>{group.heading}{group.sub ? <small>{group.sub}</small> : null}</h2> : null}
            <ul className="zukan-grid">
              {group.entries.map((item) => (
                <li key={item.id}>
                  <button className="zukan-card" onClick={() => { playSfx("ui_tap", 0.6); onSelect(item.id); }} type="button">
                    <span className="zukan-thumb">
                      <img alt="" decoding="async" loading="lazy" src={item.imageUrl} />
                    </span>
                    <span className="zukan-card-name">{item.name}</span>
                    <span className="zukan-card-sci">{item.scientificName}</span>
                    <span className="zukan-card-meta">{[item.familyJa, item.region].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        </div>
      </div>
      {speciesId ? (
        <SpeciesDetail
          entry={entry}
          id={speciesId}
          known={!entries || Boolean(entry)}
          onBack={() => onSelect(null)}
          onClose={onClose}
          onVisitTank={onVisitTank}
        />
      ) : null}
    </div>
  );
}

type Group = { key: string; heading?: string; sub?: string; entries: SpeciesIndexEntry[] };

function groupEntries(entries: SpeciesIndexEntry[], sort: SortKey): Group[] {
  const byName = (a: SpeciesIndexEntry, b: SpeciesIndexEntry) => a.name.localeCompare(b.name, "ja");
  if (sort === "name") return [{ key: "all", entries: [...entries].sort(byName) }];
  const groups = new Map<string, Group>();
  const sorted = [...entries].sort(sort === "exhibit"
    ? (a, b) => (a.exhibitRank ?? Infinity) - (b.exhibitRank ?? Infinity) || byName(a, b)
    : (a, b) => (a.orderJa ?? "").localeCompare(b.orderJa ?? "", "ja") ||
      (a.familyJa ?? "").localeCompare(b.familyJa ?? "", "ja") || byName(a, b));
  for (const entry of sorted) {
    const key = sort === "exhibit" ? getFirstExhibitHallName(entry) ?? "展示していない生き物" : entry.familyJa ?? "分類の記載なし";
    const sub = sort === "taxonomy" ? [entry.orderJa, entry.family].filter(Boolean).join(" · ") : undefined;
    const group = groups.get(key) ?? { key, heading: key, sub, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function SpeciesDetail({ id, entry, known, onBack, onClose, onVisitTank }: {
  id: string;
  entry?: SpeciesIndexEntry;
  /** 一覧にある種か（一覧を読み込む前は true）。 */
  known: boolean;
  onBack: () => void;
  onClose: () => void;
  onVisitTank: (tankId: string) => void;
}) {
  const [species, setSpecies] = useState<FishSpeciesDefinition | undefined>(fishCatalog[id]);
  const [failed, setFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSpecies(fishCatalog[id]);
    setFailed(false);
    loadSpeciesDefinition(id).then((loaded) => { if (!cancelled) setSpecies(loaded); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id]);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [id, species]);
  const exhibits = useMemo(() => (entry ? getSpeciesExhibits(entry) : []), [entry]);
  const profile = species?.profile;
  // 古い種の aliases には ID や学名そのものが入っているので、別名としては出さない。
  const aliases = (species?.catalog.aliases ?? []).filter((alias) => alias !== id && alias !== species?.catalog.scientificName);

  return (
    <article aria-labelledby="zukan-detail-name" className="zukan-detail">
      <div className="zukan-inner">
      <div className="zukan-detail-bar">
        <button className="hud-button" onClick={onBack} type="button"><BackIcon /><span className="hud-label">一覧へ</span></button>
        <button aria-label="図鑑を閉じる" className="hud-button icon-only" onClick={onClose} title="閉じる（Esc）" type="button">
          <CloseIcon />
        </button>
      </div>
      {!known || failed ? (
        <p className="zukan-empty">{failed ? "この生き物を読み込めませんでした。" : "この生き物は図鑑にありません。"}</p>
      ) : (
        <>
          <figure className="zukan-figure">
            <img alt={species?.displayName ?? entry?.name ?? ""} src={entry?.imageUrl} />
          </figure>
          <header className="zukan-detail-head">
            <p className="zukan-eyebrow">{profile ? `${profile.taxonomy.orderJa} · ${profile.taxonomy.familyJa}` : entry?.familyJa}</p>
            <h2 id="zukan-detail-name" ref={headingRef} tabIndex={-1}>{species?.displayName ?? entry?.name}</h2>
            <p className="zukan-sci">{species?.catalog.scientificName ?? entry?.scientificName}</p>
            {aliases.length ? <p className="zukan-aliases">別名・流通名: {aliases.join("、")}</p> : null}
          </header>
          {!species ? <p className="zukan-empty">読み込んでいます</p> : (
            <>
              {profile ? (
                <>
                  <ul className="zukan-highlights" aria-label="見どころ">
                    {profile.highlights.map((text) => <li key={text}>{text}</li>)}
                  </ul>
                  <dl className="zukan-facts">
                    <div><dt>分類</dt><dd>{profile.taxonomy.orderJa}（{profile.taxonomy.order}）· {profile.taxonomy.familyJa}（{profile.taxonomy.family}）</dd></div>
                    <div><dt>大きさ</dt><dd>約{profile.adultSizeCm}cm。{profile.sizeNote}</dd></div>
                    <div><dt>分布</dt><dd>{profile.distribution}</dd></div>
                    <div><dt>すむ水</dt><dd>{describeWater(profile.water)}</dd></div>
                    <div><dt>飼育</dt><dd>{KEEPING_LABELS[profile.keeping]}</dd></div>
                    <div><dt>保全状況</dt><dd>{describeConservation(profile.conservation)}</dd></div>
                  </dl>
                </>
              ) : null}
              <section className="zukan-section">
                <h3>この館での様子</h3>
                <p>{species.catalog.temperament}</p>
                <p>{species.catalog.movement}</p>
              </section>
              <section className="zukan-section">
                <h3>見られる水槽</h3>
                {exhibits.length === 0 ? <p>いまはどの水槽にもいません。</p> : (
                  <ul className="zukan-exhibits">
                    {exhibits.map(({ tank, hall, floorLabel }) => (
                      <li key={tank.id}>
                        <button onClick={() => { playSfx("tank_switch"); onVisitTank(tank.id); }} type="button">
                          <span>{tank.displayName}</span>
                          <small>{[floorLabel, hall.displayName].filter(Boolean).join(" · ")}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="zukan-section zukan-sources">
                <h3>出典</h3>
                <ul>
                  {species.ecology.sources.map((source) => (
                    <li key={source.url}><a href={source.url} rel="noreferrer" target="_blank">{source.title}</a></li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
      </div>
    </article>
  );
}

function describeWater(water: FishProfile["water"]): string {
  const parts = [SALINITY_LABELS[water.salinity]];
  if (water.temperatureC) parts.push(`水温 ${formatRange(water.temperatureC)}℃`);
  if (water.pH) parts.push(`pH ${formatRange(water.pH)}`);
  return parts.join(" · ");
}

function formatRange([min, max]: [number, number]): string {
  return min === max ? String(min) : `${min}〜${max}`;
}

function describeConservation(conservation: FishProfile["conservation"]): string {
  const status = conservation.status
    ? `IUCN レッドリスト: ${STATUS_LABELS[conservation.status]}（${conservation.status}${conservation.assessedYear ? `、${conservation.assessedYear}年` : ""}）`
    : undefined;
  return [status, conservation.note].filter(Boolean).join("。") || "記載なし";
}
