const PORT = 5183;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}/`;
const SCREENSHOT_DIR = "tmp/webview";

type CheckResult = {
  title: string;
  canvas: {
    width: number;
    height: number;
  };
  fishRowsBeforeDelete: number;
  fishRowsAfterDelete: number;
  devText: string;
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
      stdout: "pipe",
      stderr: "pipe",
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
    await sleep(1200);
    await Bun.write(
      `${SCREENSHOT_DIR}/tank.png`,
      await view.screenshot({ format: "png" }),
    );

    const title = await view.evaluate("document.title");
    const canvas = await view.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      return {
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
      };
    })()`);
    const fishRowsBeforeDelete = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );

    await view.click("button[aria-label$='を削除']");
    await sleep(200);
    const fishRowsAfterDelete = await view.evaluate(
      `document.querySelectorAll(".fish-row").length`,
    );

    await view.click("button:nth-child(2)");
    await sleep(500);
    const devText = await view.evaluate(
      `document.querySelector(".dev-view")?.textContent ?? ""`,
    );
    await Bun.write(
      `${SCREENSHOT_DIR}/dev.png`,
      await view.screenshot({ format: "png" }),
    );

    const result: CheckResult = {
      title: String(title),
      canvas: canvas as CheckResult["canvas"],
      fishRowsBeforeDelete: Number(fishRowsBeforeDelete),
      fishRowsAfterDelete: Number(fishRowsAfterDelete),
      devText: String(devText).slice(0, 240),
      consoleErrors,
    };

    assert(result.title.includes("2D熱帯魚水槽"));
    assert(result.canvas.width > 0 && result.canvas.height > 0);
    assert(result.fishRowsBeforeDelete >= 3);
    assert(result.fishRowsAfterDelete === result.fishRowsBeforeDelete - 1);
    assert(result.devText.includes("サイズ確認"));
    assert(result.devText.includes("sourceBodyBounds"));
    assert(result.consoleErrors.length === 0);

    console.log(JSON.stringify(result, null, 2));
    console.log(`Screenshots: ${SCREENSHOT_DIR}/tank.png, ${SCREENSHOT_DIR}/dev.png`);
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
