// ビルド時に内容ファイルから作るモジュール（vite/contentModules.ts）の形。
// 起動時に読むのは館の索引（virtual:museum）だけ。階の配置（virtual:floor/<id>）は館内図で階を開くときに、
// 展示室の中身（virtual:hall/<id>）と生き物（virtual:species/<id>）は、その展示室に入るときや図鑑で開くときに読む。
// 水槽ごとの種の並び（virtual:tank-species）は、起動後に読む。
import type { FishRoomDefinition } from "./contentSchemas";
import type { AquariumScene, FishSpeciesDefinition, LightingId, TankDefinition } from "./types";

/** 館の索引に載る展示室の見出し。名前、ある階、水槽の並びと、見られる生き物の数。 */
export type HallSummary = {
  id: string;
  displayName: string;
  shortName: string;
  floorId: string;
  /** 部屋の並び順の水槽。 */
  tankIds: string[];
  /** 展示室の水槽で見られる生き物の数（同じ生き物を数えない）。 */
  speciesCount: number;
};

/** 展示室の部屋の絵と、そこに置いた水槽のガラスの位置。階のモジュールが持つ。 */
export type HallLayout = FishRoomDefinition & {
  /** 館内図の縮小版に映す、部屋の絵の小さな版。 */
  thumbUrl: string;
};

/** 水槽の見出し。どの展示室にあるか、選べる水景、名前。 */
export type TankSummary = {
  id: string;
  hallId: string;
  displayName: string;
  sceneIds: string[];
};

/** 館内図と設定パネルで水景を映すのに要る分と、既定の照明。名前や地形は展示室のモジュールが持つ。 */
export type SceneSummary = {
  thumbUrl?: string;
  defaultLighting: LightingId;
  framing?: { plateBottom: number };
};

export type LoadedScene = AquariumScene & { plateUrl?: string };

/** 階のモジュール（virtual:floor/<id>）。館内図でその階を開くときと、その階の展示室に入るときに読む。 */
export type FloorModule = {
  halls: HallLayout[];
  /** その階の水槽で選べる水景。 */
  scenes: Record<string, SceneSummary>;
};

/** 展示室のモジュール（virtual:hall/<id>）。展示室に入るときに読む。 */
export type HallModule = {
  roomImageUrl: string;
  /** 部屋の並び順の水槽。 */
  tanks: TankDefinition[];
  scenes: LoadedScene[];
  species: FishSpeciesDefinition[];
  /** 全種の体の画像の URL（virtual:fish-images）。 */
  fishImages: Readonly<Record<string, string>>;
};

/** 生き物のモジュール（virtual:species/<id>）。図鑑で解説を開くときに読む。 */
export type SpeciesModule = {
  default: FishSpeciesDefinition;
};

/** 水槽ごとの種の並びのモジュール（virtual:tank-species）。起動後に読み、まだ見ていない水槽と生き物の印に使う。 */
export type TankSpeciesModule = {
  /** 水槽ごとの、今の種の並び。開いている展示室の水槽だけ。 */
  tankSpecies: Readonly<Record<string, readonly string[]>>;
  /** 既読の保存がないときの、既読の最初の状態（museum/seen-baseline.json）。 */
  seenBaseline: Readonly<Record<string, readonly string[]>>;
};
