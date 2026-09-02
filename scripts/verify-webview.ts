const PORT = 5183;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";

type Result = {
  title: string;
  initialCards: number;
  searchedCards: number;
  regionCards: number;
  bottomCards: number;
  neonCount: number;
  themesVisited: string[];
  editedSlots: number;
  ambientModeEntered: boolean;
  ambientStageWidth: number;
  ambientCanvasWidth: number;
  restored: { version: number; theme: string; lighting: string; neonCount: number; sound: boolean };
  desktop: { stageWidth: number; stageHeight: number; canvasWidth: number; canvasHeight: number };
  mobile: { stageWidth: number; canvasWidth: number; overflowWidth: number };
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
    await sleep(2200);
    await view.evaluate(`[
      "tropical-aquarium.customization.v1",
      "tropical-aquarium.state.v2",
      "tropical-aquarium.state.v3"
    ].forEach((key) => localStorage.removeItem(key))`);
    await view.reload();
    await sleep(2200);

    const title = String(await view.evaluate("document.title"));
    const desktop = await view.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage")?.getBoundingClientRect();
      const canvas = document.querySelector("canvas")?.getBoundingClientRect();
      return {
        stageWidth: Math.round(stage?.width ?? 0),
        stageHeight: Math.round(stage?.height ?? 0),
        canvasWidth: Math.round(canvas?.width ?? 0),
        canvasHeight: Math.round(canvas?.height ?? 0),
      };
    })()`) as Result["desktop"];
    const initialCards = Number(await view.evaluate(
      `document.querySelectorAll(".fish-catalog-card").length`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/planted-1440x960.png`, await view.screenshot({ format: "png" }));

    await setControlValue(view, `input[type="search"]`, "ネオン");
    await sleep(250);
    const searchedCards = Number(await view.evaluate(
      `document.querySelectorAll(".fish-catalog-card").length`,
    ));
    await setControlValue(view, `input[type="search"]`, "");
    await setControlValue(view, `.catalog-filters label:nth-child(2) select`, "south-america");
    await sleep(250);
    const regionCards = Number(await view.evaluate(
      `document.querySelectorAll(".fish-catalog-card").length`,
    ));
    await setControlValue(view, `.catalog-filters label:nth-child(2) select`, "all");
    await setControlValue(view, `.catalog-filters label:nth-child(3) select`, "bottom");
    await sleep(250);
    const bottomCards = Number(await view.evaluate(
      `document.querySelectorAll(".fish-catalog-card").length`,
    ));
    await setControlValue(view, `.catalog-filters label:nth-child(3) select`, "all");

    await view.evaluate(`document.querySelector("button[aria-label='ネオンテトラを1匹増やす']")?.click()`);
    await sleep(350);
    const neonCount = Number(await view.evaluate(`(() => {
      const value = localStorage.getItem("tropical-aquarium.state.v3");
      const stock = value ? JSON.parse(value).customization.stock : [];
      return stock.find((entry) => entry.speciesId === "neon-tetra")?.count ?? 0;
    })()`));

    await clickButtonByText(view, "レイアウト");
    const themesVisited: string[] = [];
    for (const [label, id] of [
      ["自然な流木景", "driftwood"],
      ["開けた岩組景", "iwagumi"],
      ["明るい水草景", "planted"],
    ]) {
      await clickButtonByText(view, label);
      await sleep(1500);
      themesVisited.push(String(await view.evaluate(
        `JSON.parse(localStorage.getItem("tropical-aquarium.state.v3")).customization.layout.themeId`,
      )));
      if (id !== "planted") {
        await Bun.write(`${SCREENSHOT_DIR}/${id}-1440x960.png`, await view.screenshot({ format: "png" }));
      }
    }

    const editedSlots = Number(await view.evaluate(`(() => {
      const selects = Array.from(document.querySelectorAll(".slot-row select"));
      for (const select of selects) {
        if (!(select instanceof HTMLSelectElement)) continue;
        const options = Array.from(select.options).filter((option) => option.value);
        if (options.length === 0) continue;
        select.value = options[options.length - 1].value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return selects.length;
    })()`));
    await sleep(500);
    await view.evaluate(`Array.from(document.querySelectorAll(".flip-button"))
      .forEach((button) => button instanceof HTMLButtonElement && !button.disabled && button.click())`);
    await sleep(1500);
    await Bun.write(`${SCREENSHOT_DIR}/edited-layout-1440x960.png`, await view.screenshot({ format: "png" }));

    await clickButtonByText(view, "自然な流木景");
    await sleep(1500);
    await clickButtonByText(view, "鑑賞設定");
    await clickButtonByText(view, "夜景");
    await view.evaluate(`document.querySelector(".sound-toggle")?.click()`);
    await sleep(350);
    await clickButtonByText(view, "観賞モード");
    await sleep(700);
    const ambientModeEntered = Boolean(await view.evaluate(
      `document.querySelector(".app-shell")?.classList.contains("ambient-active")`,
    ));
    const ambientStageWidth = Number(await view.evaluate(
      `Math.round(document.querySelector(".aquarium-stage")?.getBoundingClientRect().width ?? 0)`,
    ));
    const ambientCanvasWidth = Number(await view.evaluate(
      `Math.round(document.querySelector("canvas")?.getBoundingClientRect().width ?? 0)`,
    ));
    await Bun.write(`${SCREENSHOT_DIR}/ambient-1440x960.png`, await view.screenshot({ format: "png" }));
    await view.evaluate(`document.querySelector(".ambient-hud button")?.click()`);
    await sleep(200);

    await view.reload();
    await sleep(2200);
    const restored = await view.evaluate(`(() => {
      const state = JSON.parse(localStorage.getItem("tropical-aquarium.state.v3"));
      return {
        version: state.version,
        theme: state.customization.layout.themeId,
        lighting: state.customization.layout.lighting,
        neonCount: state.customization.stock.find((entry) => entry.speciesId === "neon-tetra")?.count ?? 0,
        sound: state.preferences.soundEnabled,
      };
    })()`) as Result["restored"];
    const shellText = String(await view.evaluate(
      `document.querySelector(".app-shell")?.textContent ?? ""`,
    ));
    const removedCopyAbsent = ["愛称", "空腹", "餌やり", "お気に入り", "今日の観察"]
      .every((word) => !shellText.includes(word));

    await using mobileView = new Bun.WebView({
      width: 420,
      height: 912,
      backend: "webkit",
      console: (type, ...args) => {
        if (type === "error") consoleErrors.push(`mobile: ${args.map(String).join(" ")}`);
      },
    });
    await mobileView.navigate(BASE_URL);
    await sleep(2200);
    const mobile = await mobileView.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage")?.getBoundingClientRect();
      const canvas = document.querySelector("canvas")?.getBoundingClientRect();
      return {
        stageWidth: Math.round(stage?.width ?? 0),
        canvasWidth: Math.round(canvas?.width ?? 0),
        overflowWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`) as Result["mobile"];
    await Bun.write(`${SCREENSHOT_DIR}/mobile-420x912.png`, await mobileView.screenshot({ format: "png" }));

    const result: Result = {
      title, initialCards, searchedCards, regionCards, bottomCards, neonCount,
      themesVisited, editedSlots, ambientModeEntered, ambientStageWidth, ambientCanvasWidth,
      restored, desktop, mobile,
      removedCopyAbsent, consoleErrors,
    };
    console.log(JSON.stringify(result, null, 2));

    assert(title.includes("熱帯魚"));
    assert(initialCards === 10 && searchedCards === 1);
    assert(regionCards === 4 && bottomCards >= 2 && bottomCards < initialCards);
    assert(neonCount === 7);
    assert(JSON.stringify(themesVisited) === JSON.stringify(["driftwood", "iwagumi", "planted"]));
    assert(editedSlots === 7);
    assert(ambientModeEntered);
    assert(ambientStageWidth >= 1300);
    assert(ambientCanvasWidth >= 1300);
    assert(restored.version === 3 && restored.theme === "driftwood");
    assert(restored.lighting === "night" && restored.neonCount === 7 && restored.sound);
    assert(desktop.stageWidth >= 700 && desktop.canvasWidth >= 700 && desktop.stageHeight >= 400);
    assert(mobile.stageWidth >= 380 && mobile.canvasWidth >= 380 && mobile.overflowWidth === 0);
    assert(removedCopyAbsent);
    assert(consoleErrors.length === 0);
    console.log(`Screenshots: ${SCREENSHOT_DIR}/*.png`);
  } finally {
    server.kill();
    await server.exited.catch(() => undefined);
  }
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

async function setControlValue(view: Bun.WebView, selector: string, value: string) {
  const changed = await view.evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed);
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
