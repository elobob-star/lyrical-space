import { signal } from '@preact/signals';
import { ID } from '../../store/models';
import { currentSong } from '../../store/state';
import { placeChord, recordTake, removeChord, snapToWord } from '../../store/lines';
import { runUndo } from '../../store/undo';
import { indexAtPoint } from '../../engine/hit';
import { feel, haptic } from '../../engine/feel';
import { say } from '../../store/ui';

export const chordGhost = signal<{ name: string; x: number; y: number } | null>(null);
export const armedChord = signal<string | null>(null);

/** Character index under a screen point inside a `.line` element (snapped to a word start when close). */
export function charAt(lineEl: HTMLElement, x: number, y: number, text: string): number {
  const mir = lineEl.querySelector('.mir') as HTMLElement | null;
  if (!mir) return 0;
  return snapToWord(text, indexAtPoint(mir, x, y, text.length));
}

export interface Origin { songId: ID; sid: ID; lid: ID; at: number; name: string }

/** Drag a chord stamp (from the tray or from a line). A tap without movement calls onTap. */
export function startChordDrag(e: PointerEvent, name: string, origin: Origin | null, onTap?: () => void): void {
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  const mv = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { moved = true; haptic('light'); }
    if (moved) chordGhost.value = { name, x: ev.clientX, y: ev.clientY };
  };
  const done = (ev: PointerEvent, cancel: boolean) => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelUp);
    chordGhost.value = null;
    if (cancel) return;
    if (!moved) { onTap?.(); return; }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const lineEl = el?.closest('.line') as HTMLElement | null;
    const song = currentSong.value;
    if (lineEl && song) {
      const sid = lineEl.dataset.sid!, lid = lineEl.dataset.lid!;
      const sec = song.sections.find((s) => s.id === sid);
      const line = sec && sec.takes[Math.min(sec.take, sec.takes.length - 1)].lines.find((l) => l.id === lid);
      if (line) {
        const at = charAt(lineEl, ev.clientX, ev.clientY, line.text);
        if (origin) {
          // moving a stamp is one undo step: snapshot both ends first
          recordTake(origin.songId, origin.sid, 'MOVED CHORD');
          if (origin.sid !== sid) recordTake(song.id, sid, 'MOVED CHORD');
          removeChord(origin.songId, origin.sid, origin.lid, origin.at, false);
          placeChord(song.id, sid, lid, at, name, false);
        } else placeChord(song.id, sid, lid, at, name);
        feel('chk', 'medium');
        return;
      }
    }
    if (origin) {
      removeChord(origin.songId, origin.sid, origin.lid, origin.at);
      feel('thock', 'light');
      say(`PEELED OFF ${name}`, { label: 'UNDO', run: () => { runUndo('bench'); } });
    }
  };
  const up = (ev: PointerEvent) => done(ev, false);
  const cancelUp = (ev: PointerEvent) => done(ev, true);
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelUp);
}
