import type { AquariumScene, SurfaceFrame, TankDefinition, Vec2 } from "./types";

export type FrameRect = { x: number; y: number; width: number; height: number };

/**
 * 一枚絵の水景を前面ガラスへ cover で敷いたときの、画像の矩形（ガラスと同じ座標系）。
 * 部屋・水槽画面・テストが同じ計算を使い、地形の座標と描画を一致させる。
 *
 * - 側面ガラスまで見える水槽は overscan の分だけ広げる。
 * - 水景は、既定で画像の下端（砂底）をガラスの下端に合わせ、歩く面を切らない。
 * - ガラスが画像より極端に横長な水槽では、`framing.plateBottom` で画像のどの高さを
 *   ガラスの下端に合わせるかを決め、砂底だけが映らず水の層も残るようにする。
 */
export function framePlate(
  plate: { width: number; height: number },
  glass: FrameRect,
  overscan: { x: number; y: number },
  scene: Pick<AquariumScene, "framing"> | undefined,
): FrameRect {
  const scale = Math.max(glass.width * overscan.x / plate.width, glass.height * overscan.y / plate.height);
  const width = plate.width * scale;
  const height = plate.height * scale;
  const x = glass.x + (glass.width - width) / 2;
  const bottom = scene?.framing?.plateBottom ?? (scene ? 1 : undefined);
  if (bottom === undefined) return { x, y: glass.y + (glass.height - height) / 2, width, height };
  // 画像の上端がガラスの中へ入って隙間ができない範囲に収める。
  const anchor = Math.min(1, Math.max(glass.height / height, bottom));
  return { x, y: glass.y + glass.height - anchor * height, width, height };
}

/** 画像の矩形を、前面ガラスに対する比率（地形の座標変換に使う）へ直す。 */
export function toSurfaceFrame(plateRect: FrameRect, glass: FrameRect): SurfaceFrame {
  return {
    x: (plateRect.x - glass.x) / glass.width,
    y: (plateRect.y - glass.y) / glass.height,
    width: plateRect.width / glass.width,
    height: plateRect.height / glass.height,
  };
}

/** 背景画像に対する比率の点を、前面ガラスに対する比率へ直す（泡の出る位置など）。 */
export function imageToGlass(point: Vec2, frame: SurfaceFrame): Vec2 {
  return { x: frame.x + point.x * frame.width, y: frame.y + point.y * frame.height };
}

/** 水景の寄り道先（流木・水草）を水槽の実寸 (cm) で返す。 */
export function getStructurePoints(tank: TankDefinition, scene: AquariumScene, frame: SurfaceFrame): Vec2[] {
  return scene.structurePoints.map((point) => {
    const glass = imageToGlass(point, frame);
    return { x: glass.x * tank.widthCm, y: glass.y * tank.heightCm };
  });
}
