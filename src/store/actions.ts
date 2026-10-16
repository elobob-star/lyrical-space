// Cross-surface operations: the plumbing that moves words between Roll, Table, Bench and the scrap piles.
import { produce } from 'immer';
import {
  ID, Line, Mark, Section, SectionKind, Song, Strip, activeTake, newLine, newSection, newTake, uid,
} from './models';
import { addScrap, currentSong, removeScrap, updateCurrent, updateSong } from './state';

/** Text of a range with ghost-ink characters removed. */
export function cleanRange(text: string, marks: Mark[], s: number, e: number): string {
  const ghosts = marks.filter((m) => m.kind === 'ghost');
  let out = '';
  for (let i = s; i < e; i++) {
    if (ghosts.some((g) => i >= g.s && i < g.e)) continue;
    out += text[i];
  }
  return out;
}

export function ghostStrip(text: string, marks: Mark[]): string {
  return cleanRange(text, marks, 0, text.length);
}

export function tidyPhrase(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Pick a roomy spot on the board for a new strip. */
export function freeSpot(existing: Strip[], rnd = Math.random): { x: number; y: number } {
  let best = { x: 0.06, y: 0.05 }, bestD = -1;
  for (let i = 0; i < 28; i++) {
    const x = 0.04 + rnd() * 0.42, y = 0.03 + rnd() * 0.8;
    let d = 9;
    for (const s of existing) d = Math.min(d, Math.hypot((s.x - x) * 1.1, (s.y - y) * 2.2));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

export function makeStrips(texts: string[], from: Strip['from'], existing: Strip[]): Strip[] {
  const out: Strip[] = [];
  let z = Math.max(0, ...existing.map((s) => s.z));
  for (const t of texts) {
    const pos = freeSpot([...existing, ...out]);
    out.push({ id: uid(), text: t, x: pos.x, y: pos.y, rot: (Math.random() - 0.5) * 5, z: ++z, from });
  }
  return out;
}

/** Roll → Table: every un-punched pencil mark becomes a strip. Returns how many. */
export function punchPencil(): number {
  const song = currentSong.value;
  if (!song) return 0;
  const pending = song.roll.marks.filter((m) => m.kind === 'pencil' && !m.punched);
  const texts = pending
    .map((m) => tidyPhrase(cleanRange(song.roll.text, song.roll.marks, m.s, m.e)).slice(0, 240))
    .filter(Boolean);
  if (!texts.length) {
    // marks that were only ghost text: just mark them punched
    return 0;
  }
  updateCurrent((d) => {
    d.table.push(...makeStrips(texts, 'roll', d.table));
    for (const m of d.roll.marks) if (m.kind === 'pencil' && !m.punched) m.punched = true;
  });
  return texts.length;
}

export function pendingPencil(song: Song | null): number {
  return song ? song.roll.marks.filter((m) => m.kind === 'pencil' && !m.punched).length : 0;
}

/** Cut a line out of a take into the Shoebox. */
export function cutLine(songId: ID, sectionId: ID, lineId: ID): { text: string; undo: () => void } | null {
  const song = currentSong.value;
  const sec = song?.sections.find((s) => s.id === sectionId);
  if (!song || !sec) return null;
  const take = activeTake(sec);
  const idx = take.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) return null;
  const line = take.lines[idx];
  const text = line.text.trim();
  const scrap = text ? addScrap(text, 'cut', songId) : null;
  updateSong(songId, (d) => {
    const t = activeTake(d.sections.find((s) => s.id === sectionId)!);
    t.lines.splice(idx, 1);
    if (!t.lines.length) t.lines.push(newLine());
  });
  return {
    text,
    undo: () => {
      updateSong(songId, (d) => {
        const t = activeTake(d.sections.find((s) => s.id === sectionId)!);
        if (t.lines.length === 1 && !t.lines[0].text) t.lines.splice(0, 1);
        t.lines.splice(Math.min(idx, t.lines.length), 0, line);
      });
      if (scrap) removeScrap(scrap.id);
    },
  };
}

/** Make sure the song has at least one section; returns it. */
export function ensureSection(d: Song, kind: SectionKind = 'verse'): Section {
  if (!d.sections.length) {
    const s = newSection(kind);
    d.sections.push(s);
    d.arrangement.push({ id: uid(), sectionId: s.id });
  }
  return d.sections[d.sections.length - 1];
}

/** Append text lines to the active take of a section (or a brand-new one). */
export function sendTextToBench(songId: ID, texts: string[], sectionId: ID | 'new', kind: SectionKind = 'verse'): ID {
  let target: ID = sectionId as ID;
  updateSong(songId, (d) => {
    const lines: Line[] = texts.flatMap((t) => t.split('\n')).map((t) => newLine(t.trim())).filter((l) => l.text);
    if (sectionId === 'new') {
      const s = newSection(kind, lines.length ? lines : undefined);
      d.sections.push(s);
      d.arrangement.push({ id: uid(), sectionId: s.id });
      target = s.id;
      return;
    }
    const sec = d.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const take = activeTake(sec);
    if (take.lines.length === 1 && !take.lines[0].text) take.lines.splice(0, 1);
    take.lines.push(...lines);
  });
  return target;
}

export function addTake(songId: ID, sectionId: ID, copy: boolean): void {
  updateSong(songId, (d) => {
    const sec = d.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const cur = activeTake(sec);
    const lines = copy ? cur.lines.map((l) => ({ ...l, id: uid(), chords: l.chords.map((c) => ({ ...c })) })) : [newLine()];
    sec.takes.splice(sec.take + 1, 0, newTake(lines));
    sec.take = sec.take + 1;
  });
}

export { produce };
