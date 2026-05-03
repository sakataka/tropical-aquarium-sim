import { TANK_60CM } from "./tank";
import type { FeedingEvent, TapEvent, Vec2 } from "./types";

export function createFeedingEvent(nowMs = performance.now()): FeedingEvent {
  return {
    position: {
      x: 18 + Math.random() * 24,
      y: 3,
    },
    strength: 1,
    createdAtMs: nowMs,
  };
}

export function createTapEvent(position: Vec2, nowMs = performance.now()): TapEvent {
  return {
    position,
    strength: 1,
    createdAtMs: nowMs,
  };
}

export function getActiveFeeding(
  feeding?: FeedingEvent,
  nowMs = performance.now(),
): FeedingEvent | undefined {
  if (!feeding) {
    return undefined;
  }

  const ageSec = (nowMs - (feeding.createdAtMs ?? nowMs)) / 1000;
  if (ageSec > 6.2) {
    return undefined;
  }

  return {
    ...feeding,
    position: {
      x: feeding.position.x,
      y: Math.min(TANK_60CM.heightCm - 4, feeding.position.y + ageSec * 4.8),
    },
    strength: Math.max(0.15, 1 - ageSec / 7),
  };
}

export function getActiveTap(
  tapEvent?: TapEvent,
  nowMs = performance.now(),
): TapEvent | undefined {
  if (!tapEvent) {
    return undefined;
  }

  const ageSec = (nowMs - (tapEvent.createdAtMs ?? nowMs)) / 1000;
  if (ageSec > 1.2) {
    return undefined;
  }

  return {
    ...tapEvent,
    strength: Math.max(0.12, 1 - ageSec / 1.35),
  };
}
