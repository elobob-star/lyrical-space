// Phone strings: one char per phone. Vowels are U+0100 + vowelIndex*3 + stress (0,1,2);
// consonants are plain ASCII letters. Produced by scripts/build-cmu.mjs.

const BASE = 0x100;

export const isVowel = (c: string): boolean => c.charCodeAt(0) >= BASE;
export const stressOf = (c: string): number => (c.charCodeAt(0) - BASE) % 3;
export const vowelIndex = (c: string): number => Math.floor((c.charCodeAt(0) - BASE) / 3);
const noStress = (c: string): string => {
  const code = c.charCodeAt(0);
  return code >= BASE ? String.fromCharCode(BASE + Math.floor((code - BASE) / 3) * 3) : c;
};

export function stripStress(ps: string): string {
  let out = '';
  for (const c of ps) out += noStress(c);
  return out;
}

export function countVowels(ps: string): number {
  let n = 0;
  for (const c of ps) if (isVowel(c)) n++;
  return n;
}

/** Per-syllable stress levels (0,1,2) in order. */
export function stresses(ps: string): number[] {
  const out: number[] = [];
  for (const c of ps) if (isVowel(c)) out.push(stressOf(c));
  return out;
}

/** Index of the vowel that anchors the rhyme (last primary, else last secondary, else last vowel). */
function anchorIndex(ps: string): number {
  let primary = -1, secondary = -1, last = -1;
  for (let i = 0; i < ps.length; i++) {
    const c = ps[i];
    if (!isVowel(c)) continue;
    last = i;
    const s = stressOf(c);
    if (s === 1) primary = i;
    else if (s === 2) secondary = i;
  }
  return primary >= 0 ? primary : secondary >= 0 ? secondary : last;
}

/** Perfect-rhyme key: phones from the anchoring vowel to the end, stress stripped. */
export function rhymeKey(ps: string): string | null {
  const i = anchorIndex(ps);
  return i < 0 ? null : stripStress(ps.slice(i));
}

/** Assonance key: just the anchoring vowel. */
export function slantKey(ps: string): string | null {
  const i = anchorIndex(ps);
  return i < 0 ? null : noStress(ps[i]);
}

/** Onset consonants before the anchoring vowel (used to rule out identical rhymes). */
export function onsetOf(ps: string): string {
  const i = anchorIndex(ps);
  return i < 0 ? ps : ps.slice(0, i);
}

// Human-readable ARPABET-ish rendering, handy for debugging and tests.
const VOWELS = ['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'];
const CONS: Record<string, string> = { b:'B',c:'CH',d:'D',D:'DH',f:'F',g:'G',h:'HH',j:'JH',k:'K',l:'L',m:'M',n:'N',N:'NG',p:'P',r:'R',s:'S',S:'SH',t:'T',T:'TH',v:'V',w:'W',y:'Y',z:'Z',Z:'ZH' };
export function toArpabet(ps: string): string {
  return [...ps].map((c) => (isVowel(c) ? VOWELS[vowelIndex(c)] + stressOf(c) : CONS[c] ?? c)).join(' ');
}
