import { Line, Song, activeTake, sectionNames } from '../store/models';

export type ChordMode = 'none' | 'over' | 'inline';

export function chordLine(line: Line): string {
  let out = '';
  for (const c of [...line.chords].sort((a, b) => a.at - b.at)) {
    while (out.length < c.at) out += ' ';
    if (out.length > c.at) out += ' ';
    out += c.name;
  }
  return out;
}

export function inlineChords(line: Line): string {
  let out = '';
  let last = 0;
  for (const c of [...line.chords].sort((a, b) => a.at - b.at)) {
    const at = Math.min(c.at, line.text.length);
    out += line.text.slice(last, at) + `[${c.name}]`;
    last = at;
  }
  return out + line.text.slice(last);
}

interface Block { name: string; lines: Line[]; repeat: boolean }

function blocks(song: Song, expand: boolean): Block[] {
  const names = sectionNames(song);
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const a of song.arrangement) {
    const sec = song.sections.find((s) => s.id === a.sectionId);
    if (!sec) continue;
    const repeat = seen.has(sec.id);
    seen.add(sec.id);
    out.push({ name: names.get(sec.id) ?? sec.kind.toUpperCase(), lines: activeTake(sec).lines, repeat: repeat && !expand });
  }
  return out;
}

export function songToText(song: Song, opts: { chords?: ChordMode; expand?: boolean; headers?: boolean } = {}): string {
  const { chords = 'none', expand = true, headers = true } = opts;
  const parts: string[] = [song.title];
  const meta: string[] = [];
  if (song.key) meta.push(`Key: ${song.key}`);
  if (song.capo) meta.push(`Capo: ${song.capo}`);
  if (song.bpm) meta.push(`BPM: ${song.bpm}`);
  if (chords !== 'none' && meta.length) parts.push(meta.join('   '));
  parts.push('');
  for (const b of blocks(song, expand)) {
    if (headers) parts.push(`[${b.name}${b.repeat ? ' — repeat' : ''}]`);
    if (!b.repeat) {
      for (const l of b.lines) {
        if (chords === 'over' && l.chords.length) parts.push(chordLine(l));
        parts.push(chords === 'inline' ? inlineChords(l) : l.text);
      }
    }
    parts.push('');
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function songToMarkdown(song: Song, chords: ChordMode = 'none'): string {
  const out: string[] = [`# ${song.title}`, ''];
  const meta = [song.key && `**Key** ${song.key}`, song.capo ? `**Capo** ${song.capo}` : '', song.bpm ? `**BPM** ${song.bpm}` : '', song.tuning && `**Tuning** ${song.tuning}`].filter(Boolean);
  if (meta.length) out.push(meta.join(' · '), '');
  for (const b of blocks(song, true)) {
    out.push(`## ${b.name}`, '', '```');
    for (const l of b.lines) {
      if (chords === 'over' && l.chords.length) out.push(chordLine(l));
      out.push(chords === 'inline' ? inlineChords(l) : l.text);
    }
    out.push('```', '');
  }
  return out.join('\n');
}

export function songToChordPro(song: Song): string {
  const out: string[] = [`{title: ${song.title}}`];
  if (song.key) out.push(`{key: ${song.key}}`);
  if (song.capo) out.push(`{capo: ${song.capo}}`);
  if (song.bpm) out.push(`{tempo: ${song.bpm}}`);
  out.push('');
  const names = sectionNames(song);
  const seen = new Set<string>();
  for (const a of song.arrangement) {
    const sec = song.sections.find((s) => s.id === a.sectionId);
    if (!sec) continue;
    const label = names.get(sec.id) ?? sec.kind;
    const env = sec.kind === 'chorus' ? 'chorus' : sec.kind === 'bridge' ? 'bridge' : 'verse';
    if (seen.has(sec.id) && sec.kind === 'chorus') { out.push('{chorus}', ''); continue; }
    seen.add(sec.id);
    out.push(`{start_of_${env}: ${label}}`);
    for (const l of activeTake(sec).lines) out.push(inlineChords(l));
    out.push(`{end_of_${env}}`, '');
  }
  return out.join('\n');
}

export function backupJson(songs: Song[], scraps: unknown[]): string {
  return JSON.stringify({ app: 'portascribe', version: 1, exportedAt: new Date().toISOString(), songs, scraps });
}

export function roughSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}
