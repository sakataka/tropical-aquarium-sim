// A free port chosen by the OS, so this check never collides with a LocalWeb app's dev server.
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
const PORT = probe.port;
probe.stop(true);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";
const STATE_KEY = "tropical-aquarium.state.v5.r2";

// 展示室・水槽の名前や数は、内容ファイルから読む（展示室を開けるたびに書き換えずに済むように）。
type RoomJson = { id: string; order: number; displayName: string; tanks: { tankId: string }[] };
type TankJson = { id: string; displayName: string; sceneIds: string[]; species: { speciesId: string }[]; defaultStock: { speciesId: string; count: number }[] };
const museumJson = await Bun.file("src/content/museum/museum.json").json() as { floors: { halls: { id: string }[] }[] };
const ROOMS: RoomJson[] = [];
for await (const path of new Bun.Glob("src/content/room/*.json").scan()) ROOMS.push(await Bun.file(path).json());
const HALL_ORDER = museumJson.floors.flatMap((floor) => floor.halls.map((hall) => hall.id));
ROOMS.sort((a, b) => HALL_ORDER.indexOf(a.id) - HALL_ORDER.indexOf(b.id));
const TANKS = new Map<string, TankJson>();
for await (const path of new Bun.Glob("src/content/tanks/*/tank.json").scan()) {
  const tank = await Bun.file(path).json() as TankJson;
  TANKS.set(tank.id, tank);
}
let SPECIES_COUNT = 0;
for await (const _ of new Bun.Glob("src/content/fish/*/species.json").scan()) SPECIES_COUNT++;
const tankName = (id: string) => TANKS.get(id)!.displayName;
const roomOf = (tankId: string) => ROOMS.find((room) => room.tanks.some((tank) => tank.tankId === tankId))!;
const defaultTotal = (id: string) => TANKS.get(id)!.defaultStock.reduce((sum, entry) => sum + entry.count, 0);
const ASIA_HALL = roomOf("asia-60");

type Result = {
  title: string;
  map: { floors: number; halls: string[]; soonHalls: number; previews: number; firstLastHall: boolean; overflowWidth: number };
  history: string[];
  zukan: string[];
  roomTanks: number;
  enteredTank: string;
  asiaCards: number;
  harlequinCount: number;
  rejectedSpecies: boolean;
  newSpeciesChecked: string[];
  addedTanksPreserved: boolean;
  arrangementPreserved: boolean;
  scenesVisited: string[];
  japanScenes: string[];
  expandedScenes: string[];
  halls: { viewport: string; hall: string; tanks: number }[];
  viewingOnEntry: boolean;
  viewingStageWidth: number;
  editingOpened: boolean;
  editingStageWidth: number;
  closedToViewing: boolean;
  backToRoom: boolean;
  cubeCards: number;
  cubeStageRatio: number;
  amazonCards: number;
  adjacentTanks: string[];
  restored: { version: number; scene: string; lighting: string; harlequinCount: number; sound: boolean };
  migrated: { version: number; asiaScene: string; amazonNeon: number };
  desktop: { stageWidth: number; stageHeight: number; canvasWidth: number };
  mobile: {
    entered: boolean;
    roomTanks: number;
    roomTouchAction: string;
    overflowWidth: number;
    tankStageWidth: number;
    sheet: { panelTop: number; stageHeight: number; firstCardVisible: boolean };
  };
  landscape: { panelLeft: number; panelTop: number; stageHeight: number; overflowWidth: number };
  removedCopyAbsent: boolean;
  consoleErrors: string[];
};

