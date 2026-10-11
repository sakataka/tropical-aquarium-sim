import type { TankSpeciesModule } from "./contentTypes";

// まだ見ていない水槽と生き物の印（NEW）。
// 既読は水槽ごとに持つ（同じ種が別の水槽にいても、水槽ごとに数える）。水槽の画面に入ると、その水槽の今の種が既読になる。
// 水槽ごとの今の種の並びは館の索引に入れず（索引は生き物の数で増やさない）、起動後に小さなモジュールで読む。
// 既読は、水槽の設定（customization.ts）とは別のキーで保存する。

/** 水槽ごとの、既読の種。 */
export type SeenState = Readonly<Record<string, readonly string[]>>;
/** 水槽ごとの、まだ見ていない種。未読の種がない水槽は載せない。 */
export type UnseenSpecies = Readonly<Record<string, readonly string[]>>;

export const SEEN_STORAGE_KEY = "tropical-aquarium.seen.v1";

/** 水槽ごとの今の種の並びと、既読の最初の状態を読む。 */
export const loadTankSpecies = (): Promise<TankSpeciesModule> => import("virtual:tank-species");

/**
 * 水槽ごとの未読の種。一度も見ていない水槽は全種が未読で、見たあとに足された種も未読になる。
 * 未読の種が1つでもある水槽が、NEW の水槽。
 */
export function getUnseenSpecies(tankSpecies: Readonly<Record<string, readonly string[]>>, seen: SeenState): UnseenSpecies {
  const unseen: Record<string, readonly string[]> = {};
  for (const [tankId, speciesIds] of Object.entries(tankSpecies)) {
    const known = new Set(seen[tankId]);
    const fresh = speciesIds.filter((id) => !known.has(id));
    if (fresh.length > 0) unseen[tankId] = fresh;
  }
  return unseen;
}

/** 水槽の並びのうち、NEW の水槽の数。展示室・階・建物の印に使う。 */
export function countUnseenTanks(tankIds: readonly string[], unseen: UnseenSpecies | undefined): number {
  return unseen ? tankIds.filter((id) => unseen[id] !== undefined).length : 0;
}

/**
 * 水槽の今の種を既読に加える。すでに全部が既読なら、同じ状態をそのまま返す。
 * 水槽から外れた種の既読は残す（戻ってきたときに NEW にしない）。
 */
export function markTankSeen(seen: SeenState, tankId: string, speciesIds: readonly string[]): SeenState {
  const known = seen[tankId] ?? [];
  const added = speciesIds.filter((id) => !known.includes(id));
  if (added.length === 0 && seen[tankId]) return seen;
  return { ...seen, [tankId]: [...known, ...added] };
}

/** 保存した既読を読む。形が違えば undefined。水槽ごとの並びが壊れている分は落とす（その水槽は未読に戻る）。 */
export function normalizeSeenState(value: unknown): SeenState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const seen: Record<string, string[]> = {};
  for (const [tankId, speciesIds] of Object.entries(value)) {
    if (Array.isArray(speciesIds)) seen[tankId] = speciesIds.filter((id) => typeof id === "string");
  }
  return seen;
}

type SeenStorage = Pick<Storage, "getItem" | "setItem">;

/** 既読を保存する場所。使えない環境（保存を禁じた設定など）では undefined。 */
export function getSeenStorage(): SeenStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * 既読を読む。保存がない・読めない・壊れているときは、最初の状態（baseline）から始める。
 * 閲覧の記録を取り始める前から館にあった水槽と種を、未読として並べないため。
 */
export function loadSeenState(storage: SeenStorage | undefined, baseline: SeenState): SeenState {
  try {
    const saved = storage?.getItem(SEEN_STORAGE_KEY);
    return (saved ? normalizeSeenState(JSON.parse(saved)) : undefined) ?? baseline;
  } catch {
    return baseline;
  }
}

/** 既読を保存する。保存できなくても、この回の表示は続ける（開き直すと、見た水槽が未読に戻る）。 */
export function saveSeenState(storage: SeenStorage | undefined, seen: SeenState): void {
  try {
    storage?.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // 保存できない端末でも、見て回ることはできる。
  }
}
