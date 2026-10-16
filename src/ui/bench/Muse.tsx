import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ID } from '../../store/models';
import { currentSong, settings } from '../../store/state';
import { focusLine, focused, setLineText } from '../../store/lines';
import { tray, say } from '../../store/ui';
import { Candidate, offlineRhymes } from '../../engine/rhyme';
import { commonRank } from '../../engine/common';
import { Definition, DmRel, DmWord, datamuse, define } from '../../engine/net';
import { tokenize, wordInfo } from '../../engine/words';
import { feel } from '../../engine/feel';
import { Icon } from '../icons';
import { cmuTick } from '../../store/ui';

export type MuseKind = 'rhyme' | 'slant' | 'sense' | 'like' | 'oppose' | 'define';
const TABS: Array<{ kind: MuseKind; label: string }> = [
  { kind: 'rhyme', label: 'RHYME' }, { kind: 'slant', label: 'SLANT' }, { kind: 'sense', label: 'SENSE' },
  { kind: 'like', label: 'LIKE' }, { kind: 'oppose', label: 'OPPOSE' }, { kind: 'define', label: 'DEFINE' },
];
let lastKind: MuseKind = 'rhyme';

/** The WORDS key: look up the word under the caret (or open the card blank to type one in). */
export function openWords(): void {
  const t = getTarget();
  tray.value = 'words';
  if (t) void runMuse(lastKind, t);
  else results.value = { kind: lastKind, target: null, groups: [], loading: false };
}

export interface Target { sid: ID; lid: ID; start: number; end: number; word: string }

export function getTarget(): Target | null {
  const f = focused.value;
  if (!f) return null;
  const el = document.querySelector(`.line[data-lid="${f.lid}"] .lin`) as HTMLInputElement | null;
  if (!el) return null;
  const text = el.value;
  const a = el.selectionStart ?? 0, b = el.selectionEnd ?? a;
  const toks = tokenize(text);
  if (!toks.length) return null;
  let tok;
  if (a !== b) tok = [...toks].reverse().find((t) => t.start < b && t.end > a) ?? toks[0];
  else tok = toks.find((t) => t.start <= a && a <= t.end) ?? [...toks].reverse().find((t) => t.end <= a) ?? toks[0];
  return { sid: f.sid, lid: f.lid, start: tok.start, end: tok.end, word: tok.text.replace(/[’']+$/, (m) => (/in['’]$/i.test(tok.text) ? m : '')) };
}

// ---------- results ----------
export interface Item { word: string; syl: number; freq: number; stress: string }
interface Group { title: string; items: Item[] }
interface Results {
  kind: MuseKind;
  /** null: a free lookup typed into the card, nothing to swap */
  target: Target | null;
  word?: string;
  groups: Group[];
  loading: boolean;
  note?: string;
  def?: Definition | null;
}
export const results = signal<Results | null>(null);
export const filters = signal({ syl: false, stress: false, rare: false });
let runId = 0;

const toItem = (word: string, syl = 0, freq = 0): Item => {
  const w = word.toLowerCase();
  const info = wordInfo(w);
  const rank = commonRank(w);
  return { word, syl: syl || info.syl, freq: freq || (rank === Infinity ? 0 : 40000 / (rank + 5)), stress: info.stress };
};
const fromCand = (c: Candidate): Item => toItem(c.word, c.syl);
const fromDm = (d: DmWord): Item => toItem(d.word, d.syl, d.freq);

function mergeItems(...lists: Item[][]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const l of lists) for (const i of l) { const k = i.word.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(i); } }
  return out;
}

const TITLES: Record<MuseKind, string> = { rhyme: 'RHYMES', slant: 'SLANT RHYMES', sense: 'SENSORY', like: 'LIKE', oppose: 'OPPOSITES', define: 'DEFINITION' };