async function main() {
  if (!Bun.WebView) throw new Error("Bun.WebView is not available in this Bun runtime.");
  await Bun.$`mkdir -p ${SCREENSHOT_DIR}`;
  const server = Bun.spawn([
    "bun", "run", "dev", "--", "--host", HOST, "--port", String(PORT), "--strictPort",
  ], { stdout: "inherit", stderr: "inherit" });

  try {
    await waitForServer(BASE_URL);
    const consoleErrors: string[] = [];
    if (Bun.argv.includes("--halls-only")) {
      const halls = await verifyHalls(consoleErrors);
      assert(consoleErrors.length === 0);
      console.log(JSON.stringify({ halls, consoleErrors }, null, 2));
      return;
    }
    await using view = new Bun.WebView({
      width: 1440,
      height: 960,
      backend: "webkit",
      console: (type, ...args) => {
        if (type === "error") consoleErrors.push(args.map(String).join(" "));
      },
    });

    await view.navigate(BASE_URL);
    await sleep(1500);
    await view.evaluate(`localStorage.clear()`);
    await view.reload();
    await sleep(2500);

    // 館内図から始まり、階ごとの展示室を選べる。初めての訪問では「前回の展示室」を付けない。
    const title = String(await view.evaluate("document.title"));
    const map = await mapSummary(view);
    await Bun.write(`${SCREENSHOT_DIR}/map-1440x960.png`, await view.screenshot({ format: "png" }));
    await openHall(view, ASIA_HALL.displayName);
    const roomTanks = Number(await view.evaluate(`document.querySelectorAll(".room-tank").length`));
    await Bun.write(`${SCREENSHOT_DIR}/room-1440x960.png`, await view.screenshot({ format: "png" }));

    // 水槽に寄って入る
    await clickByLabel(view, `${tankName("asia-60")}を眺める`);
    await sleep(700);
    await Bun.write(`${SCREENSHOT_DIR}/zooming-1440x960.png`, await view.screenshot({ format: "png" }));
    await sleep(1800);
    // 水槽に入ったら、まず鑑賞モード（パネルなし、水槽が画面いっぱい）。
    const viewingOnEntry = Boolean(await view.evaluate(
      `(() => { const s = document.querySelector(".tank-screen"); return s?.classList.contains("visible") && !s.classList.contains("editing"); })()`,
    ));
    const viewingStageWidth = await stageWidth(view);
    await Bun.write(`${SCREENSHOT_DIR}/viewing-1440x960.png`, await view.screenshot({ format: "png" }));
    await clickButtonByText(view, "設定");
    await sleep(700);
    const editingOpened = Boolean(await view.evaluate(
      `document.querySelector(".tank-screen")?.classList.contains("editing")`,
    ));
    const editingStageWidth = await stageWidth(view);
    const enteredTank = String(await view.evaluate(`document.querySelector(".panel-heading h1")?.textContent ?? ""`));
    await Bun.write(`${SCREENSHOT_DIR}/editing-1440x960.png`, await view.screenshot({ format: "png" }));
    const desktop = await view.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage")?.getBoundingClientRect();
      const canvas = document.querySelector(".aquarium-canvas canvas")?.getBoundingClientRect();
      return {
        stageWidth: Math.round(stage?.width ?? 0),
        stageHeight: Math.round(stage?.height ?? 0),
        canvasWidth: Math.round(canvas?.width ?? 0),
      };
    })()`) as Result["desktop"];
    const asiaCards = await countCards(view);
    await Bun.write(`${SCREENSHOT_DIR}/asia-1440x960.png`, await view.screenshot({ format: "png" }));

    await clickByLabel(view, "ラスボラ・ヘテロモルファを1匹増やす");
    await sleep(350);
    const harlequinCount = Number(await view.evaluate(stockCount("asia-60", "harlequin-rasbora")));
    const rejectedSpecies = Boolean(await view.evaluate(
      `!document.querySelector("button[aria-label='ネオンテトラを1匹増やす']")`,
    ));

    const newSpeciesChecked = await verifyNewFish(view, "asia-60", [["honey-gourami", "ハニーグラミー"], ["chili-rasbora", "ボララス・ブリジッタエ"]]);
    const japanScenes: string[] = [];
    await clickTab(view, "水景");
    const scenesVisited: string[] = [];
    for (const [label, id] of [
      ["自然な流木景", "driftwood"],
      ["根張り流木景", "root-driftwood"],
      ["開けた岩組景", "iwagumi"],
      ["明るい水草景", "planted"],
    ]) {
      await clickButtonByText(view, label);
      await sleep(1400);
      scenesVisited.push(String(await view.evaluate(
        `JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks["asia-60"].layout.sceneId`,
      )));
      if (id === "iwagumi") {
        await Bun.write(`${SCREENSHOT_DIR}/${id}-1440x960.png`, await view.screenshot({ format: "png" }));
      }
    }

    await clickButtonByText(view, "自然な流木景");
    await sleep(1400);
    await clickTab(view, "照明と音");
    await clickButtonByText(view, "夜景");
    await view.evaluate(`document.querySelector(".sound-toggle")?.click()`);
    await sleep(350);
    await Bun.write(`${SCREENSHOT_DIR}/lighting-1440x960.png`, await view.screenshot({ format: "png" }));
    await clickByLabel(view, "閉じて眺める");
    await sleep(700);
    const closedToViewing = Boolean(await view.evaluate(
      `!document.querySelector(".tank-screen")?.classList.contains("editing")`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/night-1440x960.png`, await view.screenshot({ format: "png" }));

    // Esc で部屋に戻り、別の水槽へ
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await sleep(1800);
    const backToRoom = Number(await view.evaluate(`document.querySelectorAll(".room-tank").length`)) === roomTanks;
    // キューブ水槽とアマゾンの水槽は別の展示室にあるので、水槽の直リンクで開く。
    await view.navigate(`${BASE_URL}?tank=cube-30`);
    await sleep(2600);
    await clickButtonByText(view, "設定");
    const cubeCards = await countCards(view);
    newSpeciesChecked.push(...await verifyNewFish(view, "cube-30", [["ember-tetra", "エンバーテトラ"], ["clown-killifish", "クラウンキリー"]]));
    await clickByLabel(view, "閉じて眺める");
    await sleep(700);
    const cubeStageRatio = Number(await view.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage")?.getBoundingClientRect();
      return stage ? stage.width / stage.height : 0;
    })()`));
    await Bun.write(`${SCREENSHOT_DIR}/cube-1440x960.png`, await view.screenshot({ format: "png" }));
    await view.navigate(`${BASE_URL}?tank=amazon-90`);
    await sleep(2600);
    await clickButtonByText(view, "設定");
    const amazonCards = await countCards(view);
    newSpeciesChecked.push(...await verifyNewFish(view, "amazon-90", [["lemon-tetra", "レモンテトラ"], ["dwarf-pencilfish", "ドワーフペンシル"]]));
    await clickByLabel(view, "閉じて眺める");
    await sleep(700);
    await Bun.write(`${SCREENSHOT_DIR}/amazon-1440x960.png`, await view.screenshot({ format: "png" }));

    // 日本とマラウイの水槽を開き、背景・カタログ・匹数の保存を確認する。
    for (const [id, , species] of [
      ["japan-60", "日本の湧水水槽", [["medaka", "メダカ"], ["amano-shrimp", "ヤマトヌマエビ"], ["japanese-bitterling", "ニッポンバラタナゴ"], ["japanese-loach", "シマドジョウ"]]],
      ["malawi-120", "マラウイ湖の岩場水槽", [["yellow-lab", "イエローラブ"], ["yellow-tail-acei", "イエローテール・アセイ"], ["rusty-cichlid", "ラスティ・シクリッド"], ["saulosi", "サウロシー"]]],
    ] as [string, string, [string, string][]][]) {
      await view.navigate(`${BASE_URL}?tank=${id}`);
      await sleep(2600);
      await Bun.write(`${SCREENSHOT_DIR}/${id}-1440x960.png`, await view.screenshot({ format: "png" }));
      await clickButtonByText(view, "設定");
      assert(await countCards(view) === TANKS.get(id)!.species.length);
      newSpeciesChecked.push(...await verifyNewFish(view, id, species));
      await clickTab(view, "水景");
      assert(await view.evaluate(`(() => {
        const img = document.querySelector(".theme-thumb img");
        return img?.complete && img.naturalWidth > 0;
      })()`));
      if (id === "japan-60") japanScenes.push(...await verifyJapanScenes(view, "desktop"));
      await clickByLabel(view, "閉じて眺める");
    }

    // 隣の水槽への移動、両端の折り返し、キー操作でも構成を保つこと。
    const stockBeforeTravel = String(await view.evaluate(
      `JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks)`,
    ));
    const adjacentTanks: string[] = [];
    await view.navigate(`${BASE_URL}?tank=asia-60`);
    await sleep(2600);
    const asiaHallTanks = ASIA_HALL.tanks.map((tank) => tank.tankId);
    for (const id of [...asiaHallTanks.slice(1), asiaHallTanks[0]!]) {
      await view.evaluate(`document.querySelector('button[aria-label^="次の水槽（"]')?.click()`);
      await sleep(2200);
      const active = String(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).activeTankId`));
      assert(active === id);
      assert(await view.evaluate(`document.querySelector(".tank-screen")?.classList.contains("visible")`));
      adjacentTanks.push(active);
      await Bun.write(`${SCREENSHOT_DIR}/adjacent-${id}.png`, await view.screenshot({ format: "png" }));
    }
    await view.evaluate(`document.querySelector('button[aria-label^="前の水槽（"]')?.click()`);
    await sleep(2200);
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).activeTankId === ${JSON.stringify(asiaHallTanks.at(-1))}`));
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }))`);
    await sleep(2200);
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).activeTankId === "asia-60"`));
    assert(stockBeforeTravel === await view.evaluate(
      `JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks)`,
    ));

    // 一部の水槽しかない古いv5保存へ、足りない水槽だけが既定の構成で加わること。
    const beforeExpansion = String(await view.evaluate(`(() => {
      const old = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      delete old.tanks["japan-60"];
      delete old.tanks["malawi-120"];
      old.activeTankId = "cube-30";
      localStorage.setItem("${STATE_KEY}", JSON.stringify(old));
      return JSON.stringify(old.tanks);
    })()`));
    await view.navigate(BASE_URL);
    await sleep(2500);
    const addedTanksPreserved = Boolean(await view.evaluate(`(() => {
      const now = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      const before = JSON.parse(${JSON.stringify(beforeExpansion)});
      return Object.keys(now.tanks).length === ${TANKS.size} &&
        Object.keys(before).every(id => JSON.stringify(now.tanks[id]) === JSON.stringify(before[id])) &&
        now.tanks["japan-60"].stock.reduce((n,e) => n+e.count,0) === ${defaultTotal("japan-60")} &&
        now.tanks["malawi-120"].stock.reduce((n,e) => n+e.count,0) === ${defaultTotal("malawi-120")};
    })()`));

    await view.reload();
    await sleep(2200);
    const restored = await view.evaluate(`(() => {
      const state = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      const asia = state.tanks["asia-60"];
      return {
        version: state.version,
        scene: asia.layout.sceneId,
        lighting: asia.layout.lighting,
        harlequinCount: asia.stock.find((entry) => entry.speciesId === "harlequin-rasbora")?.count ?? 0,
        sound: state.preferences.soundEnabled,
      };
    })()`) as Result["restored"];
    const shellText = String(await view.evaluate(`document.body.textContent ?? ""`));
    const removedCopyAbsent = ["愛称", "空腹", "餌やり", "お気に入り", "今日の観察"]
      .every((word) => !shellText.includes(word));

    // v4 の保存データからの移行
    await view.evaluate(`(() => {
      localStorage.clear();
      localStorage.setItem("tropical-aquarium.state.v4", JSON.stringify({
        version: 4,
        customization: {
          stock: [{ speciesId: "neon-tetra", count: 9 }, { speciesId: "cherry-barb", count: 4 }],
          layout: { sceneId: "iwagumi", lighting: "cool" },
        },
        preferences: { soundEnabled: false, soundVolume: 0.4 },
      }));
    })()`);
    await view.reload();
    await sleep(2200);
    const migrated = await view.evaluate(`(() => {
      const state = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      return {
        version: state.version,
        asiaScene: state.tanks["asia-60"].layout.sceneId,
        amazonNeon: state.tanks["amazon-90"].stock.find((entry) => entry.speciesId === "neon-tetra")?.count ?? 0,
      };
    })()`) as Result["migrated"];

    // 旧v5を想定し、魚だけが一度入れ替わり、水景・照明・以後の手動変更が残ること。
    await view.evaluate(`(() => {
      const old = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      old.stockArrangementVersion = 2;
      old.tanks["cube-30"].stock = [{ speciesId: "guppy", count: 6 }];
      old.tanks["cube-30"].layout = { sceneId: "cube-stones", lighting: "evening" };
      old.preferences.soundVolume = 0.25;
      localStorage.setItem("${STATE_KEY}", JSON.stringify(old));
    })()`);
    await view.navigate(`${BASE_URL}?tank=cube-30`);
    await sleep(2500);
    const arrangementApplied = Boolean(await view.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem("${STATE_KEY}"));
      const cube = s.tanks["cube-30"];
      const total = id => s.tanks[id].stock.reduce((n, entry) => n + entry.count, 0);
      return s.stockArrangementVersion === 3 && total("asia-60") === ${defaultTotal("asia-60")} && total("amazon-90") === ${defaultTotal("amazon-90")} && total("cube-30") === ${defaultTotal("cube-30")} &&
        total("japan-60") === ${defaultTotal("japan-60")} && total("malawi-120") === ${defaultTotal("malawi-120")} &&
        s.tanks["asia-60"].stock.length === ${TANKS.get("asia-60")!.defaultStock.length} && s.tanks["amazon-90"].stock.length === ${TANKS.get("amazon-90")!.defaultStock.length} && cube.stock.length === ${TANKS.get("cube-30")!.defaultStock.length} &&
        Object.values(s.tanks).every(t => t.stock.every(e => e.count >= 1)) &&
        cube.stock.some(e => e.speciesId === "ember-tetra" && e.count === 8) &&
        cube.stock.some(e => e.speciesId === "clown-killifish" && e.count === 2) &&
        cube.layout.sceneId === "cube-stones" && cube.layout.lighting === "evening" && s.preferences.soundVolume === 0.25;
    })()`));
    await clickButtonByText(view, "設定");
    await clickByLabel(view, "エンバーテトラを1匹減らす");
    await sleep(350);
    await view.reload();
    await sleep(2500);
    const arrangementPreserved = arrangementApplied && Number(await view.evaluate(stockCount("cube-30", "ember-tetra"))) === 7;

    await using mobileView = new Bun.WebView({
      width: 420,
      height: 912,
      backend: "webkit",
      console: (type, ...args) => {
        if (type === "error") consoleErrors.push(`mobile: ${args.map(String).join(" ")}`);
      },
    });
    await mobileView.navigate(BASE_URL);
    await sleep(2000);
    const mobileMap = await mapSummary(mobileView);
    await Bun.write(`${SCREENSHOT_DIR}/map-420x912.png`, await mobileView.screenshot({ format: "png" }));
    await openHall(mobileView, ASIA_HALL.displayName);
    await sleep(500);
    const mobileRoom = await mobileView.evaluate(`({
      roomTanks: document.querySelectorAll(".room-tank").length,
      // 部屋の絵（canvas）の上からも横スクロールできること。
      roomTouchAction: getComputedStyle(document.querySelector(".room-stage canvas")).touchAction,
      overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })`) as { roomTanks: number; roomTouchAction: string; overflowWidth: number };
    await Bun.write(`${SCREENSHOT_DIR}/room-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    // 狭い画面では一覧ボタンから水槽に入り、水槽が細い帯にならず映ること。
    await mobileView.evaluate(`Array.from(document.querySelectorAll(".room-tank-list button"))
      .find((button) => button.textContent?.includes(${JSON.stringify(tankName(ASIA_HALL.tanks[1]!.tankId))}))?.click()`);
    await sleep(3000);
    const mobileEntered = Boolean(await mobileView.evaluate(
      `document.querySelector(".tank-screen")?.classList.contains("visible")`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/list-entered-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    for (const id of ["japan-60", "malawi-120"]) {
      await mobileView.navigate(`${BASE_URL}?tank=${id}`);
      await sleep(2800);
      assert(await mobileView.evaluate(`document.querySelector(".tank-screen")?.classList.contains("visible")`));
      await Bun.write(`${SCREENSHOT_DIR}/${id}-420x912.png`, await mobileView.screenshot({ format: "png" }));
      await clickButtonByText(mobileView, "設定");
      await sleep(700);
      assert(await countCards(mobileView) === TANKS.get(id)!.species.length);
      assert(await mobileView.evaluate(`document.documentElement.scrollWidth === innerWidth`));
      await Bun.write(`${SCREENSHOT_DIR}/${id}-settings-420x912.png`, await mobileView.screenshot({ format: "png" }));
      if (id === "japan-60") {
        await clickTab(mobileView, "水景");
        japanScenes.push(...await verifyJapanScenes(mobileView, "420x912"));
      }
      await clickByLabel(mobileView, "閉じて眺める");
    }
    await mobileView.navigate(`${BASE_URL}?tank=asia-60`);
    await sleep(2500);
    const tankStageWidth = Number(await mobileView.evaluate(
      `Math.round(document.querySelector(".aquarium-stage")?.getBoundingClientRect().width ?? 0)`,
    ));
    const tankOverflow = Number(await mobileView.evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    // 縦長の画面では設定を下からのシートで出し、上に水槽を残す。
    await clickButtonByText(mobileView, "設定");
    await sleep(1200);
    const sheet = await mobileView.evaluate(`(() => {
      const panel = document.querySelector(".control-panel").getBoundingClientRect();
      const stage = document.querySelector(".aquarium-stage").getBoundingClientRect();
      const firstCard = document.querySelector(".fish-catalog-card")?.getBoundingClientRect();
      return {
        panelTop: Math.round(panel.top),
        stageHeight: Math.round(stage.height),
        firstCardVisible: Boolean(firstCard && firstCard.top < innerHeight - 80),
      };
    })()`) as Result["mobile"]["sheet"];
    await Bun.write(`${SCREENSHOT_DIR}/settings-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    const mobile = {
      entered: mobileEntered,
      roomTanks: mobileRoom.roomTanks,
      roomTouchAction: mobileRoom.roomTouchAction,
      overflowWidth: Math.max(mobileRoom.overflowWidth, tankOverflow, mobileMap.overflowWidth),
      tankStageWidth,
      sheet,
    };

    // 横向きのスマホでは設定パネルを横に出し、水槽の高さを潰さないこと。
    await using landscapeView = new Bun.WebView({
      width: 912,
      height: 420,
      backend: "webkit",
      console: (type, ...args) => {
        if (type === "error") consoleErrors.push(`landscape: ${args.map(String).join(" ")}`);
      },
    });
    await landscapeView.navigate(`${BASE_URL}?tank=asia-60`);
    await sleep(2500);
    await clickButtonByText(landscapeView, "設定");
    await sleep(1200);
    const landscape = await landscapeView.evaluate(`(() => {
      const panel = document.querySelector(".control-panel").getBoundingClientRect();
      const stage = document.querySelector(".aquarium-stage").getBoundingClientRect();
      return {
        panelLeft: Math.round(panel.left),
        panelTop: Math.round(panel.top),
        stageHeight: Math.round(stage.height),
        overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`) as Result["landscape"];
    await Bun.write(`${SCREENSHOT_DIR}/settings-landscape-912x420.png`, await landscapeView.screenshot({ format: "png" }));

    const expandedScenes = await verifyExpandedScenes(consoleErrors);
    const halls = await verifyHalls(consoleErrors);
    const history = await verifyHistory(consoleErrors);
    const zukan = await verifyZukan(consoleErrors);
    const result: Result = {
      title, map, history, zukan, roomTanks, enteredTank, asiaCards, harlequinCount, rejectedSpecies, newSpeciesChecked, addedTanksPreserved, arrangementPreserved, scenesVisited, japanScenes,
      viewingOnEntry, viewingStageWidth, editingOpened, editingStageWidth, closedToViewing, backToRoom, cubeCards, cubeStageRatio, amazonCards, adjacentTanks,
      restored, migrated, desktop, mobile, landscape, removedCopyAbsent, consoleErrors, expandedScenes, halls,
    };
    console.log(JSON.stringify(result, null, 2));

    assert(title.includes("熱帯魚"));
    // 館内図は上の階から並ぶ。開いている展示室には縮小版を映し、ほかの枠は準備中。
    assert(map.floors === museumJson.floors.length && JSON.stringify(map.halls) === JSON.stringify(ROOMS.map((room) => room.displayName))
      && map.soonHalls === HALL_ORDER.length - ROOMS.length && map.previews === ROOMS.length && !map.firstLastHall && map.overflowWidth === 0);
    assert(history.length === 6);
    assert(JSON.stringify(zukan) === JSON.stringify([
      "1440x960 ?tank=amazon-90 tank", "1440x960 closed ", "420x912 ?tank=amazon-90 tank", "420x912 closed ",
    ]));
    assert(roomTanks === ASIA_HALL.tanks.length);
    assert(enteredTank === tankName("asia-60"));
    assert(asiaCards === 9 && harlequinCount === 12 && rejectedSpecies);
    assert(JSON.stringify(scenesVisited) ===
      JSON.stringify(["driftwood", "root-driftwood", "iwagumi", "planted"]));
    assert(viewingOnEntry && viewingStageWidth >= 1400);
    assert(editingOpened && editingStageWidth < viewingStageWidth && editingStageWidth >= 700);
    assert(closedToViewing);
    assert(backToRoom);
    assert(cubeCards === TANKS.get("cube-30")!.species.length && cubeStageRatio > 1);
    assert(amazonCards === TANKS.get("amazon-90")!.species.length);
    assert(restored.version === 5 && restored.scene === "driftwood");
    assert(restored.lighting === "night" && restored.harlequinCount === 12 && !restored.sound);
    assert(migrated.version === 5 && migrated.asiaScene === "iwagumi" && migrated.amazonNeon === 9);
    assert(desktop.stageWidth >= 700 && desktop.canvasWidth >= 700 && desktop.stageHeight >= 400);
    assert(mobile.entered && mobile.roomTanks === ASIA_HALL.tanks.length &&
      mobile.roomTouchAction === "pan-x" && mobile.tankStageWidth >= 380 && mobile.overflowWidth === 0);
    assert(mobile.sheet.panelTop >= 360 && mobile.sheet.stageHeight >= 360 && mobile.sheet.firstCardVisible);
    assert(landscape.panelTop === 0 && landscape.panelLeft >= 456 && landscape.stageHeight >= 380 &&
      landscape.overflowWidth === 0);
    assert(newSpeciesChecked.length === 14);
    assert(japanScenes.length === 6);
    assert(expandedScenes.length === 20);
    assert(halls.length === ROOMS.length * 2);
    assert(addedTanksPreserved);
    assert(arrangementPreserved);
    assert(removedCopyAbsent);
    assert(consoleErrors.length === 0);
    console.log(`Screenshots: ${SCREENSHOT_DIR}/*.png`);
  } finally {
    server.kill();
    await server.exited.catch(() => undefined);
  }
}

