// Pure paper operations for the Table: tape two strips, snip one, cut a pile into fragments.
import type { Strip } from './models';

export type TapeHow = 'stack' | 'join';

/** Tape b onto a: stacked underneath (two lines) or end-to-end (one line). Returns a's new text + joints. */
export function tape(a: Pick<Strip, 'text' | 'joints'>, b: Pick<Strip, 'text' | 'joints'>, how: TapeHow): { text: string; joints: number[] } {
  const at = a.text.length;
  const text = a.text + (how === 'stack' ? '\n' : ' ') + b.text;
  const joints = [...(a.joints ?? []), at, ...(b.joints ?? []).map((j) => j + at + 1)];
  return { text, joints };
}

/** Snip at a whitespace offset. Leading/trailing blanks are trimmed; joints follow their side. */
export function snip(s: Pick<Strip, 'text' | 'joints'>, at: number): [{ text: string; joints: number[] }, { text: string; joints: number[] }] | null {
  const leftRaw = s.text.slice(0, at), rightRaw = s.text.slice(at);
  const left = leftRaw.replace(/\s+$/, '');
  const lead = rightRaw.length - rightRaw.replace(/^\s+/, '').length;
  const right = rightRaw.slice(lead);
  if (!left.trim() || !right.trim()) return null;
  const j = s.joints ?? [];
  return [
    { text: left, joints: j.filter((x) => x < left.length) },
    { text: right, joints: j.filter((x) => x >= at + lead).map((x) => x - at - lead) },
  ];
}

/** Burroughs/Bowie cut-up: slice a text into fragments of 2–4 words at random. */
export function cutUp(text: string, rnd = Math.random): string[] {
  const words = text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 4) return [words.join(' ')].filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let n = 2 + Math.floor(rnd() * 3);
    if (words.length - (i + n) === 1) n++; // never leave a lonely word at the end
    out.push(words.slice(i, i + n).join(' '));
    i += n;
  }
  return out;
}

/** Words + gaps, each gap carrying its character offset (where a snip would land). */
export interface Piece { t: string; gap?: number; joint?: boolean }
export function piecesOf(line: string, base: number, joints: number[]): Piece[] {
  const out: Piece[] = [];
  for (const m of line.matchAll(/(\s+)|(\S+)/g)) {
    const at = base + (m.index ?? 0);
    if (m[1]) out.push({ t: m[1], gap: at, joint: joints.includes(at) });
    else out.push({ t: m[2] });
  }
  return out;
}
