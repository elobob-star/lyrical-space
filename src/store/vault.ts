// The writer's own folder. Everything in Foolscap is mirrored into a folder they chose, as plain files, so the work
// outlives the app: delete it, install it again — or a whole new version of it — pick the same folder, and it all
// comes back. On Android the folder is a real one (Documents/Foolscap); in a browser that can open folders
// (Chrome) it is too; where neither is possible (Safari on iPhone) the app nudges you to save a copy now and then.
// The files are documented in docs/FORMAT.md.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { effect, signal } from '@preact/signals';
import { kvGet, kvSet } from './db';
import { Song, Page, Scrap } from './models';
import { backupAll, isFreshInstall, isLibrary, libraryData, loadBlob, pickUpLibrary, saveBlob, scraps, settings, songs } from './state';
import { pages } from './notebook';
import { lcdMsg, say } from './ui';
import { cleanText } from '../engine/ink';
import { roughSlug, songToText } from '../engine/export';
import { shareFile, toBase64 } from '../engine/share';

export type FolderKind = 'native' | 'browser' | 'none';
export interface FolderState {
  /** what this device can do: a real folder (Android app / Chrome) or only saved copies (Safari) */
  kind: FolderKind;
  linked: boolean;
  name?: string;
  /** last time everything was written to the folder */
  at?: number;
  /** the folder is remembered but needs to be allowed again */
  reconnect?: boolean;
  err?: string;
  /** last time a copy was saved by hand */
  lastCopy?: number;
}
export const folder = signal<FolderState>({ kind: 'none', linked: false });
/** the "been here before?" slip on a fresh install was put away */
export const pickupOff = signal(false);
export function dismissPickup(): void { pickupOff.value = true; void kvSet('pickup-off', true); }

export const LIB = 'foolscap-library.json';

interface Driver {
  write(path: string, data: string | Blob): Promise<void>;
  read(path: string): Promise<string | null>;
  readBlob(path: string, type: string): Promise<Blob | null>;
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
}

// ---------- Android: a Storage Access Framework folder kept with a lasting permission (FolderPlugin.java) ----------
interface FolderPlugin {
  pick(): Promise<{ name: string }>;
  info(): Promise<{ ok: boolean; name?: string }>;
  forget(): Promise<void>;
  write(o: { path: string; data: string; base64?: boolean }): Promise<void>;
  read(o: { path: string; base64?: boolean }): Promise<{ data: string | null }>;
  list(o: { path: string }): Promise<{ names: string[] }>;
  remove(o: { path: string }): Promise<void>;
}
const Native = registerPlugin<FolderPlugin>('FoolscapFolder');
const nativeDriver: Driver = {
  write: async (path, data) => (typeof data === 'string' ? Native.write({ path, data }) : Native.write({ path, data: await toBase64(data), base64: true })),
  read: async (path) => (await Native.read({ path })).data,
  readBlob: async (path, type) => {
    const d = (await Native.read({ path, base64: true })).data;
    return d ? new Blob([Uint8Array.from(atob(d), (c) => c.charCodeAt(0))], { type }) : null;
  },
  list: async (path) => (await Native.list({ path })).names,
  remove: (path) => Native.remove({ path }),
};

// ---------- a browser that can open folders (File System Access) ----------
function browserDriver(root: any): Driver {
  const split = (path: string) => { const p = path.split('/').filter(Boolean); return { dirs: p.slice(0, -1), name: p[p.length - 1] }; };
  const dir = async (parts: string[], create: boolean) => { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; };
  const file = async (path: string): Promise<File | null> => {
    try { const { dirs, name } = split(path); return await (await (await dir(dirs, false)).getFileHandle(name)).getFile(); } catch { return null; }
  };
  return {
    async write(path, data) {
      const { dirs, name } = split(path);
      const fh = await (await dir(dirs, true)).getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
    },
    read: async (path) => (await file(path))?.text() ?? null,
    readBlob: async (path, type) => { const f = await file(path); return f ? new Blob([await f.arrayBuffer()], { type }) : null; },
    async list(path) {
      try { const d = await dir(path.split('/').filter(Boolean), false); const out: string[] = []; for await (const k of d.keys()) out.push(k); return out; } catch { return []; }
    },
    async remove(path) { try { const { dirs, name } = split(path); await (await dir(dirs, false)).removeEntry(name); } catch { /* already gone */ } },
  };
}

