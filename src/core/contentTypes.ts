// ビルド時に内容ファイルから作るモジュール（vite/contentModules.ts）の形。
// 起動時に読むのは館の索引（virtual:museum）だけで、展示室の中身（virtual:hall/<id>）と
// 生き物（virtual:species/<id>）は、その展示室に入るときや図鑑で開くときに読む。
import type { FishRoomDefinition } from "./contentSchemas";
import type { AquariumScene, FishSpeciesDefinition, LightingId, TankDefinition } from "./types";

/** 館内図に並べる展示室。部屋の絵のガラスの位置と、館内図の縮小版に要る数だけを持つ。 */
export type HallSummary = FishRoomDefinition & {
  /** 館内図の縮小版に映す、部屋の絵の小さな版。 */
  thumbUrl: string;
  /** 展示室の水槽で見られる生き物の数（同じ生き物を数えない）。 */
  speciesCount: number;
};

/** 水槽の見出し。どの展示室にあるか、選べる水景、名前。 */
export type TankSummary = {
  id: string;
  hallId: string;
  displayName: string;
  sceneIds: string[];
};

/** 館内図と設定パネルで水景を映すのに要る分。名前や地形は展示室のモジュールが持つ。 */
export type SceneSummary = {
  thumbUrl?: string;
  defaultLighting: LightingId;
  framing?: { plateBottom: number };
};

export type LoadedScene = AquariumScene & { plateUrl?: string };

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
