import { describe, expect, test } from "vitest";
import { getBodyPlan, getBodyPlanId, HEAD_START_PLANS } from "./bodyPlans";
import { fishCatalog, getLoadedTanks, getSceneById } from "./catalog";
import { buildings, floors, halls as fishRooms, getHallLayout, getSceneSummary, museum, tankSummaries } from "./museum";
import { visibleSurfaceIntervals, worldPoint } from "./surfaceMotion";
import { getRenderedSurfaceFrame } from "./testContent";
import { insideTerrain } from "./terrainMotion";

const aquariumTanks = getLoadedTanks();

// 魚・水景・水槽・部屋を追加したときの取り違えを、画面を開く前に見つける。
const fishImages = import.meta.glob("../content/fish/*/body.webp");
const plateImages = import.meta.glob("../content/environment/scenes/*/plate.webp");
const thumbImages = import.meta.glob("../content/environment/scenes/*/thumb.webp");
const roomImages = import.meta.glob("../content/room/*.webp");
const roomThumbs = import.meta.glob("../content/room/thumbs/*.webp");
const museumImages = import.meta.glob("../content/museum/buildings/*/*.webp");
const folderIds = (files: Record<string, unknown>) => Object.keys(files).map((path) => path.split("/").slice(-2)[0]!).sort();
const tankFolders = folderIds(import.meta.glob("../content/tanks/*/tank.json"));
const sceneFolders = folderIds(import.meta.glob("../content/environment/scenes/*/scene.json"));

