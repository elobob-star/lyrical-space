import type { Chord, Mark } from '../store/models';
import { uid } from '../store/models';

export interface Edit { start: number; del: number; ins: number }

/** Smallest single edit that turns `a` into `b` (common prefix/suffix). `caret` biases ambiguous diffs. */
export function diffEdit(a: string, b: string, caret?: number): Edit {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB--; }
  const del = endA - start, ins = endB - start;
  // For repeated chars ("aa"->"aaa") put a pure insertion at the caret so it lands where the user typed.
  if (caret !== undefined && del === 0 && ins > 0) {
    const c = caret - ins;
    if (c >= 0 && c <= a.length && a.slice(0, c) + b.slice(c, caret) + a.slice(c) === b) start = c;
  }
  // A deletion beside an equal character is ambiguous ("bcc" → "bc"): the caret says which one went.
  if (caret !== undefined && ins === 0 && del > 0 && caret >= 0 && caret + del <= a.length && a.slice(0, caret) + a.slice(caret + del) === b) start = caret;
  return { start, del, ins };
}

/** Keep marks glued to their text across an edit. */
export function rebaseMarks(marks: Mark[], ed: Edit): Mark[] {
  const delEnd = ed.start + ed.del;
  const shift = ed.ins - ed.del;
  const out: Mark[] = [];
  for (const m of marks) {
    let s = m.s, e = m.e;
    if (e <= ed.start) { /* before the edit */ }
    else if (s >= delEnd) { s += shift; e += shift; }
    else if (m.kind === 'ghost') {
      // struck-out text never swallows what is typed into it: keep the struck halves, leave the new text clean
      if (s < ed.start) out.push({ ...m, s, e: ed.start });
      if (e > delEnd) out.push({ ...m, id: s < ed.start ? uid() : m.id, s: ed.start + ed.ins, e: e + shift });
      continue;
    } else {
      // overlap: drop the removed part; an insertion strictly inside the mark stretches it
      const ne = e > delEnd ? e + shift : ed.start;
      s = Math.min(s, ed.start);
      e = Math.max(ne, s);
    }
    if (e > s) out.push({ ...m, s, e });
  }
  return out;
}

export function rebaseChords(chords: Chord[], ed: Edit): Chord[] {
  const delEnd = ed.start + ed.del;
  const shift = ed.ins - ed.del;
  const seen = new Set<number>();
  const out: Chord[] = [];
  for (const c of chords) {
    let at = c.at;
    if (at <= ed.start) { /* stays */ }
    else if (at >= delEnd) at += shift;
    else at = ed.start;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({ ...c, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
