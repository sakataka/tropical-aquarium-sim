import { z } from "zod";
import roomJson from "../content/room/room.json";
import specialRoomJson from "../content/room/room-special.json";

const rectSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
});

const roomSchema = z.object({
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
export type RoomLayout = z.infer<typeof roomSchema>;

export const fishRoom: RoomLayout = roomSchema.parse(roomJson);

export type FishRoomDefinition = RoomLayout & { id: string; displayName: string };
export const fishRooms: FishRoomDefinition[] = [
  { ...fishRoom, id: "freshwater", displayName: "フィッシュルーム" },
  { ...roomSchema.parse(specialRoomJson), id: "special", displayName: "海と古代魚の部屋" },
];

// 最後に選んだ水槽から部屋も復元するため、保存キーや水槽IDを変更しない。
export function getRoomForTank(tankId: string): FishRoomDefinition {
  return fishRooms.find((room) => room.tanks.some((tank) => tank.tankId === tankId)) ?? fishRooms[0]!;
}
