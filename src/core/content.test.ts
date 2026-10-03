import { describe, expect, test } from "vitest";
import { fishCatalog } from "./catalog";
import { fishRooms } from "./room";
import { aquariumScenes, getSceneById } from "./sceneCatalog";
import { visibleSurfaceIntervals, worldPoint } from "./surfaceMotion";
import { aquariumTanks } from "./tankCatalog";
import { getRenderedSurfaceFrame } from "./testContent";
import { insideTerrain } from "./terrainMotion";

// 魚・水景・水槽・部屋を追加したときの取り違えを、画面を開く前に見つける。
const fishImages = import.meta.glob("../content/fish/*/body.webp");
const plateImages = import.meta.glob("../content/environment/scenes/*/plate.webp");
const roomImages = import.meta.glob("../content/room/*.webp");

describe("content wiring", () => {
  test("every tank is placed in exactly one room, and rooms only place known tanks", () => {
    const placed = fishRooms.flatMap((room) => room.tanks.map((item) => item.tankId));
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(aquariumTanks.map((tank) => tank.id).sort());
    expect(new Set(fishRooms.map((room) => room.id)).size).toBe(fishRooms.length);
    for (const room of fishRooms) expect(roomImages[`../content/room/${room.image}`], room.id).toBeDefined();
  });

  test("tanks reference existing scenes and species, with default stock inside the limits", () => {
    for (const tank of aquariumTanks) {
      for (const sceneId of tank.sceneIds) expect(getSceneById(sceneId), `${tank.id}/${sceneId}`).toBeDefined();
      for (const slot of tank.species) expect(fishCatalog[slot.speciesId], `${tank.id}/${slot.speciesId}`).toBeDefined();
      for (const entry of tank.defaultStock) {
        const limit = tank.species.find((slot) => slot.speciesId === entry.speciesId)?.maxCount ?? 0;
        expect(entry.count, `${tank.id}/${entry.speciesId}`).toBeLessThanOrEqual(limit);
      }
      expect(tank.defaultStock.reduce((sum, entry) => sum + entry.count, 0)).toBeLessThanOrEqual(tank.maxTotalFish);
    }
  });

  test("every species and scene belongs to a tank and has its generated image", () => {
    const usedSpecies = new Set(aquariumTanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)));
    for (const id of Object.keys(fishCatalog)) {
      expect(usedSpecies.has(id), `${id} is not offered by any tank`).toBe(true);
      expect(fishImages[`../content/fish/${id}/body.webp`], `${id}/body.webp`).toBeDefined();
    }
    const usedScenes = new Set(aquariumTanks.flatMap((tank) => tank.sceneIds));
    for (const scene of aquariumScenes) {
      expect(usedScenes.has(scene.id), `${scene.id} is not offered by any tank`).toBe(true);
      expect(plateImages[`../content/environment/scenes/${scene.id}/plate.webp`], `${scene.id}/plate.webp`).toBeDefined();
    }
  });

  test("swim parameters only describe body parts the body plan has", () => {
    for (const species of Object.values(fishCatalog)) {
      // 触角の範囲 headStart は、エビ（crustacean）にだけ意味がある。
      if (species.swim?.bodyPlan !== "crustacean") expect(species.swim?.headStart, species.id).toBeUndefined();
    }
  });

  test("species with a home shelter find that kind of shelter in every scene of their tanks", () => {
    for (const tank of aquariumTanks) for (const slot of tank.species) {
      const home = fishCatalog[slot.speciesId]!.ecology.habits.find((habit) => habit.type === "homeShelter");
      if (!home || home.type !== "homeShelter") continue;
      for (const sceneId of tank.sceneIds) {
        const kinds = getSceneById(sceneId)!.terrain?.shelters?.map((shelter) => shelter.kind) ?? [];
        expect(kinds, `${slot.speciesId} needs a ${home.kind} in ${sceneId}`).toContain(home.kind);
      }
    }
  });

  test("terrain stays visible inside the glass as each scene is framed on screen", () => {
    for (const tank of aquariumTanks) for (const sceneId of tank.sceneIds) {
      const scene = getSceneById(sceneId)!;
      if (!scene.terrain) continue;
      const frame = getRenderedSurfaceFrame(tank, scene);
      for (const surface of scene.terrain.surfaces) {
        expect(visibleSurfaceIntervals(surface, tank, frame).length, `${sceneId}/${surface.id}`).toBeGreaterThan(0);
      }
      for (const shelter of scene.terrain.shelters ?? []) {
        const point = worldPoint(shelter, tank, frame);
        const label = `${sceneId}/${shelter.id}`;
        expect(point.x, label).toBeGreaterThan(tank.safeMarginCm);
        expect(point.x, label).toBeLessThan(tank.widthCm - tank.safeMarginCm);
        expect(point.y, label).toBeGreaterThan(tank.safeMarginCm);
        expect(point.y, label).toBeLessThan(tank.heightCm - tank.safeMarginCm);
        // 住みかの中心が岩の内側にあると、魚がたどり着けない。
        const species = Object.values(fishCatalog)[0]!;
        expect(insideTerrain(point, point.depth, { scene, tank, frame, species }), label).toBe(false);
      }
    }
  });
});
