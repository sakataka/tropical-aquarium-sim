// SFX Forge で作った効果音（public/sfx）を鳴らす。サウンドを入れたときだけ読み込み、
// 環境音と同じ音量つまみに従う。鑑賞の邪魔にならないよう、全体を控えめにする。

export type SfxKey =
  | "tank_enter"
  | "room_return"
  | "tank_switch"
  | "panel_open"
  | "panel_close"
  | "ui_tap"
  | "fish_add"
  | "fish_remove"
  | "scene_change"
  | "light_switch";

type ManifestSound = { key: string; files: string[]; playbackRandom: { pitch: number; volume: number } };
type LoadedSound = { buffers: AudioBuffer[]; random: ManifestSound["playbackRandom"] };

const BASE_URL = `${import.meta.env.BASE_URL}sfx/`;
const MASTER_LEVEL = 0.55;
// 開く音は閉じる音を少し高く鳴らして作る（同じ素材で開閉の対をそろえる）。
const ALIASES: Partial<Record<SfxKey, { key: SfxKey; rate: number }>> = {
  panel_open: { key: "panel_close", rate: 1.18 },
};

let context: AudioContext | undefined;
let master: GainNode | undefined;
let sounds: Promise<Map<string, LoadedSound>> | undefined;
let enabled = false;
let volume = 0.42;

export function configureSfx(next: { enabled: boolean; volume: number }) {
  enabled = next.enabled;
  volume = next.volume;
  if (master && context) master.gain.setTargetAtTime(level(), context.currentTime, 0.05);
  if (enabled) void load();
}

export function playSfx(key: SfxKey, gain = 1) {
  if (!enabled) return;
  const alias = ALIASES[key];
  void load()?.then((loaded) => {
    const sound = loaded.get(alias?.key ?? key);
    if (!sound || !context || !master || !enabled) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const source = context.createBufferSource();
    source.buffer = sound.buffers[Math.floor(Math.random() * sound.buffers.length)]!;
    // 同じ音が続いても機械的に聞こえないよう、推奨幅でピッチと音量を揺らす。
    source.playbackRate.value = (alias?.rate ?? 1) * (1 + (Math.random() * 2 - 1) * sound.random.pitch);
    const node = context.createGain();
    node.gain.value = gain * (1 + (Math.random() * 2 - 1) * sound.random.volume);
    source.connect(node).connect(master);
    source.start();
  }).catch(() => undefined);
}

function level() {
  return enabled ? Math.max(0, Math.min(1, volume)) * MASTER_LEVEL : 0;
}

function load() {
  if (sounds) return sounds;
  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return undefined;
  const audio = new AudioContextConstructor();
  context = audio;
  master = audio.createGain();
  master.gain.value = level();
  master.connect(audio.destination);
  sounds = fetch(`${BASE_URL}sfx-manifest.json`)
    .then((response) => response.json() as Promise<{ sounds: ManifestSound[] }>)
    .then(async (manifest) => new Map(await Promise.all(manifest.sounds.map(async (sound) => [
      sound.key,
      {
        buffers: await Promise.all(sound.files.map(async (file) =>
          audio.decodeAudioData(await (await fetch(BASE_URL + file)).arrayBuffer()))),
        random: sound.playbackRandom,
      },
    ] as const))));
  // 読み込みに失敗したら、次にサウンドを入れたときにもう一度試す。
  sounds.catch(() => { sounds = undefined; });
  return sounds;
}
