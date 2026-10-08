import { Graphics, MeshPlane, type Texture } from "pixi.js";
import type { FishInstance, FishSpeciesDefinition } from "../core";
import { blendAngle, sampleMeshPoint, stepTurnSpring } from "./fishMotion";
import { BODY_PLANS } from "../core/bodyPlans";
import { DEFAULT_BELL } from "../core/driftMotion";
import { clamp } from "../core/math";
import { BODY_PLAN_RENDERERS, VERTICES_X, type BodyPlanRenderer, type MotionState, type SwimStyle } from "./bodyPlans";
import { getMotionState, MIN_TURN_INTERVAL_SEC } from "./motionState";

const TURN_HYSTERESIS_CM_PER_SEC = 0.35;
const MAX_PITCH_RAD = 0.42;
const MAX_TRIP_PITCH_RAD = 1.05;
const NOSE_DOWN_PITCH_RAD = 0.32;
/** 砂に潜りきったときに沈める量（画像の高さに対する比率）と、砂をかぶって薄く見える量。 */
const BURIAL_SINK = 0.32;
const BURIAL_FADE = 0.2;

const DEFAULT_SWIM: SwimStyle = {
  tailBeatHz: 2.6,
  bodyWaveStart: 0.38,
  waveCount: 0.65,
  tailSweepRad: 0.5,
  verticalFlex: 0.012,
  bodyPlan: "fish",
  headStart: 0,
  mouthAnchor: { x: .025, y: .62 },
  footAnchor: { x: .42, y: .95 },
  bell: DEFAULT_BELL,
};

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
  private readonly renderer: BodyPlanRenderer;
  /**
   * 横歩きの生き物（カニ）と前後どちらへも泳ぐ生き物（イカ）、巣穴から動かない生き物（チンアナゴ）は、
   * 進む向きではなくシミュレーションの向き（facing）に従って体を向ける。
   */
  private readonly keepsFacing: boolean;
  /** 前後どちらへも泳ぐ生き物は、後ろへ進むときに胴の側を進む向きへ傾ける。 */
  private readonly reverses: boolean;
  /** 漂う生き物（クラゲ）は向きを変えず、傘の中心を軸に傾く。 */
  private readonly drifts: boolean;
  private readonly bodyLengthCm: number;
  /** 描き方が決める、位置に置くメッシュ上の固定の点（エイ）。 */
  private readonly fixedPivot?: { x: number; y: number };
  /** 砂に潜っている間だけ使う、砂の面より上を残す切り抜き。 */
  private burialMask?: Graphics;

  constructor(texture: Texture, species: FishSpeciesDefinition, fish: FishInstance) {
    this.swim = { ...DEFAULT_SWIM, ...species.swim };
    this.renderer = BODY_PLAN_RENDERERS[this.swim.bodyPlan];
    this.verticesY = this.renderer.verticesY;
    this.reverses = BODY_PLANS[this.swim.bodyPlan].reverses;
    this.keepsFacing = BODY_PLANS[this.swim.bodyPlan].sideways || this.reverses || BODY_PLANS[this.swim.bodyPlan].burrowDwelling;
    this.drifts = BODY_PLANS[this.swim.bodyPlan].drifts;
    this.bodyLengthCm = species.realBodyLengthCm * fish.bodyLengthVariance;
    this.mesh = new MeshPlane({ texture, verticesX: VERTICES_X, verticesY: this.verticesY });
    this.mesh.autoResize = false;
    this.basePositions = new Float32Array(this.mesh.geometry.positions);
    this.width = texture.width;
    this.height = texture.height;
    this.fixedPivot = this.renderer.pivot?.({ width: texture.width, height: texture.height, swim: this.swim });
    this.pivotX = this.fixedPivot?.x ?? texture.width * (this.drifts ? 0.5 : 0.42);
    this.mesh.pivot.set(this.pivotX, texture.height / 2);
    this.motion = getMotionState(fish);
  }

  update(fish: FishInstance, deltaSec: number, bottomY: number, surfaceAngle?: number) {
    if (this.drifts) {
      this.updateDrifter(fish, deltaSec, bottomY);
      return;
    }
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
    // 後ろへ進むとき（イカ）は、胴の側が上下を先導する。
    const backward = this.reverses && fish.velocity.x * fish.facing < 0 ? -1 : 1;
    const headingPitch = speed > 0.08
      ? clamp(Math.atan2(fish.velocity.y, Math.abs(fish.velocity.x)) * 0.8 * backward, -maxPitch, maxPitch) *
        (this.renderer.pitchScale ?? 1)
      : 0;
    const targetPitch = fish.posture === "noseDown"
      ? Math.max(headingPitch, NOSE_DOWN_PITCH_RAD)
      : headingPitch;
    this.motion.pitch += (targetPitch - this.motion.pitch) * (1 - Math.exp(-4 * deltaSec));
    // 頭が向いている側へ傾ける。反転中は自然に0へ近づく。
    const freeRotation = -this.motion.pitch * Math.cos(this.motion.yaw);
    if (surfaceAngle !== undefined) {
      const contactRotation = surfaceAngle + (fish.contact?.kind === "mouth" ? -NOSE_DOWN_PITCH_RAD * Math.cos(this.motion.yaw) : 0);
      const targetRotation = fish.surfaceMotion ? contactRotation : blendAngle(freeRotation, contactRotation, fish.contact?.weight ?? 0);
      this.motion.surfaceRotation = this.motion.surfaceRotation === undefined ? targetRotation
        : blendAngle(this.motion.surfaceRotation, targetRotation, 1 - Math.exp(-6 * deltaSec));
      this.mesh.rotation = this.motion.surfaceRotation;
    } else {
      this.motion.surfaceRotation = undefined;
      this.mesh.rotation = -this.motion.pitch * Math.cos(this.motion.yaw);
    }
    this.renderer.deform({
      positions: this.mesh.geometry.positions,
      base: this.basePositions,
      width: this.width,
      height: this.height,
      pivotX: this.pivotX,
      verticesY: this.verticesY,
      swim: this.swim,
      motion: this.motion,
    }, { fish, speed, deltaSec, bottomY, bodyLengthCm: this.bodyLengthCm });
    this.mesh.geometry.getBuffer("aPosition").update();
    if (this.fixedPivot) {
      this.mesh.pivot.set(this.fixedPivot.x, this.fixedPivot.y);
      return;
    }
    // 息継ぎに面を離れる・戻る間も、脚の接地点を基準にして連続させる。
    const desiredAnchor = fish.surfaceMotion || fish.breathTrip ? this.swim.footAnchor
      : fish.contact?.kind === "mouth" ? this.swim.mouthAnchor : { x: .42, y: .82 };
    if (fish.contact || fish.surfaceMotion) {
      const previous = this.motion.contactAnchor;
      const response = 1 - Math.exp(-5 * deltaSec);
      this.motion.contactAnchor = previous ? { x: previous.x + (desiredAnchor.x - previous.x) * response,
        y: previous.y + (desiredAnchor.y - previous.y) * response } : desiredAnchor;
    } else this.motion.contactAnchor = undefined;
    const anchor = this.motion.contactAnchor ?? desiredAnchor;
    const point = sampleMeshPoint(this.mesh.geometry.positions, VERTICES_X, this.verticesY, anchor.x, anchor.y);
    const weight = fish.surfaceMotion ? 1 : fish.contact?.weight ?? 0;
    const burial = this.motion.burial;
    this.mesh.pivot.set(this.pivotX + (point.x - this.pivotX) * weight,
      this.height / 2 + (point.y - this.height / 2) * weight - burial * this.height * BURIAL_SINK);
    this.updateBurial(burial, point.y);
  }

  // 砂に潜っている生き物は、潜る前の体の下端（砂の面）より下を切り取りながら沈め、砂をかぶって少し薄く見せる。
  private updateBurial(burial: number, anchorY: number) {
    if (burial < 0.002) {
      if (this.mesh.mask) this.mesh.mask = null;
      if (this.burialMask) this.burialMask.visible = false;
      return;
    }
    const parent = this.mesh.parent;
    if (!parent) return;
    this.burialMask ??= new Graphics();
    if (this.burialMask.parent !== parent) parent.addChild(this.burialMask);
    const scale = this.mesh.scale.y;
    const groundY = this.mesh.position.y + (this.height - anchorY) * scale;
    const reach = this.width * Math.abs(this.mesh.scale.x) * 1.5;
    this.burialMask.clear().rect(this.mesh.position.x - reach, groundY - reach, reach * 2, reach).fill(0xffffff);
    this.burialMask.visible = true;
    this.mesh.mask = this.burialMask;
    this.mesh.alpha *= 1 - burial * BURIAL_FADE;
  }

  // 画像は反転せず、傘の中心（クリオネは翼足の付け根）を軸にシミュレーションの傾き（fish.tilt）だけ回す。
  private updateDrifter(fish: FishInstance, deltaSec: number, bottomY: number) {
    this.motion.yaw = 0;
    this.motion.targetYaw = 0;
    this.motion.yawVelocity = 0;
    this.mesh.rotation = fish.tilt ?? 0;
    this.renderer.deform({
      positions: this.mesh.geometry.positions,
      base: this.basePositions,
      width: this.width,
      height: this.height,
      pivotX: this.pivotX,
      verticesY: this.verticesY,
      swim: this.swim,
      motion: this.motion,
    }, { fish, speed: Math.hypot(fish.velocity.x, fish.velocity.y), deltaSec, bottomY, bodyLengthCm: this.bodyLengthCm });
    this.mesh.geometry.getBuffer("aPosition").update();
    const bell = this.swim.bell;
    this.mesh.pivot.set(this.pivotX, this.height * (this.swim.wings?.y ?? (bell.top + bell.bottom) / 2));
  }

  destroy() {
    this.mesh.destroy();
    this.burialMask?.destroy();
  }

  private updateYaw(fish: FishInstance, deltaSec: number) {
    this.motion.sinceTurnSec += deltaSec;
    const vx = fish.velocity.x;
    const anchored = this.keepsFacing || fish.surfaceMotion || (fish.contact && fish.contact.weight > .5);
    if (anchored && this.motion.sinceTurnSec >= MIN_TURN_INTERVAL_SEC &&
      (fish.facing === 1) !== (this.motion.targetYaw > Math.PI / 2)) {
      this.motion.targetYaw = fish.facing === 1 ? Math.PI : 0;
      this.motion.sinceTurnSec = 0;
    }
    const facingRight = this.motion.targetYaw > Math.PI / 2;
    if (!anchored && this.motion.sinceTurnSec >= MIN_TURN_INTERVAL_SEC) {
      if (!facingRight && vx > TURN_HYSTERESIS_CM_PER_SEC) {
        this.motion.targetYaw = Math.PI;
        this.motion.sinceTurnSec = 0;
      } else if (facingRight && vx < -TURN_HYSTERESIS_CM_PER_SEC) {
        this.motion.targetYaw = 0;
        this.motion.sinceTurnSec = 0;
      }
    }
    const next = stepTurnSpring(this.motion.yaw, this.motion.yawVelocity, this.motion.targetYaw, deltaSec);
    this.motion.yaw = next.value;
    this.motion.yawVelocity = next.velocity;
  }
}
export { forgetMotionState } from "./motionState";
