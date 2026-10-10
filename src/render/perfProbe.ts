import type { Application } from "pixi.js";

/**
 * 性能の計測（scripts/measure-performance.ts）のための窓口。計測スクリプトが sessionStorage に印を置いたときだけ働く
 * （URL は画面の移動で書き換わり、この描画のモジュールは後から読まれるので、URL では渡さない）。
 * 描画中の Pixi アプリを名前で登録し、1フレームの中の区間（シミュレーション、体の変形）の時間を足し込む。
 * ふだんは何も記録しない。
 */
type PerfProbe = { apps: Record<string, Application>; sections: Record<string, number> };

function isRequested(): boolean {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem("tropical-aquarium.perf") === "1";
  } catch {
    return false;
  }
}

const probe: PerfProbe | undefined = isRequested() ? { apps: {}, sections: {} } : undefined;

/** 描画を始めたアプリを登録する。返す関数で外す。 */
export function registerPerfApp(name: string, app: Application): () => void {
  if (!probe) return () => {};
  // 計測スクリプトが読む場所。
  (window as unknown as { __aquariumPerf: PerfProbe }).__aquariumPerf = probe;
  probe.apps[name] = app;
  return () => { if (probe.apps[name] === app) delete probe.apps[name]; };
}

/** 区間の始まりの時刻。計測していないときは 0。 */
export const perfStart: () => number = probe ? () => performance.now() : () => 0;

/** perfStart からの時間を、区間の合計に足す。 */
export function perfEnd(section: string, startMs: number) {
  if (probe) probe.sections[section] = (probe.sections[section] ?? 0) + performance.now() - startMs;
}
