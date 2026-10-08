import type { FishInstance } from "../core/types";
import type { MotionState } from "./bodyPlans/types";

// 描画ライブラリに依存しない。アプリ本体が魚を外すときに呼べるよう、fishBody から分けている。

/** 向きを変えてから次に変えられるまでの最短の秒数。 */
export const MIN_TURN_INTERVAL_SEC = 0.7;

// 尾の振りや向きの状態は魚ごとに1つだけ持ち、部屋と水槽画面で共有する。
// 画面を重ねて切り替える間も、2つの画面の魚が同じ形で描かれる。
const motionStates = new Map<string, MotionState>();

export function getMotionState(fish: FishInstance): MotionState {
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
      detailPhase: (Math.abs(fish.seed) % 628) / 100,
      flick: 0,
      stepBlend: 0,
      swimBlend: 0,
    };
    motionStates.set(fish.id, state);
  }
  return state;
}

/** 水槽から外れた魚の状態を捨てる。 */
export function forgetMotionState(fishId: string) {
  motionStates.delete(fishId);
}
