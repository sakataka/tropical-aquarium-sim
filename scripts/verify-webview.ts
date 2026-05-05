const PORT = 5183;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";

type CheckResult = {
  title: string;
  shellText: string;
  stage: {
    width: number;
    height: number;
  };
  canvas: {
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
  };
  controlPanelScroll: {
    clientHeight: number;
    scrollHeight: number;
    scrollTopAfterScroll: number;
  };
  fishListText: string;
  fishRowsBeforeDelete: number;
  fishRowsAfterDelete: number;
  fishRowsAfterPreset: number;
  fishRowsAfterReload: number;
  customizationStatus: string;
  tapLabelSeen: boolean;
  guideText: string;
  consoleErrors: string[];
};

async function main() {
  if (!Bun.WebView) {
    throw new Error("Bun.WebView is not available in this Bun runtime.");
  }

  await Bun.$`mkdir -p ${SCREENSHOT_DIR}`;
  const server = Bun.spawn(
    [
      "bun",
      "run",
      "dev",
      "--",
      "--host",
      HOST,
      "--port",
      String(PORT),
      "--strictPort",
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  try {
    await waitForServer(BASE_URL);
    const consoleErrors: string[] = [];
    await using view = new Bun.WebView({
      width: 1440,
      height: 960,
      backend: "webkit",
      console: (type, ...args) => {
        if (type === "error") {
          consoleErrors.push(args.map(String).join(" "));
        }
      },
    });

    await view.navigate(BASE_URL);
    await view.evaluate(`localStorage.removeItem("tropical-aquarium.customization.v1")`);
    await view.reload();
    await sleep(1200);
    await Bun.write(
      `${SCREENSHOT_DIR}/tank.png`,
      await view.screenshot({ format: "png" }),
    );

    const title = await view.evaluate("document.title");
    const shellText = await view.evaluate(
      `document.querySelector(".app-shell")?.textContent ?? ""`,
    );
    const stage = await view.evaluate(`(() => {
      const stage = document.querySelector(".aquarium-stage");
      const rect = stage?.getBoundingClientRect();
      return {
        width: Math.round(rect?.width ?? 0),
        height: Math.round(rect?.height ?? 0),
      };
    })()`);
    const canvas = await view.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      return {
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
        cssWidth: Math.round(rect?.width ?? 0),
        cssHeight: Math.round(rect?.height ?? 0),
      };
    })()`);
    const controlPanelScroll = await view.evaluate(`(() => {
      const panel = document.querySelector(".control-panel");
      if (!(panel instanceof HTMLElement)) {
        return { clientHeight: 0, scrollHeight: 0, scrollTopAfterScroll: 0 };
      }
      panel.scrollTop = panel.scrollHeight;
      return {
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        scrollTopAfterScroll: panel.scrollTop,
      };
    })()`);
    const fishListText = await view.evaluate(
      `document.querySelector(".fish-list")?.textContent ?? ""`,
    );
    const fishRowsBeforeDelete = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );
    await view.evaluate(`(() => {
      const element = document.querySelector(".aquarium-canvas");
      const rect = element?.getBoundingClientRect();
      if (!element || !rect) return false;
      element.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width * 0.48,
        clientY: rect.top + rect.height * 0.44,
      }));
      return true;
    })()`);
    await sleep(300);
    const tapLabelSeen = await view.evaluate(
      `document.querySelector(".fish-list")?.textContent?.includes("タップ") ?? false`,
    );

    await view.evaluate(`(() => {
      const button = document.querySelector("button[aria-label$='を削除']");
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    await sleep(200);
    const fishRowsAfterDelete = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );
    await view.evaluate(`(() => {
      const preset = document.querySelector("section[aria-label='水槽設定'] select");
      if (!(preset instanceof HTMLSelectElement)) return false;
      preset.value = "school";
      preset.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    const fishRowsAfterPreset = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );
    await view.evaluate(`(() => {
      const inputs = Array.from(document.querySelectorAll(".stock-row input"));
      const neonInput = inputs.find((input) =>
        input.closest(".stock-row")?.textContent?.includes("ネオン")
      );
      if (!(neonInput instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(neonInput, "3");
      neonInput.dispatchEvent(new Event("input", { bubbles: true }));
      neonInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    await view.reload();
    await sleep(900);
    const fishRowsAfterReload = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );
    const customizationStatus = await view.evaluate(
      `document.querySelector("section[aria-label='水槽設定']")?.textContent ?? ""`,
    );

    await view.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll(".segmented-control button"));
      const guideButton = buttons.find((button) => button.textContent?.includes("図鑑"));
      if (!(guideButton instanceof HTMLButtonElement)) return false;
      guideButton.click();
      return true;
    })()`);
    await sleep(500);
    const guideText = await view.evaluate(
      `document.querySelector(".guide-view")?.textContent ?? ""`,
    );
    await Bun.write(
      `${SCREENSHOT_DIR}/guide.png`,
      await view.screenshot({ format: "png" }),
    );

    const result: CheckResult = {
      title: String(title),
      shellText: String(shellText).slice(0, 320),
      stage: stage as CheckResult["stage"],
      canvas: canvas as CheckResult["canvas"],
      controlPanelScroll: controlPanelScroll as CheckResult["controlPanelScroll"],
      fishListText: String(fishListText).slice(0, 1000),
      fishRowsBeforeDelete: Number(fishRowsBeforeDelete),
      fishRowsAfterDelete: Number(fishRowsAfterDelete),
      fishRowsAfterPreset: Number(fishRowsAfterPreset),
      fishRowsAfterReload: Number(fishRowsAfterReload),
      customizationStatus: String(customizationStatus).slice(0, 240),
      tapLabelSeen: Boolean(tapLabelSeen),
      guideText: String(guideText).slice(0, 240),
      consoleErrors,
    };

    console.log(JSON.stringify(result, null, 2));

    assert(result.title.includes("2D熱帯魚水槽"));
    assert(result.shellText.includes("魚を追加"));
    assert(result.shellText.includes("水槽設定"));
    assert(result.shellText.includes("プラティ"));
    assert(result.shellText.includes("クーリーローチ"));
    assert(result.stage.width >= 720 && result.stage.height >= 360);
    assert(result.canvas.width > 0 && result.canvas.height > 0);
    assert(result.canvas.cssWidth >= 720 && result.canvas.cssHeight >= 360);
    assert(result.controlPanelScroll.scrollHeight > result.controlPanelScroll.clientHeight);
    assert(result.controlPanelScroll.scrollTopAfterScroll > 0);
    assert(result.fishListText.includes("ネオン"));
    assert(result.fishListText.includes("遊泳"));
    assert(result.fishListText.includes("削除"));
    assert(result.fishRowsBeforeDelete >= 3);
    assert(result.fishRowsAfterDelete === result.fishRowsBeforeDelete - 1);
    assert(result.fishRowsAfterPreset === 26);
    assert(result.fishRowsAfterReload === 19);
    assert(result.customizationStatus.includes("保存済み"));
    assert(result.guideText.includes("魚図鑑"));
    assert(result.guideText.includes("原産"));
    assert(result.guideText.includes("性格"));
    assert(result.guideText.includes("動き"));
    assert(result.guideText.includes("Paracheirodon innesi"));
    assert(result.consoleErrors.length === 0);

    console.log(`Screenshots: ${SCREENSHOT_DIR}/tank.png, ${SCREENSHOT_DIR}/guide.png`);
  } finally {
    server.kill();
    await server.exited.catch(() => undefined);
  }
}

async function waitForServer(url: string) {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await sleep(150);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: unknown): asserts condition {
  if (!condition) {
    throw new Error("Bun.WebView verification failed.");
  }
}

await main();
