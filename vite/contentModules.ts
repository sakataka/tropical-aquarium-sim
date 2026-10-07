import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import {
  museumSchema,
  roomSchema,
  sceneHeaderSchema,
  sceneTerrainSchema,
  tankSchema,
  type FishRoomDefinition,
  type MuseumDefinition,
  type SceneHeader,
} from "../src/core/contentSchemas";
import type { HallLayout, HallSummary, SceneSummary, TankSummary } from "../src/core/contentTypes";
import { glassAspect } from "../src/core/room";
import { parseFishSpeciesDefinition } from "../src/core/schema";
import { toSpeciesIndexEntry } from "../src/core/speciesIndexEntry";
import type { FishSpeciesDefinition, TankDefinition } from "../src/core/types";

// 内容ファイル（src/content/）を読み、形と参照を検証して、アプリが読むモジュールを作る。
// 中央の一覧ファイルを手で書かず、展示室・水槽・水景・生き物のフォルダを置けば載る。
//
// - virtual:museum        起動時に読む館の索引。館内図の階と、展示室・水槽の見出しだけを持ち、
//                         生き物の数では増えない（展示室と水槽の数に比例する）。
// - virtual:floor/<id>    階の配置。部屋の絵のガラスの位置と、その階の水景の縮小版・既定の照明。
//                         館内図でその階を開くときと、その階の展示室に入るときに読む。
// - virtual:hall/<id>     展示室の中身。水槽の定義、水景の地形、生き物の定義、画像の URL。入るときに読む。
//                         生き物は1種ずつのチャンクに分けず、展示室のチャンクに入れる（入るときの読み込みを1回にする）。
// - virtual:fish-images   全種の体の画像の URL。展示室と図鑑の一覧で使う。
// - virtual:species/<id>  生き物1種。図鑑で解説を開くときに読む。
// - virtual:species-index 図鑑の一覧に使う全種の見出し。図鑑を開くときに読む。

const SAFE_MARGIN_CM = 2;
const PREFIX = "virtual:";

type ContentModel = {
  museum: MuseumDefinition;
  /** 館内図の順（上の階から、階の中は左から）。 */
  halls: FishRoomDefinition[];
  tanks: Map<string, TankDefinition>;
  tankHall: Map<string, string>;
  scenes: Map<string, { header: SceneHeader; terrain: unknown }>;
  species: Map<string, FishSpeciesDefinition>;
  files: string[];
};

class ContentError extends Error {
  constructor(file: string, detail: unknown) {
    super(`${file}: ${detail instanceof Error ? detail.message : String(detail)}`);
  }
}

function readJson(file: string, files: string[]): unknown {
  files.push(file);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new ContentError(file, error);
  }
}

function parse<T>(file: string, files: string[], parser: (value: unknown) => T): T {
  const value = readJson(file, files);
  try {
    return parser(value);
  } catch (error) {
    throw new ContentError(file, error);
  }
}

function folders(dir: string, file: string): string[] {
  return readdirSync(dir).sort().filter((name) => existsSync(join(dir, name, file)));
}