describe("content wiring", () => {
  test("every tank is placed in exactly one room, and rooms only place known tanks", () => {
    const placed = fishRooms.flatMap((room) => room.tankIds);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(tankFolders);
    expect(aquariumTanks.map((tank) => tank.id)).toEqual(placed);
    expect(new Set(fishRooms.map((room) => room.id)).size).toBe(fishRooms.length);
    for (const room of fishRooms) {
      const layout = getHallLayout(room.id)!;
      // 館の索引の水槽の並びと、階のモジュールのガラスの並びが同じ。
      expect(layout.tanks.map((item) => item.tankId), room.id).toEqual(room.tankIds);
      expect(roomImages[`../content/room/${layout.image}`], room.id).toBeDefined();
      // 館内図の縮小版用。scripts/build-room-thumbs.py で作る。
      expect(roomThumbs[`../content/room/thumbs/${layout.image}`], `${room.id} thumb`).toBeDefined();
    }
  });

  test("the startup index holds headings only, and each floor module brings its halls' glass and scenes", () => {
    // 起動時に読む索引には、部屋の絵のガラスの位置や水景の情報を入れない（水槽の数で重くなるため）。
    for (const room of fishRooms) expect(Object.keys(room).sort(), room.id).toEqual(["displayName", "floorId", "id", "shortName", "speciesCount", "tankIds"]);
    for (const tank of tankSummaries) expect(Object.keys(tank).sort(), tank.id).toEqual(["displayName", "hallId", "id", "sceneIds"]);
    for (const tank of tankSummaries) {
      for (const sceneId of tank.sceneIds) expect(getSceneSummary(sceneId)?.defaultLighting, sceneId).toBeDefined();
    }
  });

  test("every room is placed once in a hall slot of the museum, and planned slots have names", () => {
    // 階と展示室の id は URL に使うので、建物をまたいでも重ならない。
    const buildingIds = buildings.map((building) => building.id);
    expect(new Set(buildingIds).size).toBe(buildingIds.length);
    expect(new Set(buildings.map((building) => building.order)).size).toBe(buildingIds.length);
    expect(museum.buildings.flatMap((building) => building.floors)).toEqual(floors);
    const floorIds = floors.map((floor) => floor.id);
    expect(new Set(floorIds).size).toBe(floorIds.length);
    for (const building of buildings) {
      expect(building.floors.every((floor) => floor.buildingId === building.id), building.id).toBe(true);
      expect(new Set(building.floors.map((floor) => floor.order)).size, building.id).toBe(building.floors.length);
    }
    const slotIds = floors.flatMap((floor) => floor.halls.map((hall) => hall.id));
    expect(new Set(slotIds).size).toBe(slotIds.length);
    for (const room of fishRooms) expect(slotIds, room.id).toContain(room.id);
    for (const floor of floors) {
      for (const hall of floor.halls) {
        if (!fishRooms.some((room) => room.id === hall.id)) expect(hall.displayName, hall.id).toBeTruthy();
      }
    }
  });

  test("each building's section image exists and each floor area sits inside it without overlapping", () => {
    for (const building of buildings) {
      expect(museumImages[`../content/museum/buildings/${building.id}/${building.map.image}`], building.id).toBeDefined();
      const { focus, width, height } = building.map;
      expect(focus.x + focus.width, building.id).toBeLessThanOrEqual(width);
      const areas = building.floors.map((floor) => floor.mapArea);
      for (const [index, area] of areas.entries()) {
        const id = building.floors[index]!.id;
        expect(area.x + area.width, id).toBeLessThanOrEqual(width);
        expect(area.y + area.height, id).toBeLessThanOrEqual(height);
        // 狭い画面で切り出す範囲に、階の範囲が収まる（左の階名の札の分も空ける）。
        expect(area.x, id).toBeGreaterThanOrEqual(focus.x + 40);
        expect(area.x + area.width, id).toBeLessThanOrEqual(focus.x + focus.width);
        // 階は上から順に並び、断面図の中でも下の階ほど下にある。
        if (index > 0) expect(area.y, id).toBeGreaterThanOrEqual(areas[index - 1]!.y + areas[index - 1]!.height);
      }
    }
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
      // 種ごとの上限を全部使えば、水槽の上限まで入れられる（耐久テストは上限まで埋めて泳がせる）。
      expect(tank.species.reduce((sum, slot) => sum + slot.maxCount, 0), tank.id).toBeGreaterThanOrEqual(tank.maxTotalFish);
    }
  });

  test("every species and scene belongs to a tank and has its generated image", () => {
    const usedSpecies = new Set(aquariumTanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)));
    // 図鑑に載る種は、館のどこかへ行けば最低1匹は見られる（既定の匹数に入っている）。
    const shownSpecies = new Set(aquariumTanks.flatMap((tank) =>
      tank.defaultStock.filter((entry) => entry.count > 0).map((entry) => entry.speciesId)));
    for (const id of Object.keys(fishCatalog)) {
      expect(usedSpecies.has(id), `${id} is not offered by any tank`).toBe(true);
      expect(shownSpecies.has(id), `${id} is not shown in any tank by default`).toBe(true);
      expect(fishImages[`../content/fish/${id}/body.webp`], `${id}/body.webp`).toBeDefined();
    }
    const usedScenes = new Set(aquariumTanks.flatMap((tank) => tank.sceneIds));
    for (const id of sceneFolders) {
      expect(usedScenes.has(id), `${id} is not offered by any tank`).toBe(true);
      // 展示室を読むと、その水槽の水景が地形まで読み込まれる（テストの準備で全展示室を読んでいる）。
      expect(getSceneById(id), `${id}/terrain.json`).toBeDefined();
      expect(plateImages[`../content/environment/scenes/${id}/plate.webp`], `${id}/plate.webp`).toBeDefined();
      // 館内図の縮小版用。scripts/build-scene-thumbs.py で作る。
      expect(thumbImages[`../content/environment/scenes/${id}/thumb.webp`], `${id}/thumb.webp`).toBeDefined();
    }
  });

  test("swim parameters only describe body parts the body plan has", () => {
    for (const species of Object.values(fishCatalog)) {
      // headStart は、触角のあるエビと腕のあるイカにだけ意味がある。
      if (!HEAD_START_PLANS.includes(getBodyPlanId(species))) expect(species.swim?.headStart, species.id).toBeUndefined();
      // 傘の範囲 bell は、漂う体のつくり（クラゲ）にだけ意味がある。
      if (!getBodyPlan(species).drifts) expect(species.swim?.bell, species.id).toBeUndefined();
      // 震わせるひれ fins と立った尾の始まり tailStartY は、タツノオトシゴの仲間にだけ意味がある。
      if (getBodyPlanId(species) !== "seahorse") {
        expect(species.swim?.fins, species.id).toBeUndefined();
        expect(species.swim?.tailStartY, species.id).toBeUndefined();
      }
      // 体の中心線 spine は、体を立てて巣穴から出し入れするチンアナゴの仲間に必要で、ほかには意味がない。
      if (getBodyPlan(species).burrowDwelling) expect(species.swim?.spine?.length, species.id).toBeGreaterThanOrEqual(3);
      else expect(species.swim?.spine, species.id).toBeUndefined();
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
