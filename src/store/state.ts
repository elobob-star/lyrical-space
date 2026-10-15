import { computed, effect, signal } from '@preact/signals';
import { produce, setAutoFreeze } from 'immer';
import { dbAll, dbDelete, dbGet, dbPut, kvGet, kvSet, persistRequest } from './db';
import {
  DEFAULT_SETTINGS, ID, Scrap, Settings, Song, newSong, uid,
} from './models';
import { seedScraps, seedSong } from './seed';

setAutoFreeze(false);

export type Mode = 'roll' | 'table' | 'bench';

export const songs = signal<Song[]>([]);
export const scraps = signal<Scrap[]>([]);
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const currentId = signal<ID | null>(null);
export const mode = signal<Mode>('roll');
export const ready = signal(false);
export const saving = signal(false);

export const liveSongs = computed(() => songs.value.filter((s) => !s.deletedAt));
export const currentSong = computed(() => liveSongs.value.find((s) => s.id === currentId.value) ?? null);

// ---------- song mutations ----------
export function updateSong(id: ID, recipe: (draft: Song) => void): void {
  songs.value = songs.value.map((s) =>
    s.id === id ? produce(s, (d) => { recipe(d); d.updatedAt = Date.now(); }) : s,
  );
}
export function updateCurrent(recipe: (draft: Song) => void): void {
  if (currentId.value) updateSong(currentId.value, recipe);
}

export function createSong(title = 'UNTITLED'): Song {
  const song = newSong(title);
  songs.value = [song, ...songs.value];
  currentId.value = song.id;
  mode.value = 'roll';
  return song;
}

export function duplicateSong(id: ID): void {
  const src = songs.value.find((s) => s.id === id);
  if (!src) return;
  const copy: Song = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.title = src.title + ' (COPY)';
  copy.createdAt = copy.updatedAt = Date.now();
  copy.memos = [];
  songs.value = [copy, ...songs.value];
}

export function binSong(id: ID): void {
  updateSong(id, (d) => { d.deletedAt = Date.now(); });
  if (currentId.value === id) currentId.value = liveSongs.value[0]?.id ?? null;
}
export function restoreSong(id: ID): void {
  updateSong(id, (d) => { delete d.deletedAt; });
}
export async function purgeSong(id: ID): Promise<void> {
  const s = songs.value.find((x) => x.id === id);
  songs.value = songs.value.filter((x) => x.id !== id);
  s?.memos.forEach((m) => void dbDelete('blobs', m.id));
  await dbDelete('songs', id);
}

// ---------- scraps (shoebox + boneyard) ----------
export function addScrap(text: string, kind: Scrap['kind'], songId?: ID): Scrap | null {
  const t = text.trim();
  if (!t) return null;
  const s: Scrap = { id: uid(), text: t, kind, createdAt: Date.now(), songId, used: 0 };
  scraps.value = [s, ...scraps.value];
  return s;
}
export function updateScrap(id: ID, patch: Partial<Scrap>): void {
  scraps.value = scraps.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}
export function removeScrap(id: ID): void {
  scraps.value = scraps.value.filter((s) => s.id !== id);
  void dbDelete('scraps', id);
}

export function drawSpark(): Scrap | null {
  const sparks = scraps.value.filter((s) => s.kind === 'spark');
  if (!sparks.length) return null;
  const least = Math.min(...sparks.map((s) => s.used));
  const pool = sparks.filter((s) => s.used === least);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  updateScrap(pick.id, { used: pick.used + 1 });
  return pick;
}

// ---------- settings ----------
export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
  settings.value = { ...settings.value, [k]: v };
}

// ---------- persistence ----------
const savedRefs = new Map<ID, Song>();
const savedScraps = new Map<ID, Scrap>();
const timers = new Map<ID, ReturnType<typeof setTimeout>>();
let scrapTimer: ReturnType<typeof setTimeout> | undefined;
let booted = false;

function flushSong(s: Song): void {
  savedRefs.set(s.id, s);
  saving.value = true;
  dbPut('songs', s.id, s).finally(() => { saving.value = false; });
}

