// 図鑑の一覧と検索に使う、魚種ごとの軽い見出し。ビルド時に species.json から作る
// （vite.config.ts の speciesIndex）。設定ファイルからも読むので、ほかのモジュールに依存しない。

export type SpeciesIndexEntry = {
  id: string;
  name: string;
  scientificName: string;
  /** 種数を数えるときのキー（種レベルの学名）。未同定・種群は null。 */
  speciesKey: string | null;
  aliases: string[];
  orderJa?: string;
  family?: string;
  familyJa?: string;
  region: string;
  salinity?: "freshwater" | "brackish" | "marine";
};

type SpeciesJson = {
  id: string;
  displayName: string;
  catalog: { scientificName: string; originRegionName: string; aliases?: string[] };
  profile?: {
    taxonomy: { orderJa: string; family: string; familyJa: string };
    water: { salinity: "freshwater" | "brackish" | "marine" };
  };
};

export function toSpeciesIndexEntry(species: SpeciesJson): SpeciesIndexEntry {
  const profile = species.profile;
  return {
    id: species.id,
    name: species.displayName,
    scientificName: species.catalog.scientificName,
    speciesKey: toSpeciesKey(species.catalog.scientificName),
    aliases: species.catalog.aliases ?? [],
    orderJa: profile?.taxonomy.orderJa,
    family: profile?.taxonomy.family,
    familyJa: profile?.taxonomy.familyJa,
    region: species.catalog.originRegionName,
    salinity: profile?.water.salinity,
  };
}

/**
 * 種数を数えるときのキー（種レベルの学名）。表示用の学名とは別に持つ。
 * - 亜種（三名法）は種名にまとめる（ニッポンバラタナゴは Rhodeus ocellatus）。
 * - 未同定（sp.）、種群（complex、group）、近似種（cf.、aff.）、流通名（'acei' など）は数えず null。
 */
export function toSpeciesKey(scientificName: string): string | null {
  const name = scientificName.trim();
  if (/\b(sp|spp|cf|aff)\.|\bcomplex\b|\bgroup\b|['"‘’“”]/i.test(name)) return null;
  const words = name.replace(/\(.*?\)/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 2 || !/^[A-Z][a-z]+$/.test(words[0]!) || !/^[a-z-]+$/.test(words[1]!)) return null;
  return `${words[0]} ${words[1]}`;
}
