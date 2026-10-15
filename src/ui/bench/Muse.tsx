import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { ID } from '../../store/models';
import { currentSong, settings } from '../../store/state';
import { focusLine, focused, setLineText } from '../../store/lines';
import { tray, say } from '../../store/ui';
import { Candidate, offlineRhymes } from '../../engine/rhyme';
import { commonRank } from '../../engine/common';
import { Definition, DmRel, DmWord, datamuse, define } from '../../engine/net';
import { tokenize, wordInfo } from '../../engine/words';
import { feel, haptic } from '../../engine/feel';
import { Icon } from '../icons';
import { cmuTick } from '../../store/ui';

export type MuseKind = 'rhyme' | 'slant' | 'sense' | 'like' | 'oppose' | 'define';
const SECTORS: Array<{ kind: MuseKind; label: string; icon: string; hint: string }> = [
  { kind: 'rhyme', label: 'RHYME', icon: 'note', hint: 'perfect' },
  { kind: 'slant', label: 'SLANT', icon: 'flow', hint: 'near' },
  { kind: 'sense', label: 'SENSE', icon: 'eye', hint: 'imagery' },
  { kind: 'like', label: 'LIKE', icon: 'copy', hint: 'synonyms' },
  { kind: 'oppose', label: 'OPPOSE', icon: 'shuffle', hint: 'antonyms' },
  { kind: 'define', label: 'DEFINE', icon: 'card', hint: 'meaning' },
];

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

// ---------- wheel ----------
interface WheelState { cx: number; cy: number; active: number; hold: boolean; target: Target }
export const wheel = signal<WheelState | null>(null);
const R = 122, HUB = 34;

export function sectorAt(w: WheelState, x: number, y: number): number {
  const dx = x - w.cx, dy = y - w.cy;
  const d = Math.hypot(dx, dy);
  if (d < HUB - 4 || d > R + 26) return -1;
  const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.floor((((ang + 30) % 360) + 360) % 360 / 60);
}

export function openWheel(keyEl: HTMLElement, hold: boolean): boolean {
  const target = getTarget();
  if (!target) { say('TAP INTO A WORD FIRST'); return false; }
  const r = keyEl.getBoundingClientRect();
  const W = window.innerWidth;
  const cx = Math.max(R + 10, Math.min(W - R - 10, r.left + r.width / 2));
  const cy = Math.max(R + 70, r.top - R - 26);
  wheel.value = { cx, cy, active: -1, hold, target };
  feel('click', 'medium');
  return true;
}

export function moveWheel(x: number, y: number): void {
  const w = wheel.value;
  if (!w) return;
  const a = sectorAt(w, x, y);
  if (a !== w.active) { wheel.value = { ...w, active: a }; if (a >= 0) haptic('light'); }
}

export function releaseWheel(x: number, y: number, moved: boolean): void {
  const w = wheel.value;
  if (!w) return;
  const a = sectorAt(w, x, y);
  if (moved || a >= 0) {
    if (a >= 0 && (moved || w.hold)) { wheel.value = null; void runMuse(SECTORS[a].kind, w.target); return; }
    if (moved) { wheel.value = null; return; }
  }
  // quick tap: leave wheel open for tap selection
  wheel.value = { ...w, hold: false, active: -1 };
}

