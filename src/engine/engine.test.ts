import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCmuText, lookup } from './cmu';
import { setCommonText } from './common';
import { lineInfo, wordInfo, guessSyllables, stressWords, tokenize } from './words';
import { analyzeFlow, offlineRhymes } from './rhyme';
import { rhymeKey, slantKey, toArpabet, stripStress } from './phones';
import { diffEdit, rebaseMarks, rebaseChords } from './textdiff';
import { tapsToPattern, fitLine, stressToPattern } from './cadence';
import { diatonic, parseKey, modifyChord, transposeChord } from './music';

beforeAll(() => {
  setCmuText(readFileSync('src/data/cmu.txt', 'utf8'));
  setCommonText(readFileSync('src/data/common.txt', 'utf8'));
});

describe('dictionary', () => {
  it('looks words up', () => {
    expect(toArpabet(lookup('hello')!)).toBe('HH AH0 L OW1');
    expect(lookup('zzzznotaword')).toBeNull();
    expect(lookup('time')).toBeTruthy();
  });
  it('finds first and last entries', () => {
    expect(lookup('a')).toBeTruthy();
    expect(lookup('zoo')).toBeTruthy();
    expect(lookup('zywicki') ?? lookup('zyskowski') ?? lookup('zytek')).toBeTruthy();
  });
});

describe('syllables & stress', () => {
  it('counts known words', () => {
    expect(wordInfo('hello').syl).toBe(3 - 1);
    expect(wordInfo('beautiful').syl).toBe(3);
    expect(wordInfo('radio').syl).toBe(3);
    expect(wordInfo('fire').syl).toBeGreaterThanOrEqual(1);
  });
  it('handles dropped g and possessives', () => {
    expect(wordInfo("singin'").syl).toBe(2);
    expect(wordInfo("moon's").syl).toBe(1);
  });
  it('guesses unknown words', () => {
    expect(guessSyllables('flibbertigibbet')).toBeGreaterThanOrEqual(4);
    expect(wordInfo('qwxzyl').syl).toBeGreaterThanOrEqual(1);
  });
  it('line totals and stress', () => {
    const li = lineInfo('Keep the light on low');
    expect(li.syl).toBe(5);
    expect(li.stress).toBe('SuSuS');
    expect(stressWords('uS')).toBe('da-DUM');
  });
  it('tokenizes with offsets', () => {
    const t = tokenize("I'm still learning");
    expect(t.map((x) => x.text)).toEqual(["I'm", 'still', 'learning']);
    expect(t[1].start).toBe(4);
  });
});

describe('rhyme', () => {
  it('keys', () => {
    expect(rhymeKey(lookup('room')!)).toBe(rhymeKey(lookup('bloom')!));
    expect(rhymeKey(lookup('room')!)).not.toBe(rhymeKey(lookup('tune')!));
    expect(slantKey(lookup('room')!)).toBe(slantKey(lookup('tune')!));
    expect(stripStress(lookup('hello')!).length).toBe(lookup('hello')!.length);
  });
  it('groups perfect rhymes and slant end-words', () => {
    const marks = analyzeFlow(['Rain on the roof of a borrowed room,', 'something in the window wants to bloom,', 'streetlight leaning like a question mark,', 'read you in the dark.']);
    const perfect = marks.flat().filter((m) => m.kind === 'perfect');
    expect(marks[0].some((m) => m.kind === 'perfect')).toBe(true);
    expect(marks[1].some((m) => m.kind === 'perfect')).toBe(true);
    expect(perfect.length).toBeGreaterThanOrEqual(4);
    const g0 = marks[0].find((m) => m.kind === 'perfect')!.group;
    expect(marks[1].find((m) => m.group === g0)).toBeTruthy();
  });
  it('ignores repeated identical words', () => {
    const marks = analyzeFlow(['go go', 'go go']);
    expect(marks.flat().length).toBe(0);
  });
  it('offline rhymes are common words and exclude the word itself', () => {
    const r = offlineRhymes('light', 'perfect').map((c) => c.word);
    expect(r).toContain('night');
    expect(r).not.toContain('light');
    expect(r).not.toContain('highlight');
    const s = offlineRhymes('time', 'slant').map((c) => c.word);
    expect(s.length).toBeGreaterThan(5);
  });
});

