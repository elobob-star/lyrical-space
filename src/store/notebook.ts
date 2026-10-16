// The notebook: pages of rambling that belong to no song. It is the home surface.
import { computed, effect, signal } from '@preact/signals';
import { produce } from 'immer';
import { dbAll, dbPut, kvGet, kvSet } from './db';
import { ID, Mark, Page, Song, uid } from './models';
import { cleanRange, tidyPhrase } from './actions';
import { addScrap } from './state';

export const pages = signal<Page[]>([]); // ascending by page number
export const pageId = signal<ID | null>(null);
export const currentPage = computed(() => pages.value.find((p) => p.id === pageId.value) ?? pages.value[pages.value.length - 1] ?? null);
export const latestPage = computed(() => pages.value[pages.value.length - 1] ?? null);

/** Coming back after this long (or on another day) opens a fresh page. */
export const IDLE_MS = 45 * 60_000;

export const hasWords = (p: Page | null | undefined) => !!p && /\S/.test(p.text);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** A page you'd come back to cold: it has words, and it's been a while (or it's a new day). */
export function isStale(p: Page, now = Date.now()): boolean {
  return hasWords(p) && (now - p.updatedAt > IDLE_MS || !sameDay(p.updatedAt, now));
}

export function blankPage(n: number, now = Date.now()): Page {
  return { id: uid(), n, createdAt: now, updatedAt: now, text: '', marks: [] };
}

/** MK-I kept a freewrite roll inside every song; MK-II turns each one into a notebook page, oldest first. */
export function pagesFromSongs(songs: Song[]): Page[] {
  return songs
    .filter((s) => !s.deletedAt && /\S/.test(s.roll?.text ?? ''))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s, i) => ({
      id: uid(), n: i + 1, createdAt: s.createdAt, updatedAt: s.updatedAt,
      text: s.roll.text, marks: JSON.parse(JSON.stringify(s.roll.marks ?? [])) as Mark[], spark: s.roll.spark, fromSong: s.title,
    }));
}

const WELCOME =
  'This is the notebook. It belongs to no song, so just ramble.\n\n' +
  'Backspace never erases a finished word here: it strikes it through, and nothing is lost. ' +
  'Come back after a break and there is a fresh page waiting; the old ones are a flip back.\n\n' +
  'Flip the LATCH to go forward only. Later, pick up the PEN, tap the lines worth keeping and PUNCH them into the shoebox.\n';

// ---------- mutations ----------
export function updatePage(id: ID, recipe: (d: Page) => void): void {
  pages.value = pages.value.map((p) => (p.id === id ? produce(p, (d) => { recipe(d); d.updatedAt = Date.now(); }) : p));
}

/** Start a new page (or stay on the current one if it's still blank). */
export function turnPage(): Page {
  const last = latestPage.peek();
  if (last && !hasWords(last) && !last.spark) { pageId.value = last.id; return last; }
  const p = blankPage((last?.n ?? 0) + 1);
  pages.value = [...pages.value, p];
  pageId.value = p.id;
  return p;
}

/** On open / return: a stale last page gets a fresh one after it. Returns true if a new page was started. */
export function ensureFreshPage(now = Date.now()): boolean {
  const last = latestPage.peek();
  if (!last) { const p = blankPage(1, now); pages.value = [p]; pageId.value = p.id; return true; }
  if (!isStale(last, now)) return false;
  turnPage();
  return true;
}

export function flip(dir: -1 | 1): Page | null {
  const list = pages.peek();
  const i = list.findIndex((p) => p.id === currentPage.peek()?.id);
  const next = list[i + dir];
  if (!next) return null;
  pageId.value = next.id;
  return next;
}

/** Every un-punched pen mark on the page becomes a scrap in the shoebox. Returns the new scraps' ids. */
export function punchPage(p: Page): ID[] {
  const pending = p.marks.filter((m) => m.kind === 'pencil' && !m.punched);
  const ids: ID[] = [];
  for (const m of pending) {
    const t = tidyPhrase(cleanRange(p.text, p.marks, m.s, m.e)).slice(0, 240);
    const sc = t ? addScrap(t, 'roll', undefined, { page: p.n }) : null;
    if (sc) ids.push(sc.id);
  }
  if (pending.length) updatePage(p.id, (d) => { for (const m of d.marks) if (m.kind === 'pencil' && !m.punched) m.punched = true; });
  return ids;
}

export const pendingMarks = (p: Page | null) => (p ? p.marks.filter((m) => m.kind === 'pencil' && !m.punched).length : 0);

// ---------- persistence ----------
const saved = new Map<ID, Page>();
let timer: ReturnType<typeof setTimeout> | undefined;

function flushDirty(): void {
  for (const p of pages.peek()) if (saved.get(p.id) !== p) { saved.set(p.id, p); void dbPut('pages', p.id, p); }
}
export function flushPages(): void { clearTimeout(timer); flushDirty(); }

export async function loadNotebook(songs: Song[], freshInstall: boolean): Promise<void> {
  let list = await dbAll<Page>('pages');
  const started = await kvGet<boolean>('notebook');
  if (!started) {
    list = freshInstall ? [] : pagesFromSongs(songs);
    if (!list.length && freshInstall) list = [{ ...blankPage(1), text: WELCOME }];
    for (const p of list) void dbPut('pages', p.id, p);
    void kvSet('notebook', true);
  }
  list.sort((a, b) => a.n - b.n);
  list.forEach((p) => saved.set(p.id, p));
  pages.value = list;
  // opening the app always lands on the newest page (a fresh one, after a break)
  pageId.value = list[list.length - 1]?.id ?? null;
  ensureFreshPage();

  effect(() => {
    const l = pages.value;
    if (l.every((p) => saved.get(p.id) === p)) return;
    clearTimeout(timer);
    timer = setTimeout(flushDirty, 400);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPages();
    else if (ensureFreshPage()) onFreshPage?.();
  });
}

/** set by the UI to say something when a fresh page appears on return */
export let onFreshPage: (() => void) | null = null;
export function setOnFreshPage(f: () => void): void { onFreshPage = f; }

export function mergePages(incoming: Page[]): number {
  const known = new Set(pages.peek().map((p) => p.id));
  let n = latestPage.peek()?.n ?? 0;
  const add = incoming.filter((p) => !known.has(p.id)).sort((a, b) => a.n - b.n).map((p) => ({ ...p, n: ++n }));
  if (add.length) pages.value = [...pages.peek(), ...add];
  return add.length;
}
