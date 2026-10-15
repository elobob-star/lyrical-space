// Cadence templates: 'u' = da (unstressed), 'S' = DUM (stressed), 'r' = rest.

export type Beat = 'u' | 'S' | 'r';

export interface TapEvent { t: number; dur: number }

export const HOLD_MS = 220;

/** Turns raw taps into a cadence: short = da, long = DUM, big gaps = rests. */
export function tapsToPattern(taps: TapEvent[]): Beat[] {
  if (!taps.length) return [];
  const gaps: number[] = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i].t - taps[i - 1].t);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const out: Beat[] = [];
  taps.forEach((tap, i) => {
    if (i > 0 && median > 0) {
      const extra = Math.round(gaps[i - 1] / median) - 1;
      // a gap well beyond the median is a rest (cap so a coffee break doesn't add 40 rests)
      if (gaps[i - 1] > median * 1.6) for (let k = 0; k < Math.min(extra, 3); k++) out.push('r');
    }
    out.push(tap.dur >= HOLD_MS ? 'S' : 'u');
  });
  return out;
}

export const patternSyllables = (p: Beat[]): number => p.filter((b) => b !== 'r').length;
export const patternToStress = (p: Beat[]): string => p.filter((b) => b !== 'r').join('');

export type Fit = 'none' | 'exact' | 'near' | 'off';

export interface FitResult {
  fit: Fit;
  delta: number;
  stressMismatch: boolean;
}

/** Compare a line (syllables + stress string) to the template. */
export function fitLine(template: Beat[] | undefined, syl: number, stress: string): FitResult {
  if (!template || !template.length || syl === 0) return { fit: 'none', delta: 0, stressMismatch: false };
  const want = patternToStress(template);
  const delta = syl - want.length;
  const d = Math.abs(delta);
  let mismatch = false;
  if (d === 0) {
    // 's' (secondary) is allowed to match either
    for (let i = 0; i < want.length; i++) {
      const a = want[i], b = stress[i];
      if (b !== 's' && a !== b) mismatch = true;
    }
  }
  return { fit: d === 0 ? 'exact' : d === 1 ? 'near' : 'off', delta, stressMismatch: mismatch };
}

/** Normalises a word-level stress string ('S','s','u') into a template. */
export function stressToPattern(stress: string): Beat[] {
  return [...stress].map((c) => (c === 'S' ? 'S' : 'u')) as Beat[];
}