export async function runMuse(kind: MuseKind, target: Target | null, free?: string): Promise<void> {
  const id = ++runId;
  lastKind = kind;
  const word = (target?.word ?? free ?? '').toLowerCase().trim().replace(/^'+|'+$/g, '');
  if (!word) return;
  const online = settings.peek().online;
  const put = (groups: Group[], loading: boolean, extra: Partial<Results> = {}) => {
    if (id === runId) results.value = { kind, target, word, groups, loading, ...extra };
  };
  tray.value = 'words';
  put([], true);

  const run = async (rel: DmRel): Promise<Item[]> => (await datamuse(rel, word)).map(fromDm);
  try {
    if (kind === 'rhyme' || kind === 'slant') {
      const local = offlineRhymes(word, kind === 'rhyme' ? 'perfect' : 'slant').map(fromCand);
      put([{ title: '', items: local }], online);
      if (!online) { put([{ title: '', items: local }], false, { note: 'ONLINE LOOKUPS OFF — OFFLINE LIST' }); return; }
      try {
        const dm = await run(kind === 'rhyme' ? 'rhy' : 'nry');
        put([{ title: '', items: mergeItems(dm, local) }], false);
      } catch { put([{ title: '', items: local }], false, { note: 'NO SIGNAL — OFFLINE LIST' }); }
      return;
    }
    if (!online) { put([], false, { note: 'ONLINE LOOKUPS ARE OFF (DIP SWITCHES)' }); return; }
    if (kind === 'sense') {
      const [adj, trg, ml] = await Promise.allSettled([run('jjb'), run('trg'), run('ml')]);
      const g: Group[] = [];
      if (adj.status === 'fulfilled' && adj.value.length) g.push({ title: 'DESCRIBED AS', items: adj.value });
      if (trg.status === 'fulfilled' && trg.value.length) g.push({ title: 'ASSOCIATED', items: trg.value });
      if (ml.status === 'fulfilled' && ml.value.length) g.push({ title: 'MEANS LIKE', items: ml.value });
      put(g, false, g.length ? {} : { note: 'NO SIGNAL — TRY AGAIN WHEN ONLINE' });
      return;
    }
    if (kind === 'like') { put([{ title: '', items: await run('syn') }], false); return; }
    if (kind === 'oppose') { put([{ title: '', items: await run('ant') }], false); return; }
    if (kind === 'define') {
      const def = await define(word);
      put([], false, { def });
    }
  } catch {
    put([], false, { note: kind === 'define' ? 'NO DEFINITION FOUND (OR NO SIGNAL)' : 'NO SIGNAL — TRY AGAIN WHEN ONLINE' });
  }
}

function matchCase(orig: string, next: string): string {
  if (orig.length > 1 && orig === orig.toUpperCase() && /[A-Z]/.test(orig)) return next.toUpperCase();
  if (orig[0] && orig[0] === orig[0].toUpperCase() && /[A-Z]/.test(orig[0])) return next[0].toUpperCase() + next.slice(1);
  return next;
}

export function applyWord(r: Results, next: string): void {
  const song = currentSong.value;
  if (!song) return;
  const t = r.target;
  if (!t) { void runMuse(r.kind, null, next); return; }
  const sec = song.sections.find((s) => s.id === t.sid);
  const line = sec && sec.takes[Math.min(sec.take, sec.takes.length - 1)].lines.find((l) => l.id === t.lid);
  if (!line) return;
  const word = matchCase(line.text.slice(t.start, t.end), next);
  const nt = line.text.slice(0, t.start) + word + line.text.slice(t.end);
  setLineText(song.id, t.sid, t.lid, nt, { start: t.start, del: t.end - t.start, ins: word.length });
  focusLine(t.lid, t.start + word.length);
  feel('chk', 'medium');
  results.value = { ...r, target: { ...t, end: t.start + word.length, word }, word };
}

