// Tape history: quiet snapshots of a song's previous states, so a rewrite never costs you the old version.
import { dbDelete, dbPrefix, dbPut } from './db';
import type { ID, Song } from './models';

export interface Snapshot { key: string; at: number; song: Song }

const GAP_MS = 3 * 60_000;
const KEEP = 80;
const lastSnap = new Map<ID, number>();

const keyFor = (id: ID, at: number) => `${id}:${String(at).padStart(14, '0')}`;

/** Called with the version that is about to be overwritten. Throttled per song. */
export async function maybeSnapshot(prev: Song, now = Date.now()): Promise<void> {
  if (now - (lastSnap.get(prev.id) ?? 0) < GAP_MS) return;
  if (!hasWords(prev)) return;
  lastSnap.set(prev.id, now);
  await dbPut('history', keyFor(prev.id, prev.updatedAt), prev);
  const all = await dbPrefix<Song>('history', prev.id + ':');
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await dbDelete('history', old.key);
}

export async function listSnapshots(id: ID): Promise<Snapshot[]> {
  const all = await dbPrefix<Song>('history', id + ':');
  return all.map(({ key, value }) => ({ key, at: value.updatedAt, song: value })).reverse();
}

export async function forceSnapshot(song: Song): Promise<void> {
  lastSnap.set(song.id, Date.now());
  await dbPut('history', keyFor(song.id, Date.now()), song);
}

export async function dropHistory(id: ID): Promise<void> {
  for (const s of await dbPrefix<Song>('history', id + ':')) await dbDelete('history', s.key);
}

function hasWords(s: Song): boolean {
  if (s.roll.text.trim()) return true;
  return s.sections.some((sec) => sec.takes.some((t) => t.lines.some((l) => l.text.trim())));
}
