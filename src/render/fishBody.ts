import { MeshPlane, type Texture } from "pixi.js";
import type { FishInstance, FishSpeciesDefinition } from "../core";

const VERTICES_X = 26;
const VERTICES_Y = 5;
// エビは脚と触角を別々に動かすため、縦の分割を細かくする。
const CRUSTACEAN_VERTICES_Y = 10;
const TURN_STIFFNESS = 64;
const TURN_DAMPING = 16;
const TURN_HYSTERESIS_CM_PER_SEC = 0.35;
const MIN_TURN_INTERVAL_SEC = 0.7;
const MIN_PROFILE_WIDTH = 0.1;
const MAX_PITCH_RAD = 0.42;
const MAX_TRIP_PITCH_RAD = 1.05;
const NOSE_DOWN_PITCH_RAD = 0.32;

const DEFAULT_SWIM = {
  tailBeatHz: 2.6,
  bodyWaveStart: 0.38,
  waveCount: 0.65,
  tailSweepRad: 0.5,
  verticalFlex: 0.012,
  bodyPlan: "fish" as "fish" | "crustacean",
  headStart: 0,
};

type SwimStyle = typeof DEFAULT_SWIM;
type BehaviorMode = FishInstance["behaviorMode"];

const MODE_AMPLITUDE: Record<BehaviorMode, number> = {
  kick: 1,
  coast: 0.34,
  pause: 0.14,
  forage: 0.2,
  rest: 0.06,
};

const MODE_BEAT: Record<BehaviorMode, number> = {
  kick: 1.25,
  coast: 0.62,
  pause: 0.4,
  forage: 0.5,
  rest: 0.25,
};

type MotionState = {
  phase: number;
  amplitude: number;
  yaw: number;
  yawVelocity: number;
  targetYaw: number;
  sinceTurnSec: number;
  pitch: number;
  /** エビの脚の運び。歩く速さに合わせて進む。 */
  stridePhase: number;
  clockSec: number;
  surfaceRotation?: number;
};

// 尾の振りや向きの状態は魚ごとに1つだけ持ち、部屋と水槽画面で共有する。
// 画面を重ねて切り替える間も、2つの画面の魚が同じ形で描かれる。
const motionStates = new Map<string, MotionState>();

function getMotionState(fish: FishInstance): MotionState {
  let state = motionStates.get(fish.id);
  if (!state) {
    const yaw = fish.facing === 1 ? Math.PI : 0;
    state = {
      phase: (Math.abs(fish.seed) % 628) / 100,
      amplitude: 0.12,
      yaw,
      yawVelocity: 0,
      targetYaw: yaw,
      sinceTurnSec: MIN_TURN_INTERVAL_SEC,
      pitch: 0,
      stridePhase: (Math.abs(fish.seed) % 314) / 100,
      clockSec: (Math.abs(fish.seed) % 1000) / 37,
    };
    motionStates.set(fish.id, state);
  }
  return state;
}

/** 水槽から外れた魚の状態を捨てる。 */
export function forgetMotionState(fishId: string) {
  motionStates.delete(fishId);
}

// 横向き写真1枚をメッシュとして変形し、尾の振りと反転を立体的に見せる。
// 画像は頭が左を向いている前提（yaw 0 = 左向き、yaw π = 右向き）。
export class FishBody {
  readonly mesh: MeshPlane;
  private readonly basePositions: Float32Array;
  private readonly swim: SwimStyle;
  private readonly pivotX: number;
  private readonly width: number;
  private readonly height: number;
  private readonly motion: MotionState;

  private readonly verticesY: number;

  constructor(texture: Texture, species: FishSpeciesDefinition, fish: FishInstance) {
    this.swim = { ...DEFAULT_SWIM, ...species.swim };
    this.verticesY = this.swim.bodyPlan === "crustacean" ? CRUSTACEAN_VERTICES_Y : VERTICES_Y;
    this.mesh = new MeshPlane({ texture, verticesX: VERTICES_X, verticesY: this.verticesY });
    this.mesh.autoResize = false;
    this.basePositions = new Float32Array(this.mesh.geometry.positions);
    this.width = texture.width;
    this.height = texture.height;
    this.pivotX = texture.width * 0.42;
    this.mesh.pivot.set(this.pivotX, texture.height / 2);
    this.motion = getMotionState(fish);
  }

