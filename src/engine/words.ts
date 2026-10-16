import { lookup } from './cmu';
import type { MeterMark } from '../store/models';
import { countVowels, stresses } from './phones';

export interface Token {
  text: string;
  start: number;
  end: number;
  norm: string;
}

const WORD = /[\p{L}][\p{L}'’]*/gu;

export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  for (const m of line.matchAll(WORD)) {
    let text = m[0];
    let start = m.index ?? 0;
    // trim stray leading/trailing apostrophes but keep things like "singin'" intact for lookup
    while (text.startsWith("'") || text.startsWith('’')) { text = text.slice(1); start++; }
    if (!text) continue;
    out.push({ text, start, end: start + text.length, norm: text.toLowerCase().replace(/’/g, "'") });
  }
  return out;
}

export const STOP = new Set(
  ('the a an and or but nor so yet of to in on at by for with from as is are was were be been am it its it\'s i i\'m i\'ll i\'ve i\'d ' +
    'my mine me you your you\'re we our us he him his she her they them their this that these those there here do does did ' +
    'have has had will would can could shall should may might must not no if then than too very just up out off over into onto ' +
    'upon about all any some oh uh um ah ooh yeah hey la na').split(' '),
);

/** Vowel-group syllable guess for words missing from the dictionary. */
export function guessSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export interface WordInfo {
  norm: string;
  phones: string | null;
  syl: number;
  /** one char per syllable: S primary, s secondary, u unstressed */
  stress: string;
}

const infoCache = new Map<string, WordInfo>();

function phonesFor(norm: string): string | null {
  let p = lookup(norm);
  if (p) return p;
  // dropped g: singin' -> singing
  if (/in['’]$/.test(norm)) { p = lookup(norm.replace(/['’]$/, 'g')); if (p) return p; }
  if (norm.endsWith("'s")) { p = lookup(norm.slice(0, -2)); if (p) return p; }
  if (norm.includes("'")) { p = lookup(norm.replace(/'/g, '')); if (p) return p; }
  return null;
}

export function wordInfo(norm: string): WordInfo {
  const hit = infoCache.get(norm);
  if (hit) return hit;
  const phones = phonesFor(norm);
  let info: WordInfo;
  if (phones) {
    const st = stresses(phones);
    let s = st.map((x) => (x === 1 ? 'S' : x === 2 ? 's' : 'u')).join('');
    if (st.length === 1) s = STOP.has(norm) ? 'u' : 'S';
    info = { norm, phones, syl: countVowels(phones), stress: s };
  } else {
    const n = guessSyllables(norm);
    // unknown: stress the first syllable of polysyllables, content monosyllables stressed
    const s = n <= 1 ? (STOP.has(norm) ? 'u' : 'S') : 'S' + 'u'.repeat(n - 1);
    info = { norm, phones: null, syl: n, stress: s };
  }
  if (infoCache.size > 20000) infoCache.clear();
  infoCache.set(norm, info);
  return info;
}

/** Drop caches (call after the dictionary finishes loading so guesses get replaced). */
export function resetWordCache(): void { infoCache.clear(); }

export interface WordMeter {
  tok: Token;
  key: string;
  /** stress actually used (override or dictionary) */
  stress: string;
  auto: string;
  overridden: boolean;
  down: boolean;
}

export interface LineInfo {
  syl: number;
  stress: string;
  tokens: Token[];
  words: WordMeter[];
}

export const meterKey = (i: number, t: Token) => `${i}:${t.norm}`;

export function lineInfo(text: string, meter?: Record<string, MeterMark>): LineInfo {
  const tokens = tokenize(text);
  let syl = 0;
  let stress = '';
  const words: WordMeter[] = [];
  tokens.forEach((t, i) => {
    const w = wordInfo(t.norm);
    const key = meterKey(i, t);
    const o = meter?.[key];
    const st = o?.s && o.s.length === w.stress.length ? o.s : w.stress;
    syl += w.syl;
    stress += st;
    words.push({ tok: t, key, stress: st, auto: w.stress, overridden: st !== w.stress, down: !!o?.d });
  });
  return { syl, stress, tokens, words };
}

/**
 * One tap on a word in the METER lens: dictionary stress → flipped (one-syllable words only,
 * where context decides) → downbeat bar before the word → back to the dictionary.
 */
export function nextMeter(w: WordMeter): MeterMark | undefined {
  const flip = w.auto.length === 1 ? (w.auto === 'S' ? 'u' : 'S') : null;
  if (!w.overridden && !w.down) return flip ? { s: flip } : { d: 1 };
  if (w.overridden && !w.down) return { d: 1 };
  return undefined;
}

/** "da-DUM-da-da-DUM" rendering of a stress string. */
export function stressWords(stress: string): string {
  return [...stress].map((c) => (c === 'S' ? 'DUM' : c === 's' ? 'dUm' : 'da')).join('-');
}