// 開いている展示室をすべて館内図から開き、どの水槽にも入れて、絵・魚・展示ラベルが出ることを確かめる。
// 狭い画面では展示室と、一覧から入る最初の水槽だけを見る。
async function verifyHalls(consoleErrors: string[]) {
  const results: Result["halls"] = [];
  for (const [width, height] of [[1440, 960], [420, 912]]) {
    const viewport = `${width}x${height}`;
    const wide = width > 800;
    await using view = new Bun.WebView({ width, height, backend: "webkit",
      console: (type, ...args) => { if (type === "error") consoleErrors.push(`halls ${viewport}: ${args.map(String).join(" ")}`); } });
    await view.navigate(BASE_URL);
    await sleep(2500);
    await view.evaluate(`localStorage.clear()`);
    await view.reload();
    await sleep(2000);
    // 館内図では、どの水景や生き物の画像もまだ要求しない。
    assert(await view.evaluate(`!performance.getEntriesByType('resource').some(r => /\\/(plate|body)\\.webp$/.test(r.name))`));
    for (const room of ROOMS) {
      await openHall(view, room.displayName);
      assert(await view.evaluate(`document.querySelector('.room-scroll.ready[data-room="${room.id}"]') && document.querySelectorAll('.room-tank').length === ${room.tanks.length} && document.querySelector('.room-stage canvas') && !document.querySelector('.render-problem')`));
      assert(await view.evaluate(`document.documentElement.scrollWidth === document.documentElement.clientWidth`));
      await Bun.write(`${SCREENSHOT_DIR}/hall-${room.id}-${viewport}.png`, await view.screenshot({ format: "png" }));
      const tanks = wide ? room.tanks.map((tank) => tank.tankId) : [room.tanks[0]!.tankId];
      for (const tankId of tanks) {
        const tank = TANKS.get(tankId)!;
        if (wide) {
          await clickByLabel(view, `${tank.displayName}を眺める`);
        } else {
          await view.evaluate(`Array.from(document.querySelectorAll(".room-tank-list button"))
            .find((button) => button.textContent?.includes(${JSON.stringify(tank.displayName)}))?.click()`);
        }
        await sleep(2800);
        assert(await view.evaluate(`document.querySelector('.tank-screen.visible') && document.querySelector('.aquarium-stage canvas') && !document.querySelector('.render-problem')`));
        // 展示ラベルに、いま水槽にいる生き物の名前が並ぶ。
        const names = await Promise.all(tank.defaultStock.map(async (entry) =>
          (await Bun.file(`src/content/fish/${entry.speciesId}/species.json`).json()).displayName as string));
        assert(await view.evaluate(`(() => {const text=document.querySelector('.caption-species')?.textContent ?? ''; return ${JSON.stringify(names)}.every((label) => text.includes(label));})()`));
        assert(await view.evaluate(`document.documentElement.scrollWidth === document.documentElement.clientWidth`));
        await Bun.write(`${SCREENSHOT_DIR}/tank-${tankId}-${viewport}.png`, await view.screenshot({ format: "png" }));
        await clickButtonByText(view, "展示室に戻る");
        await sleep(2200);
        assert(await view.evaluate(`!!document.querySelector('.room-scroll.ready[data-room="${room.id}"]')`));
      }
      results.push({ viewport, hall: room.id, tanks: tanks.length });
    }
    // ガラスを軽く叩くと、魚が驚く（短い押し下げだけを叩いた操作として扱い、ドラッグは含めない）。
    await view.navigate(`${BASE_URL}?tank=reef-120`);
    await sleep(2800);
    await view.evaluate(`(() => {
      const host = document.querySelector('.aquarium-canvas'); const r = host.getBoundingClientRect();
      const at = { clientX: r.left + r.width * .5, clientY: r.top + r.height * .55, pointerId: 7, bubbles: true, pointerType: 'mouse', button: 0 };
      host.dispatchEvent(new PointerEvent('pointerdown', at)); host.dispatchEvent(new PointerEvent('pointerup', at));
      const drag = { ...at, pointerId: 8 };
      host.dispatchEvent(new PointerEvent('pointerdown', drag));
      host.dispatchEvent(new PointerEvent('pointermove', { ...drag, clientX: at.clientX + 40 }));
      host.dispatchEvent(new PointerEvent('pointerup', { ...drag, clientX: at.clientX + 40 }));
    })()`);
    await sleep(350);
    assert(await view.evaluate(`document.querySelector('.aquarium-canvas').dataset.glassTaps === '1'`));
    // 開き直すと館内図から始まり、前回の展示室に目印が付く。
    await view.navigate(BASE_URL);
    await sleep(2000);
    assert(await view.evaluate(`document.querySelector('.hall-card.last')?.textContent?.includes(${JSON.stringify(roomOf("reef-120").displayName)})`));
  }
  return results;
}