export function readContent(contentDir: string): ContentModel {
  const files: string[] = [];
  const museumFile = join(contentDir, "museum/museum.json");
  const museumData = parse(museumFile, files, (value) => museumSchema.parse(value));
  const museum = { ...museumData, floors: [...museumData.floors].sort((a, b) => a.order - b.order) };

  const roomDir = join(contentDir, "room");
  const rooms = new Map<string, FishRoomDefinition>();
  for (const name of readdirSync(roomDir).filter((item) => item.endsWith(".json")).sort()) {
    const file = join(roomDir, name);
    const room = parse(file, files, (value) => roomSchema.parse(value));
    if (`${room.id}.json` !== name) throw new ContentError(file, `room id "${room.id}" must match its file name`);
    if (!existsSync(join(roomDir, room.image))) throw new ContentError(file, `image not found: ${room.image}`);
    rooms.set(room.id, room);
  }
  const slotIds = museum.floors.flatMap((floor) => floor.halls.map((hall) => hall.id));
  for (const room of rooms.values()) {
    if (!slotIds.includes(room.id)) throw new ContentError(museumFile, `room "${room.id}" is not placed on any floor`);
  }
  const halls = slotIds.flatMap((id) => rooms.get(id) ?? []);

  const tankHall = new Map<string, string>();
  const placements = new Map<string, { room: FishRoomDefinition; placement: FishRoomDefinition["tanks"][number] }>();
  for (const room of halls) for (const placement of room.tanks) {
    if (tankHall.has(placement.tankId)) {
      throw new ContentError(join(roomDir, `${room.id}.json`), `tank "${placement.tankId}" is already placed in "${tankHall.get(placement.tankId)}"`);
    }
    tankHall.set(placement.tankId, room.id);
    placements.set(placement.tankId, { room, placement });
  }

  const sceneDir = join(contentDir, "environment/scenes");
  const scenes = new Map<string, { header: SceneHeader; terrain: unknown }>();
  for (const id of folders(sceneDir, "scene.json")) {
    const headerFile = join(sceneDir, id, "scene.json");
    const header = parse(headerFile, files, (value) => sceneHeaderSchema.parse(value));
    if (header.id !== id) throw new ContentError(headerFile, `scene id "${header.id}" must match its folder`);
    const terrain = parse(join(sceneDir, id, "terrain.json"), files, (value) => sceneTerrainSchema.parse(value));
    if (!existsSync(join(sceneDir, id, "plate.webp"))) throw new ContentError(headerFile, "plate.webp not found");
    scenes.set(id, { header, terrain });
  }

  const fishDir = join(contentDir, "fish");
  const species = new Map<string, FishSpeciesDefinition>();
  for (const id of folders(fishDir, "species.json")) {
    const file = join(fishDir, id, "species.json");
    const definition = parse(file, files, parseFishSpeciesDefinition);
    if (definition.id !== id) throw new ContentError(file, `species id "${definition.id}" must match its folder`);
    species.set(id, definition);
  }

  const tankDir = join(contentDir, "tanks");
  const tanks = new Map<string, TankDefinition>();
  for (const id of folders(tankDir, "tank.json")) {
    const file = join(tankDir, id, "tank.json");
    const tank = parse(file, files, (value) => tankSchema.parse(value));
    if (tank.id !== id) throw new ContentError(file, `tank id "${tank.id}" must match its folder`);
    const placed = placements.get(id);
    if (!placed) throw new ContentError(file, "tank is not placed in any room");
    for (const sceneId of tank.sceneIds) if (!scenes.has(sceneId)) throw new ContentError(file, `scene not found: ${sceneId}`);
    for (const slot of tank.species) if (!species.has(slot.speciesId)) throw new ContentError(file, `species not found: ${slot.speciesId}`);
    // 部屋の絵のガラスは実寸より横長なことがある。縦を縮めて描くと上下の動きが潰れるので、
    // 横幅とガラスの縦横比から「見えている水の高さ」を求め、縦横の縮尺をそろえる。
    const aspect = glassAspect(placed.room, placed.placement);
    tanks.set(id, {
      ...tank,
      heightCm: Math.min(tank.heightCm, tank.widthCm / aspect),
      specHeightCm: tank.heightCm,
      safeMarginCm: SAFE_MARGIN_CM,
    });
  }
  for (const [tankId, hallId] of tankHall) {
    if (!tanks.has(tankId)) throw new ContentError(join(roomDir, `${hallId}.json`), `tank not found: ${tankId}`);
  }
  if (halls.length === 0) throw new ContentError(roomDir, "no rooms found");

  return { museum, halls, tanks, tankHall, scenes, species, files };
}

/** モジュールのコードを組み立てる。画像の URL は Vite に解決させるため import にする。 */
class ModuleWriter {
  private imports: string[] = [];
  private urls = new Map<string, string>();

  /** 画像の URL を表す識別子。値の中に置き、literal() で式に直す。 */
  url(path: string): string {
    const known = this.urls.get(path);
    if (known) return known;
    const name = `__url${this.urls.size}__`;
    this.urls.set(path, name);
    this.imports.push(`import ${name.slice(2, -2)} from ${JSON.stringify(`${path}?url`)};`);
    return name;
  }

  import(code: string) {
    this.imports.push(code);
  }

  /** JSON にした値の中の URL の識別子を、import した変数に置き換える。 */
  literal(value: unknown): string {
    return JSON.stringify(value).replace(/"__(url\d+)__"/g, "$1");
  }

  toString(body: string[]): string {
    return [...this.imports, ...body].join("\n");
  }
}

