// The notebook's ink rules, as pure functions so they can be tested to death.
//
//  · A word is WET while you are still typing it: backspace really erases it (typos are free).
//  · A space / punctuation / Enter completes the word. From then on the word is DRY: backspace strikes it through
//    (ghost ink) instead of erasing it.
//  · The space or punctuation you just typed is itself erasable — until a full word has been written after it.
//  · Whatever you type is always clean ink, wherever the caret is, even in the middle of struck-out text.
import type { Mark } from '../store/models';
import { uid } from '../store/models';
import { Edit, rebaseMarks } from './textdiff';

export const isWordCh = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}'’]/u.test(c);
const isSpace = (c: string | undefined): boolean => !!c && /\s/.test(c);

/** The ink that is still wet: [s,e). It always ends where you are writing. */
export interface Wet { s: number; e: number }

export const isGhostAt = (marks: Mark[], i: number): boolean => marks.some((m) => m.kind === 'ghost' && i >= m.s && i < m.e);

/** Merge ranges into the ghost marks (touching / overlapping ghosts fuse). */
export function addGhosts(marks: Mark[], ranges: Array<[number, number]>): Mark[] {
  let ghosts = marks.filter((m) => m.kind === 'ghost').map((m) => ({ ...m }));
  const rest = marks.filter((m) => m.kind !== 'ghost');
  for (const [s, e] of ranges) {
    if (e <= s) continue;
    const hits = ghosts.filter((g) => g.s <= e && g.e >= s);
    const ns = Math.min(s, ...hits.map((g) => g.s));
    const ne = Math.max(e, ...hits.map((g) => g.e));
    ghosts = ghosts.filter((g) => !hits.includes(g));
    ghosts.push({ id: hits[0]?.id ?? uid(), s: ns, e: ne, kind: 'ghost' });
  }
  return [...rest, ...ghosts];
}

/** May a deletion of [a,b) be a real erase? Only fresh, still-wet ink. */
export const mayErase = (wet: Wet | null, a: number, b: number): boolean => !!wet && b > a && a >= wet.s && b <= wet.e;

export function afterErase(wet: Wet | null, a: number, b: number): Wet | null {
  if (!wet) return null;
  const e = wet.e - (b - a);
  return e > wet.s ? { s: wet.s, e } : null;
}

/**
 * What is wet after `ins` characters replaced `del` characters at `start` (text is the NEW text).
 * Typing outside the wet ink dries it. A space/punctuation after a word completes that word and dries everything before it.
 */
export function afterType(text: string, wet: Wet | null, start: number, del: number, ins: number): Wet | null {
  let w: Wet | null = wet && start >= wet.s && start + del <= wet.e ? { ...wet } : null;
  const tail = w ? w.e - del + ins : start + ins;
  for (let p = start; p < start + ins; p++) {
    if (!w) w = { s: p, e: p };
    const c = text[p];
    if (!isWordCh(c) && p - 1 >= w.s && isWordCh(text[p - 1])) w.s = p; // the word before is complete → dry
    w.e = p + 1;
  }
  if (w) w.e = Math.max(w.e, tail);
  return w && w.e > w.s ? w : null;
}

// ---------------------------------------------------------------------------------------------------------------

export interface InkState { text: string; marks: Mark[]; wet: Wet | null }
export interface InkOpts { ghost: boolean; latch: boolean }

export type InkOp =
  | { t: 'ins'; from: number; to: number; text: string }
  | { t: 'back'; from: number; to: number }
  | { t: 'fwd'; from: number; to: number }
  | { t: 'wordBack'; from: number; to: number }
  | { t: 'wordFwd'; from: number; to: number }
  | { t: 'lineBack'; from: number; to: number }
  /** chars [from,to) are already gone from the DOM (an IME did it) — decide after the fact */
  | { t: 'gone'; from: number; to: number };

export type InkKind = 'type' | 'strike' | 'erase' | 'noop' | 'refuse';
export interface InkResult extends InkState { caret: number; kind: InkKind }

const same = (s: InkState, caret: number, kind: InkKind): InkResult => ({ ...s, caret, kind });

function splice(s: InkState, a: number, b: number, ins: string, wet: Wet | null, kind: InkKind): InkResult {
  const text = s.text.slice(0, a) + ins + s.text.slice(b);
  const marks = rebaseMarks(s.marks, { start: a, del: b - a, ins: ins.length });
  return { text, marks, wet, caret: a + ins.length, kind };
}

/** Where a one-character backward/forward delete lands, hopping over ink that is already struck. */
function leftTarget(marks: Mark[], from: number): number {
  let i = from - 1;
  while (i >= 0 && isGhostAt(marks, i)) i--;
  return i;
}
function rightTarget(text: string, marks: Mark[], from: number): number {
  let i = from;
  while (i < text.length && isGhostAt(marks, i)) i++;
  return i < text.length ? i : -1;
}