// ---------------------------------------------------------------------------------------------------------------
interface Saved { name: string; base: string; handle?: unknown }
let drv: Driver | null = null;
let base = '';
let saved: Saved | null = null;
/** what was last written, so an unchanged file is never written again */
let lastLib = '';
let hashes: Record<string, string> = {};
let memosDone = new Set<string>();
let copyDay = '';

const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
const memoExt = (mime: string) => (/mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm');
const parse = (raw: string | null): any => { try { const d = raw ? JSON.parse(raw) : null; return isLibrary(d) ? d : null; } catch { return null; } };

const README = `FOOLSCAP — your words, kept as plain files.

foolscap-library.json   everything: notebook pages, songs (sections, takes, chords), the shoebox, settings.
                        Foolscap reads this back: install the app again, choose this folder, and it all returns.
Copies/                 one dated copy of the library per day, the last 14 kept — in case anything goes wrong.
Notebook/               every notebook page as a text file (struck-out words left out).
Songs/                  every song as a text file, chords above the lines.
Shoebox.txt             every scrap in the shoebox, one per line.
Memos/                  voice memos, named by their id in the library.

The format is described in docs/FORMAT.md in the Foolscap source. Nothing here is sent anywhere.
`;

/** The human-readable side of the folder: one file per page and per song, plus the shoebox. */
function readable(data: { songs: Song[]; pages: Page[]; scraps: Scrap[] }): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of data.pages) {
    const t = cleanText(p.text, p.marks).replace(/[ \t]+$/gm, '').trim();
    if (!t) continue;
    out.set(`Notebook/p${String(p.n).padStart(4, '0')} ${new Date(p.createdAt).toLocaleDateString('sv')}.txt`, t + '\n');
  }
  const used = new Set<string>();
  for (const s of data.songs) {
    if (s.deletedAt) continue;
    let slug = roughSlug(s.title).slice(0, 60);
    if (used.has(slug)) slug += '-' + s.id.slice(-4);
    used.add(slug);
    out.set(`Songs/${slug}.txt`, songToText(s, { chords: 'over' }));
  }
  if (data.scraps.length) out.set('Shoebox.txt', data.scraps.map((s) => s.text.replace(/\n/g, ' / ')).join('\n') + '\n');
  return out;
}

