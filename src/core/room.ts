import { z } from "zod";
import roomJson from "../content/room/room.json";

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
