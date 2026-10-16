// Line-level and arrangement operations used by the Bench.
import { signal } from '@preact/signals';
import {
  Chord, ID, Line, SectionKind, Song, activeTake, newLine, newSection, uid,
} from './models';
import { addScrap, currentSong, removeScrap, updateSong } from './state';
import { Edit, rebaseChords } from '../engine/textdiff';

export const focused = signal<{ sid: ID; lid: ID } | null>(null);
export const focusReq = signal<{ lid: ID; caret: number; n: number } | null>(null);
let reqN = 0;
export function focusLine(lid: ID, caret = 0): void { focusReq.value = { lid, caret, n: ++reqN }; }

const takeOf = (d: Song, sid: ID) => {
  const sec = d.sections.find((s) => s.id === sid);
  return sec ? activeTake(sec) : null;
};

export function setLineText(songId: ID, sid: ID, lid: ID, text: string, edit: Edit): void {
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    const l = t?.lines.find((x) => x.id === lid);
    if (!l) return;
    l.text = text;
    if (l.chords.length) l.chords = rebaseChords(l.chords, edit);
  });
}

export function splitLine(songId: ID, sid: ID, lid: ID, a: number, b: number): void {
  const nl = newLine();
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = t.lines.findIndex((x) => x.id === lid);
    if (i < 0) return;
    const l = t.lines[i];
    const right = l.text.slice(b);
    const moved: Chord[] = l.chords.filter((c) => c.at >= b).map((c) => ({ ...c, at: c.at - b }));
    const stay: Chord[] = l.chords.filter((c) => c.at < a);
    nl.text = right;
    nl.chords = moved;
    l.text = l.text.slice(0, a);
    l.chords = stay;
    t.lines.splice(i + 1, 0, nl);
  });
  focusLine(nl.id, 0);
}

export function mergeUp(songId: ID, sid: ID, lid: ID): boolean {
  let prevId: ID | null = null, caret = 0;
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = t.lines.findIndex((x) => x.id === lid);
    if (i <= 0) return;
    const prev = t.lines[i - 1], cur = t.lines[i];
    caret = prev.text.length;
    prevId = prev.id;
    prev.chords = [...prev.chords, ...cur.chords.map((c) => ({ ...c, at: c.at + caret }))];
    prev.text += cur.text;
    t.lines.splice(i, 1);
  });
  if (prevId) focusLine(prevId, caret);
  return !!prevId;
}

export function pasteLines(songId: ID, sid: ID, lid: ID, a: number, b: number, pasted: string): void {
  const parts = pasted.replace(/\r/g, '').split('\n');
  let lastId: ID = lid;
  let lastCaret = 0;
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = t.lines.findIndex((x) => x.id === lid);
    if (i < 0) return;
    const l = t.lines[i];
    const tail = l.text.slice(b);
    l.text = l.text.slice(0, a) + parts[0];
    const extra = parts.slice(1).map((p) => newLine(p));
    if (extra.length) {
      const lastLine = extra[extra.length - 1];
      lastCaret = lastLine.text.length;
      lastLine.text += tail;
      lastId = lastLine.id;
      t.lines.splice(i + 1, 0, ...extra);
    }
  });
  focusLine(lastId, lastCaret);
}

export function addLineAfter(songId: ID, sid: ID, lid: ID | null, text = ''): ID {
  const nl = newLine(text);
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = lid ? t.lines.findIndex((x) => x.id === lid) : t.lines.length - 1;
    t.lines.splice(i + 1, 0, nl);
  });
  focusLine(nl.id, text.length);
  return nl.id;
}

export function moveLine(songId: ID, sid: ID, lid: ID, dir: -1 | 1): void {
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = t.lines.findIndex((x) => x.id === lid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= t.lines.length) return;
    [t.lines[i], t.lines[j]] = [t.lines[j], t.lines[i]];
  });
}

export function duplicateLine(songId: ID, sid: ID, lid: ID): void {
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    const i = t.lines.findIndex((x) => x.id === lid);
    if (i < 0) return;
    const l = t.lines[i];
    t.lines.splice(i + 1, 0, { id: uid(), text: l.text, chords: l.chords.map((c) => ({ ...c })) });
  });
}

