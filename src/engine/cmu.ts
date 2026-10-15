// Binary-searched view over the compact CMU text (src/data/cmu.txt).
// Lines look like  word|PHONES  and are sorted by word (default JS string order).

let text = '';
let starts: Int32Array | null = null;
let listeners: Array<() => void> = [];

export function setCmuText(t: string): void {
  text = t;
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
  const s = new Int32Array(n);
  s[0] = 0;
  let k = 1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) s[k++] = i + 1;
  starts = s;
  rhymeIndex = null;
  listeners.forEach((f) => f());
}

export const cmuReady = (): boolean => starts !== null;
export function onCmuReady(fn: () => void): void { listeners.push(fn); }

const lineEnd = (i: number): number => (starts && i + 1 < starts.length ? starts[i + 1] - 1 : text.length);
const wordAt = (i: number): string => text.slice(starts![i], text.indexOf('|', starts![i]));
const phonesAt = (i: number): string => text.slice(text.indexOf('|', starts![i]) + 1, lineEnd(i));

export function lookup(word: string): string | null {
  if (!starts) return null;
  let lo = 0, hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = wordAt(mid);
    if (w === word) return phonesAt(mid);
    if (w < word) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

export function size(): number { return starts ? starts.length : 0; }

/** Iterate every entry (used for offline rhyme search). */
export function forEachEntry(fn: (word: string, phones: string) => void): void {
  if (!starts) return;
  for (let i = 0; i < starts.length; i++) fn(wordAt(i), phonesAt(i));
}

import { rhymeKey, slantKey } from './phones';
let rhymeIndex: { perfect: Map<string, string[]>; slant: Map<string, string[]> } | null = null;

export function getRhymeIndex() {
  if (rhymeIndex) return rhymeIndex;
  const perfect = new Map<string, string[]>();
  const slant = new Map<string, string[]>();
  forEachEntry((w, p) => {
    if (w.includes("'")) return;
    const k = rhymeKey(p), s = slantKey(p);
    if (k) { const a = perfect.get(k); if (a) a.push(w); else perfect.set(k, [w]); }
    if (s) { const a = slantIdx(slant, s); a.push(w); }
  });
  rhymeIndex = { perfect, slant };
  return rhymeIndex;
}
function slantIdx(m: Map<string, string[]>, k: string): string[] {
  let a = m.get(k);
  if (!a) { a = []; m.set(k, a); }
  return a;
}
