import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSeenStorage,
  getUnseenSpecies,
  loadSeenState,
  loadTankSpecies,
  markTankSeen,
  saveSeenState,
  type SeenState,
  type UnseenSpecies,
} from "./core/seen";

type SeenData = {
  tankSpecies: Readonly<Record<string, readonly string[]>>;
  seen: SeenState;
};

/**
 * まだ見ていない水槽と生き物（NEW の印）。既読はここだけで持ち、館内図・展示室・水槽の画面は unseen を見て印を出す。
 * 水槽ごとの種の並びは起動後に読むので、読めるまで unseen は undefined（印なし）。読めなければ、印なしのまま。
 */
export function useSeenTanks(): {
  /** 水槽ごとの未読の種。未読の種がない水槽は載らない。 */
  unseen: UnseenSpecies | undefined;
  /** 水槽の画面に入ったときに呼ぶ。その水槽の今の種を既読にする。 */
  markSeen: (tankId: string) => void;
} {
  const [data, setData] = useState<SeenData>();
  // 保存してある既読。水槽を見て変わったときだけ保存する（開いただけでは、最初の状態を書き込まない）。
  const savedRef = useRef<SeenState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadTankSpecies().then((module) => {
      if (cancelled) return;
      const seen = loadSeenState(getSeenStorage(), module.seenBaseline);
      savedRef.current = seen;
      setData({ tankSpecies: module.tankSpecies, seen });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!data || data.seen === savedRef.current) return;
    savedRef.current = data.seen;
    saveSeenState(getSeenStorage(), data.seen);
  }, [data]);

  const unseen = useMemo(() => data && getUnseenSpecies(data.tankSpecies, data.seen), [data]);
  const markSeen = useCallback((tankId: string) => setData((current) => {
    if (!current) return current;
    const seen = markTankSeen(current.seen, tankId, current.tankSpecies[tankId] ?? []);
    return seen === current.seen ? current : { ...current, seen };
  }), []);
  return { unseen, markSeen };
}