// 既存の4水槽は全水景を鑑賞画面で描画し、水槽ごとに最後の選択を再読込して確認する。
async function verifyExpandedScenes(consoleErrors: string[]) {
  const visited: string[] = [];
  for (const [width, height, viewport] of [[1440, 960, "desktop"], [420, 912, "420x912"]] as const) {
    await using view = new Bun.WebView({ width, height, backend: "webkit",
      console: (type, ...args) => { if (type === "error") consoleErrors.push(`terrain: ${args.map(String).join(" ")}`); } });
    for (const tankId of ["asia-60", "amazon-90", "cube-30", "malawi-120"]) {
      const tank = await Bun.file(`src/content/tanks/${tankId}/tank.json`).json();
      await view.navigate(`${BASE_URL}?tank=${tankId}`);
      await sleep(2200);
      const saved = String(await view.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].stock)`));
      for (const sceneId of tank.sceneIds as string[]) {
        const scene = await Bun.file(`src/content/environment/scenes/${sceneId}/scene.json`).json();
        await clickButtonByText(view, "設定");
        await clickTab(view, "水景");
        await clickButtonByText(view, scene.displayName);
        await sleep(1500);
        assert(await view.evaluate(`Array.from(document.querySelectorAll('.theme-thumb img')).every(img => img.complete && img.naturalWidth > 0)`));
        await clickByLabel(view, "閉じて眺める");
        await sleep(700);
        assert(await view.evaluate(`document.querySelectorAll('.aquarium-canvas canvas').length === 1 && !document.querySelector('.render-problem') && !document.querySelector('vite-error-overlay') && document.documentElement.scrollWidth === innerWidth`));
        assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].layout.sceneId === ${JSON.stringify(sceneId)}`));
        assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].layout.lighting === ${JSON.stringify(scene.defaultLighting)}`));
        await Bun.write(`${SCREENSHOT_DIR}/terrain-${sceneId}-${viewport}.png`, await view.screenshot({ format: "png" }));
        visited.push(`${viewport}:${sceneId}`);
      }
      await view.reload();
      await sleep(2000);
      assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].layout.sceneId === ${JSON.stringify(tank.sceneIds.at(-1))}`));
      const lastScene = await Bun.file(`src/content/environment/scenes/${tank.sceneIds.at(-1)}/scene.json`).json();
      assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].layout.lighting === ${JSON.stringify(lastScene.defaultLighting)}`));
      assert(saved === await view.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks[${JSON.stringify(tankId)}].stock)`));
      await clickButtonByText(view, "展示室に戻る");
      await sleep(1800);
      assert(await view.evaluate(`document.querySelectorAll('.room-tank').length === ${roomOf(tankId).tanks.length} && !!document.querySelector('.room-stage canvas') && !document.querySelector('.render-problem')`));
    }
    await Bun.write(`${SCREENSHOT_DIR}/terrain-room-${viewport}.png`, await view.screenshot({ format: "png" }));
  }
  return visited;
}

