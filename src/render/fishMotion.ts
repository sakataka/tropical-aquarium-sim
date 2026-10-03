/** 臨界減衰の解析解。低いfpsでも反転が発散・振動しない。 */
export function stepTurnSpring(value: number, velocity: number, target: number, deltaSec: number) {
  const omega = 8;
  const offset = value - target;
  const change = velocity + omega * offset;
  const decay = Math.exp(-omega * deltaSec);
  return { value: target + (offset + change * deltaSec) * decay,
    velocity: (velocity - omega * change * deltaSec) * decay };
}

export function blendAngle(from: number, to: number, amount: number) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}

/** メッシュ上の接地点を補間する。反転と変形後の座標を使う。 */
export function sampleMeshPoint(positions: Float32Array, columns: number, rows: number, u: number, v: number) {
  const x = u * (columns - 1), y = v * (rows - 1);
  const col = Math.min(columns - 2, Math.floor(x)), row = Math.min(rows - 2, Math.floor(y));
  const tx = x - col, ty = y - row;
  const sample = (axis: number) => {
    const a = positions[(row * columns + col) * 2 + axis]!;
    const b = positions[(row * columns + col + 1) * 2 + axis]!;
    const c = positions[((row + 1) * columns + col) * 2 + axis]!;
    const d = positions[((row + 1) * columns + col + 1) * 2 + axis]!;
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  return { x: sample(0), y: sample(1) };
}
