// A small LIFO undo stack per song and surface (Table, Bench). The LCD offers UNDO right after an action, and the
// UNDO key / arrow on the surface itself keeps working for as long as there is something to take back.
import { signal } from '@preact/signals';
import { ID } from './models';
import { currentId } from './state';
import { say } from './ui';

export type Surface = 'table' | 'bench';
interface Entry { label: string; run: () => void }

/** bumps whenever something other than plain typing is recorded or undone — it ends a typing burst */
let ticks = 0;
export const undoTick = (): number => ticks;

const MAX = 80;
/** while an undo runs, the store functions it calls must not record themselves again */
let replaying = false;
const stacks = new Map<string, Entry[]>();
const rev = signal(0);
const key = (s: Surface, id: ID | null) => `${id ?? ''}:${s}`;

export function pushUndo(surface: Surface, label: string, run: () => void, songId: ID | null = currentId.peek()): Entry | null {
  if (replaying) return null;
  if (label !== 'TYPING') ticks++;
  const k = key(surface, songId);
  const list = stacks.get(k) ?? [];
  const entry: Entry = { label, run };
  list.push(entry);
  if (list.length > MAX) list.shift();
  stacks.set(k, list);
  rev.value++;
  return entry;
}

/** How many steps can be taken back on this surface of the current song (reactive). */
export function undoDepth(surface: Surface): number {
  void rev.value;
  return stacks.get(key(surface, currentId.value))?.length ?? 0;
}

/** Take back the most recent step on this surface. */
export function runUndo(surface: Surface): boolean {
  const list = stacks.get(key(surface, currentId.peek()));
  const e = list?.pop();
  if (!e) return false;
  return play(e);
}

function play(e: Entry): boolean {
  ticks++;
  replaying = true;
  let ok = true;
  try { e.run(); } catch (err) { ok = false; console.error('undo failed', err); } finally { replaying = false; rev.value++; }
  say(ok ? `UNDONE · ${e.label}` : `COULD NOT UNDO · ${e.label}`, undefined, 1800);
  return ok;
}

/** The LCD's UNDO belongs to one action: it only works while that action is still the latest step. */
function runIfLatest(surface: Surface, entry: Entry): void {
  const list = stacks.get(key(surface, currentId.peek()));
  if (!list || !list.includes(entry)) { say('ALREADY UNDONE'); return; }
  if (list[list.length - 1] !== entry) { say('MORE HAS HAPPENED SINCE — THE UNDO CHIP STEPS BACK ONE AT A TIME'); return; }
  list.pop();
  play(entry);
}

/** Remember how to take an action back, and offer UNDO on the LCD. */
export function undoable(surface: Surface, text: string, run: () => void, ms?: number, label = text.split(' — ')[0].slice(0, 24)): void {
  const entry = pushUndo(surface, label, run);
  say(text, entry ? { label: 'UNDO', run: () => runIfLatest(surface, entry) } : undefined, ms);
}

export function clearUndo(songId: ID): void {
  stacks.delete(key('table', songId));
  stacks.delete(key('bench', songId));
  rev.value++;
}