// 既存の水景・匹数を維持し、新しい地形つき水景を通常のUIで選択・復元する。
async function verifyJapanScenes(view: Bun.WebView, viewport: string) {
  const stock = String(await view.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks["japan-60"].stock)`));
  const visited: string[] = [];
  for (const [id, name] of [["japan-moss-stones", "苔石と砂の小径"],
    ["japan-moss-wood", "苔むす流木の浅瀬"], ["japan-spring", "木漏れ日の湧水"]]) {
    await clickButtonByText(view, name!);
    await sleep(1600);
    assert(await view.evaluate(`Array.from(document.querySelectorAll('.theme-thumb img')).every(img => img.complete && img.naturalWidth > 0)`));
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks["japan-60"].layout.sceneId === ${JSON.stringify(id)}`));
    await clickByLabel(view, "閉じて眺める");
    await sleep(900);
    await Bun.write(`${SCREENSHOT_DIR}/${id}-${viewport}.png`, await view.screenshot({ format: "png" }));
    assert(await view.evaluate(`document.documentElement.scrollWidth === innerWidth`));
    assert(!await view.evaluate(`!!document.querySelector('.render-problem')`));
    await view.evaluate(`history.replaceState(null, "", "?tank=japan-60")`);
    await view.reload();
    await sleep(2000);
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks["japan-60"].layout.sceneId === ${JSON.stringify(id)}`));
    assert(stock === await view.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks["japan-60"].stock)`));
    await clickButtonByText(view, "設定");
    await clickTab(view, "水景");
    visited.push(`${viewport}:${id}`);
  }
  return visited;
}

