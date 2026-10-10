import { useEffect, useRef, type MutableRefObject } from "react";
import {
  AQUARIUM_STATE_STORAGE_KEY,
  createDefaultState,
  normalizeAquariumPersistedState,
} from "./core/customization";
import {
  defaultBuilding,
  getBuildingById,
  getFloorById,
  getHallById,
  getHallOfTank,
  getTankSummary,
  tankSummaries,
} from "./core/museum";
import type { AquariumPersistedState } from "./core/types";

/** 図鑑を開いているときの表示。speciesId が null なら一覧。 */
export type ZukanView = { speciesId: string | null };

// 画面を切り替える間は、次の画面の準備ができるまで前の画面を重ねて残す。
export type Phase =
  // floorId があれば、館内図のその階の展示室の一覧。なければ建物の断面図（buildingId がなければ最初の建物）。
  | { kind: "map"; floorId?: string; buildingId?: string }
  | { kind: "room"; returningFrom?: string }
  | { kind: "toTank"; tankReady: boolean }
  | { kind: "tank" }
  | { kind: "toRoom"; returningFrom: string; roomReady: boolean }
  // 部屋に戻らず隣の水槽へ。今の水槽を流し消してから、次の水槽を反対側から出す。
  | { kind: "leaveTank"; to: string; direction: SwitchDirection }
  | { kind: "switchTank"; direction: SwitchDirection; tankReady: boolean };
export type SwitchDirection = "next" | "previous";

type HistoryTargets = {
  /** 図鑑を開く（speciesId が null なら一覧）。undefined なら閉じる。 */
  toZukan: (speciesId: string | null | undefined) => void;
  /** 館内図へ。floorId があれば、その階の展示室の一覧。なければ buildingId の建物（なければ最初の建物）の断面図。 */
  toMap: (floorId?: string, buildingId?: string) => void;
  toHall: (hallId: string) => void;
  toTank: (tankId: string) => void;
};

/**
 * 館内図は ""（最初の建物）と ?building=（ほかの建物）、階の一覧は ?floor=、展示室は ?hall=、水槽は ?tank=、
 * 図鑑は ?zukan と ?zukan=<種>。階・展示室・水槽の id は館全体で重ならないので、建物は書かない。
 * 切り替えの途中は URL を書き換えない。
 */
export function searchForPhase(phase: Phase, tankId: string, zukan: ZukanView | null): string | null {
  if (zukan) return zukan.speciesId ? `?zukan=${zukan.speciesId}` : "?zukan";
  if (phase.kind === "map") {
    if (phase.floorId) return `?floor=${phase.floorId}`;
    return phase.buildingId && phase.buildingId !== defaultBuilding.id ? `?building=${phase.buildingId}` : "";
  }
  if (phase.kind === "room") return `?hall=${getHallOfTank(tankId).id}`;
  if (phase.kind === "tank") return `?tank=${tankId}`;
  return null;
}

// 見ている画面を URL に映し、ブラウザの戻る・進むで館内図・展示室・水槽を行き来できるようにする。
// GitHub Pages で動くよう、パスではなくクエリで表す。
export function useHistorySync(phase: Phase, tankId: string, zukan: ZukanView | null,
  closingZukanRef: MutableRefObject<boolean>, targets: HistoryTargets) {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const syncedRef = useRef(false);
  const search = searchForPhase(phase, tankId, zukan);

  useEffect(() => {
    if (search === null) return;
    const current = window.location.search;
    if (search !== current) {
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      // 開いた直後の正規化（?theme= など）、同じ展示室の隣の水槽や隣の階・隣の建物への移動、直接開いた図鑑を閉じるときは履歴を増やさない。
      const isBuilding = (value: string) => value === "" || value.startsWith("?building=");
      const sideways = (search.startsWith("?tank=") && current.startsWith("?tank=")) ||
        (search.startsWith("?floor=") && current.startsWith("?floor=")) ||
        (isBuilding(search) && isBuilding(current));
      const depth = Number((window.history.state as { zukanDepth?: number } | null)?.zukanDepth ?? 0);
      // 図鑑の中で進んだ数を履歴に残し、閉じるときにその分だけ戻れるようにする。
      const state = zukan ? { zukanDepth: depth + 1 } : null;
      if (!syncedRef.current || sideways || closingZukanRef.current) window.history.replaceState(zukan ? { zukanDepth: depth } : null, "", url);
      else window.history.pushState(state, "", url);
    }
    closingZukanRef.current = false;
    syncedRef.current = true;
  }, [closingZukanRef, search, zukan]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("zukan")) {
        targetsRef.current.toZukan(params.get("zukan") || null);
        return;
      }
      targetsRef.current.toZukan(undefined);
      const tank = getTankSummary(params.get("tank"));
      const hall = getHallById(params.get("hall"));
      if (tank) targetsRef.current.toTank(tank.id);
      else if (hall) targetsRef.current.toHall(hall.id);
      else targetsRef.current.toMap(getFloorById(params.get("floor"))?.id, getBuildingById(params.get("building"))?.id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

type InitialState = {
  state: AquariumPersistedState;
  phase: Phase;
  restored: boolean;
  zukan: ZukanView | null;
  /** ?theme= で指定された水景。その水槽の展示室を読んでから当てる。 */
  pendingScene?: { tankId: string; sceneId: string };
};

export function loadInitialState(): InitialState {
  const params = new URLSearchParams(window.location.search);
  let state = createDefaultState();
  let restored = false;
  try {
    const saved = window.localStorage.getItem(AQUARIUM_STATE_STORAGE_KEY);
    const current = saved ? normalizeAquariumPersistedState(JSON.parse(saved)) : undefined;
    state = current ?? state;
    restored = Boolean(current);
  } catch {
    // 壊れた保存データは初期状態から始める。
  }
  // ?tank=<id> で水槽を、?theme=<水景id> でその水景を持つ水槽を、?hall=<id> で展示室を直接開く。
  // ?floor=<id> で館内図のその階の展示室の一覧を、?building=<id> でその建物の断面図を開く。
  // ?zukan で図鑑の一覧を、?zukan=<種> でその種の解説を、館内図の上に開く。
  // 何も指定がなければ館内図から始める。
  if (params.has("zukan")) return { state, phase: { kind: "map" }, restored, zukan: { speciesId: params.get("zukan") || null } };
  const sceneId = params.get("theme");
  const sceneTank = sceneId ? tankSummaries.find((item) => item.sceneIds.includes(sceneId)) : undefined;
  const requestedTank = getTankSummary(params.get("tank")) ?? sceneTank;
  if (!requestedTank) {
    const hall = getHallById(params.get("hall"));
    if (!hall) {
      const phase: Phase = { kind: "map", floorId: getFloorById(params.get("floor"))?.id, buildingId: getBuildingById(params.get("building"))?.id };
      return { state, phase, restored, zukan: null };
    }
    const saved = hall.tankIds.includes(state.activeTankId);
    return {
      state: saved ? state : { ...state, activeTankId: hall.tankIds[0]! },
      phase: { kind: "room" },
      restored,
      zukan: null,
    };
  }
  return {
    state: { ...state, activeTankId: requestedTank.id },
    phase: { kind: "tank" },
    restored,
    zukan: null,
    // すでにその水景なら、選んである照明を残す。
    pendingScene: sceneTank && sceneId ? { tankId: sceneTank.id, sceneId } : undefined,
  };
}
