import { describe, expect, test } from "vitest";
import { getHallSlotsOnFloor, museum } from "../core/museum";
import { fishRooms } from "../core/room";
import { cropAroundTanks } from "./HallPreview";

describe("hall preview crop", () => {
  test("keeps the frame's aspect, stays inside the hall picture and shows every tank", () => {
    for (const hall of fishRooms) {
      const area = museum.floors.flatMap((floor) => getHallSlotsOnFloor(floor.id)).find((slot) => slot.id === hall.id)!.mapArea;
      const aspect = area.width / area.height;
      const crop = cropAroundTanks(hall, aspect);
      expect(crop.width * hall.aspectRatio / crop.height, hall.id).toBeCloseTo(aspect, 6);
      expect(crop.x, hall.id).toBeGreaterThanOrEqual(0);
      expect(crop.y, hall.id).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width, hall.id).toBeLessThanOrEqual(1 + 1e-9);
      expect(crop.y + crop.height, hall.id).toBeLessThanOrEqual(1 + 1e-9);
      for (const { tankId, glass } of hall.tanks) {
        expect(glass.x, tankId).toBeGreaterThanOrEqual(crop.x);
        expect(glass.y, tankId).toBeGreaterThanOrEqual(crop.y);
        expect(glass.x + glass.width, tankId).toBeLessThanOrEqual(crop.x + crop.width);
        expect(glass.y + glass.height, tankId).toBeLessThanOrEqual(crop.y + crop.height);
      }
    }
  });
});