export function flushAll(): void {
  for (const [id, t] of timers) { clearTimeout(t); timers.delete(id); }
  for (const s of songs.value) if (savedRefs.get(s.id) !== s) flushSong(s);
  clearTimeout(scrapTimer);
  for (const s of scraps.value) if (savedScraps.get(s.id) !== s) { savedScraps.set(s.id, s); void dbPut('scraps', s.id, s); }
  void kvSet('settings', settings.value);
  void kvSet('meta', { currentId: currentId.value, mode: mode.value });
}

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  const [dbSongs, dbScraps, st, meta, onboarded] = await Promise.all([
    dbAll<Song>('songs'), dbAll<Scrap>('scraps'),
    kvGet<Settings>('settings'), kvGet<{ currentId: ID | null; mode: Mode }>('meta'),
    kvGet<boolean>('seeded'),
  ]);
  let loaded = dbSongs;
  let loadedScraps = dbScraps;
  if (!onboarded && !loaded.length && !loadedScraps.length) {
    loaded = [seedSong()];
    loadedScraps = seedScraps();
    void kvSet('seeded', true);
  }
  // the Bin keeps deleted tapes for 30 days
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const s of loaded.filter((x) => x.deletedAt && x.deletedAt < cutoff)) void dbDelete('songs', s.id);
  loaded = loaded.filter((x) => !(x.deletedAt && x.deletedAt < cutoff));
  loaded.sort((a, b) => b.updatedAt - a.updatedAt);
  loaded.forEach((s) => savedRefs.set(s.id, s));
  loadedScraps.forEach((s) => savedScraps.set(s.id, s));
  songs.value = loaded;
  scraps.value = loadedScraps.sort((a, b) => b.createdAt - a.createdAt);
  if (st) settings.value = { ...DEFAULT_SETTINGS, ...st };
  const live = loaded.filter((s) => !s.deletedAt);
  currentId.value = live.find((s) => s.id === meta?.currentId)?.id ?? live[0]?.id ?? null;
  if (!currentId.value) createSong();
  mode.value = meta?.mode ?? 'roll';
  if (loaded.length && !onboarded) void kvSet('seeded', true);
  void persistRequest();
  ready.value = true;

  effect(() => {
    const list = songs.value;
    for (const s of list) {
      if (savedRefs.get(s.id) === s || timers.has(s.id)) continue;
      timers.set(s.id, setTimeout(() => {
        timers.delete(s.id);
        const latest = songs.peek().find((x) => x.id === s.id);
        if (latest && savedRefs.get(latest.id) !== latest) flushSong(latest);
      }, 450));
    }
  });
  effect(() => {
    const list = scraps.value;
    if (list.every((s) => savedScraps.get(s.id) === s) && savedScraps.size === list.length) return;
    clearTimeout(scrapTimer);
    scrapTimer = setTimeout(() => {
      for (const s of scraps.peek()) if (savedScraps.get(s.id) !== s) { savedScraps.set(s.id, s); void dbPut('scraps', s.id, s); }
    }, 300);
  });
  effect(() => { void kvSet('settings', settings.value); });
  effect(() => { void kvSet('meta', { currentId: currentId.value, mode: mode.value }); });

  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
}

/** Replace the whole library (backup restore). */
export async function importBackup(json: string): Promise<{ songs: number; scraps: number }> {
  const data = JSON.parse(json);
  if (data?.app !== 'portascribe') throw new Error('Not a Portascribe backup');
  const inSongs: Song[] = data.songs ?? [];
  const inScraps: Scrap[] = data.scraps ?? [];
  const known = new Set(songs.value.map((s) => s.id));
  const merged = [...songs.value];
  for (const s of inSongs) {
    if (known.has(s.id)) s.id = uid();
    merged.push(s);
  }
  songs.value = merged;
  const knownScrap = new Set(scraps.value.map((s) => s.id));
  scraps.value = [...scraps.value, ...inScraps.filter((s) => !knownScrap.has(s.id))];
  return { songs: inSongs.length, scraps: inScraps.length };
}

export async function loadBlob(id: ID): Promise<Blob | undefined> {
  return dbGet<Blob>('blobs', id);
}
export async function saveBlob(id: ID, b: Blob): Promise<void> {
  await dbPut('blobs', id, b);
}
export async function deleteBlob(id: ID): Promise<void> {
  await dbDelete('blobs', id);
}
