// Paste-in importer: plain lyrics, chords-over-lyrics, ChordPro, or "[Verse 1] / Chorus:" style sheets.
import { CHORD_RE } from './music';
import type { Chord, SectionKind } from '../store/models';

export interface ParsedSection { kind: SectionKind; name?: string; lines: Array<{ text: string; chords: Chord[] }> }
export interface ParsedSong {
  title?: string;
  key?: string;
  bpm?: number;
  capo?: number;
  sections: ParsedSection[];
  /** indices into `sections`, in play order (repeats allowed) */
  arrangement: number[];
}

const KIND_WORDS: Array<[RegExp, SectionKind, string?]> = [
  [/^pre[- ]?chorus$/, 'pre'], [/^chorus$/, 'chorus'], [/^refrain$/, 'chorus', 'REFRAIN'], [/^verse$/, 'verse'],
  [/^bridge$/, 'bridge'], [/^middle ?8$/, 'bridge', 'MIDDLE 8'], [/^hook$/, 'hook'], [/^intro$/, 'intro'], [/^outro$/, 'outro'],
  [/^coda$/, 'outro', 'CODA'], [/^tag$/, 'tag'], [/^(instrumental|interlude|solo|break)$/, 'tag'],
];

interface Header { kind: SectionKind; name?: string; times: number }

export function parseHeader(line: string): Header | null {
  const m = /^\s*[[(]?\s*([a-z][a-z \-8]*?)\s*(\d+)?\s*[\])]?\s*:?\s*(?:[x×]\s*(\d+))?\s*$/i.exec(line);
  if (!m) return null;
  const word = m[1].toLowerCase().trim();
  for (const [re, kind, name] of KIND_WORDS) {
    if (re.test(word)) {
      const fixed = name ?? (kind === 'tag' && word !== 'tag' ? word.toUpperCase() : undefined);
      return { kind, name: fixed, times: m[3] ? Math.max(1, Math.min(8, Number(m[3]))) : 1 };
    }
  }
  return null;
}

export function isChordLine(line: string): boolean {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  return toks.every((t) => CHORD_RE.test(t.replace(/[()|]/g, '')) || /^[|/\-x%.]+$/.test(t)) && toks.some((t) => CHORD_RE.test(t.replace(/[()|]/g, '')));
}

function chordsFromColumns(chordLine: string, lyricLen: number): Chord[] {
  const out: Chord[] = [];
  for (const m of chordLine.matchAll(/\S+/g)) {
    const name = m[0].replace(/[()|]/g, '');
    if (!CHORD_RE.test(name)) continue;
    out.push({ at: Math.min(m.index ?? 0, Math.max(0, lyricLen)), name });
  }
  // two chords squeezed onto the same character keep their order one apart
  for (let i = 1; i < out.length; i++) if (out[i].at <= out[i - 1].at) out[i].at = out[i - 1].at + 1;
  return out;
}

function inlineChords(line: string): { text: string; chords: Chord[] } {
  const chords: Chord[] = [];
  let text = '';
  let last = 0;
  for (const m of line.matchAll(/\[([^\]\s]{1,12})\]/g)) {
    const name = m[1];
    if (!CHORD_RE.test(name)) continue;
    text += line.slice(last, m.index);
    chords.push({ at: text.length, name });
    last = (m.index ?? 0) + m[0].length;
  }
  if (!chords.length) return { text: line, chords };
  text += line.slice(last);
  return { text, chords };
}

const DIRECTIVE = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;

interface Block { header?: Header; label?: string; lines: ParsedSection['lines']; chorusRef?: boolean }

const labelOf = (s: string) => s.trim().toLowerCase().replace(/[[\]():{}]/g, '').replace(/\s*[x×]\s*\d+$/, '').trim();

export function parseLyrics(raw: string): ParsedSong {
  const rows = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out: ParsedSong = { sections: [], arrangement: [] };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let pendingChords: string | null = null;

  const flushChords = () => {
    if (!pendingChords) return;
    cur ??= { lines: [] };
    cur.lines.push({ text: '', chords: chordsFromColumns(pendingChords, 999) });
    pendingChords = null;
  };
  const end = () => { flushChords(); if (cur && (cur.lines.length || cur.header || cur.chorusRef)) blocks.push(cur); cur = null; };
  const startBlock = (header: Header, label: string) => { end(); cur = { header, label: labelOf(label), lines: [] }; };

  for (const row of rows) {
    const d = DIRECTIVE.exec(row);
    if (d) {
      const k = d[1].toLowerCase(), v = (d[2] ?? '').trim();
      if (k === 'title' || k === 't') out.title = v;
      else if (k === 'key') out.key = v;
      else if (k === 'tempo') out.bpm = Number(v) || undefined;
      else if (k === 'capo') out.capo = Number(v) || undefined;
      else if (/^(start_of_|so[cvb]$)/.test(k)) {
        const kind: SectionKind = /chorus|^soc$/.test(k) ? 'chorus' : /bridge|^sob$/.test(k) ? 'bridge' : 'verse';
        const h = (v && parseHeader(v)) || { kind, times: 1 };
        startBlock(h, v || kind);
      } else if (/^(end_of_|eo[cvb]$)/.test(k)) end();
      else if (k === 'chorus') { end(); blocks.push({ lines: [], chorusRef: true }); }
      else if ((k === 'comment' || k === 'c' || k === 'ci') && parseHeader(v)) startBlock(parseHeader(v)!, v);
      continue;
    }
    const h = row.trim().length < 28 ? parseHeader(row) : null;
    if (h) { startBlock(h, row); continue; }
    if (!row.trim()) {
      if (cur && (cur as Block).lines.length) end();
      continue;
    }
    if (isChordLine(row)) { flushChords(); pendingChords = row; continue; }
    cur ??= { lines: [] };
    const inl = inlineChords(row.replace(/\s+$/, ''));
    let text = inl.text;
    let chords = inl.chords;
    if (pendingChords) {
      const lead = text.length - text.trimStart().length;
      text = text.trimStart();
      chords = chordsFromColumns(pendingChords, text.length + 40).map((c) => ({ ...c, at: Math.max(0, Math.min(text.length, c.at - lead)) }));
      pendingChords = null;
    } else text = text.trim();
    cur.lines.push({ text, chords });
  }
  end();

  const byLabel = new Map<string, number>();
  const sig = (lines: ParsedSection['lines']) => lines.map((l) => l.text.trim().toLowerCase()).join('\n');
  for (const b of blocks) {
    const times = b.header?.times ?? 1;
    let idx = -1;
    if (b.lines.length) {
      const twin = out.sections.findIndex((s) => sig(s.lines) === sig(b.lines));
      if (twin >= 0) {
        idx = twin;
        // an unlabelled block that comes back word-for-word is the chorus
        if (!b.header && out.sections[twin].kind === 'verse' && !out.sections[twin].name) out.sections[twin].kind = 'chorus';
      } else {
        out.sections.push({ kind: b.header?.kind ?? 'verse', name: b.header?.name, lines: b.lines });
        idx = out.sections.length - 1;
        if (b.label && !byLabel.has(b.label)) byLabel.set(b.label, idx);
      }
    } else if (b.label && byLabel.has(b.label)) idx = byLabel.get(b.label)!;
    else if (b.chorusRef || b.header?.kind === 'chorus') {
      for (let k = out.sections.length - 1; k >= 0; k--) if (out.sections[k].kind === 'chorus') { idx = k; break; }
    }
    if (idx < 0) continue;
    for (let t = 0; t < times; t++) out.arrangement.push(idx);
  }
  return out;
}