function wedge(i: number, r0: number, r1: number): string {
  const a0 = ((i * 60 - 30 + 2.2) * Math.PI) / 180, a1 = ((i * 60 + 30 - 2.2) * Math.PI) / 180;
  const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(1)} ${(-r * Math.cos(a)).toFixed(1)}`;
  return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

export function WheelOverlay() {
  const w = wheel.value;
  if (!w) return null;
  return (
    <div class="wheel-scrim"
      onPointerDown={(e) => {
        const a = sectorAt(w, e.clientX, e.clientY);
        if (a >= 0) { wheel.value = null; void runMuse(SECTORS[a].kind, w.target); } else wheel.value = null;
      }}>
      <svg class="wheel" viewBox={`${-R - 8} ${-R - 8} ${2 * R + 16} ${2 * R + 16}`} style={{ left: w.cx - R - 8, top: w.cy - R - 8, width: 2 * R + 16, height: 2 * R + 16 }}>
        <circle r={R + 6} fill="#0a0b0d" stroke="#2c2f35" stroke-width="1.5" />
        {SECTORS.map((s, i) => {
          const mid = (i * 60 * Math.PI) / 180;
          const lx = Math.sin(mid) * 84, ly = -Math.cos(mid) * 84;
          const on = w.active === i;
          return (
            <g key={s.kind} class={'sec' + (on ? ' on' : '')}>
              <path d={wedge(i, HUB + 6, R)} />
              <g transform={`translate(${lx} ${ly})`} class="lab">
                <g transform="translate(-9 -20)"><Icon n={s.icon} size={18} /></g>
                <text y="6" text-anchor="middle" class="t1">{s.label}</text>
                <text y="17" text-anchor="middle" class="t2">{s.hint}</text>
              </g>
            </g>
          );
        })}
        <circle r={HUB} fill="#16171a" stroke="#3b3e46" />
        <text y="4" text-anchor="middle" class="hub">{w.target.word.length > 9 ? w.target.word.slice(0, 8) + '…' : w.target.word}</text>
      </svg>
    </div>
  );
}

// ---------- results ----------
export interface Item { word: string; syl: number; freq: number; stress: string }
interface Group { title: string; items: Item[] }
interface Results {
  kind: MuseKind;
  target: Target;
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

export async function runMuse(kind: MuseKind, target: Target): Promise<void> {
  const id = ++runId;
  const word = target.word.toLowerCase().replace(/^'+|'+$/g, '');
  const online = settings.peek().online;
  const put = (groups: Group[], loading: boolean, extra: Partial<Results> = {}) => {
    if (id === runId) results.value = { kind, target, groups, loading, ...extra };
  };
  tray.value = 'results';
  put([], true);
  feel('thock', 'light');

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
  const sec = song.sections.find((s) => s.id === t.sid);
  const line = sec && sec.takes[Math.min(sec.take, sec.takes.length - 1)].lines.find((l) => l.id === t.lid);
  if (!line) return;
  const word = matchCase(line.text.slice(t.start, t.end), next);
  const nt = line.text.slice(0, t.start) + word + line.text.slice(t.end);
  setLineText(song.id, t.sid, t.lid, nt, { start: t.start, del: t.end - t.start, ins: word.length });
  focusLine(t.lid, t.start + word.length);
  feel('chk', 'medium');
  results.value = { ...r, target: { ...t, end: t.start + word.length, word } };
}

export function ResultsTray() {
  const r = results.value;
  const f = filters.value;
  void cmuTick.value;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: 0 }); }, [r?.kind, r?.target.word]);
  if (!r) return null;
  const tInfo = wordInfo(r.target.word.toLowerCase());
  const pass = (i: Item) => (!f.syl || i.syl === tInfo.syl) && (!f.stress || i.stress === tInfo.stress);
  const sorted = (items: Item[]) => {
    const list = items.filter(pass);
    return f.rare ? [...list].sort((a, b) => (a.freq || 1e9) - (b.freq || 1e9)) : list;
  };
  const toggle = (k: 'syl' | 'stress' | 'rare') => { filters.value = { ...f, [k]: !f[k] }; feel('click', 'light'); };
  const total = r.groups.reduce((n, g) => n + sorted(g.items).length, 0);
  return (
    <div class="tray results">
      <div class="tray-head">
        <span class="tray-title">{TITLES[r.kind]} · <b>{r.target.word}</b> <small>{tInfo.syl}σ</small></span>
        <span class="grow" />
        {r.kind !== 'define' && (
          <>
            <button class={'tog' + (f.syl ? ' on' : '')} onClick={() => toggle('syl')}>={tInfo.syl}σ</button>
            <button class={'tog' + (f.stress ? ' on' : '')} onClick={() => toggle('stress')}>STRESS</button>
            <button class={'tog' + (f.rare ? ' on' : '')} onClick={() => toggle('rare')}>RARE</button>
          </>
        )}
        <button class="tog" aria-label="Close" onClick={() => { tray.value = null; }}><Icon n="close" size={14} /></button>
      </div>
      <div class="tray-body" ref={box}>
        {r.loading && <div class="tray-note"><span class="led on amber blink" /> CONSULTING…</div>}
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
        {!r.loading && !r.note && r.kind !== 'define' && total === 0 && <div class="tray-note">NOTHING MATCHES THOSE FILTERS</div>}
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