const contentPath = (path: string) => `/src/content/${path}`;
/** 大きなデータは JSON.parse で読ませる（同じ内容のオブジェクトリテラルより速く読める）。 */
const jsonParse = (value: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(value))})`;
const thumbPath = (contentDir: string, room: FishRoomDefinition) =>
  existsSync(join(contentDir, "room/thumbs", room.image)) ? `room/thumbs/${room.image}` : `room/${room.image}`;

function museumModule(model: ContentModel, contentDir: string): string {
  const out = new ModuleWriter();
  const halls: HallSummary[] = model.halls.map((room) => ({
    id: room.id,
    displayName: room.displayName,
    shortName: room.shortName,
    floorId: floorOf(model, room.id),
    tankIds: room.tanks.map((placement) => placement.tankId),
    speciesCount: new Set(room.tanks.flatMap((placement) =>
      model.tanks.get(placement.tankId)!.species.map((slot) => slot.speciesId))).size,
  }));
  const tanks: TankSummary[] = model.halls.flatMap((room) => room.tanks.map((placement) => {
    const tank = model.tanks.get(placement.tankId)!;
    return { id: tank.id, hallId: room.id, displayName: tank.displayName, sceneIds: tank.sceneIds };
  }));
  // 階の生き物の数（同じ生き物を数えない）。展示室ごとの数を足すと、階の中で重なる種を数え直してしまう。
  const floorSpeciesCounts = Object.fromEntries(model.museum.floors.map((floor) => [floor.id, new Set(
    model.halls.filter((room) => floorOf(model, room.id) === floor.id).flatMap((room) => room.tanks.flatMap((placement) =>
      model.tanks.get(placement.tankId)!.species.map((slot) => slot.speciesId))),
  ).size]));
  const firstTank = [...model.tanks.values()].sort((a, b) => a.order - b.order)[0]!;
  return out.toString([
    `export const museum = ${out.literal(model.museum)};`,
    `export const halls = ${out.literal(halls)};`,
    `export const floorSpeciesCounts = ${out.literal(floorSpeciesCounts)};`,
    `export const tanks = ${out.literal(tanks)};`,
    `export const mapImageUrl = ${out.literal(out.url(contentPath(`museum/${model.museum.map.image}`)))};`,
    `export const defaultTankId = ${JSON.stringify(firstTank.id)};`,
    `export const hallLoaders = {${model.halls.map((room) =>
      `${JSON.stringify(room.id)}: () => import(${JSON.stringify(`${PREFIX}hall/${room.id}`)})`).join(",")}};`,
    `export const floorLoaders = {${model.museum.floors.map((floor) =>
      `${JSON.stringify(floor.id)}: () => import(${JSON.stringify(`${PREFIX}floor/${floor.id}`)})`).join(",")}};`,
  ]);
}

function floorOf(model: ContentModel, hallId: string): string {
  return model.museum.floors.find((floor) => floor.halls.some((hall) => hall.id === hallId))!.id;
}

function floorModule(model: ContentModel, contentDir: string, floorId: string): string {
  if (!model.museum.floors.some((floor) => floor.id === floorId)) throw new Error(`Unknown floor: ${floorId}`);
  const out = new ModuleWriter();
  const rooms = model.halls.filter((room) => floorOf(model, room.id) === floorId);
  const halls: HallLayout[] = rooms.map((room) => ({
    ...room,
    thumbUrl: out.url(contentPath(thumbPath(contentDir, room))),
  }));
  const scenes: Record<string, SceneSummary> = {};
  for (const room of rooms) for (const placement of room.tanks) {
    for (const id of model.tanks.get(placement.tankId)!.sceneIds) {
      const { header } = model.scenes.get(id)!;
      scenes[id] = {
        thumbUrl: existsSync(join(contentDir, "environment/scenes", id, "thumb.webp"))
          ? out.url(contentPath(`environment/scenes/${id}/thumb.webp`)) : undefined,
        defaultLighting: header.defaultLighting,
        framing: header.framing,
      };
    }
  }
  return out.toString([
    `export const halls = ${out.literal(halls)};`,
    `export const scenes = ${out.literal(scenes)};`,
  ]);
}

function hallModule(model: ContentModel, hallId: string): string {
  const room = model.halls.find((item) => item.id === hallId);
  if (!room) throw new Error(`Unknown hall: ${hallId}`);
  const out = new ModuleWriter();
  const tanks = room.tanks.map((placement) => model.tanks.get(placement.tankId)!);
  const sceneIds = [...new Set(tanks.flatMap((tank) => tank.sceneIds))];
  const scenes = sceneIds.map((id) => {
    const { header, terrain } = model.scenes.get(id)!;
    return { ...header, ...(terrain as object), plateUrl: out.url(contentPath(`environment/scenes/${id}/plate.webp`)) };
  });
  const species = [...new Set(tanks.flatMap((tank) => tank.species.map((slot) => slot.speciesId)))]
    .map((id) => model.species.get(id)!);
  return out.toString([
    `export { default as fishImages } from ${JSON.stringify(`${PREFIX}fish-images`)};`,
    `export const roomImageUrl = ${out.literal(out.url(contentPath(`room/${room.image}`)))};`,
    `export const tanks = ${jsonParse(tanks)};`,
    `export const scenes = ${out.literal(scenes)};`,
    `export const species = ${jsonParse(species)};`,
  ]);
}

function speciesModule(model: ContentModel, speciesId: string): string {
  const species = model.species.get(speciesId);
  if (!species) throw new Error(`Unknown species: ${speciesId}`);
  return `export default ${jsonParse(species)};`;
}

function fishImagesModule(model: ContentModel, contentDir: string): string {
  const out = new ModuleWriter();
  // 描画と一覧には、原画 side.png から体だけを切り出した軽い body.webp を使う
  // （scripts/build-fish-sprites.py で作る）。
  const images = Object.fromEntries([...model.species.keys()]
    .filter((id) => existsSync(join(contentDir, "fish", id, "body.webp")))
    .map((id) => [id, out.url(contentPath(`fish/${id}/body.webp`))]));
  return out.toString([`export default ${out.literal(images)};`]);
}

function speciesIndexModule(model: ContentModel): string {
  // 図鑑の「展示順」は、館内図の順に水槽をたどって最初に出会う順。
  const tankIds = new Map<string, string[]>();
  const rank = new Map<string, number>();
  for (const room of model.halls) for (const placement of room.tanks) {
    for (const slot of model.tanks.get(placement.tankId)!.species) {
      tankIds.set(slot.speciesId, [...new Set([...(tankIds.get(slot.speciesId) ?? []), placement.tankId])]);
      if (!rank.has(slot.speciesId)) rank.set(slot.speciesId, rank.size);
    }
  }
  const entries = [...model.species.values()].map((species) => ({
    ...toSpeciesIndexEntry(species),
    tankIds: tankIds.get(species.id) ?? [],
    exhibitRank: rank.get(species.id),
  }));
  return [
    `import images from ${JSON.stringify(`${PREFIX}fish-images`)};`,
    `export default ${jsonParse(entries)}.map((entry) => ({ ...entry, imageUrl: images[entry.id] }));`,
    `export const loaders = {${[...model.species.keys()].map((id) =>
      `${JSON.stringify(id)}: () => import(${JSON.stringify(`${PREFIX}species/${id}`)})`).join(",")}};`,
  ].join("\n");
}

export function contentModules(contentDir: string): Plugin {
  let model: ContentModel | undefined;
  const isContentFile = (file: string) => file.startsWith(contentDir) && file.endsWith(".json");
  const invalidate = (server: ViteDevServer) => {
    model = undefined;
    for (const module of server.moduleGraph.idToModuleMap.values()) {
      if (module.id?.startsWith(`\0${PREFIX}`)) server.moduleGraph.invalidateModule(module);
    }
    server.ws.send({ type: "full-reload" });
  };
  return {
    name: "content-modules",
    resolveId(source) {
      if (source === `${PREFIX}museum` || source === `${PREFIX}species-index` || source === `${PREFIX}fish-images` ||
        source.startsWith(`${PREFIX}floor/`) || source.startsWith(`${PREFIX}hall/`) ||
        source.startsWith(`${PREFIX}species/`)) return `\0${source}`;
      return undefined;
    },
    load(id) {
      if (!id.startsWith(`\0${PREFIX}`)) return undefined;
      model ??= readContent(contentDir);
      for (const file of model.files) this.addWatchFile(file);
      const name = id.slice(1 + PREFIX.length);
      if (name === "museum") return museumModule(model, contentDir);
      if (name === "species-index") return speciesIndexModule(model);
      if (name === "fish-images") return fishImagesModule(model, contentDir);
      if (name.startsWith("floor/")) return floorModule(model, contentDir, name.slice("floor/".length));
      if (name.startsWith("hall/")) return hallModule(model, name.slice("hall/".length));
      if (name.startsWith("species/")) return speciesModule(model, name.slice("species/".length));
      return undefined;
    },
    watchChange(file) {
      if (isContentFile(file)) model = undefined;
    },
    // 展示室や生き物のフォルダを足したり消したりしたときも、作り直して読み直す。
    configureServer(server) {
      server.watcher.on("add", (file) => { if (isContentFile(file)) invalidate(server); });
      server.watcher.on("unlink", (file) => { if (isContentFile(file)) invalidate(server); });
      server.watcher.on("change", (file) => { if (isContentFile(file)) invalidate(server); });
    },
  };
}
