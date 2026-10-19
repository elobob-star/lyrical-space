// Line-level and arrangement operations used by the Bench.
import { signal } from '@preact/signals';
import {
  Chord, ID, Line, SectionKind, Song, activeTake, newLine, newSection, uid,
} from './models';
import { addScrap, currentSong, removeScrap, songs, updateSong } from './state';
import { pushUndo, undoTick } from './undo';
import { Edit, rebaseChords } from '../engine/textdiff';

export const focused = signal<{ sid: ID; lid: ID } | null>(null);
export const focusReq = signal<{ lid: ID; caret: number; n: number } | null>(null);
let reqN = 0;
export function focusLine(lid: ID, caret = 0): void { focusReq.value = { lid, caret, n: ++reqN }; }

const takeOf = (d: Song, sid: ID) => {
  const sec = d.sections.find((s) => s.id === sid);
  return sec ? activeTake(sec) : null;
};
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const songById = (id: ID) => songs.peek().find((s) => s.id === id);

/** A take, found by id: undo must act on the take it recorded, not on whichever one is showing now. */
export function takeById(d: Song, sid: ID, tid: ID): { sec: Song['sections'][number]; take: ReturnType<typeof activeTake>; index: number } | null {
  const sec = d.sections.find((s) => s.id === sid);
  const index = sec ? sec.takes.findIndex((t) => t.id === tid) : -1;
  return sec && index >= 0 ? { sec, take: sec.takes[index], index } : null;
}

/** Remember the lines of the section's active take: undo puts them back exactly as they were (in that take, which it brings to the front). */
export function recordTake(songId: ID, sid: ID, label: string): void {
  const song = songById(songId);
  const t = song && takeOf(song, sid);
  if (!t) return;
  const tid = t.id;
  const snap = copy(t.lines);
  pushUndo('bench', label, () => updateSong(songId, (d) => {
    const f = takeById(d, sid, tid);
    if (!f) return;
    f.take.lines = copy(snap);
    f.sec.take = f.index;
  }), songId);
}
/** Remember one whole section (kind, name, cadence, takes) so a change to it can be undone. */
export function recordSection(songId: ID, sid: ID, label: string): void {
  const sec = songById(songId)?.sections.find((q) => q.id === sid);
  if (!sec) return;
  const snap = copy(sec);
  pushUndo('bench', label, () => updateSong(songId, (d) => { const i = d.sections.findIndex((q) => q.id === sid); if (i >= 0) d.sections[i] = copy(snap); }), songId);
}
/** Remember the section list and arrangement. */
export function recordArrangement(songId: ID, label: string): void {
  const song = songById(songId);
  if (!song) return;
  const snap = copy({ sections: song.sections, arrangement: song.arrangement });
  pushUndo('bench', label, () => updateSong(songId, (d) => { d.sections = copy(snap.sections); d.arrangement = copy(snap.arrangement); }), songId);
}

/** Typing in one breath is one undo step. */
let burst: { lid: ID; at: number; tick: number } | null = null;

export function setLineText(songId: ID, sid: ID, lid: ID, text: string, edit: Edit): void {
  const song0 = songById(songId);
  const take0 = song0 && takeOf(song0, sid);
  const prev = take0?.lines.find((x) => x.id === lid);
  const now = Date.now();
  if (prev && take0 && (!burst || burst.lid !== lid || now - burst.at > 900 || burst.tick !== undoTick())) {
    const was = { text: prev.text, chords: copy(prev.chords) };
    const tid = take0.id;
    pushUndo('bench', 'TYPING', () => updateSong(songId, (d) => {
      const f = takeById(d, sid, tid);
      const l = f?.take.lines.find((x) => x.id === lid);
      if (f && l) { l.text = was.text; l.chords = copy(was.chords); f.sec.take = f.index; }
    }), songId);
  }
  burst = { lid, at: now, tick: undoTick() };
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    const l = t?.lines.find((x) => x.id === lid);
    if (!l) return;
    l.text = text;
    if (l.chords.length) l.chords = rebaseChords(l.chords, edit);
  });
}

export function splitLine(songId: ID, sid: ID, lid: ID, a: number, b: number): void {
  recordTake(songId, sid, 'NEW LINE'); burst = null;
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
  recordTake(songId, sid, 'JOIN LINES'); burst = null;
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
  recordTake(songId, sid, 'PASTE'); burst = null;
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
  recordTake(songId, sid, 'NEW LINE');
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
  const lines0 = songById(songId) && takeOf(songById(songId)!, sid)?.lines;
  const i0 = lines0 ? lines0.findIndex((x) => x.id === lid) : -1;
  if (!lines0 || i0 < 0 || i0 + dir < 0 || i0 + dir >= lines0.length) return; // nowhere to go: nothing to undo
  recordTake(songId, sid, 'MOVE LINE');
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
  recordTake(songId, sid, 'DUPLICATE LINE');
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
  let tid: ID | null = null;
  let removed: Line | null = null;
  updateSong(songId, (d) => {
    const t = takeOf(d, sid);
    if (!t) return;
    idx = t.lines.findIndex((x) => x.id === lid);
    if (idx < 0) return;
    tid = t.id;
    removed = JSON.parse(JSON.stringify(t.lines[idx])); // a plain copy: the draft itself is revoked when produce ends
    t.lines.splice(idx, 1);
    if (!t.lines.length) t.lines.push(newLine());
  });
  return () => {
    if (!removed || !tid) return;
    updateSong(songId, (d) => {
      const f = takeById(d, sid, tid!);
      if (!f) return;
      if (f.take.lines.length === 1 && !f.take.lines[0].text) f.take.lines.splice(0, 1);
      f.take.lines.splice(Math.min(idx, f.take.lines.length), 0, JSON.parse(JSON.stringify(removed)));
      f.sec.take = f.index;
    });
  };
}

// ---- chords ----
export function placeChord(songId: ID, sid: ID, lid: ID, at: number, name: string, rec = true): void {
  if (rec) recordTake(songId, sid, 'CHORD');
  updateSong(songId, (d) => {
    const l = takeOf(d, sid)?.lines.find((x) => x.id === lid);
    if (!l) return;
    at = Math.max(0, Math.min(at, Math.max(l.text.length, 0)));
    const existing = l.chords.find((c) => c.at === at);
    if (existing) existing.name = name; else l.chords.push({ at, name });
    l.chords.sort((a, b) => a.at - b.at);
  });
}

export function removeChord(songId: ID, sid: ID, lid: ID, at: number, rec = true): Chord | null {
  if (rec) recordTake(songId, sid, 'CHORD');
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
  recordArrangement(songId, 'NEW SECTION');
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
  recordArrangement(songId, 'REPEAT');
  updateSong(songId, (d) => {
    const i = d.arrangement.findIndex((a) => a.id === entryId);
    if (i < 0) return;
    d.arrangement.splice(i + 1, 0, { id: uid(), sectionId: d.arrangement[i].sectionId });
  });
}

export function moveEntry(songId: ID, entryId: ID, dir: -1 | 1): void {
  recordArrangement(songId, 'MOVE SECTION');
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
