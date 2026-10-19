import { computed, effect, signal } from '@preact/signals';
import { produce, setAutoFreeze } from 'immer';
import { dbAll, dbDelete, dbGet, dbPut, kvGet, kvSet, persistRequest } from './db';
import {
  DEFAULT_SETTINGS, ID, Page, Scrap, ScrapFrom, Settings, Song, newSong, normalizeScrap, uid,
} from './models';
import { seedScraps, seedSong } from './seed';
import { dropHistory, forceSnapshot, maybeSnapshot } from './history';
import { flushPages, loadNotebook, mergePages, pages, upsertPages } from './notebook';
import { version } from '../../package.json';

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
  delete copy.deletedAt;
  songs.value = [copy, ...songs.value];
}

/** Put an old version back. The current state is snapshotted first, so restoring is itself undoable. */
export async function restoreVersion(old: Song, asCopy: boolean): Promise<ID> {
  const cur = songs.value.find((s) => s.id === old.id);
  if (asCopy || !cur) {
    const copy: Song = JSON.parse(JSON.stringify(old));
    copy.id = uid();
    copy.title = old.title + ' (' + new Date(old.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase() + ')';
    copy.createdAt = copy.updatedAt = Date.now();
    copy.memos = [];
    delete copy.deletedAt;
    songs.value = [copy, ...songs.value];
    return copy.id;
  }
  await forceSnapshot(cur);
  const back: Song = JSON.parse(JSON.stringify(old));
  back.memos = cur.memos; // audio lives outside the snapshot
  delete back.deletedAt;
  back.updatedAt = Date.now();
  songs.value = songs.value.map((s) => (s.id === old.id ? back : s));
  return back.id;
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
  await dropHistory(id);
}

// ---------- the Shoebox: one pile for every stray line ----------
export function addScrap(text: string, from: ScrapFrom, songId?: ID, extra: Partial<Scrap> = {}): Scrap | null {
  const t = text.trim();
  if (!t) return null;
  const s: Scrap = { id: uid(), text: t, from, createdAt: Date.now(), songId, used: 0, ...extra };
  scraps.value = [s, ...scraps.value];
  return s;
}
export function putBackScrap(s: Scrap): void {
  if (!scraps.value.some((x) => x.id === s.id)) scraps.value = [s, ...scraps.value];
}
export function updateScrap(id: ID, patch: Partial<Scrap>): void {
  scraps.value = scraps.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}
export function removeScrap(id: ID): void {
  scraps.value = scraps.value.filter((s) => s.id !== id);
  void dbDelete('scraps', id);
}

/** Pull scraps out of the Shoebox at random, least-used first, never the one you just saw. */
export function drawScraps(n: number, avoid: string[] = []): Scrap[] {
  const pool = scraps.value.filter((s) => !avoid.includes(s.text));
  const src = pool.length ? pool : scraps.value;
  const out: Scrap[] = [];
  const left = [...src];
  while (out.length < n && left.length) {
    const least = Math.min(...left.map((s) => s.used));
    const tier = left.filter((s) => s.used <= least + 1);
    const pick = tier[Math.floor(Math.random() * tier.length)];
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  out.forEach((p) => updateScrap(p.id, { used: p.used + 1 }));
  return out;
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

/** What a fresh install starts with (the sample tape, the welcome page, the sample scraps) — so it can make way for real work. */
interface SeedMark { at: number; songs: Record<ID, number>; scraps: ID[]; pages: Record<ID, string> }
let seedMark: SeedMark | null = null;

/** Nothing here yet but what the app came with, untouched: picking up a folder or a copy may simply replace it. */
export function isFreshInstall(): boolean {
  const m = seedMark;
  if (!m) return false;
  return songs.value.every((s) => m.songs[s.id] === s.updatedAt)
    && scraps.value.every((s) => m.scraps.includes(s.id))
    && pages.value.every((p) => (!/\S/.test(p.text) && !p.spark) || m.pages[p.id] === p.text);
}

function flushSong(s: Song): void {
  const prev = savedRefs.get(s.id);
  if (prev && prev !== s) void maybeSnapshot(prev);
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
  flushPages();
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
  for (const s of loaded.filter((x) => x.deletedAt && x.deletedAt < cutoff)) { void dbDelete('songs', s.id); void dropHistory(s.id); }
  loaded = loaded.filter((x) => !(x.deletedAt && x.deletedAt < cutoff));
  loaded.sort((a, b) => b.updatedAt - a.updatedAt);
  loaded.forEach((s) => savedRefs.set(s.id, s));
  loadedScraps = loadedScraps.map((s) => {
    const n = normalizeScrap(s);
    if (n === s) savedScraps.set(s.id, s); // migrated scraps get re-saved by the effect below
    return n;
  });
  songs.value = loaded;
  scraps.value = loadedScraps.sort((a, b) => b.createdAt - a.createdAt);
  migrateSongs();
  if (st) settings.value = { ...DEFAULT_SETTINGS, ...st };
  const live = loaded.filter((s) => !s.deletedAt);
  currentId.value = live.find((s) => s.id === meta?.currentId)?.id ?? live[0]?.id ?? null;
  if (!currentId.value) createSong();
  // the app always opens on the notebook
  mode.value = 'roll';
  const fresh = !onboarded && !dbSongs.length && !dbScraps.length;
  await loadNotebook(loaded, fresh);
  if (loaded.length && !onboarded) void kvSet('seeded', true);
  if (fresh) {
    seedMark = {
      at: Date.now(), songs: Object.fromEntries(loaded.map((s) => [s.id, s.updatedAt])),
      scraps: loadedScraps.map((s) => s.id), pages: Object.fromEntries(pages.peek().map((p) => [p.id, p.text])),
    };
    void kvSet('seed', seedMark);
  } else seedMark = (await kvGet<SeedMark>('seed')) ?? null;
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

/** Older builds stored strips/lines with handwriting-only fields; nothing to fix yet — hook for future migrations. */
function migrateSongs(): void { /* v0.2: schema compatible */ }

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

/**
 * Everything, as one plain object: the format of the folder's foolscap-library.json and of a saved copy
 * (documented in docs/FORMAT.md — anything that reads it can pick up where this app left off).
 */
export function libraryData(): { app: 'portascribe'; format: 'foolscap-library'; schema: number; version: number; appVersion: string; savedAt: string; songs: Song[]; scraps: Scrap[]; pages: Page[]; settings: Settings } {
  // the file marker stays 'portascribe' so copies move freely between this app and the earlier MK-I build
  return {
    app: 'portascribe', format: 'foolscap-library', schema: 4, version: 3, appVersion: version, savedAt: new Date().toISOString(),
    songs: songs.peek(), scraps: scraps.peek(), pages: pages.peek(), settings: settings.peek(),
  };
}

/** Whole library as one JSON file — including voice memos (base64). */
export async function backupAll(): Promise<string> {
  const data = libraryData();
  const blobs: Record<string, string> = {};
  for (const s of data.songs) for (const m of s.memos) {
    const b = await dbGet<Blob>('blobs', m.id);
    if (b) blobs[m.id] = await blobToDataUrl(b);
  }
  return JSON.stringify({ ...data, exportedAt: data.savedAt, blobs });
}

export const isLibrary = (data: any): boolean => !!data && (data.app === 'portascribe' || data.format === 'foolscap-library') && Array.isArray(data.songs);

/**
 * Pick up a library (from the folder, after a reinstall or from another app that shares it). Everything is matched by
 * id and the newer version of each song and page wins, so picking up the same folder twice never doubles anything.
 * On a fresh install the sample tape and welcome page simply make way.
 */
export function pickUpLibrary(data: any, replace: boolean): { songs: number; scraps: number; pages: number } {
  const inSongs: Song[] = Array.isArray(data?.songs) ? data.songs : [];
  const inScraps: Scrap[] = (Array.isArray(data?.scraps) ? data.scraps : []).map(normalizeScrap);
  const inPages: Page[] = Array.isArray(data?.pages) ? data.pages : [];
  const n = { songs: 0, scraps: 0, pages: 0 };
  if (replace) {
    for (const s of songs.peek()) if (!inSongs.some((x) => x.id === s.id)) { savedRefs.delete(s.id); void dbDelete('songs', s.id); void dropHistory(s.id); }
    for (const s of scraps.peek()) if (!inScraps.some((x) => x.id === s.id)) { savedScraps.delete(s.id); void dbDelete('scraps', s.id); }
  }
  const list = replace ? [] : [...songs.peek()];
  for (const s of inSongs) {
    const i = list.findIndex((x) => x.id === s.id);
    if (i < 0) { list.push(s); n.songs++; } else if ((s.updatedAt ?? 0) > list[i].updatedAt) { list[i] = s; n.songs++; }
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  songs.value = list;
  const sc = replace ? [] : [...scraps.peek()];
  for (const s of inScraps) if (!sc.some((x) => x.id === s.id)) { sc.push(s); n.scraps++; }
  scraps.value = sc.sort((a, b) => b.createdAt - a.createdAt);
  n.pages = upsertPages(inPages, replace);
  if (replace && data?.settings) settings.value = { ...DEFAULT_SETTINGS, ...data.settings };
  const live = list.filter((s) => !s.deletedAt);
  if (replace || !live.some((s) => s.id === currentId.peek())) currentId.value = live[0]?.id ?? null;
  if (!currentId.value) createSong();
  if (replace) { seedMark = null; void kvSet('seed', null); }
  return n;
}

/** Merge a backup into the library. */
export async function importBackup(json: string): Promise<{ songs: number; scraps: number; pages: number }> {
  const data = JSON.parse(json);
  if (!isLibrary(data)) throw new Error('Not a Foolscap backup');
  const blobs0: Record<string, string> = data.blobs ?? {};
  // on a fresh install a saved copy simply becomes the library
  if (isFreshInstall()) {
    for (const [id, url] of Object.entries(blobs0)) {
      try { await dbPut('blobs', id, await (await fetch(url)).blob()); } catch { /* skip a bad memo */ }
    }
    return pickUpLibrary(data, true);
  }
  const inSongs: Song[] = data.songs ?? [];
  const inScraps: Scrap[] = (data.scraps ?? []).map(normalizeScrap);
  const blobs: Record<string, string> = data.blobs ?? {};
  for (const [id, url] of Object.entries(blobs)) {
    try { await dbPut('blobs', id, await (await fetch(url)).blob()); } catch { /* skip a bad memo */ }
  }
  const known = new Map(songs.value.map((s) => [s.id, s]));
  const merged = [...songs.value];
  for (const s of inSongs) {
    const have = known.get(s.id);
    if (have && have.updatedAt === s.updatedAt) continue; // that very version is already here
    if (have) s.id = uid(); // a different version of a song you have: it comes in alongside, as its own tape
    merged.push(s);
  }
  songs.value = merged;
  const knownScrap = new Set(scraps.value.map((s) => s.id));
  scraps.value = [...scraps.value, ...inScraps.filter((s) => !knownScrap.has(s.id))];
  const nPages = mergePages(Array.isArray(data.pages) ? data.pages : []);
  return { songs: inSongs.length, scraps: inScraps.length, pages: nPages };
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