  update(fish: FishInstance, deltaSec: number, bottomY: number, surfaceAngle?: number) {
    this.mesh.pivot.y = this.height * (fish.surfaceMotion ? 0.88 : 0.5);
    this.updateYaw(fish, deltaSec);
    const speed = Math.hypot(fish.velocity.x, fish.velocity.y);
    const turning = Math.abs(Math.sin(this.motion.yaw));
    const modeAmplitude = MODE_AMPLITUDE[fish.behaviorMode];
    const targetAmplitude = this.swim.tailSweepRad * Math.min(1.25, modeAmplitude + turning * 0.7);
    this.motion.amplitude += (targetAmplitude - this.motion.amplitude) * (1 - Math.exp(-5 * deltaSec));
    const beatHz = this.swim.tailBeatHz * MODE_BEAT[fish.behaviorMode] *
      (1 + Math.min(0.5, speed * 0.04));
    this.motion.phase = (this.motion.phase + deltaSec * beatHz * Math.PI * 2) % (Math.PI * 200);

    // 水面へ息継ぎに行くときは大きく頭を上げ、底を探るときは頭を下げる。
    const maxPitch = fish.targetKind === "surfaceVisit" || fish.targetKind === "descend"
      ? MAX_TRIP_PITCH_RAD
      : MAX_PITCH_RAD;
    const headingPitch = speed > 0.08
      ? clamp(Math.atan2(fish.velocity.y, Math.abs(fish.velocity.x)) * 0.8, -maxPitch, maxPitch)
      : 0;
    const targetPitch = fish.posture === "noseDown"
      ? Math.max(headingPitch, NOSE_DOWN_PITCH_RAD)
      : headingPitch;
    this.motion.pitch += (targetPitch - this.motion.pitch) * (1 - Math.exp(-4 * deltaSec));
    // 頭が向いている側へ傾ける。反転中は自然に0へ近づく。
    if (surfaceAngle !== undefined) {
      this.motion.surfaceRotation = this.motion.surfaceRotation === undefined ? surfaceAngle
        : this.motion.surfaceRotation + (surfaceAngle - this.motion.surfaceRotation) * (1 - Math.exp(-6 * deltaSec));
      this.mesh.rotation = this.motion.surfaceRotation;
    } else {
      this.motion.surfaceRotation = undefined;
      this.mesh.rotation = -this.motion.pitch * Math.cos(this.motion.yaw);
    }
    if (this.swim.bodyPlan === "crustacean") this.deformCrustacean(fish, speed, deltaSec, bottomY);
    else this.deform();
  }

  destroy() {
    this.mesh.destroy();
  }

  private updateYaw(fish: FishInstance, deltaSec: number) {
    this.motion.sinceTurnSec += deltaSec;
    const vx = fish.velocity.x;
    if (fish.surfaceMotion && this.motion.sinceTurnSec >= MIN_TURN_INTERVAL_SEC &&
      (fish.facing === 1) !== (this.motion.targetYaw > Math.PI / 2)) {
      this.motion.targetYaw = fish.facing === 1 ? Math.PI : 0;
      this.motion.sinceTurnSec = 0;
    }
    const facingRight = this.motion.targetYaw > Math.PI / 2;
    if (this.motion.sinceTurnSec >= MIN_TURN_INTERVAL_SEC) {
      if (!facingRight && vx > TURN_HYSTERESIS_CM_PER_SEC) {
        this.motion.targetYaw = Math.PI;
        this.motion.sinceTurnSec = 0;
      } else if (facingRight && vx < -TURN_HYSTERESIS_CM_PER_SEC) {
        this.motion.targetYaw = 0;
        this.motion.sinceTurnSec = 0;
      }
    }
    const accel = (this.motion.targetYaw - this.motion.yaw) * TURN_STIFFNESS - this.motion.yawVelocity * TURN_DAMPING;
    this.motion.yawVelocity += accel * deltaSec;
    this.motion.yaw += this.motion.yawVelocity * deltaSec;
  }

