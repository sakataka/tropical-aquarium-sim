import { smoothstep } from "../../core/math";
import { profileWidth, VERTICES_X, type BodyMesh, type BodyPlanRenderer, type DeformFrame } from "./types";

/** 砂から出始める、休みの残り秒数。 */
const EMERGE_SEC = 2.5;
/**
 * 斜め上から見た画像を、底すれすれの目線の水景になじませるため、接地点を中心に縦に縮める割合。
 * 縮めないと甲が立ち上がって、底から浮いて見える。
 */
const VIEW_FLATTEN = 0.78;

// カブトガニは斜め上から見た画像で、前（左）に丸い前体の甲、その後ろに棘のある後体の甲、右へ尾剣が伸びる。
// 脚は甲の下に隠れているので、甲ごと底を滑るように這い、後体の甲と尾剣が歩みに合わせてかすかに揺れる。
// ついばむときは脚を伸ばして前体の前を持ち上げ、前の脚で砂を探る。驚くと甲を伏せる。
// 砂に潜るときは前縁を砂へ差し込みながら沈み、甲を低くする（砂の面より下を隠して沈めるのは fishBody が burial から描く）。
function deformHorseshoeCrab(mesh: BodyMesh, { fish, speed, deltaSec }: DeformFrame) {
  const { positions, base, width, height, pivotX, verticesY, motion, swim } = mesh;
  motion.clockSec += deltaSec;
  const surface = fish.surfaceMotion;
  const ease = (current: number, target: number, rise: number, fall: number) =>
    current + (target - current) * (1 - Math.exp(-(target > current ? rise : fall) * deltaSec));
  const walking = speed > 0.04;
  motion.stepBlend = ease(motion.stepBlend, walking ? 1 : 0, 4, 2);
  // 潜るときは数秒かけて沈み、出るときはそれより速く砂から抜け出す。
  motion.burial = ease(motion.burial, surface?.burrowed && surface.pauseSec > EMERGE_SEC ? 1 : 0, 0.7, 1.4);
  motion.flick = ease(motion.flick, (fish.alarmSec ?? 0) > 0 ? 1 : 0, 10, 1.2);
  motion.lift = ease(motion.lift, fish.behaviorMode === "forage" && !surface?.burrowed ? 1 : 0, 1.5, 2);
  const strideHz = 1.2 + Math.min(1.5, speed * 0.6);
  motion.stridePhase = (motion.stridePhase + deltaSec * strideHz * Math.PI * 2 * motion.stepBlend) % (Math.PI * 200);
  const t = motion.clockSec;
  const telsonStart = swim.bodyWaveStart;
  const telsonX = telsonStart * width;
  const footY = swim.footAnchor.y * height;
  // 尾剣は付け根を軸に、ゆっくり振れる。歩くと歩みに合わせて、前を持ち上げると梃子のように先が下がる。
  const telsonAngle = Math.sin(t * 0.45 + motion.detailPhase) * 0.035 +
    Math.sin(motion.stridePhase) * 0.025 * motion.stepBlend + motion.lift * 0.06 - motion.flick * 0.03;
  const bob = Math.sin(motion.stridePhase * 2) * height * 0.003 * motion.stepBlend;
  const probe = Math.sin(t * 5.5 + motion.detailPhase) * height * 0.006 * motion.lift;
  // 潜り始めと出る途中に、前縁を砂へ差し込む。
  const dig = Math.sin(Math.PI * Math.min(1, motion.burial * 1.4)) * height * 0.035;
  const flatten = VIEW_FLATTEN * (1 - motion.burial * 0.15);
  const profile = profileWidth(motion.yaw);
  for (let index = 0; index < VERTICES_X * verticesY; index += 1) {
    const column = index % VERTICES_X;
    const u = column / (VERTICES_X - 1);
    const bx = base[index * 2]!;
    const by = base[index * 2 + 1]!;
    const telson = smoothstep(telsonStart, telsonStart + 0.06, u);
    const shell = 1 - telson;
    // 前体の前縁ほど大きく動く。
    const front = Math.max(0, 1 - u / telsonStart) * shell;
    // 後体の甲（前体との継ぎ目より後ろ）は、歩みに合わせて前体と少しずれて揺れる。
    const hinge = smoothstep(0.36, 0.46, u) * shell;
    let dy = bob * shell + Math.sin(motion.stridePhase + 1.1) * height * 0.004 * motion.stepBlend * hinge;
    dy -= (motion.lift * height * 0.05 + probe) * front;
    dy += motion.flick * height * (0.01 + 0.025 * front);
    dy += dig * front;
    dy += (bx - telsonX) * telsonAngle * telson;
    const y = footY + (by + dy - footY) * flatten;
    positions[index * 2] = pivotX + (bx - pivotX) * profile;
    positions[index * 2 + 1] = y;
  }
}

export const horseshoeCrabRenderer: BodyPlanRenderer = { verticesY: 6, deform: deformHorseshoeCrab };
