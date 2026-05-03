import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFeedingEvent,
  createTapEvent,
  getActiveFeeding,
  getActiveTap,
} from "./aquariumEvents";
import { TANK_60CM } from "./tank";

describe("aquarium interaction events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates feeding events in the surface feed band", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(createFeedingEvent(1200)).toEqual({
      position: {
        x: 30,
        y: 3,
      },
      strength: 1,
      createdAtMs: 1200,
    });
  });

  it("moves active feeding downward and fades strength over time", () => {
    const feeding = createFeedingEvent(1000);

    expect(getActiveFeeding(feeding, 4500)).toEqual({
      ...feeding,
      position: {
        x: feeding.position.x,
        y: 3 + 3.5 * 4.8,
      },
      strength: 1 - 3.5 / 7,
    });
    expect(getActiveFeeding(feeding, 9000)).toBeUndefined();
  });

  it("caps feeding at the lower visible tank margin", () => {
    const active = getActiveFeeding(
      {
        position: { x: 30, y: TANK_60CM.heightCm - 5 },
        strength: 1,
        createdAtMs: 1000,
      },
      6000,
    );

    expect(active?.position.y).toBe(TANK_60CM.heightCm - 4);
    expect(active?.strength).toBeCloseTo(0.2857, 4);
  });

  it("creates and expires tap events with the same fade curve used by the app", () => {
    const tap = createTapEvent({ x: 20, y: 12 }, 1000);

    expect(tap).toEqual({
      position: { x: 20, y: 12 },
      strength: 1,
      createdAtMs: 1000,
    });
    expect(getActiveTap(tap, 1450)?.strength).toBeCloseTo(1 - 0.45 / 1.35);
    expect(getActiveTap(tap, 2300)).toBeUndefined();
  });
});
