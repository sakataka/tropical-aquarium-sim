import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer } from "./types";

// 魚。体の後ろ半分に波を送り、尾を振る。頭の位置を固定したまま、尾側だけを縮める。
function deformFish({ positions, base, width, height, pivotX, verticesY, swim, motion }: BodyMesh) {
  const { bodyWaveStart, waveCount, verticalFlex } = swim;
  const columnStep = width / (VERTICES_X - 1);
  const profile = profileWidth(motion.yaw);
  // 反転の途中は体を少し曲げ、頭から回り込む感じを出す。
  const turnBend = Math.sin(motion.yaw) * Math.sign(motion.yawVelocity) * 0.06;

  let projectedX = 0;
  const columnX = new Float32Array(VERTICES_X);
  const columnY = new Float32Array(VERTICES_X);
  for (let column = 0; column < VERTICES_X; column += 1) {
    const u = column / (VERTICES_X - 1);
    const envelope = smoothstep(bodyWaveStart - 0.2, 1, u) ** 1.6;
    const wave = Math.sin(motion.phase - u * waveCount * Math.PI * 2);
    const angle = motion.amplitude * envelope * wave;
    if (column > 0) projectedX += columnStep * Math.cos(angle);
    columnX[column] = projectedX;
    columnY[column] = height * (verticalFlex * envelope * wave + turnBend * u * u);
  }
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const x = columnX[column]!;
    positions[index * 2] = pivotX + (x - pivotX) * profile;
    positions[index * 2 + 1] = base[index * 2 + 1]! + columnY[column]!;
  }
}

export const fishRenderer: BodyPlanRenderer = { verticesY: 5, deform: deformFish };
