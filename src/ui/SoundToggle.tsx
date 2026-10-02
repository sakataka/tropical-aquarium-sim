import { playSfx } from "../audio/sfx";

// 環境音と効果音をまとめて入れ・切りする。鳴っているあいだは小さな波形がゆっくり揺れる。
export function SoundToggle({
  enabled,
  onToggle,
  className,
}: {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      aria-label={enabled ? "サウンドを切る" : "サウンドを入れる"}
      aria-pressed={enabled}
      className={["hud-button icon-only sound-button", enabled ? "on" : "", className ?? ""].filter(Boolean).join(" ")}
      onClick={() => {
        if (enabled) playSfx("ui_tap", 0.6);
        onToggle();
      }}
      title={enabled ? "サウンドを切る" : "水の音と効果音を入れる"}
      type="button"
    >
      <span aria-hidden="true" className="sound-bars">
        <i /><i /><i /><i />
      </span>
    </button>
  );
}