export function reduce(s: InkState, op: InkOp, o: InkOpts): InkResult {
  const { text, marks, wet } = s;
  const n = text.length;

  if (op.t === 'ins') {
    const { from, to } = op;
    const len = op.text.length;
    if (!len) return same(s, from, 'noop');
    // typing over a selection: the old words are struck, the new ones go in after them
    if (to > from && (o.latch || o.ghost) && !mayErase(wet, from, to)) {
      const ghosted = addGhosts(marks, [[from, to]]);
      const nt = text.slice(0, to) + op.text + text.slice(to);
      return { text: nt, marks: rebaseMarks(ghosted, { start: to, del: 0, ins: len }), wet: afterType(nt, null, to, 0, len), caret: to + len, kind: 'type' };
    }
    const nt = text.slice(0, from) + op.text + text.slice(to);
    return splice(s, from, to, op.text, afterType(nt, wet, from, to - from, len), 'type');
  }

  // ---- deletions ----
  if (o.latch) return same(s, Math.max(0, op.to), 'refuse');
  let a = op.from, b = op.to;
  let caretAfter = b;
  let target: [number, number] | null = [a, b]; // what gets erased/struck

  if (a === b) {
    const c = a;
    switch (op.t) {
      case 'back': {
        // the char just left of the caret: a real erase if it is wet, otherwise the nearest unstruck one to its left
        if (c <= 0) return same(s, c, 'noop');
        if (!o.ghost || mayErase(wet, c - 1, c)) target = [c - 1, c];
        else { const i = leftTarget(marks, c); target = i < 0 ? null : [i, i + 1]; }
        caretAfter = c;
        break;
      }
      case 'fwd': {
        if (c >= n) return same(s, c, 'noop');
        if (!o.ghost || mayErase(wet, c, c + 1)) { target = [c, c + 1]; caretAfter = c; }
        else { const i = rightTarget(text, marks, c); target = i < 0 ? null : [i, i + 1]; caretAfter = i < 0 ? n : i + 1; }
        break;
      }
      case 'wordBack': {
        let i = c;
        while (i > 0 && (isSpace(text[i - 1]) || (o.ghost && isGhostAt(marks, i - 1)))) i--;
        while (i > 0 && !isSpace(text[i - 1]) && !(o.ghost && isGhostAt(marks, i - 1))) i--;
        target = i < c ? [i, c] : null;
        caretAfter = c;
        break;
      }
      case 'wordFwd': {
        let i = c;
        while (i < n && (isSpace(text[i]) || (o.ghost && isGhostAt(marks, i)))) i++;
        while (i < n && !isSpace(text[i]) && !(o.ghost && isGhostAt(marks, i))) i++;
        target = i > c ? [c, i] : null;
        caretAfter = o.ghost ? i : c;
        break;
      }
      case 'lineBack': {
        let i = c;
        while (i > 0 && text[i - 1] !== '\n') i--;
        target = i < c ? [i, c] : null;
        caretAfter = c;
        break;
      }
      default: return same(s, c, 'noop');
    }
    if (!target) return same(s, caretAfter, 'noop');
    [a, b] = target;
  } else if (op.t === 'gone') {
    // an IME already removed [a,b). If that was struck ink there is nothing left to strike here: hop to the nearest live char on the left
    if (o.ghost && !mayErase(wet, a, b) && Array.from({ length: b - a }, (_, k) => a + k).every((i) => isGhostAt(marks, i))) {
      const i = leftTarget(marks, b);
      if (i < 0) return same(s, b, 'noop');
      return { text, marks: addGhosts(marks, [[i, i + 1]]), wet: null, caret: b, kind: 'strike' };
    }
  }

  if (!o.ghost) return splice(s, a, b, '', null, 'erase');
  if (mayErase(wet, a, b)) return splice(s, a, b, '', afterErase(wet, a, b), 'erase');
  // dry ink: strike it through, never remove it
  const ghosted = addGhosts(marks, [[a, b]]);
  const changed = ghosted.length !== marks.length || ghosted.some((m, k) => m.s !== marks[k]?.s || m.e !== marks[k]?.e);
  return { text, marks: ghosted, wet: null, caret: caretAfter, kind: changed ? 'strike' : 'noop' };
}

/** Process an edit that has already happened in the DOM (IME fallback): returns the decision and whether the DOM must be put back. */
export function reduceDiff(old: InkState, ed: Edit, nv: string, o: InkOpts): { res: InkResult; revert: boolean } {
  if (ed.ins === 0 && ed.del > 0) {
    const res = reduce(old, { t: 'gone', from: ed.start, to: ed.start + ed.del }, o);
    return { res, revert: res.kind === 'strike' || res.kind === 'refuse' || res.kind === 'noop' };
  }
  const added = nv.slice(ed.start, ed.start + ed.ins);
  const res = splice(old, ed.start, ed.start + ed.del, added, afterType(nv, old.wet, ed.start, ed.del, ed.ins), 'type');
  return { res, revert: false };
}

/** The text with struck-out characters left out. */
export function cleanText(text: string, marks: Mark[]): string {
  let out = '';
  for (let i = 0; i < text.length; i++) if (!isGhostAt(marks, i)) out += text[i];
  return out;
}

/** Burn the struck-out words for good. Pencil marks are carried over to the shortened text. */
export function stripGhosts(text: string, marks: Mark[]): { text: string; marks: Mark[] } {
  if (!marks.some((m) => m.kind === 'ghost')) return { text, marks };
  const before: number[] = new Array(text.length + 1); // kept chars before index i
  let out = '', kept = 0;
  for (let i = 0; i < text.length; i++) {
    before[i] = kept;
    if (!isGhostAt(marks, i)) { out += text[i]; kept++; }
  }
  before[text.length] = kept;
  const rest: Mark[] = [];
  for (const m of marks) {
    if (m.kind === 'ghost') continue;
    const s = before[Math.min(m.s, text.length)], e = before[Math.min(m.e, text.length)];
    if (e > s) rest.push({ ...m, s, e });
  }
  return { text: out, marks: rest };
}
