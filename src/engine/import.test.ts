import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCmuText } from './cmu';
import { parseHeader, parseLyrics, isChordLine } from './importText';
import { lineInfo, nextMeter } from './words';
import { parseKey, semisBetween, transposeChord } from './music';
import { normalizeScrap } from '../store/models';

beforeAll(() => { setCmuText(readFileSync('src/data/cmu.txt', 'utf8')); });

describe('import: headers & chord lines', () => {
  it('recognises section headers in many spellings', () => {
    expect(parseHeader('[Verse 1]')?.kind).toBe('verse');
    expect(parseHeader('Chorus:')?.kind).toBe('chorus');
    expect(parseHeader('PRE-CHORUS')?.kind).toBe('pre');
    expect(parseHeader('(Bridge)')?.kind).toBe('bridge');
    expect(parseHeader('Chorus x2')?.times).toBe(2);
    expect(parseHeader('Refrain')?.name).toBe('REFRAIN');
    expect(parseHeader('Versed in the art of leaving')).toBeNull();
    expect(parseHeader('I walked out')).toBeNull();
  });
  it('tells chord lines from lyrics', () => {
    expect(isChordLine('G      Em   C/B   D7sus4')).toBe(true);
    expect(isChordLine('| Am | F | C | G |')).toBe(true);
    expect(isChordLine('A man walked in')).toBe(false);
    expect(isChordLine('')).toBe(false);
  });
});

describe('import: songs', () => {
  it('splits blocks, detects a returning chorus, and keeps order', () => {
    const p = parseLyrics('rain on the roof\nof a borrowed room\n\nkeep the light on low\nkeep the radio\n\npaper boats\nin a parking lot\n\nkeep the light on low\nkeep the radio\n');
    expect(p.sections.length).toBe(3);
    expect(p.sections[1].kind).toBe('chorus');
    expect(p.arrangement).toEqual([0, 1, 2, 1]);
  });
  it('labels sections and repeats bare headers', () => {
    const p = parseLyrics('[Verse 1]\nline one\nline two\n\n[Chorus]\nhook line\n\n[Verse 2]\nthree\n\n[Chorus]\n\n[Chorus]\n');
    expect(p.sections.map((s) => s.kind)).toEqual(['verse', 'chorus', 'verse']);
    expect(p.arrangement).toEqual([0, 1, 2, 1, 1]);
  });
  it('attaches chords-over-lyrics by column', () => {
    const p = parseLyrics('G         Em\nRain on the roof\n');
    const l = p.sections[0].lines[0];
    expect(l.text).toBe('Rain on the roof');
    expect(l.chords).toEqual([{ at: 0, name: 'G' }, { at: 10, name: 'Em' }]);
  });
  it('reads ChordPro', () => {
    const p = parseLyrics('{title: Borrowed Room}\n{key: G}\n{tempo: 84}\n{start_of_verse}\n[G]Rain on the [Em]roof\n{end_of_verse}\n{start_of_chorus}\n[C]Keep the light\n{end_of_chorus}\n{chorus}\n');
    expect(p.title).toBe('Borrowed Room');
    expect(p.key).toBe('G');
    expect(p.bpm).toBe(84);
    expect(p.sections[0].lines[0]).toEqual({ text: 'Rain on the roof', chords: [{ at: 0, name: 'G' }, { at: 12, name: 'Em' }] });
    expect(p.arrangement).toEqual([0, 1, 1]);
  });
  it('honours repeat counts', () => {
    const p = parseLyrics('Chorus x2\nla la\n');
    expect(p.arrangement).toEqual([0, 0]);
  });
});

describe('meter overrides', () => {
  it('flips one-syllable words, then bars, then resets', () => {
    const info = lineInfo('and the night');
    const w = info.words[0];
    expect(w.auto).toBe('u');
    const m1 = nextMeter(w)!;
    expect(m1.s).toBe('S');
    const w1 = lineInfo('and the night', { [w.key]: m1 }).words[0];
    expect(w1.overridden).toBe(true);
    const m2 = nextMeter(w1)!;
    expect(m2.d).toBe(1);
    const w2 = lineInfo('and the night', { [w.key]: m2 }).words[0];
    expect(w2.down).toBe(true);
    expect(nextMeter(w2)).toBeUndefined();
  });
  it('overrides change the line stress string', () => {
    const base = lineInfo('and the night');
    const k = base.words[0].key;
    expect(lineInfo('and the night', { [k]: { s: 'S' } }).stress[0]).toBe('S');
    // an override keyed to a word that changed is ignored
    expect(lineInfo('but the night', { [k]: { s: 'S' } }).stress[0]).toBe('u');
  });
});

describe('transpose & scraps', () => {
  it('moves by the shortest interval', () => {
    expect(semisBetween(parseKey('G')!, parseKey('A')!)).toBe(2);
    expect(semisBetween(parseKey('C')!, parseKey('A')!)).toBe(-3);
    expect(transposeChord('Em7/B', 2)).toBe('F#m7/C#');
  });
  it('migrates legacy sparks and bones into one shoebox', () => {
    expect(normalizeScrap({ id: 'a', text: 'x', kind: 'bone', createdAt: 0, used: 0 } as any).from).toBe('cut');
    expect(normalizeScrap({ id: 'b', text: 'y', kind: 'spark', createdAt: 0, used: 0 } as any).from).toBe('catch');
  });
});

import { analyzeFlow, rhymeScheme } from './rhyme';
describe('rhyme scheme', () => {
  it('letters end rhymes in order', () => {
    const lines = ['the night is long', 'I keep the light', 'and sing a song', 'until the end'];
    expect(rhymeScheme(lines, analyzeFlow(lines))).toEqual(['A', 'B', 'A', 'C']);
  });
});
