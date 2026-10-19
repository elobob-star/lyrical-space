// Undo / redo for the notebook page you are writing on. Typing in one breath is one step; a strike, a paste, a new
// line of thought is another. Snapshots keep the text and the struck-out ink (pencil marks are rebased on restore).
import { signal } from '@preact/signals';
import type { Mark } from './models';

export interface Snap { text: string; ghosts: Mark[]; caret: number }
export type InkStep = 'type' | 'strike' | 'erase' | 'other';

const MAX = 150;
const BURST_MS = 900;
let past: Snap[] = [];
let future: Snap[] = [];
let page = '';
let lastAt = 0;
let lastKind: InkStep | '' = '';

export const canUndo = signal(false);
export const canRedo = signal(false);
const sync = () => { canUndo.value = past.length > 0; canRedo.value = future.length > 0; };

export function resetHistory(pageId = ''): void {
  past = []; future = []; page = pageId; lastAt = 0; lastKind = '';
  sync();
}

/** Opening a page: keep its history if it is the one we already have (the notebook view remounts when you switch surfaces). */
export function openPage(pageId: string): void {
  if (pageId !== page) resetHistory(pageId);
}

/** Call with the state BEFORE an edit. Edits of the same kind in quick succession share one undo step. */
export function record(pageId: string, before: Snap, kind: InkStep, now = Date.now(), breakBurst = false): void {
  const fresh = pageId !== page || kind !== lastKind || kind === 'other' || breakBurst || now - lastAt > BURST_MS;
  if (pageId !== page) { past = []; future = []; page = pageId; }
  if (fresh) {
    past.push(before);
    if (past.length > MAX) past.shift();
  }
  future = [];
  lastAt = now; lastKind = kind;
  sync();
}

export function undo(current: Snap): Snap | null {
  const s = past.pop();
  if (!s) return null;
  future.push(current);
  lastKind = '';
  sync();
  return s;
}

export function redo(current: Snap): Snap | null {
  const s = future.pop();
  if (!s) return null;
  past.push(current);
  lastKind = '';
  sync();
  return s;
}
