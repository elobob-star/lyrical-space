// A small LIFO undo stack per song and surface (Table, Bench). The LCD offers UNDO right after an action, and the
// UNDO chip on the surface itself keeps working for as long as there is something to take back.
import { signal } from '@preact/signals';
import { ID } from './models';
import { currentId } from './state';
import { say } from './ui';

export type Surface = 'table' | 'bench';
interface Entry { label: string; run: () => void }

const MAX = 80;
/** while an undo runs, the store functions it calls must not record themselves again */
let replaying = false;
const stacks = new Map<string, Entry[]>();
const rev = signal(0);
const key = (s: Surface, id: ID | null) => `${id ?? ''}:${s}`;

export function pushUndo(surface: Surface, label: string, run: () => void, songId: ID | null = currentId.peek()): void {
  if (replaying) return;
  const k = key(surface, songId);
  const list = stacks.get(k) ?? [];
  list.push({ label, run });
  if (list.length > MAX) list.shift();
  stacks.set(k, list);
  rev.value++;
}

/** How many steps can be taken back on this surface of the current song (reactive). */
export function undoDepth(surface: Surface): number {
  void rev.value;
  return stacks.get(key(surface, currentId.value))?.length ?? 0;
}

export function runUndo(surface: Surface): boolean {
  const e = stacks.get(key(surface, currentId.peek()))?.pop();
  if (!e) return false;
  replaying = true;
  try { e.run(); } finally { replaying = false; }
  rev.value++;
  say(`UNDONE · ${e.label}`, undefined, 1800);
  return true;
}

/** Remember how to take an action back, and offer UNDO on the LCD. */
export function undoable(surface: Surface, text: string, run: () => void, ms?: number, label = text.split(' — ')[0].slice(0, 24)): void {
  pushUndo(surface, label, run);
  say(text, { label: 'UNDO', run: () => runUndo(surface) }, ms);
}

export function clearUndo(songId: ID): void {
  stacks.delete(key('table', songId));
  stacks.delete(key('bench', songId));
  rev.value++;
}