function stockCount(tankId: string, speciesId: string) {
  return `(() => {
    const value = localStorage.getItem("${STATE_KEY}");
    const stock = value ? JSON.parse(value).tanks["${tankId}"].stock : [];
    return stock.find((entry) => entry.speciesId === "${speciesId}")?.count ?? 0;
  })()`;
}

// 新魚種の画像・増減・再読込後の保存を、実際の設定パネルで検証する。
async function verifyNewFish(view: Bun.WebView, tankId: string, species: [string, string][]) {
  const checked: string[] = [];
  const counts = new Map<string, number>();
  for (const [id, name] of species) {
    const selector = JSON.stringify(`button[aria-label='${name}を1匹増やす']`);
    await view.evaluate(`document.querySelector(${selector})?.scrollIntoView({ block: "center" })`);
    await sleep(500);
    assert(await view.evaluate(`(() => {
      const img = document.querySelector(${selector})?.closest(".fish-catalog-card")?.querySelector("img");
      return img?.complete && img.naturalWidth > 0;
    })()`));
    const before = Number(await view.evaluate(stockCount(tankId, id)));
    await clickByLabel(view, `${name}を1匹減らす`);
    await sleep(350);
    assert(Number(await view.evaluate(stockCount(tankId, id))) === before - 1);
    await clickByLabel(view, `${name}を1匹増やす`);
    await sleep(350);
    assert(Number(await view.evaluate(stockCount(tankId, id))) === before);
    counts.set(id, before);
    await Bun.write(`${SCREENSHOT_DIR}/new-${id}.png`, await view.screenshot({ format: "png" }));
    checked.push(id);
  }
  // 通常URLの再読込は館内図に戻るため、水槽の直リンクで同じ水槽を開く。
  await view.evaluate(`history.replaceState(null, "", ${JSON.stringify(`?tank=${tankId}`)})`);
  await view.reload();
  await sleep(2000);
  for (const [id, count] of counts) {
    assert(Number(await view.evaluate(stockCount(tankId, id))) === count);
  }
  await clickButtonByText(view, "設定");
  return checked;
}

