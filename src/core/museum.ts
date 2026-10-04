import { z } from "zod";
import museumJson from "../content/museum/museum.json";
import { fishRooms, type FishRoomDefinition } from "./room";

/** 館内図の絵の中の範囲。絵の画素で表す。 */
const mapAreaSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const floorSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 上から順の並び。1 が地上で、大きいほど深い階。 */
  order: z.number().finite(),
  /** 「地上」「地下1階」など。 */
  label: z.string().min(1),
  /** 館内図の断面図に添える短い階名（"1F"、"B1" など）。 */
  shortLabel: z.string().min(1).max(3),
  /** 展示ラベル用の英字の階名（"Floor B1" など）。 */
  exhibitLabel: z.string().min(1),
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
  description: z.string().min(1),
  /** 館内図の断面図で、この階の展示フロアが描かれている範囲。 */
  mapArea: mapAreaSchema,
});

const museumSchema = z.object({
  displayName: z.string().min(1),
  exhibitName: z.string().min(1),
  lede: z.string().min(1),
  /** 館内図の断面図。画像は src/content/museum/ に置く。 */
  map: z.object({
    image: z.string().regex(/^[\w-]+\.webp$/),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  floors: z.array(floorSchema).min(1),
});

export type MuseumFloor = z.infer<typeof floorSchema>;

const parsed = museumSchema.parse(museumJson);

export const museum = {
  ...parsed,
  floors: [...parsed.floors].sort((a, b) => a.order - b.order),
};

for (const room of fishRooms) {
  if (!museum.floors.some((floor) => floor.id === room.floorId)) {
    throw new Error(`Room "${room.id}" is on an unknown floor: ${room.floorId}`);
  }
}

export function getFloorById(floorId: string): MuseumFloor | undefined {
  return museum.floors.find((floor) => floor.id === floorId);
}

/** その階にある展示室。まだ展示室のない階は空の配列。 */
export function getHallsOnFloor(floorId: string): FishRoomDefinition[] {
  return fishRooms.filter((room) => room.floorId === floorId);
}

export function getHallById(hallId: string | null | undefined): FishRoomDefinition | undefined {
  return fishRooms.find((room) => room.id === hallId);
}
