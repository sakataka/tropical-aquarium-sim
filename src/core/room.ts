import type { FishRoomDefinition } from "./contentSchemas";

export type { FishRoomDefinition, RoomRect } from "./contentSchemas";

type TankPlacement = FishRoomDefinition["tanks"][number];

// 部屋の絵に置いた水槽のガラスの形。ビルド時（水槽の見えている水の高さ）と画面の両方で使う。

/** 部屋の絵に置かれたガラスの縦横比（幅 / 高さ）。水槽画面はこの比率で水景を切り取る。 */
export function glassAspect(room: Pick<FishRoomDefinition, "aspectRatio">, placement: TankPlacement): number {
  return (placement.glass.width * room.aspectRatio) / placement.glass.height;
}

/** 側面ガラスまで含めた切り抜き範囲が、前面ガラスの何倍か。水景はここまで広げて描く。 */
export function windowOverscan(placement: TankPlacement): { x: number; y: number } {
  return { x: placement.window.width / placement.glass.width, y: placement.window.height / placement.glass.height };
}
