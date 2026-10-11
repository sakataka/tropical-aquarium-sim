import { describe, expect, test } from "bun:test";
import { getHallLayout, halls } from "../core/museum";
import { cropAroundTanks } from "./HallPreview";

describe("hall preview crop", () => {
  test("keeps the frame's aspect, stays inside the hall picture and shows every tank", () => {
    for (const summary of halls) {
      const hall = getHallLayout(summary.id)!;
      // 階の一覧のカード（2:1）と、それより縦長・横長の枠でも崩れない。
      for (const aspect of [2, 1.2, 3]) {
        const crop = cropAroundTanks(hall, aspect);
        expect(crop.width * hall.aspectRatio / crop.height, hall.id).toBeCloseTo(aspect, 6);
        expect(crop.x, hall.id).toBeGreaterThanOrEqual(0);
        expect(crop.y, hall.id).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width, hall.id).toBeLessThanOrEqual(1 + 1e-9);
        expect(crop.y + crop.height, hall.id).toBeLessThanOrEqual(1 + 1e-9);
        if (aspect !== 2) continue;
        for (const { tankId, glass } of hall.tanks) {
          expect(glass.x, tankId).toBeGreaterThanOrEqual(crop.x);
          expect(glass.y, tankId).toBeGreaterThanOrEqual(crop.y);
          expect(glass.x + glass.width, tankId).toBeLessThanOrEqual(crop.x + crop.width);
          expect(glass.y + glass.height, tankId).toBeLessThanOrEqual(crop.y + crop.height);
        }
      }
    }
  });
});
