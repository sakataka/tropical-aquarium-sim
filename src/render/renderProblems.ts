// 描画に失敗したときの理由を画面に出す。スマホでは開発者ツールを開きにくいため、
// 利用者がそのまま伝えられる形で表示する。
export const RENDER_PROBLEM_EVENT = "aquarium:render-problem";

export function reportRenderProblem(where: string, error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[${where}] ${message}`);
  window.dispatchEvent(new CustomEvent(RENDER_PROBLEM_EVENT, { detail: `${where}: ${message}` }));
}

/**
 * WebGL のコンテキストが失われたとき（GPUメモリ不足など）にも知らせる。
 * 画面を閉じるときは PixiJS が自分で解放するので、isClosing が true の間は知らせない。
 */
export function watchContextLoss(canvas: HTMLCanvasElement, where: string, isClosing: () => boolean) {
  canvas.addEventListener("webglcontextlost", () => {
    if (!isClosing()) reportRenderProblem(where, new Error("WebGL context lost"));
  });
}

/**
 * 準備がエラーも出さずに止まった場合に備え、進んだ段階を記録して一定時間後に知らせる。
 * mark() で段階を進め、done() で見張りをやめる。
 */
export function watchSetup(where: string, timeoutMs = 10_000) {
  let stage = "開始前";
  const timer = window.setTimeout(() => {
    reportRenderProblem(where, new Error(`${timeoutMs / 1000}秒たっても準備が終わりません（止まった段階: ${stage}）`));
  }, timeoutMs);
  return {
    mark: (next: string) => { stage = next; },
    done: () => window.clearTimeout(timer),
  };
}
