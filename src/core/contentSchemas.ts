import { z } from "zod";
import { SHELTER_KINDS, type AquariumScene } from "./types";

// 館・展示室・水槽・水景の内容ファイルの形。ビルド時（vite/contentModules.ts）とテストで検証し、
// アプリは検証済みの内容を読むだけにする（起動時に zod を読まない）。
// ビルド設定からも読むので、import.meta.glob など Vite の機能に依存しない。

const unit = z.number().finite().min(0).max(1);

/** 館内図の絵の中の範囲。絵の画素で表す。 */
const mapAreaSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** 階に置く展示室の枠。展示室（room/*.json）があれば開き、なければ「準備中」と出す。 */
const hallSlotSchema = z.object({
  /** 展示室のID。room/*.json の id と同じにする。 */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 準備中の展示室の名前。展示室ができたら room/*.json の displayName を使う。 */
  displayName: z.string().min(1).optional(),
});

const floorSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 館内図で上から並べる順。上の階ほど小さい。 */
  order: z.number().finite(),
  /** 「1階」「地下1階」など。 */
  label: z.string().min(1),
  /** 館内図の断面図に添える短い階名（"1F"、"B1" など）。 */
  shortLabel: z.string().min(1).max(3),
  /** 展示ラベル用の英字の階名（"Floor B1" など）。 */
  exhibitLabel: z.string().min(1),
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
  description: z.string().min(1),
  /** 館内図の断面図で、この階の展示フロアが描かれている範囲。展示室はこれを左から等分する。 */
  mapArea: mapAreaSchema,
  /** この階の展示室の枠を左から順に。館内のどこに展示室があるかは、ここだけで決める。 */
  halls: z.array(hallSlotSchema).min(1),
});

export const museumSchema = z.object({
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
  lede: z.string().min(1),
  /** 館内図の断面図。画像は src/content/museum/ に置く。 */
  map: z.object({
    image: z.string().regex(/^[\w-]+\.webp$/),
    width: z.number().positive(),
    height: z.number().positive(),
    /** 狭い画面で切り出す横の範囲（絵の画素）。建物と階名の札が収まるようにする。 */
    focus: z.object({ x: z.number().nonnegative(), width: z.number().positive() }),
  }),
  floors: z.array(floorSchema).min(1),
});

export type MuseumDefinition = z.infer<typeof museumSchema>;
export type MuseumFloor = z.infer<typeof floorSchema>;
export type MuseumMapArea = z.infer<typeof mapAreaSchema>;

const rectSchema = z.object({
  x: unit,
  y: unit,
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
});

export const roomSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  /** 部屋の見出し。 */
  displayName: z.string().min(1),
  /** 部屋の切り替えボタンに出す短い名前。 */
  shortName: z.string().min(1),
  /** 同じフォルダにある部屋の一枚絵のファイル名。 */
  image: z.string().regex(/^[\w-]+\.webp$/),
  aspectRatio: z.number().finite().positive(),
  tanks: z.array(z.object({
    tankId: z.string().min(1),
    /** 水槽の前面ガラス。魚の座標系と、寄るときの目標に使う。 */
    glass: rectSchema,
    /** 部屋の絵で切り抜いた範囲（側面ガラスを含む）。水景はここまで描く。 */
    window: rectSchema,
  })).min(1),
});

export type RoomRect = z.infer<typeof rectSchema>;
export type FishRoomDefinition = z.infer<typeof roomSchema>;

export const tankSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
  depthCm: z.number().finite().positive(),
  maxTotalFish: z.number().int().positive(),
  sceneIds: z.array(z.string().min(1)).min(1),
  species: z.array(z.object({
    speciesId: z.string().min(1),
    maxCount: z.number().int().positive(),
  })).min(1),
  defaultStock: z.array(z.object({
    speciesId: z.string().min(1),
    count: z.number().int().nonnegative(),
  })),
});

const surfacePointSchema = z.object({ x: unit, y: unit, depth: unit });
export const terrainSchema = z.object({
  surfaces: z.array(z.object({
    id: z.string().min(1),
    material: z.enum(["sand", "stone", "wood", "leaf"]),
    points: z.array(surfacePointSchema).min(2).refine((points) =>
      points.slice(1).every((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y) > 0.0001),
    { message: "Surface segments must have visible length" }),
  })).min(1),
  occluders: z.array(z.object({
    id: z.string().min(1),
    depth: unit,
    polygon: z.array(z.object({ x: unit, y: unit })).min(3),
  })),
  obstacles: z.array(z.object({
    id: z.string().min(1), center: surfacePointSchema,
    radius: z.object({ x: unit.gt(0), y: unit.gt(0) }), depthRadius: unit.gt(0),
  })).optional(),
  shelters: z.array(surfacePointSchema.extend({
    id: z.string().min(1),
    kind: z.enum(SHELTER_KINDS).optional(),
  })).optional(),
}).refine((terrain) => new Set(terrain.surfaces.map((s) => s.id)).size === terrain.surfaces.length,
{ message: "Surface ids must be unique" })
  .refine((terrain) => [terrain.occluders, terrain.obstacles ?? [], terrain.shelters ?? []]
    .every((items) => new Set(items.map((s) => s.id)).size === items.length),
  { message: "Terrain ids must be unique within each collection" });

export type SceneHeader = Omit<AquariumScene, "structurePoints" | "bubbleSources" | "terrain">;

/** 水景の見出し（scene.json）。名前、照明、水の色、画像の置き方。 */
export const sceneHeaderSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().finite(),
  displayName: z.string().min(1),
  description: z.string().min(1),
  defaultLighting: z.enum(["natural", "cool", "evening", "night"]),
  waterColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  framing: z.object({ plateBottom: unit.gt(0) }).optional(),
  waterLine: z.object({ front: unit, back: unit }).refine((line) => line.back <= line.front, {
    message: "waterLine.back must not be below waterLine.front",
  }).optional(),
}) satisfies z.ZodType<SceneHeader>;

/** 水景の地形（terrain.json）。 */
export const sceneTerrainSchema = z.object({
  structurePoints: z.array(z.object({ x: unit, y: unit })),
  bubbleSources: z.array(z.object({ x: unit, y: unit })),
  terrain: terrainSchema,
});
