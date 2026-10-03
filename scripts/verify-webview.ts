// A free port chosen by the OS, so this check never collides with a LocalWeb app's dev server.
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
const PORT = probe.port;
probe.stop(true);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";
const STATE_KEY = "tropical-aquarium.state.v5.r2";

type Result = {
  title: string;
  roomTanks: number;
  enteredTank: string;
  asiaCards: number;
  harlequinCount: number;
  rejectedSpecies: boolean;
  newSpeciesChecked: string[];
  addedTanksPreserved: boolean;
  arrangementPreserved: boolean;
  scenesVisited: string[];
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

    // フィッシュルーム
    const title = String(await view.evaluate("document.title"));
    const roomTanks = Number(await view.evaluate(`document.querySelectorAll(".room-tank").length`));
    await Bun.write(`${SCREENSHOT_DIR}/room-1440x960.png`, await view.screenshot({ format: "png" }));

    // 水槽に寄って入る
    await clickByLabel(view, "東南アジアの水草水槽を眺める");
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
    await clickByLabel(view, "小型魚のキューブ水槽を眺める");
    await sleep(2400);
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
    await clickButtonByText(view, "部屋に戻る");
    await sleep(1800);
    await clickByLabel(view, "アマゾンの大型水槽を眺める");
    await sleep(2400);
    await clickButtonByText(view, "設定");
    const amazonCards = await countCards(view);
    newSpeciesChecked.push(...await verifyNewFish(view, "amazon-90", [["lemon-tetra", "レモンテトラ"], ["dwarf-pencilfish", "ドワーフペンシル"]]));
    await clickByLabel(view, "閉じて眺める");
    await sleep(700);
    await Bun.write(`${SCREENSHOT_DIR}/amazon-1440x960.png`, await view.screenshot({ format: "png" }));

    // 追加した2水槽を部屋から開き、背景・カタログ・匹数の保存を確認する。
    for (const [id, name, species] of [
      ["japan-60", "日本の湧水水槽", [["medaka", "メダカ"], ["amano-shrimp", "ヤマトヌマエビ"], ["japanese-bitterling", "ニッポンバラタナゴ"], ["japanese-loach", "シマドジョウ"]]],
      ["malawi-120", "マラウイ湖の岩場水槽", [["yellow-lab", "イエローラブ"], ["yellow-tail-acei", "イエローテール・アセイ"], ["rusty-cichlid", "ラスティ・シクリッド"], ["saulosi", "サウロシー"]]],
    ] as [string, string, [string, string][]][]) {
      await clickButtonByText(view, "部屋に戻る");
      await sleep(1800);
      await clickByLabel(view, `${name}を眺める`);
      await sleep(2400);
      await Bun.write(`${SCREENSHOT_DIR}/${id}-1440x960.png`, await view.screenshot({ format: "png" }));
      await clickButtonByText(view, "設定");
      assert(await countCards(view) === 4);
      newSpeciesChecked.push(...await verifyNewFish(view, id, species));
      await clickTab(view, "水景");
      assert(await view.evaluate(`(() => {
        const img = document.querySelector(".theme-thumb img");
        return img?.complete && img.naturalWidth > 0;
      })()`));
      await clickByLabel(view, "閉じて眺める");
    }

    // 隣の水槽への移動、両端の折り返し、キー操作でも構成を保つこと。
    const stockBeforeTravel = String(await view.evaluate(
      `JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks)`,
    ));
    const adjacentTanks: string[] = [];
    await sleep(700);
    for (const id of ["asia-60", "amazon-90", "cube-30", "japan-60", "malawi-120"]) {
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
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).activeTankId === "japan-60"`));
    await view.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }))`);
    await sleep(2200);
    assert(await view.evaluate(`JSON.parse(localStorage.getItem("${STATE_KEY}")).activeTankId === "malawi-120"`));
    assert(stockBeforeTravel === await view.evaluate(
      `JSON.stringify(JSON.parse(localStorage.getItem("${STATE_KEY}")).tanks)`,
    ));

    // 既存3水槽しかないv5保存へ、新しい2水槽だけが加わること。
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
      return Object.keys(now.tanks).length === 5 &&
        Object.keys(before).every(id => JSON.stringify(now.tanks[id]) === JSON.stringify(before[id])) &&
        now.tanks["japan-60"].stock.reduce((n,e) => n+e.count,0) === 28 &&
        now.tanks["malawi-120"].stock.reduce((n,e) => n+e.count,0) === 23;
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
      return s.stockArrangementVersion === 3 && total("asia-60") === 34 && total("amazon-90") === 46 && total("cube-30") === 20 &&
        total("japan-60") === 28 && total("malawi-120") === 23 &&
        s.tanks["asia-60"].stock.length === 8 && s.tanks["amazon-90"].stock.length === 7 && cube.stock.length === 7 &&
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
    await sleep(2500);
    const mobileRoom = await mobileView.evaluate(`({
      roomTanks: document.querySelectorAll(".room-tank").length,
      // 部屋の絵（canvas）の上からも横スクロールできること。
      roomTouchAction: getComputedStyle(document.querySelector(".room-stage canvas")).touchAction,
      overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })`) as { roomTanks: number; roomTouchAction: string; overflowWidth: number };
    await Bun.write(`${SCREENSHOT_DIR}/room-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    // 狭い画面では一覧ボタンから水槽に入り、水槽が細い帯にならず映ること。
    await mobileView.evaluate(`Array.from(document.querySelectorAll(".room-tank-list button"))
      .find((button) => button.textContent?.includes("アマゾンの大型水槽"))?.click()`);
    await sleep(3000);
    const mobileEntered = Boolean(await mobileView.evaluate(
      `document.querySelector(".tank-screen")?.classList.contains("visible")`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/amazon-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    for (const [id, name] of [["japan-60", "日本の湧水水槽"], ["malawi-120", "マラウイ湖の岩場水槽"]]) {
      await clickButtonByText(mobileView, "部屋に戻る");
      await sleep(1800);
      await mobileView.evaluate(`Array.from(document.querySelectorAll(".room-tank-list button"))
        .find(button => button.textContent?.includes(${JSON.stringify(name)}))?.click()`);
      await sleep(2600);
      assert(await mobileView.evaluate(`document.querySelector(".tank-screen")?.classList.contains("visible")`));
      await Bun.write(`${SCREENSHOT_DIR}/${id}-420x912.png`, await mobileView.screenshot({ format: "png" }));
      await clickButtonByText(mobileView, "設定");
      await sleep(700);
      assert(await countCards(mobileView) === 4);
      assert(await mobileView.evaluate(`document.documentElement.scrollWidth === innerWidth`));
      await Bun.write(`${SCREENSHOT_DIR}/${id}-settings-420x912.png`, await mobileView.screenshot({ format: "png" }));
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
      overflowWidth: Math.max(mobileRoom.overflowWidth, tankOverflow),
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

    const result: Result = {
      title, roomTanks, enteredTank, asiaCards, harlequinCount, rejectedSpecies, newSpeciesChecked, addedTanksPreserved, arrangementPreserved, scenesVisited,
      viewingOnEntry, viewingStageWidth, editingOpened, editingStageWidth, closedToViewing, backToRoom, cubeCards, cubeStageRatio, amazonCards, adjacentTanks,
      restored, migrated, desktop, mobile, landscape, removedCopyAbsent, consoleErrors,
    };
    console.log(JSON.stringify(result, null, 2));

    assert(title.includes("熱帯魚"));
    assert(roomTanks === 5);
    assert(enteredTank === "東南アジアの水草水槽");
    assert(asiaCards === 8 && harlequinCount === 12 && rejectedSpecies);
    assert(JSON.stringify(scenesVisited) ===
      JSON.stringify(["driftwood", "root-driftwood", "iwagumi", "planted"]));
    assert(viewingOnEntry && viewingStageWidth >= 1400);
    assert(editingOpened && editingStageWidth < viewingStageWidth && editingStageWidth >= 700);
    assert(closedToViewing);
    assert(backToRoom);
    assert(cubeCards === 7 && cubeStageRatio > 1.4);
    assert(amazonCards === 7);
    assert(restored.version === 5 && restored.scene === "driftwood");
    assert(restored.lighting === "night" && restored.harlequinCount === 12 && !restored.sound);
    assert(migrated.version === 5 && migrated.asiaScene === "iwagumi" && migrated.amazonNeon === 9);
    assert(desktop.stageWidth >= 700 && desktop.canvasWidth >= 700 && desktop.stageHeight >= 400);
    assert(mobile.entered && mobile.roomTanks === 5 &&
      mobile.roomTouchAction === "pan-x" && mobile.tankStageWidth >= 380 && mobile.overflowWidth === 0);
    assert(mobile.sheet.panelTop >= 360 && mobile.sheet.stageHeight >= 360 && mobile.sheet.firstCardVisible);
    assert(landscape.panelTop === 0 && landscape.panelLeft >= 456 && landscape.stageHeight >= 380 &&
      landscape.overflowWidth === 0);
    assert(newSpeciesChecked.length === 14);
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
  // 通常URLの再読込は部屋に戻るため、水槽の直リンクで同じ水槽を開く。
  await view.evaluate(`history.replaceState(null, "", ${JSON.stringify(`?tank=${tankId}`)})`);
  await view.reload();
  await sleep(2000);
  for (const [id, count] of counts) {
    assert(Number(await view.evaluate(stockCount(tankId, id))) === count);
  }
  await clickButtonByText(view, "設定");
  return checked;
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
