import { z } from "zod";
import type { TankDefinition } from "./types";

type RoomJsonModule = { default: unknown };

const rectSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
});

const roomSchema = z.object({
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

// 部屋は src/content/room/*.json を置くと自動で読み込む。水槽を増やすときは部屋の絵とガラス位置を足す。
const roomModules = import.meta.glob<RoomJsonModule>("../content/room/*.json", { eager: true });

export const fishRooms: FishRoomDefinition[] = Object.values(roomModules)
  .map((module) => roomSchema.parse(module.default))
  .sort((a, b) => a.order - b.order);

if (fishRooms.length === 0) throw new Error("No fish rooms found");

// 最後に選んだ水槽から部屋も復元するため、保存キーや水槽IDを変更しない。
export function getRoomForTank(tankId: string): FishRoomDefinition {
  return fishRooms.find((room) => room.tanks.some((tank) => tank.tankId === tankId)) ?? fishRooms[0]!;
}

// 水槽画面は部屋で見えているガラスと同じ縦横比で水景を切り取る。
// こうすると、部屋から寄り終えた構図と水槽画面の構図が一致する。
export function getGlassAspect(tank: TankDefinition): number {
  const placement = getTankPlacement(tank.id);
  if (!placement) return tank.widthCm / tank.heightCm;
  return (placement.glass.width * getRoomForTank(tank.id).aspectRatio) / placement.glass.height;
}

/** 側面ガラスまで含めた切り抜き範囲が、前面ガラスの何倍か。水景はここまで広げて描く。 */
export function getWindowOverscan(tankId: string): { x: number; y: number } {
  const placement = getTankPlacement(tankId);
  return placement
    ? { x: placement.window.width / placement.glass.width, y: placement.window.height / placement.glass.height }
    : { x: 1, y: 1 };
}

function getTankPlacement(tankId: string) {
  return getRoomForTank(tankId).tanks.find((item) => item.tankId === tankId);
}