let running = false, again = false;
/** Bring the folder up to date. Cheap when little has changed: only what differs is written. */
export async function syncFolder(): Promise<void> {
  if (!drv) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const data = libraryData();
    const json = JSON.stringify(data);
    if (json !== lastLib) { await drv.write(base + LIB, json); lastLib = json; }
    const day = today();
    if (copyDay !== day) {
      await drv.write(`${base}Copies/foolscap-library-${day}.json`, json);
      copyDay = day;
      void kvSet('folder-day', day);
      const old = (await drv.list(base + 'Copies')).filter((n) => /^foolscap-library-\d{4}-\d\d-\d\d\.json$/.test(n)).sort().reverse().slice(14);
      for (const n of old) await drv.remove(`${base}Copies/${n}`);
    }
    const files = readable(data);
    let changed = false;
    for (const [p, t] of files) {
      const h = hash(t);
      if (hashes[p] === h) continue;
      await drv.write(base + p, t);
      hashes[p] = h; changed = true;
    }
    // a renamed song or a burnt page leaves no stale file behind (only files this app wrote are ever removed)
    for (const p of Object.keys(hashes)) if (!files.has(p)) { await drv.remove(base + p); delete hashes[p]; changed = true; }
    if (changed) void kvSet('folder-hashes', hashes);
    let memos = false;
    for (const s of data.songs) for (const m of s.memos) {
      if (memosDone.has(m.id)) continue;
      const b = await loadBlob(m.id);
      if (b) await drv.write(`${base}Memos/${m.id}.${memoExt(m.mime)}`, b);
      memosDone.add(m.id); memos = true;
    }
    if (memos) void kvSet('folder-memos', [...memosDone]);
    folder.value = { ...folder.peek(), at: Date.now(), err: undefined, reconnect: false };
  } catch (e: any) {
    const lost = /NO_ACCESS|NO_FOLDER|NotAllowed|permission/i.test(String(e?.code ?? '') + String(e?.name ?? '') + String(e?.message ?? ''));
    if (lost) { drv = null; folder.value = { ...folder.peek(), reconnect: true }; say(`THE FOLDER ${saved?.name ? '“' + saved.name.toUpperCase() + '” ' : ''}NEEDS TO BE ALLOWED AGAIN — SETUP › LIBRARY`); }
    else if (!folder.peek().err) { folder.value = { ...folder.peek(), err: 'COULD NOT WRITE TO THE FOLDER' }; console.error('folder', e); }
  } finally {
    running = false;
    if (again) { again = false; schedule(); }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let firstDirty = 0;
/** a few seconds after the last change — but never more than 20 s behind while you keep writing */
function schedule(): void {
  if (!drv) return;
  const now = Date.now();
  firstDirty ||= now;
  clearTimeout(timer);
  timer = setTimeout(() => { firstDirty = 0; void syncFolder(); }, Math.max(0, Math.min(3000, firstDirty + 20000 - now)));
}

/** Read the folder's library (or, if that file is damaged, the newest dated copy) and merge it in. */
async function pickUp(): Promise<{ songs: number; scraps: number; pages: number } | null> {
  if (!drv) return null;
  let data = parse(await drv.read(base + LIB));
  if (!data) {
    const copies = (await drv.list(base + 'Copies')).filter((n) => /^foolscap-library-.*\.json$/.test(n)).sort().reverse();
    for (const c of copies) { data = parse(await drv.read(`${base}Copies/${c}`)); if (data) break; }
  }
  if (!data) return null;
  const r = pickUpLibrary(data, isFreshInstall());
  for (const s of data.songs as Song[]) for (const m of s.memos ?? []) {
    if (await loadBlob(m.id)) { memosDone.add(m.id); continue; }
    try { const b = await drv.readBlob(`${base}Memos/${m.id}.${memoExt(m.mime)}`, m.mime); if (b) { await saveBlob(m.id, b); memosDone.add(m.id); } } catch { /* the memo file is missing */ }
  }
  return r;
}

const counts = (r: { songs: number; scraps: number; pages: number }) =>
  [r.pages && `${r.pages} PAGE${r.pages > 1 ? 'S' : ''}`, r.songs && `${r.songs} TAPE${r.songs > 1 ? 'S' : ''}`, r.scraps && `${r.scraps} SCRAP${r.scraps > 1 ? 'S' : ''}`].filter(Boolean).join(' · ');

async function link(d: Driver, s: Saved): Promise<void> {
  drv = d; saved = s;
  // inside the chosen folder: use it as is if it is (or already holds) a Foolscap library, otherwise make a Foolscap folder in it
  const names = await d.list('');
  base = names.includes(LIB) || !names.length || /foolscap/i.test(s.name) ? '' : 'Foolscap/';
  s.base = base;
  void kvSet('folder', s);
  lastLib = ''; hashes = {}; memosDone = new Set(); copyDay = '';
  const r = await pickUp();
  await d.write(base + 'README.txt', README);
  folder.value = { ...folder.peek(), linked: true, name: s.name, reconnect: false, err: undefined };
  await syncFolder();
  const where = (s.name ? s.name.toUpperCase() : 'THE FOLDER') + (base ? ' › FOOLSCAP' : '');
  say(r && counts(r) ? `PICKED UP ${counts(r)} FROM ${where}` : `EVERYTHING IS NOW KEPT IN ${where} TOO`, undefined, 6000);
}

/** Choose (or change) the folder. Whatever is already in it is picked up first. */
export async function chooseFolder(): Promise<void> {
  const k = folder.peek().kind;
  try {
    if (k === 'native') {
      const r = await Native.pick();
      await link(nativeDriver, { name: r.name, base: '' });
    } else if (k === 'browser') {
      const h = await (window as any).showDirectoryPicker({ id: 'foolscap', mode: 'readwrite', startIn: 'documents' });
      await link(browserDriver(h), { name: h.name, base: '', handle: h });
    }
  } catch (e: any) {
    if (/CANCEL|AbortError/i.test(String(e?.code ?? '') + String(e?.name ?? ''))) return;
    console.error('folder', e);
    say('THAT FOLDER COULD NOT BE USED — TRY ANOTHER ONE');
  }
}

/** The folder is remembered but its permission lapsed: ask again (a browser) or choose it again (Android). */
export async function reconnectFolder(): Promise<void> {
  const k = folder.peek().kind;
  if (k === 'browser' && saved?.handle) {
    const h: any = saved.handle;
    if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') { await link(browserDriver(h), saved); return; }
  }
  await chooseFolder();
}

/** Stop mirroring (the files already in the folder stay where they are). */
export async function forgetFolder(): Promise<void> {
  if (folder.peek().kind === 'native') { try { await Native.forget(); } catch { /* nothing to forget */ } }
  drv = null; saved = null;
  void kvSet('folder', null);
  folder.value = { kind: folder.peek().kind, linked: false, lastCopy: folder.peek().lastCopy };
}

/** A copy of everything, handed to the share sheet (Files / iCloud / Drive / e-mail…). */
export async function saveCopy(): Promise<void> {
  say('PACKING A COPY OF EVERYTHING…');
  const json = await backupAll();
  const ok = await shareFile(`foolscap-${today()}.json`, new Blob([json], { type: 'application/json' }), 'Foolscap — a copy of everything');
  if (!ok) return;
  const at = Date.now();
  void kvSet('copy-at', at);
  folder.value = { ...folder.peek(), lastCopy: at };
}

let started = false;
export async function initFolder(): Promise<void> {
  if (started) return;
  started = true;
  const kind: FolderKind = Capacitor.isNativePlatform() ? (Capacitor.getPlatform() === 'android' ? 'native' : 'none')
    : typeof (window as any).showDirectoryPicker === 'function' ? 'browser' : 'none';
  const [s, h, m, day, lastCopy, off] = await Promise.all([
    kvGet<Saved>('folder'), kvGet<Record<string, string>>('folder-hashes'), kvGet<string[]>('folder-memos'), kvGet<string>('folder-day'), kvGet<number>('copy-at'), kvGet<boolean>('pickup-off'),
  ]);
  pickupOff.value = !!off;
  hashes = h ?? {}; memosDone = new Set(m ?? []); copyDay = day ?? '';
  folder.value = { kind, linked: false, lastCopy: lastCopy ?? undefined };
  if (s && kind !== 'none') {
    saved = s; base = s.base ?? '';
    let ok = false;
    try {
      if (kind === 'native') ok = (await Native.info()).ok;
      else ok = (await (s.handle as any)?.queryPermission?.({ mode: 'readwrite' })) === 'granted';
    } catch { ok = false; }
    folder.value = { ...folder.peek(), linked: true, name: s.name, reconnect: !ok };
    if (ok) {
      drv = kind === 'native' ? nativeDriver : browserDriver(s.handle);
      // first take in anything another copy of the app put there, then write — the folder is never overwritten by less
      try { const r = await pickUp(); if (r && counts(r)) say(`PICKED UP ${counts(r)} FROM THE FOLDER`); } catch (e) { console.error('folder', e); }
    }
  }

  let first = true;
  effect(() => {
    void songs.value; void scraps.value; void pages.value; void settings.value;
    if (first) { first = false; return; }
    schedule();
  });
  if (drv) void syncFolder();
  const flush = () => { if (document.visibilityState === 'hidden' && drv) { clearTimeout(timer); firstDirty = 0; void syncFolder(); } };
  document.addEventListener('visibilitychange', flush);
  setTimeout(nudge, 25_000);
}

/** Once a week at most: a gentle word if nothing outside the app holds your work yet. Never on your first day, never over another message. */
async function nudge(tries = 0): Promise<void> {
  const f = folder.peek();
  if (f.linked && !f.reconnect) return;
  if (isFreshInstall()) return;
  const since = Math.min(Date.now(), ...pages.peek().map((p) => p.createdAt), ...songs.peek().map((s) => s.createdAt));
  if (Date.now() - since < 86_400_000) return;
  if (lcdMsg.peek() || document.visibilityState !== 'visible') { if (tries < 20) setTimeout(() => void nudge(tries + 1), 15_000); return; }
  const newest = Math.max(0, ...songs.peek().map((s) => s.updatedAt), ...pages.peek().map((p) => p.updatedAt));
  if (f.lastCopy && f.lastCopy >= newest) return;
  const last = (await kvGet<number>('nudge-at')) ?? 0;
  if (Date.now() - last < 7 * 86_400_000) return;
  void kvSet('nudge-at', Date.now());
  if (f.reconnect) say('YOUR FOLDER NEEDS TO BE ALLOWED AGAIN', { label: 'ALLOW', run: () => void reconnectFolder() }, 9000);
  else if (f.kind === 'none') {
    const days = f.lastCopy ? Math.floor((Date.now() - f.lastCopy) / 86_400_000) : 0;
    say(f.lastCopy ? `${days} DAYS SINCE YOUR LAST COPY — SAVE ONE?` : 'ALL YOUR WORK LIVES ONLY IN THIS APP — SAVE A COPY?', { label: 'SAVE', run: () => void saveCopy() }, 9000);
  } else say('KEEP YOUR WORK IN A FOLDER, SO IT OUTLIVES THE APP?', { label: 'CHOOSE', run: () => void chooseFolder() }, 9000);
}
