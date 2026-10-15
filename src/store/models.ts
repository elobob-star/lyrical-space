export type ID = string;

export const uid = (): ID =>
  Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);

export type MarkKind = 'ghost' | 'pencil';
export interface Mark { id: ID; s: number; e: number; kind: MarkKind; punched?: boolean }

export interface Chord { at: number; name: string }
export interface Line { id: ID; text: string; chords: Chord[] }
export interface Take { id: ID; lines: Line[] }

export type SectionKind = 'verse' | 'pre' | 'chorus' | 'bridge' | 'hook' | 'intro' | 'outro' | 'tag';
export const SECTION_KINDS: SectionKind[] = ['verse', 'pre', 'chorus', 'bridge', 'hook', 'intro', 'outro', 'tag'];

export interface Section {
  id: ID;
  kind: SectionKind;
  name?: string;
  take: number;
  takes: Take[];
  cadence?: Array<'u' | 'S' | 'r'>;
}

export interface Strip {
  id: ID;
  text: string;
  x: number; // 0..1 of board width (left edge)
  y: number; // 0..1 of board height (top edge)
  rot: number;
  z: number;
  from: 'roll' | 'spark' | 'bone' | 'typed' | 'splice';
}

export interface Memo {
  id: ID;
  sectionId?: ID;
  label: string;
  durMs: number;
  peaks: number[];
  mime: string;
  createdAt: number;
}

export interface Song {
  id: ID;
  title: string;
  ink: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  bpm: number;
  key: string | null;
  capo: number;
  tuning: string;
  roll: { text: string; marks: Mark[]; spark?: string; sprintMs: number };
  table: Strip[];
  sections: Section[];
  arrangement: Array<{ id: ID; sectionId: ID }>;
  memos: Memo[];
}

export interface Scrap {
  id: ID;
  text: string;
  kind: 'spark' | 'bone';
  createdAt: number;
  songId?: ID;
  used: number;
}

export type Paper = 'newsprint' | 'legal' | 'graph' | 'midnight';
export type Chassis = 'alu' | 'charcoal';

export interface Settings {
  paper: Paper;
  chassis: Chassis;
  haptics: boolean;
  clicks: boolean;
  keys: boolean;
  grain: boolean;
  textSize: number; // 0..2
  gutter: boolean;
  online: boolean;
  awake: boolean;
  leftHand: boolean;
  tilt: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  paper: 'newsprint',
  chassis: 'alu',
  haptics: true,
  clicks: true,
  keys: false,
  grain: true,
  textSize: 1,
  gutter: true,
  online: true,
  awake: false,
  leftHand: false,
  tilt: true,
};

export const INKS = ['#d9432b', '#c98a14', '#7d8b2e', '#1f8a84', '#3b4fa8', '#8a3f86', '#c9507a', '#5b6670'];
export const INK_NAMES = ['VERMILION', 'OCHRE', 'OLIVE', 'TEAL', 'INDIGO', 'PLUM', 'ROSE', 'SLATE'];

export function newLine(text = ''): Line { return { id: uid(), text, chords: [] }; }
export function newTake(lines: Line[] = [newLine()]): Take { return { id: uid(), lines }; }
export function newSection(kind: SectionKind = 'verse', lines?: Line[]): Section {
  return { id: uid(), kind, take: 0, takes: [newTake(lines)] };
}

export function newSong(title = 'UNTITLED', ink = Math.floor(Math.random() * INKS.length)): Song {
  const now = Date.now();
  return {
    id: uid(), title, ink, createdAt: now, updatedAt: now,
    bpm: 92, key: null, capo: 0, tuning: 'Standard EADGBE',
    roll: { text: '', marks: [], sprintMs: 0 },
    table: [], sections: [], arrangement: [], memos: [],
  };
}

export const activeTake = (s: Section): Take => s.takes[Math.min(s.take, s.takes.length - 1)];

/** Display names: VERSE 1 / VERSE 2 / CHORUS … numbered only when a kind occurs more than once. */
export function sectionNames(song: Song): Map<ID, string> {
  const total: Record<string, number> = {};
  for (const sec of song.sections) total[sec.kind] = (total[sec.kind] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const out = new Map<ID, string>();
  for (const sec of song.sections) {
    seen[sec.kind] = (seen[sec.kind] ?? 0) + 1;
    out.set(sec.id, sec.name?.trim() ? sec.name.trim().toUpperCase()
      : sec.kind.toUpperCase() + (total[sec.kind] > 1 ? ` ${seen[sec.kind]}` : ''));
  }
  return out;
}

export function lineCount(song: Song): number {
  let n = 0;
  for (const sec of song.sections) for (const l of activeTake(sec).lines) if (l.text.trim()) n++;
  return n;
}

const ABBR: Record<SectionKind, string> = { verse: 'V', pre: 'PRE', chorus: 'C', bridge: 'B', hook: 'H', intro: 'IN', outro: 'OUT', tag: 'TAG' };
export function sectionAbbrev(sec: Section, names: Map<ID, string>): string {
  if (sec.name?.trim()) return sec.name.trim().slice(0, 3).toUpperCase();
  const num = /(\d+)$/.exec(names.get(sec.id) ?? '')?.[1] ?? '';
  return ABBR[sec.kind] + num;
}