  // エビは尾を振らない。脚を前から後ろへ波のように運んで歩き、触角をゆっくり揺らし、
  // 底や水草をついばむときは頭を小刻みに下げる。速く進むときは腹の遊泳肢で泳ぎ、腹が小さくしなる。
  private deformCrustacean(fish: FishInstance, speed: number, deltaSec: number, bottomY: number) {
    const positions = this.mesh.geometry.positions;
    const base = this.basePositions;
    const motion = this.motion;
    motion.clockSec += deltaSec;
    // kick は通常移動のリズムでも発生する。底にいる間は加速中も脚で歩く。
    const swimming = !fish.surfaceMotion && fish.position.y < bottomY - 0.6 && speed > 0.04;
    const picking = fish.behaviorMode === "forage";
    const walking = !swimming && speed > 0.04;
    const strideHz = swimming ? 5.5 : walking ? Math.min(4, 1.6 + speed * 6) : 0.5;
    motion.stridePhase = (motion.stridePhase + deltaSec * strideHz * Math.PI * 2) % (Math.PI * 200);
    const legAmplitude = swimming ? 0.006 : walking ? 0.014 : 0.003;
    const bob = walking ? Math.sin(motion.stridePhase * 2) * this.height * 0.006 : 0;
    const head = this.swim.headStart;
    const t = motion.clockSec;
    const rawCos = Math.cos(motion.yaw);
    const profile = Math.sign(rawCos || 1) * Math.max(MIN_PROFILE_WIDTH, Math.abs(rawCos));
    const columns = VERTICES_X;
    for (let index = 0; index < columns * this.verticesY; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const u = column / (columns - 1);
      const v = row / (this.verticesY - 1);
      let dx = 0;
      let dy = bob;
      // 脚（体の下側）を、前の脚から順に少し遅れて動かす。
      const leg = smoothstep(0.55, 0.95, v) * smoothstep(head, head + 0.08, u) * (1 - smoothstep(0.62, 0.8, u));
      dx += Math.sin(motion.stridePhase - u * 14) * this.width * legAmplitude * leg;
      dy += Math.max(0, Math.sin(motion.stridePhase - u * 14 + 1.2)) * this.height * legAmplitude * 1.4 * leg;
      // 触角は根元から先へ向かって大きく、ゆっくり揺れる。
      if (head > 0 && u < head) {
        const reach = ((head - u) / head) ** 1.4;
        dy += (Math.sin(t * 1.6 + u * 7 + fish.seed) * 0.05 + Math.sin(t * 3.7 + u * 13) * 0.015) * this.height * reach;
        dx += Math.sin(t * 1.1 + fish.seed) * this.width * 0.012 * reach;
      }
      // ついばむときは、頭先を小刻みに下げる。
      if (picking) {
        const front = smoothstep(head + 0.22, head, u);
        dy += Math.max(0, Math.sin(t * Math.PI * 2 * 2.4)) * this.height * 0.028 * front;
      }
      // 泳ぐときは腹の後ろ半分が遊泳肢の拍に合わせて小さくしなる。
      if (swimming) {
        const abdomen = smoothstep(0.55, 1, u);
        dy += Math.sin(motion.stridePhase * 0.5 - u * 3) * this.height * 0.02 * abdomen;
      }
      const x = base[index * 2]! + dx;
      positions[index * 2] = this.pivotX + (x - this.pivotX) * profile;
      positions[index * 2 + 1] = base[index * 2 + 1]! + dy;
    }
    this.mesh.geometry.getBuffer("aPosition").update();
  }

  private deform() {
    const positions = this.mesh.geometry.positions;
    const base = this.basePositions;
    const { bodyWaveStart, waveCount, verticalFlex } = this.swim;
    const columnStep = this.width / (VERTICES_X - 1);
    const rawCos = Math.cos(this.motion.yaw);
    const profile = Math.sign(rawCos || 1) * Math.max(MIN_PROFILE_WIDTH, Math.abs(rawCos));
    // 反転の途中は体を少し曲げ、頭から回り込む感じを出す。
    const turnBend = Math.sin(this.motion.yaw) * Math.sign(this.motion.yawVelocity) * 0.06;

    let projectedX = 0;
    const columnX = new Float32Array(VERTICES_X);
    const columnY = new Float32Array(VERTICES_X);
    for (let column = 0; column < VERTICES_X; column += 1) {
      const u = column / (VERTICES_X - 1);
      const envelope = smoothstep(bodyWaveStart - 0.2, 1, u) ** 1.6;
      const wave = Math.sin(this.motion.phase - u * waveCount * Math.PI * 2);
      const angle = this.motion.amplitude * envelope * wave;
      if (column > 0) projectedX += columnStep * Math.cos(angle);
      columnX[column] = projectedX;
      columnY[column] = this.height * (verticalFlex * envelope * wave + turnBend * u * u);
    }
    // 頭の位置を固定したまま、尾側だけを縮める。
    for (let index = 0; index < VERTICES_X * VERTICES_Y; index += 1) {
      const column = index % VERTICES_X;
      const x = columnX[column]!;
      positions[index * 2] = this.pivotX + (x - this.pivotX) * profile;
      positions[index * 2 + 1] = base[index * 2 + 1]! + columnY[column]!;
    }
    this.mesh.geometry.getBuffer("aPosition").update();
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
