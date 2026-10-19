import { beforeEach, describe, expect, it } from 'vitest';
import { libraryData, pickUpLibrary, scraps, songs } from './state';
import { blankPage, pages, pageId } from './notebook';
import { newSong } from './models';

const page = (n: number, text: string, updatedAt = 1000) => ({ ...blankPage(n, updatedAt), text, updatedAt });

beforeEach(() => {
  songs.value = [];
  scraps.value = [];
  pages.value = [];
  pageId.value = null;
});

describe('picking up a library (the folder)', () => {
  it('matches by id: the newer song and page win, nothing is doubled', () => {
    const s = { ...newSong('MINE'), updatedAt: 5000 };
    const p1 = page(1, 'old words', 1000);
    songs.value = [s];
    pages.value = [p1];
    const incoming = {
      app: 'portascribe', songs: [{ ...s, title: 'NEWER', updatedAt: 9000 }],
      pages: [{ ...p1, text: 'newer words', updatedAt: 2000 }, page(1, 'a page from elsewhere', 3000)], scraps: [],
    };
    pickUpLibrary(incoming, false);
    pickUpLibrary(incoming, false); // the same folder twice
    expect(songs.value.map((x) => x.title)).toEqual(['NEWER']);
    expect(pages.value.map((p) => p.text)).toEqual(['newer words', 'a page from elsewhere']);
    expect(pages.value.map((p) => p.n)).toEqual([1, 2]);
  });

  it('keeps the local version when it is the newer one', () => {
    const s = { ...newSong('LOCAL'), updatedAt: 9000 };
    songs.value = [s];
    pickUpLibrary({ app: 'portascribe', songs: [{ ...s, title: 'STALE', updatedAt: 1000 }], pages: [], scraps: [] }, false);
    expect(songs.value[0].title).toBe('LOCAL');
  });

  it('on a fresh install the incoming library simply replaces the sample', () => {
    songs.value = [newSong('SAMPLE TAPE')];
    pages.value = [page(1, 'welcome', 1000)];
    const mine = newSong('MY SONG');
    pickUpLibrary({ app: 'portascribe', songs: [mine], pages: [page(7, 'my page seven', Date.now())], scraps: [{ id: 'x', text: 'a scrap', from: 'catch', createdAt: 1, used: 0 }] }, true);
    expect(songs.value.map((x) => x.title)).toEqual(['MY SONG']);
    expect(pages.value[0].text).toBe('my page seven');
    expect(pages.value[0].n).toBe(7);
    expect(scraps.value.map((x) => x.text)).toEqual(['a scrap']);
  });

  it('what is written out reads back the same', () => {
    songs.value = [newSong('ROUND TRIP')];
    pages.value = [page(1, 'there and back', Date.now())];
    const data = JSON.parse(JSON.stringify(libraryData()));
    expect(data.format).toBe('foolscap-library');
    songs.value = [];
    pages.value = [];
    pickUpLibrary(data, false);
    expect(songs.value[0].title).toBe('ROUND TRIP');
    expect(pages.value[0].text).toBe('there and back');
  });
});
