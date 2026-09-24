const PORT = 5183;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";
const STATE_KEY = "tropical-aquarium.state.v5";

type Result = {
  title: string;
  roomTanks: number;
  enteredTank: string;
  asiaCards: number;
  harlequinCount: number;
  rejectedSpecies: boolean;
  scenesVisited: string[];
  ambientModeEntered: boolean;
  ambientStageWidth: number;
  backToRoom: boolean;
  cubeCards: number;
  cubeStageRatio: number;
  amazonCards: number;
  restored: { version: number; scene: string; lighting: string; harlequinCount: number; sound: boolean };
  migrated: { version: number; asiaScene: string; amazonNeon: number };
  desktop: { stageWidth: number; stageHeight: number; canvasWidth: number };
  mobile: { roomTanks: number; overflowWidth: number; tankStageWidth: number };
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
    const enteredTank = String(await view.evaluate(`document.querySelector(".panel-heading h1")?.textContent ?? ""`));
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

    await clickButtonByText(view, "レイアウト");
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
    await clickButtonByText(view, "鑑賞設定");
    await clickButtonByText(view, "夜景");
    await view.evaluate(`document.querySelector(".sound-toggle")?.click()`);
    await sleep(350);
    await clickButtonByText(view, "観賞モード");
    await sleep(900);
    const ambientModeEntered = Boolean(await view.evaluate(
      `document.querySelector(".app-shell")?.classList.contains("ambient-active")`,
    ));
    const ambientStageWidth = Number(await view.evaluate(
      `Math.round(document.querySelector(".aquarium-stage")?.getBoundingClientRect().width ?? 0)`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/ambient-1440x960.png`, await view.screenshot({ format: "png" }));
    await view.evaluate(`document.querySelector(".ambient-hud button")?.click()`);
    await sleep(200);

    // 部屋に戻り、別の水槽へ
    await clickButtonByText(view, "部屋に戻る");
    await sleep(1800);
    const backToRoom = Number(await view.evaluate(`document.querySelectorAll(".room-tank").length`)) === roomTanks;
    await clickByLabel(view, "小型魚のキューブ水槽を眺める");
    await sleep(2400);
    const cubeCards = await countCards(view);
    const cubeStageRatio = Number(await view.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage")?.getBoundingClientRect();
      return stage ? stage.width / stage.height : 0;
    })()`));
    await Bun.write(`${SCREENSHOT_DIR}/cube-1440x960.png`, await view.screenshot({ format: "png" }));
    await clickButtonByText(view, "部屋に戻る");
    await sleep(1800);
    await clickByLabel(view, "アマゾンの大型水槽を眺める");
    await sleep(2400);
    const amazonCards = await countCards(view);
    await Bun.write(`${SCREENSHOT_DIR}/amazon-1440x960.png`, await view.screenshot({ format: "png" }));

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
      overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    })`) as { roomTanks: number; overflowWidth: number };
    await Bun.write(`${SCREENSHOT_DIR}/room-mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    await mobileView.navigate(`${BASE_URL}?tank=asia-60`);
    await sleep(2500);
    const tankStageWidth = Number(await mobileView.evaluate(
      `Math.round(document.querySelector(".aquarium-stage")?.getBoundingClientRect().width ?? 0)`,
    ));
    const tankOverflow = Number(await mobileView.evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));
    const mobile = {
      roomTanks: mobileRoom.roomTanks,
      overflowWidth: Math.max(mobileRoom.overflowWidth, tankOverflow),
      tankStageWidth,
    };

    const result: Result = {
      title, roomTanks, enteredTank, asiaCards, harlequinCount, rejectedSpecies, scenesVisited,
      ambientModeEntered, ambientStageWidth, backToRoom, cubeCards, cubeStageRatio, amazonCards,
      restored, migrated, desktop, mobile, removedCopyAbsent, consoleErrors,
    };
    console.log(JSON.stringify(result, null, 2));

    assert(title.includes("熱帯魚"));
    assert(roomTanks === 3);
    assert(enteredTank === "東南アジアの水草水槽");
    assert(asiaCards === 4 && harlequinCount === 11 && rejectedSpecies);
    assert(JSON.stringify(scenesVisited) ===
      JSON.stringify(["driftwood", "root-driftwood", "iwagumi", "planted"]));
    assert(ambientModeEntered && ambientStageWidth >= 1300);
    assert(backToRoom);
    assert(cubeCards === 3 && Math.abs(cubeStageRatio - 1) < 0.05);
    assert(amazonCards === 3);
    assert(restored.version === 5 && restored.scene === "driftwood");
    assert(restored.lighting === "night" && restored.harlequinCount === 11 && restored.sound);
    assert(migrated.version === 5 && migrated.asiaScene === "iwagumi" && migrated.amazonNeon === 9);
    assert(desktop.stageWidth >= 700 && desktop.canvasWidth >= 700 && desktop.stageHeight >= 400);
    assert(mobile.roomTanks === 3 && mobile.tankStageWidth >= 380 && mobile.overflowWidth === 0);
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
