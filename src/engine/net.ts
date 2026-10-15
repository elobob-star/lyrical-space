// Free, keyless lookups: Datamuse + dictionaryapi.dev. Results are cached in IndexedDB (see store/db).
import { kvGet, kvSet } from '../store/db';

const DAY = 86_400_000;

async function cachedFetch<T>(url: string, ttl: number, parse: (j: any) => T): Promise<T> {
  const key = 'net:' + url;
  const hit = await kvGet<{ t: number; v: T }>(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    const v = parse(await r.json());
    void kvSet(key, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (hit) return hit.v; // stale beats nothing
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface DmWord {
  word: string;
  score: number;
  syl: number;
  freq: number;
}

function parseDm(j: any[]): DmWord[] {
  return (j as any[])
    .filter((x) => x && typeof x.word === 'string' && !x.word.includes(' '))
    .map((x) => {
      const f = (x.tags as string[] | undefined)?.find((t) => t.startsWith('f:'));
      return { word: x.word as string, score: x.score ?? 0, syl: x.numSyllables ?? 0, freq: f ? parseFloat(f.slice(2)) : 0 };
    });
}

export type DmRel = 'rhy' | 'nry' | 'jjb' | 'trg' | 'syn' | 'ant' | 'ml' | 'hom';

export function datamuse(rel: DmRel, word: string, max = 60): Promise<DmWord[]> {
  const q = rel === 'ml' ? `ml=${encodeURIComponent(word)}` : `rel_${rel}=${encodeURIComponent(word)}`;
  return cachedFetch(`https://api.datamuse.com/words?${q}&md=sf&max=${max}`, 30 * DAY, parseDm);
}

export interface Definition {
  word: string;
  phonetic?: string;
  meanings: Array<{ pos: string; defs: Array<{ def: string; example?: string }>; synonyms: string[] }>;
}

export function define(word: string): Promise<Definition> {
  return cachedFetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
    60 * DAY,
    (j: any[]) => {
      const e = j[0];
      return {
        word: e.word,
        phonetic: e.phonetic ?? e.phonetics?.find((p: any) => p.text)?.text,
        meanings: (e.meanings ?? []).map((m: any) => ({
          pos: m.partOfSpeech,
          defs: (m.definitions ?? []).slice(0, 3).map((d: any) => ({ def: d.definition, example: d.example })),
          synonyms: (m.synonyms ?? []).slice(0, 8),
        })),
      } as Definition;
    },
  );
}
