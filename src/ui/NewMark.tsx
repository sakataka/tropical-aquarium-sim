/**
 * まだ見ていない水槽・生き物の印。count を渡すと「NEW 5」のように数を添える。
 * 読み上げには「NEW」ではなく label（「未読の水槽が5台」など）を使う。
 */
export function NewMark({ count, label, dot = false }: {
  count?: number;
  label: string;
  /** 文字を出さず、小さな点だけにする（階の切り替えのような狭い所）。 */
  dot?: boolean;
}) {
  // em や span だと、置いた先の文字の指定（.index-copy em など）を拾ってしまうので、ほかで使っていない mark にする。
  return (
    <mark aria-label={label} className={dot ? "new-mark dot" : "new-mark"} role="img">
      {dot ? null : <>NEW{count ? <b>{count}</b> : null}</>}
    </mark>
  );
}

/** 未読の水槽の数を、読み上げ用の文にする。 */
export function unseenTanksLabel(count: number): string {
  return `未読の水槽が${count}台`;
}
