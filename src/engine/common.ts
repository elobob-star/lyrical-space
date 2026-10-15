// Rank of words by spoken-English frequency (0 = most common). Loaded lazily with the dictionary.
let rank: Map<string, number> | null = null;

export function setCommonText(t: string): void {
  rank = new Map();
  let i = 0;
  for (const w of t.split('\n')) rank.set(w, i++);
}
export const commonRank = (w: string): number => rank?.get(w) ?? Infinity;
