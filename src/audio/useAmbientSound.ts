import { useEffect, useRef } from "react";
import waterAmbienceLoop from "../content/audio/water-ambience.json";
import waterAmbienceUrl from "../content/audio/water-ambience.m4a?url";

type AmbientAudio = { context: AudioContext; master: GainNode; suspendTimer: number };

const ambientLevel = (volume: number) => Math.max(0, Math.min(1, volume)) * 0.6;

// 生成した水音のループを流す。音量の変更では鳴らし直さず、ゲインだけを動かす。
export function useAmbientSound(active: boolean, volume: number) {
  const audioRef = useRef<AmbientAudio | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !active) return;
    audio.master.gain.setTargetAtTime(ambientLevel(volume), audio.context.currentTime, 0.08);
  }, [active, volume]);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current ?? createAmbientAudio();
    if (!audio) return;
    audioRef.current = audio;
    window.clearTimeout(audio.suspendTimer);
    // タブが裏へ回ったら止め、戻ったら続きから鳴らす。
    const sync = () => {
      if (document.hidden) void audio.context.suspend().catch(() => undefined);
      else void audio.context.resume().catch(() => undefined);
    };
    sync();
    audio.master.gain.setTargetAtTime(ambientLevel(volumeRef.current), audio.context.currentTime, 0.4);
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.12);
      audio.suspendTimer = window.setTimeout(
        () => void audio.context.suspend().catch(() => undefined),
        800,
      );
    };
  }, [active]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    window.clearTimeout(audio.suspendTimer);
    void audio.context.close();
  }, []);
}

function createAmbientAudio(): AmbientAudio | undefined {
  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return undefined;
  const context = new AudioContextConstructor();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  void fetch(waterAmbienceUrl)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      if (context.state === "closed") return;
      // 前後の余白は同じ波形の複製。デコーダーが先頭に無音を足しても継ぎ目が出ない。
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = waterAmbienceLoop.padSec;
      source.loopEnd = waterAmbienceLoop.padSec + waterAmbienceLoop.loopSec;
      source.connect(master);
      source.start(0, waterAmbienceLoop.padSec);
    })
    .catch(() => undefined);
  return { context, master, suspendTimer: 0 };
}
