import { getRhymeIndex, cmuReady } from './cmu';
import { commonRank } from './common';
import { onsetOf, rhymeKey, slantKey } from './phones';
import { STOP, Token, tokenize, wordInfo } from './words';

export interface RhymeMark {
  start: number;
  end: number;
  group: number;
  kind: 'perfect' | 'slant';
}

interface Cand {
  line: number;
  tok: Token;
  key: string;
  vowel: string;
  isEnd: boolean;
}

/**
 * Colour-groups rhymes across the lines of one section.
 * Returns, per line, the marks to draw. Perfect rhymes need >=2 distinct words sharing a rhyme key.
 * End-of-line words that only share a vowel become slant groups.
 */
export function analyzeFlow(lines: string[]): RhymeMark[][] {
  const out: RhymeMark[][] = lines.map(() => []);
  const cands: Cand[] = [];
  lines.forEach((text, li) => {
    const toks = tokenize(text);
    toks.forEach((tok, ti) => {
      const info = wordInfo(tok.norm);
      if (!info.phones) return;
      const isEnd = ti === toks.length - 1;
      if (!isEnd && (STOP.has(tok.norm) || info.syl < 1)) return;
      const key = rhymeKey(info.phones);
      const vowel = slantKey(info.phones);
      if (!key || !vowel) return;
      cands.push({ line: li, tok, key, vowel, isEnd });
    });
  });

  const byKey = new Map<string, Cand[]>();
  for (const c of cands) {
    const a = byKey.get(c.key);
    if (a) a.push(c); else byKey.set(c.key, [c]);
  }
  let group = 0;
  const used = new Set<Cand>();
  const pos = (c: Cand) => c.line * 1000 + c.tok.start;
  const firstPos = (a: Cand[]): number => Math.min(...a.map(pos));
  const perfect = [...byKey.values()]
    .filter((a) => a.length >= 2 && new Set(a.map((c) => c.tok.norm)).size >= 2)
    .sort((a, b) => firstPos(a) - firstPos(b));
  for (const g of perfect) {
    for (const c of g) {
      out[c.line].push({ start: c.tok.start, end: c.tok.end, group, kind: 'perfect' });
      used.add(c);
    }
    group++;
  }

  const endLeft = cands.filter((c) => c.isEnd && !used.has(c));
  const byVowel = new Map<string, Cand[]>();
  for (const c of endLeft) {
    const a = byVowel.get(c.vowel);
    if (a) a.push(c); else byVowel.set(c.vowel, [c]);
  }
  const slants = [...byVowel.values()]
    .filter((a) => new Set(a.map((c) => c.line)).size >= 2 && new Set(a.map((c) => c.tok.norm)).size >= 2)
    .sort((a, b) => firstPos(a) - firstPos(b));
  for (const g of slants) {
    for (const c of g) out[c.line].push({ start: c.tok.start, end: c.tok.end, group, kind: 'slant' });
    group++;
  }
  out.forEach((a) => a.sort((x, y) => x.start - y.start));
  return out;
}

export interface Candidate {
  word: string;
  syl: number;
  stress: string;
  score?: number;
}

/** Offline rhyme / slant search over the bundled dictionary. */
export function offlineRhymes(word: string, mode: 'perfect' | 'slant', max = 80): Candidate[] {
  if (!cmuReady()) return [];
  const w = word.toLowerCase();
  const info = wordInfo(w);
  if (!info.phones) return [];
  const idx = getRhymeIndex();
  const key = mode === 'perfect' ? rhymeKey(info.phones) : slantKey(info.phones);
  if (!key) return [];
  const pool = (mode === 'perfect' ? idx.perfect : idx.slant).get(key) ?? [];
  const targetOnset = onsetOf(info.phones);
  const targetKey = rhymeKey(info.phones);
  const res: Candidate[] = [];
  for (const cand of pool) {
    if (cand === w || cand.endsWith(w) || w.endsWith(cand)) continue;
    const r = commonRank(cand);
    if (r === Infinity) continue; // keep offline results to words people actually say
    const ci = wordInfo(cand);
    if (!ci.phones) continue;
    if (mode === 'slant' && rhymeKey(ci.phones) === targetKey) continue; // those are perfect rhymes
    if (mode === 'perfect' && onsetOf(ci.phones) === targetOnset) continue; // identical rhyme
    res.push({ word: cand, syl: ci.syl, stress: ci.stress, score: -r });
  }
  res.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return res.slice(0, max);
}


/**
 * Rhyme-scheme letters (A, B, A, B…) for a section, from the end words.
 * Lines whose last word shares a perfect or slant group get the same letter; unrhymed lines get their own.
 */
export function rhymeScheme(lines: string[], marks: RhymeMark[][]): string[] {
  const letterOf = new Map<number, string>();
  let next = 0;
  const fresh = () => String.fromCharCode(65 + (next++ % 26));
  return lines.map((text, i) => {
    const toks = tokenize(text);
    const last = toks[toks.length - 1];
    if (!last) return '';
    const m = marks[i]?.find((x) => x.start === last.start);
    if (!m) return fresh();
    if (!letterOf.has(m.group)) letterOf.set(m.group, fresh());
    return letterOf.get(m.group)!;
  });
}