export function WordsTray() {
  const r = results.value;
  const f = filters.value;
  void cmuTick.value;
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [r?.kind, r?.word]);
  if (!r) return null;
  const w = r.word ?? r.target?.word ?? '';
  const tInfo = wordInfo(w.toLowerCase());
  const pass = (i: Item) => (!f.syl || i.syl === tInfo.syl) && (!f.stress || i.stress === tInfo.stress);
  const sorted = (items: Item[]) => {
    const list = items.filter(pass);
    return f.rare ? [...list].sort((a, b) => (a.freq || 1e9) - (b.freq || 1e9)) : list;
  };
  const toggle = (k: 'syl' | 'stress' | 'rare') => { filters.value = { ...f, [k]: !f[k] }; feel('click', 'light'); };
  const total = r.groups.reduce((n, g) => n + sorted(g.items).length, 0);
  const lookup = (e?: Event) => { e?.preventDefault(); if (q.trim()) { void runMuse(r.kind, null, q.trim()); setQ(''); (document.activeElement as HTMLElement)?.blur?.(); } };
  return (
    <div class="tray words">
      <div class="tray-head">
        <span class="tray-title">{w ? <><b>{w}</b> <small>{tInfo.syl}σ · {tInfo.stress.replace(/S/g, '/').replace(/[us]/g, '˘')}</small></> : 'LOOK UP A WORD'}</span>
        <span class="grow" />
        {r.kind !== 'define' && w && (
          <>
            <button class={'tog' + (f.syl ? ' on' : '')} onClick={() => toggle('syl')}>={tInfo.syl} SYL</button>
            <button class={'tog' + (f.stress ? ' on' : '')} onClick={() => toggle('stress')}>STRESS</button>
            <button class={'tog' + (f.rare ? ' on' : '')} onClick={() => toggle('rare')}>RARE</button>
          </>
        )}
        <button class="tog" aria-label="Close" onClick={() => { tray.value = null; }}><Icon n="close" size={13} /></button>
      </div>
      <div class="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.kind} role="tab" aria-selected={r.kind === t.kind} class={r.kind === t.kind ? 'on' : ''}
            onClick={() => { feel('click', 'light'); if (w) void runMuse(t.kind, r.target, r.target ? undefined : w); else { lastKind = t.kind; results.value = { ...r, kind: t.kind }; } }}>{t.label}</button>
        ))}
      </div>
      {!r.target && (
        <form class="lookup" onSubmit={lookup}>
          <input class="field ui" placeholder={w ? 'another word…' : 'type a word…'} value={q} enterKeyHint="search" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <button class="btn small" type="submit"><Icon n="search" size={13} /></button>
        </form>
      )}
      <div class="tray-body" ref={box}>
        {r.loading && <div class="tray-note"><span class="led on amber blink" /> LOOKING…</div>}
        {r.note && <div class="tray-note">{r.note}</div>}
        {r.groups.map((g) => (
          <div key={g.title}>
            {g.title && <div class="grp">{g.title}</div>}
            <div class="chips">
              {sorted(g.items).map((i) => (
                <button key={i.word} class="chip" onClick={() => applyWord(r, i.word)}>{i.word}<sup>{i.syl}</sup></button>
              ))}
            </div>
          </div>
        ))}
        {!r.loading && !r.note && w && r.kind !== 'define' && total === 0 && <div class="tray-note">NOTHING MATCHES — TRY ANOTHER TAB OR TURN A FILTER OFF</div>}
        {!w && <div class="tray-note">PUT THE CARET IN A WORD AND PRESS WORDS — OR TYPE ONE ABOVE</div>}
        {r.target && <div class="tray-foot">TAP A WORD TO SWAP IT INTO THE LINE</div>}
        {r.def && (
          <div class="defs">
            <div class="dw">{r.def.word} <small>{r.def.phonetic}</small></div>
            {r.def.meanings.slice(0, 3).map((m) => (
              <div class="dm" key={m.pos}>
                <i>{m.pos}</i>
                {m.defs.map((d) => <p>{d.def}{d.example && <em> “{d.example}”</em>}</p>)}
                {m.synonyms.length > 0 && (
                  <div class="chips">{m.synonyms.map((s) => <button class="chip" onClick={() => applyWord(r, s)}>{s}</button>)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
