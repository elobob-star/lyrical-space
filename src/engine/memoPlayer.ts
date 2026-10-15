import { signal } from '@preact/signals';
import { ID, Memo } from '../store/models';
import { loadBlob } from '../store/state';
import { say } from '../store/ui';

export const playingId = signal<ID | null>(null);
export const playProgress = signal(0);
export const loopIds = signal<ID[]>([]);

let audio: HTMLAudioElement | null = null;
let url: string | null = null;

export function stopMemo(): void {
  if (audio) { audio.pause(); audio.src = ''; }
  if (url) URL.revokeObjectURL(url);
  audio = null; url = null;
  playingId.value = null;
  playProgress.value = 0;
}

export async function togglePlay(m: Memo): Promise<void> {
  if (playingId.value === m.id) { stopMemo(); return; }
  stopMemo();
  const blob = await loadBlob(m.id);
  if (!blob) { say('AUDIO FILE MISSING'); return; }
  url = URL.createObjectURL(blob);
  audio = new Audio(url);
  audio.loop = loopIds.value.includes(m.id);
  audio.ontimeupdate = () => {
    const dur = Number.isFinite(audio!.duration) && audio!.duration > 0 ? audio!.duration : m.durMs / 1000;
    playProgress.value = Math.min(1, audio!.currentTime / dur);
  };
  audio.onended = () => stopMemo();
  try {
    await audio.play();
    playingId.value = m.id;
  } catch {
    say('COULD NOT PLAY THAT TAPE');
    stopMemo();
  }
}

export function toggleLoop(id: ID): void {
  const on = loopIds.value.includes(id);
  loopIds.value = on ? loopIds.value.filter((x) => x !== id) : [...loopIds.value, id];
  if (audio && playingId.value === id) audio.loop = !on;
}