async function mapSummary(view: Bun.WebView) {
  assert(await view.evaluate(`!!document.querySelector('.museum-map') && location.search === ''`));
  return await view.evaluate(`({
    floors: document.querySelectorAll('.map-floor').length,
    halls: [...document.querySelectorAll('.hall-card strong')].map((item) => item.textContent),
    soonHalls: document.querySelectorAll('.map-hall.soon').length,
    previews: document.querySelectorAll('.map-hall.open .hall-preview').length,
    firstLastHall: !!document.querySelector('.hall-card.last'),
    overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })`) as Result["map"];
}

// 展示室を開く。館内図にいなければ Esc で館内図へ戻ってから選ぶ。
async function openHall(view: Bun.WebView, name: string) {
  if (!await view.evaluate(`!!document.querySelector('.museum-map')`)) {
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(900);
  }
  const clicked = await view.evaluate(`(() => {
    const card = [...document.querySelectorAll('.hall-card')].find((item) => item.textContent?.includes(${JSON.stringify(name)}));
    card?.click();
    return Boolean(card);
  })()`);
  assert(clicked);
  await sleep(2500);
  assert(await view.evaluate(`!!document.querySelector('.room-scroll.ready')`));
}

// 館内図・展示室・水槽が URL に映り、ブラウザの戻る・進むで行き来できる。隣の水槽への移動は履歴を増やさない。
async function verifyHistory(consoleErrors: string[]) {
  await using view = new Bun.WebView({ width: 1440, height: 960, backend: "webkit",
    console: (type, ...args) => { if (type === "error") consoleErrors.push(`history: ${args.map(String).join(" ")}`); } });
  const steps: string[] = [];
  const where = async () => String(await view.evaluate(`[location.search,
    document.querySelector('.museum-map') ? 'map' : document.querySelector('.tank-screen.visible') ? 'tank' : document.querySelector('.room-scroll.ready')?.dataset.room ?? '?'].join(' ')`));
  const reef = roomOf("reef-120");
  const next = reef.tanks[(reef.tanks.findIndex((tank) => tank.tankId === "reef-120") + 1) % reef.tanks.length]!.tankId;
  await view.navigate(BASE_URL);
  await sleep(2000);
  await openHall(view, reef.displayName);
  steps.push(await where());
  await clickByLabel(view, `${tankName("reef-120")}を眺める`);
  await sleep(2500);
  steps.push(await where());
  await view.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }))`);
  await sleep(2500);
  steps.push(await where());
  await view.evaluate(`history.back()`);
  await sleep(2800);
  steps.push(await where());
  await view.evaluate(`history.back()`);
  await sleep(1200);
  steps.push(await where());
  await view.evaluate(`history.forward()`);
  await sleep(2500);
  steps.push(await where());
  assert(JSON.stringify(steps) === JSON.stringify([
    `?hall=${reef.id} ${reef.id}`, "?tank=reef-120 tank", `?tank=${next} tank`,
    `?hall=${reef.id} ${reef.id}`, " map", `?hall=${reef.id} ${reef.id}`,
  ]));
  // 展示室の直リンク
  await view.navigate(`${BASE_URL}?hall=${reef.id}`);
  await sleep(2500);
  assert(await view.evaluate(`document.querySelector('.room-scroll.ready')?.dataset.room === ${JSON.stringify(reef.id)}`));
  return steps;
}

// 図鑑: 館内図から開き、検索して1種の解説を開き、見られる水槽へ移り、戻る・閉じるで元の画面へ戻る。
async function verifyZukan(consoleErrors: string[]) {
  const steps: string[] = [];
  for (const [width, height] of [[1440, 960], [420, 912]]) {
    await using view = new Bun.WebView({ width, height, backend: "webkit",
      console: (type, ...args) => { if (type === "error") consoleErrors.push(`zukan: ${args.map(String).join(" ")}`); } });
    const size = `${width}x${height}`;
    await view.navigate(BASE_URL);
    await sleep(2000);
    await view.evaluate(`document.querySelector(".map-zukan")?.click()`);
    await sleep(1500);
    const cards = Number(await view.evaluate(`document.querySelectorAll(".zukan-card").length`));
    assert(cards === SPECIES_COUNT);
    assert(Number(await view.evaluate(`document.querySelector(".zukan-list").scrollWidth - document.querySelector(".zukan-list").clientWidth`)) <= 0);
    await Bun.write(`${SCREENSHOT_DIR}/zukan-${size}.png`, await view.screenshot({ format: "png" }));
    await view.evaluate(`(() => {
      const input = document.querySelector(".zukan-search");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "ねおんてとら");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await sleep(400);
    await view.evaluate(`[...document.querySelectorAll(".zukan-card")].find((card) => card.textContent.includes("Paracheirodon innesi"))?.click()`);
    await sleep(1500);
    assert(await view.evaluate(`location.search === "?zukan=neon-tetra" && document.querySelectorAll(".zukan-facts > div").length === 6`));
    await Bun.write(`${SCREENSHOT_DIR}/zukan-detail-${size}.png`, await view.screenshot({ format: "png" }));
    await view.evaluate(`document.querySelector(".zukan-exhibits button")?.click()`);
    await sleep(3500);
    steps.push(`${size} ${await view.evaluate(`location.search + (document.querySelector(".tank-screen.visible") ? " tank" : " ?")`)}`);
    await view.evaluate(`history.back()`);
    await sleep(1200);
    assert(await view.evaluate(`location.search === "?zukan=neon-tetra" && !!document.querySelector("#zukan-detail-name")`));
    // Esc で解説から一覧へ、一覧から閉じる。
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await sleep(600);
    assert(await view.evaluate(`!!document.querySelector(".zukan-list") && !document.querySelector(".zukan-detail")`));
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await sleep(1500);
    steps.push(`${size} closed ${await view.evaluate(`location.search + (document.querySelector(".zukan") ? " open" : "")`)}`);
  }
  return steps;
}

async function stageWidth(view: Bun.WebView) {
  return Number(await view.evaluate(
    `Math.round(document.querySelector(".aquarium-stage")?.getBoundingClientRect().width ?? 0)`,
  ));
}

async function countCards(view: Bun.WebView) {
  return Number(await view.evaluate(`document.querySelectorAll(".fish-catalog-card").length`));
}

async function clickByLabel(view: Bun.WebView, label: string) {
  const clicked = await view.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label='${label}']`)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert(clicked);
  await sleep(100);
}

async function clickButtonByText(view: Bun.WebView, text: string) {
  const clicked = await view.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.textContent?.includes(${JSON.stringify(text)}));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert(clicked);
  await sleep(100);
}

async function clickTab(view: Bun.WebView, label: string) {
  const clicked = await view.evaluate(`(() => {
    const tab = Array.from(document.querySelectorAll("[role='tab']"))
      .find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
    if (!(tab instanceof HTMLButtonElement)) return false;
    tab.click();
    return true;
  })()`);
  assert(clicked);
  await sleep(100);
}

async function waitForServer(url: string) {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Development server is still starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Bun.WebView verification failed.");
}

await main();
