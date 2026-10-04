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

const museumSchema = z.object({
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

export type MuseumFloor = z.infer<typeof floorSchema>;
export type MuseumMapArea = z.infer<typeof mapAreaSchema>;

/** 館内図に並べる展示室の枠。room があれば開ける展示室、なければ準備中。 */
export type HallSlot = {
  id: string;
  displayName: string;
  floor: MuseumFloor;
  room?: FishRoomDefinition;
  /** 館内図の絵の中の範囲（絵の画素）。 */
  mapArea: MuseumMapArea;
};

const parsed = museumSchema.parse(museumJson);

export const museum = {
  ...parsed,
  floors: [...parsed.floors].sort((a, b) => a.order - b.order),
};

const hallSlots: HallSlot[] = museum.floors.flatMap((floor) => floor.halls.map((hall, index) => {
  const room = fishRooms.find((item) => item.id === hall.id);
  const displayName = room?.displayName ?? hall.displayName;
  if (!displayName) throw new Error(`Hall "${hall.id}" has no room and no displayName`);
  const width = floor.mapArea.width / floor.halls.length;
  return {
    id: hall.id,
    displayName,
    floor,
    room,
    mapArea: { ...floor.mapArea, x: floor.mapArea.x + width * index, width },
  };
}));

for (const room of fishRooms) {
  if (!hallSlots.some((slot) => slot.id === room.id)) {
    throw new Error(`Room "${room.id}" is not placed on any floor in museum.json`);
  }
}

/** その階の展示室の枠を左から順に。準備中の枠も含む。 */
export function getHallSlotsOnFloor(floorId: string): HallSlot[] {
  return hallSlots.filter((slot) => slot.floor.id === floorId);
}

/** 展示室のある階。 */
export function getFloorOfHall(hallId: string): MuseumFloor | undefined {
  return hallSlots.find((slot) => slot.id === hallId)?.floor;
}

export function getHallById(hallId: string | null | undefined): FishRoomDefinition | undefined {
  return fishRooms.find((room) => room.id === hallId);
}
