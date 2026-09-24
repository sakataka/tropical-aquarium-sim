import { MeshPlane, Rectangle, Texture } from "pixi.js";
import type { FishInstance, FishSpeciesDefinition } from "../core";

const VERTICES_X = 26;
const VERTICES_Y = 5;
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

  constructor(texture: Texture, species: FishSpeciesDefinition, fish: FishInstance) {
    this.mesh = new MeshPlane({ texture, verticesX: VERTICES_X, verticesY: VERTICES_Y });
    this.mesh.autoResize = false;
    this.basePositions = new Float32Array(this.mesh.geometry.positions);
    this.swim = { ...DEFAULT_SWIM, ...species.swim };
    this.width = texture.width;
    this.height = texture.height;
    this.pivotX = texture.width * 0.42;
    this.mesh.pivot.set(this.pivotX, texture.height / 2);
    this.motion = getMotionState(fish);
  }

  update(fish: FishInstance, deltaSec: number) {
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
    this.mesh.rotation = -this.motion.pitch * Math.cos(this.motion.yaw);
    this.deform();
  }

  destroy() {
    this.mesh.destroy();
  }

  private updateYaw(fish: FishInstance, deltaSec: number) {
    this.motion.sinceTurnSec += deltaSec;
    const vx = fish.velocity.x;
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

const bodyTextureCache = new WeakMap<Texture, Texture>();

export function getBodyTexture(texture: Texture, species: FishSpeciesDefinition): Texture {
  const cached = bodyTextureCache.get(texture);
  if (cached) return cached;
  const bounds = species.sourceBodyBounds;
  const frame = new Rectangle(
    bounds.x,
    bounds.y,
    Math.min(bounds.width, texture.width - bounds.x),
    Math.min(bounds.height, texture.height - bounds.y),
  );
  const body = new Texture({ source: texture.source, frame });
  bodyTextureCache.set(texture, body);
  return body;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