export function removeLine(songId: ID, sid: ID, lid: ID): () => void {
  let idx = -1;
  let removed: Line | null = null;
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    idx = t.lines.findIndex((x) => x.id === lid);
    if (idx < 0) return;
    removed = t.lines[idx];
    t.lines.splice(idx, 1);
    if (!t.lines.length) t.lines.push(newLine());
  });
  return () => {
    if (!removed) return;
    updateSong(songId, (d) => {
      const t = takeOf(d, sid);
      if (!t) return;
      if (t.lines.length === 1 && !t.lines[0].text) t.lines.splice(0, 1);
      t.lines.splice(Math.min(idx, t.lines.length), 0, removed!);
    });
  };
}

// ---- chords ----
export function placeChord(songId: ID, sid: ID, lid: ID, at: number, name: string): void {
  updateSong(songId, (d) => {
    const l = takeOf(d, sid)?.lines.find((x) => x.id === lid);
    if (!l) return;
    at = Math.max(0, Math.min(at, Math.max(l.text.length, 0)));
    const existing = l.chords.find((c) => c.at === at);
    if (existing) existing.name = name; else l.chords.push({ at, name });
    l.chords.sort((a, b) => a.at - b.at);
  });
}

export function removeChord(songId: ID, sid: ID, lid: ID, at: number): Chord | null {
  let gone: Chord | null = null;
  updateSong(songId, (d) => {
    const l = takeOf(d, sid)?.lines.find((x) => x.id === lid);
    if (!l) return;
    gone = l.chords.find((c) => c.at === at) ?? null;
    l.chords = l.chords.filter((c) => c.at !== at);
  });
  return gone;
}

/** Snap a character index to the nearest word start when close. */
export function snapToWord(text: string, at: number): number {
  at = Math.max(0, Math.min(at, text.length));
  let best = at, bestD = 3;
  for (let i = 0; i <= text.length; i++) {
    const isStart = i < text.length && /\S/.test(text[i]) && (i === 0 || /\s/.test(text[i - 1]));
    if (isStart && Math.abs(i - at) < bestD) { best = i; bestD = Math.abs(i - at); }
  }
  return best;
}

// ---- arrangement ----
export function addSection(songId: ID, kind: SectionKind, afterEntry?: ID): ID {
  const sec = newSection(kind);
  updateSong(songId, (d) => {
    d.sections.push(sec);
    const entry = { id: uid(), sectionId: sec.id };
    const i = afterEntry ? d.arrangement.findIndex((a) => a.id === afterEntry) : -1;
    if (i >= 0) d.arrangement.splice(i + 1, 0, entry); else d.arrangement.push(entry);
  });
  return sec.id;
}

export function repeatEntry(songId: ID, entryId: ID): void {
  updateSong(songId, (d) => {
    const i = d.arrangement.findIndex((a) => a.id === entryId);
    if (i < 0) return;
    d.arrangement.splice(i + 1, 0, { id: uid(), sectionId: d.arrangement[i].sectionId });
  });
}

export function moveEntry(songId: ID, entryId: ID, dir: -1 | 1): void {
  updateSong(songId, (d) => {
    const i = d.arrangement.findIndex((a) => a.id === entryId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.arrangement.length) return;
    [d.arrangement[i], d.arrangement[j]] = [d.arrangement[j], d.arrangement[i]];
  });
}

/** Remove an entry; if it was the last use of its section, the section's lines go to the Shoebox. */
export function removeEntry(songId: ID, entryId: ID): { undo: () => void; buried: number } | null {
  const song = currentSong.value;
  if (!song) return null;
  const snap = { sections: JSON.parse(JSON.stringify(song.sections)), arrangement: JSON.parse(JSON.stringify(song.arrangement)) };
  const entry = song.arrangement.find((a) => a.id === entryId);
  if (!entry) return null;
  const last = song.arrangement.filter((a) => a.sectionId === entry.sectionId).length === 1;
  const sec = song.sections.find((s) => s.id === entry.sectionId);
  const bones: ID[] = [];
  if (last && sec) {
    for (const t of sec.takes) for (const l of t.lines) if (l.text.trim()) { const s = addScrap(l.text, 'cut', songId); if (s) bones.push(s.id); }
  }
  updateSong(songId, (d) => {
    d.arrangement = d.arrangement.filter((a) => a.id !== entryId);
    if (last) d.sections = d.sections.filter((s) => s.id !== entry.sectionId);
  });
  return {
    buried: bones.length,
    undo: () => {
      updateSong(songId, (d) => { d.sections = snap.sections; d.arrangement = snap.arrangement; });
      bones.forEach(removeScrap);
    },
  };
}