describe('text diff & rebasing', () => {
  it('diffs insertions and deletions', () => {
    expect(diffEdit('hello', 'hello!')).toEqual({ start: 5, del: 0, ins: 1 });
    expect(diffEdit('hello', 'hell')).toEqual({ start: 4, del: 1, ins: 0 });
    expect(diffEdit('abc', 'aXc')).toEqual({ start: 1, del: 1, ins: 1 });
  });
  it('uses the caret for repeated chars', () => {
    expect(diffEdit('aa', 'aaa', 1)).toEqual({ start: 0, del: 0, ins: 1 });
    expect(diffEdit('aa', 'aaa', 3)).toEqual({ start: 2, del: 0, ins: 1 });
  });
  it('rebases marks', () => {
    const m = [{ id: 'a', s: 5, e: 10, kind: 'pencil' as const }];
    expect(rebaseMarks(m, { start: 0, del: 0, ins: 3 })[0]).toMatchObject({ s: 8, e: 13 });
    expect(rebaseMarks(m, { start: 12, del: 0, ins: 3 })[0]).toMatchObject({ s: 5, e: 10 });
    expect(rebaseMarks(m, { start: 7, del: 0, ins: 2 })[0]).toMatchObject({ s: 5, e: 12 });
    expect(rebaseMarks(m, { start: 3, del: 4, ins: 0 })[0]).toMatchObject({ s: 3, e: 6 });
    expect(rebaseMarks(m, { start: 4, del: 8, ins: 0 })).toHaveLength(0);
  });
  it('rebases chords', () => {
    const c = [{ at: 0, name: 'G' }, { at: 10, name: 'D' }];
    expect(rebaseChords(c, { start: 4, del: 0, ins: 2 }).map((x) => x.at)).toEqual([0, 12]);
    expect(rebaseChords(c, { start: 8, del: 4, ins: 0 }).map((x) => x.at)).toEqual([0, 8]);
  });
});

describe('cadence', () => {
  it('turns taps into a pattern with rests', () => {
    const taps = [{ t: 0, dur: 60 }, { t: 250, dur: 300 }, { t: 500, dur: 50 }, { t: 1000, dur: 300 }];
    expect(tapsToPattern(taps)).toEqual(['u', 'S', 'u', 'r', 'S']);
  });
  it('fits lines', () => {
    const tpl = stressToPattern('SuSuS');
    expect(fitLine(tpl, 5, 'SuSuS').fit).toBe('exact');
    expect(fitLine(tpl, 5, 'SuSuS').stressMismatch).toBe(false);
    expect(fitLine(tpl, 5, 'uSuSu').stressMismatch).toBe(true);
    expect(fitLine(tpl, 6, 'SuSuSu').fit).toBe('near');
    expect(fitLine(tpl, 9, 'SuSuSuSuS').fit).toBe('off');
    expect(fitLine(undefined, 5, 'SuSuS').fit).toBe('none');
  });
});

describe('music', () => {
  it('builds diatonic chords', () => {
    expect(diatonic(parseKey('G')).map((c) => c.name).slice(0, 6)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em']);
    expect(diatonic(parseKey('Am')).map((c) => c.name).slice(0, 4)).toEqual(['Am', 'Bdim', 'C', 'Dm']);
    expect(diatonic(parseKey('F')).map((c) => c.name)).toContain('Bb');
  });
  it('modifies and transposes chords', () => {
    expect(modifyChord('G', '7')).toBe('G7');
    expect(modifyChord('Am', 'm')).toBe('A');
    expect(modifyChord('G', 'm')).toBe('Gm');
    expect(transposeChord('Am7/G', 2)).toBe('Bm7/A');
  });
});

import { chordLine, inlineChords, songToChordPro, songToText } from './export';
import { newSong, newSection, newLine } from '../store/models';

describe('export', () => {
  const song = newSong('Test Song');
  song.key = 'G';
  const line = newLine('Rain on the roof');
  line.chords = [{ at: 0, name: 'G' }, { at: 8, name: 'Em' }];
  const v = newSection('verse', [line]);
  const c = newSection('chorus', [newLine('Keep the light on low')]);
  song.sections = [v, c];
  song.arrangement = [
    { id: 'a', sectionId: v.id }, { id: 'b', sectionId: c.id }, { id: 'c', sectionId: c.id },
  ];
  it('chord lines align', () => {
    expect(chordLine(line)).toBe('G       Em');
    expect(inlineChords(line)).toBe('[G]Rain on [Em]the roof');
  });
  it('text export expands repeats', () => {
    const t = songToText(song, { chords: 'over' });
    expect(t).toContain('[VERSE]');
    expect(t.match(/Keep the light on low/g)?.length).toBe(2);
    expect(t).toContain('G       Em');
  });
  it('chordpro marks repeated chorus', () => {
    const t = songToChordPro(song);
    expect(t).toContain('{title: Test Song}');
    expect(t).toContain('{start_of_chorus: CHORUS}');
    expect(t).toContain('{chorus}');
  });
});
