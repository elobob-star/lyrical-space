import { describe, expect, it } from 'vitest';
import { IDLE_MS, blankPage, ensureFreshPage, isStale, pages, pageId, pagesFromSongs, turnPage, flip, currentPage, punchPage, updatePage } from './notebook';
import { newSong } from './models';
import { scraps } from './state';

const H = 3_600_000;

describe('notebook pages', () => {
  it('a page goes stale after a break or overnight, but only if it has words', () => {
    const now = new Date('2026-10-16T15:00:00').getTime();
    const p = { ...blankPage(1, now - 10 * 60_000), text: 'some words' };
    expect(isStale(p, now)).toBe(false);
    expect(isStale({ ...p, updatedAt: now - IDLE_MS - 1 }, now)).toBe(true);
    expect(isStale({ ...p, text: '   \n ' , updatedAt: now - 5 * H }, now)).toBe(false);
    const lateLastNight = new Date('2026-10-15T23:50:00').getTime();
    expect(isStale({ ...p, updatedAt: lateLastNight }, new Date('2026-10-16T00:10:00').getTime())).toBe(true);
  });

  it('opens a fresh page after a break and keeps the old one a flip back', () => {
    const old = { ...blankPage(1, Date.now() - 5 * H), text: 'yesterday rambling' };
    pages.value = [old];
    pageId.value = old.id;
    expect(ensureFreshPage()).toBe(true);
    expect(pages.value.length).toBe(2);
    expect(currentPage.value!.n).toBe(2);
    expect(currentPage.value!.text).toBe('');
    // a blank page is reused, never stacked
    expect(ensureFreshPage()).toBe(false);
    expect(turnPage().n).toBe(2);
    expect(pages.value.length).toBe(2);
    expect(flip(-1)!.id).toBe(old.id);
    expect(flip(-1)).toBeNull();
  });

  it('turns MK-I song rolls into pages, oldest first, marks intact', () => {
    const a = newSong('FIRST'); a.createdAt = 100; a.roll.text = 'first roll'; a.roll.marks = [{ id: 'm', s: 0, e: 5, kind: 'pencil' }];
    const b = newSong('SECOND'); b.createdAt = 200; b.roll.text = 'second roll';
    const c = newSong('EMPTY'); c.createdAt = 50;
    const got = pagesFromSongs([b, c, a]);
    expect(got.map((p) => [p.n, p.text, p.fromSong])).toEqual([[1, 'first roll', 'FIRST'], [2, 'second roll', 'SECOND']]);
    expect(got[0].marks).toEqual(a.roll.marks);
    expect(got[0].marks).not.toBe(a.roll.marks);
  });

  it('PUNCH files marked phrases into the shoebox, without the struck-out ink', () => {
    const p = { ...blankPage(7), text: 'keep the wrold world light on low', marks: [] as any[] };
    pages.value = [p];
    pageId.value = p.id;
    updatePage(p.id, (d) => { d.marks = [{ id: 'g', s: 9, e: 15, kind: 'ghost' }, { id: 'k', s: 0, e: 33, kind: 'pencil' }]; });
    scraps.value = [];
    const ids = punchPage(currentPage.value!);
    expect(ids.length).toBe(1);
    expect(scraps.value[0]).toMatchObject({ text: 'keep the world light on low', from: 'roll', page: 7 });
    expect(currentPage.value!.marks.find((m) => m.id === 'k')!.punched).toBe(true);
  });
});
