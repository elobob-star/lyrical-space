import { describe, expect, it } from 'vitest';
import { InkOp, InkOpts, Wet, afterType, cleanText, isGhostAt, reduce, stripGhosts } from './ink';
import { diffEdit, rebaseMarks } from './textdiff';
import { reduceDiff } from './ink';
import type { Mark } from '../store/models';

/** A tiny writer: a caret, some ink, and the same reducer the notebook uses. */
class Pad {
  text = ''; marks: Mark[] = []; wet: Wet | null = null; caret = 0; last = 'noop';
  constructor(public o: InkOpts = { ghost: true, latch: false }) {}
  op(op: InkOp) {
    const r = reduce({ text: this.text, marks: this.marks, wet: this.wet }, op, this.o);
    this.text = r.text; this.marks = r.marks; this.wet = r.wet; this.caret = r.caret; this.last = r.kind;
    return r;
  }
  type(s: string) { for (const ch of s) this.op({ t: 'ins', from: this.caret, to: this.caret, text: ch }); return this; }
  back(n = 1) { for (let i = 0; i < n; i++) this.op({ t: 'back', from: this.caret, to: this.caret }); return this; }
  fwd(n = 1) { for (let i = 0; i < n; i++) this.op({ t: 'fwd', from: this.caret, to: this.caret }); return this; }
  /** tap somewhere else: the caret moves and the ink dries */
  click(i: number) { this.caret = i; this.wet = null; return this; }
  get seen() { return cleanText(this.text, this.marks); }
  ghosts() { return this.marks.filter((m) => m.kind === 'ghost').map((m) => [m.s, m.e]); }
}

describe('ink: wet words', () => {
  it('letters of the word you are typing erase for real', () => {
    const p = new Pad().type('hello').back(2);
    expect(p.text).toBe('hel');
    expect(p.ghosts()).toEqual([]);
    p.type('p');
    expect(p.text).toBe('help');
  });

  it('a space completes the word: backspace then strikes it instead of erasing', () => {
    const p = new Pad().type('hello ');
    p.back(); // the space was just typed: it erases
    expect(p.text).toBe('hello');
    p.back(); // 'o' belongs to a finished word
    expect(p.text).toBe('hello');
    expect(p.ghosts()).toEqual([[4, 5]]);
    expect(p.caret).toBe(5);
    expect(p.last).toBe('strike');
  });

  it('punctuation completes the word too, and is itself erasable', () => {
    const p = new Pad().type('hello,').back();
    expect(p.text).toBe('hello');
    p.back();
    expect(p.ghosts()).toEqual([[4, 5]]);
  });

  it('spaces and punctuation erase until a full word is written after them', () => {
    const p = new Pad().type('one, two');
    // "two" is wet, so are ", " before it
    p.back(3).back(2);
    expect(p.text).toBe('one');
    expect(p.ghosts()).toEqual([]);
    p.back();
    expect(p.text).toBe('one'); // 'e' is dry now
    expect(p.ghosts()).toEqual([[2, 3]]);
  });

  it('once the next word is finished, the space before it is stuck', () => {
    const p = new Pad().type('one two ');
    p.back(); // trailing space: wet
    expect(p.text).toBe('one two');
    p.back(); // 'o' of two: dry
    expect(p.text).toBe('one two');
    expect(p.ghosts()).toEqual([[6, 7]]);
    // ...and so is the space between the words
    const q = new Pad().type('one two ').back().click(4).back();
    expect(q.text).toBe('one two');
    expect(q.ghosts()).toEqual([[3, 4]]);
  });

  it('Enter completes a word and can be taken back', () => {
    const p = new Pad().type('line one\n');
    p.back();
    expect(p.text).toBe('line one');
    p.back();
    expect(p.ghosts()).toEqual([[7, 8]]);
  });

  it('moving the caret dries the ink', () => {
    const p = new Pad().type('hello');
    p.click(5).back();
    expect(p.text).toBe('hello');
    expect(p.ghosts()).toEqual([[4, 5]]);
  });

  it('backspace skips struck letters and strikes the next live one', () => {
    const p = new Pad().type('hello ').back().back().back().back();
    expect(p.text).toBe('hello');
    expect(p.ghosts()).toEqual([[2, 5]]);
    expect(p.caret).toBe(5);
    expect(p.seen).toBe('he');
  });

  it('a latch refuses every delete', () => {
    const p = new Pad({ ghost: true, latch: true }).type('hello');
    const r = p.back();
    expect(p.text).toBe('hello');
    expect(p.ghosts()).toEqual([]);
    expect(r.last).toBe('refuse');
  });

  it('with ghost ink off backspace is a plain eraser', () => {
    const p = new Pad({ ghost: false, latch: false }).type('hello ').back(3);
    expect(p.text).toBe('hel');
  });
});

describe('ink: what you type is always clean', () => {
  it('typing inside struck text leaves the new text un-struck and keeps both struck halves', () => {
    const p = new Pad().type('alpha beta gamma ');
    p.click(17).back(17); // strike everything
    expect(p.ghosts()).toEqual([[0, 17]]);
    p.click(6).type('NEW');
    expect(p.text).toBe('alpha NEWbeta gamma ');
    expect(isGhostAt(p.marks, 6)).toBe(false);
    expect(p.ghosts()).toEqual([[0, 6], [9, 20]]);
    expect(p.seen).toBe('NEW');
  });

  it('Enter inside struck text breaks the struck run without being struck itself', () => {
    const p = new Pad().type('struck words ').click(13).back(13).click(7);
    p.op({ t: 'ins', from: 7, to: 7, text: '\n' });
    p.caret = 8;
    expect(p.text).toBe('struck \nwords ');
    expect(isGhostAt(p.marks, 7)).toBe(false);
    p.type('fresh');
    expect(p.seen).toBe('\nfresh');
  });

  it('typing right after struck text and at its start is clean too', () => {
    const p = new Pad().type('abc ').click(4).back(4);
    p.click(4).type('x');
    p.click(0).type('y');
    expect(p.seen).toBe('yx');
  });

  it('typing over a selection strikes the old words and writes after them', () => {
    const p = new Pad().type('keep these words ').click(0);
    const r = p.op({ t: 'ins', from: 5, to: 10, text: 'THOSE' });
    expect(r.text).toBe('keep these' + 'THOSE' + ' words ');
    expect(p.ghosts()).toEqual([[5, 10]]);
    expect(p.seen).toBe('keep THOSE words ');
  });

  it('forward delete hops over struck ink instead of striking the wrong thing', () => {
    const p = new Pad().type('ab cd ').click(6).back(6);
    p.click(0).fwd();
    expect(p.seen).toBe('');
    expect(p.text).toBe('ab cd ');
  });

  it('a word-delete strikes just the word, not extra letters to its left', () => {
    const p = new Pad().type('one two three ');
    p.click(8).back(8); // strike "one two "
    p.click(14);
    p.op({ t: 'wordBack', from: 14, to: 14 });
    expect(p.seen).toBe('');
    expect(p.ghosts()).toEqual([[0, 14]]);
  });
});

describe('ink: IME fallback (deletions learned afterwards)', () => {
  it('a gone char that was already struck hops left instead of doing nothing', () => {
    const p = new Pad().type('abc ').click(4).back(2); // strike ' ' and 'c'
    expect(p.ghosts()).toEqual([[2, 4]]);
    const r = reduce({ text: p.text, marks: p.marks, wet: null }, { t: 'gone', from: 3, to: 4 }, p.o);
    expect(r.kind).toBe('strike');
    expect(r.marks.filter((m) => m.kind === 'ghost').map((m) => [m.s, m.e])).toEqual([[1, 4]]);
  });
});

describe('marks keep their shape across edits', () => {
  it('a pencil mark stretches when you type inside it, a ghost does not', () => {
    const marks: Mark[] = [{ id: 'p', s: 2, e: 8, kind: 'pencil' }, { id: 'g', s: 2, e: 8, kind: 'ghost' }];
    const out = rebaseMarks(marks, { start: 5, del: 0, ins: 3 });
    expect(out.find((m) => m.kind === 'pencil')).toMatchObject({ s: 2, e: 11 });
    const g = out.filter((m) => m.kind === 'ghost').map((m) => [m.s, m.e]);
    expect(g).toEqual([[2, 5], [8, 11]]);
  });

  it('diffEdit + rebase agrees with the reducer for a plain insertion', () => {
    const marks: Mark[] = [{ id: 'g', s: 0, e: 4, kind: 'ghost' }];
    const ed = diffEdit('abcd', 'abXcd', 3);
    expect(ed).toEqual({ start: 2, del: 0, ins: 1 });
    expect(rebaseMarks(marks, ed).filter((m) => m.kind === 'ghost').map((m) => [m.s, m.e])).toEqual([[0, 2], [3, 5]]);
  });
});

describe('ink: IME replacements and edge cases', () => {
  const state = (text: string, marks: Mark[] = [], wet: Wet | null = null) => ({ text, marks, wet });

  it('an IME replacing finished words strikes them and writes after (never overwrites)', () => {
    const old = state('keep these words ');
    const nv = 'keep x words ';
    const { res, revert } = reduceDiff(old, diffEdit(old.text, nv), nv, { ghost: true, latch: false });
    expect(revert).toBe(true);
    expect(res.text).toBe('keep thesex words ');
    expect(res.marks.filter((m) => m.kind === 'ghost').map((m) => [m.s, m.e])).toEqual([[5, 10]]);
  });

  it('...but replacing the word still being typed is an ordinary edit (autocorrect)', () => {
    const old = state('say teh', [], { s: 4, e: 7 });
    const nv = 'say the';
    const { res, revert } = reduceDiff(old, diffEdit(old.text, nv, 7), nv, { ghost: true, latch: false });
    expect(revert).toBe(false);
    expect(res.text).toBe('say the');
    expect(res.marks).toEqual([]);
  });

  it('a latch also holds against IME replacements', () => {
    const old = state('keep these words ');
    const nv = 'keep x words ';
    const { res, revert } = reduceDiff(old, diffEdit(old.text, nv), nv, { ghost: true, latch: true });
    expect(revert).toBe(true);
    expect(res.text).toContain('these');
  });

  it('a deletion beside an equal character is attributed by the caret', () => {
    // "bcc" -> "bc" with the caret at 1: the FIRST c went
    expect(diffEdit('bcc\n', 'bc\n', 1)).toEqual({ start: 1, del: 1, ins: 0 });
    const old = state('bcc\n', [], { s: 0, e: 2 });
    const { res } = reduceDiff(old, diffEdit('bcc\n', 'bc\n', 1), 'bc\n', { ghost: true, latch: false });
    expect(res.kind).toBe('erase');
  });

  it('backspace removes a whole emoji, wet or dry', () => {
    const p = new Pad().type('a😀');
    p.back();
    expect(p.text).toBe('a');
    const q = new Pad().type('😀 y ');
    q.click(2).back(); // the emoji is finished ink now: struck whole, not split
    expect(q.text).toBe('😀 y ');
    expect(q.ghosts()).toEqual([[0, 2]]);
  });

  it('struck ink already covering a selection is not a change (no spurious undo step)', () => {
    const marks: Mark[] = [{ id: 'g', s: 0, e: 4, kind: 'ghost' }, { id: 'p', s: 5, e: 8, kind: 'pencil' }];
    const r = reduce({ text: 'dead live', marks, wet: null }, { t: 'back', from: 0, to: 4 }, { ghost: true, latch: false });
    expect(r.kind).toBe('noop');
  });
});

describe('stripGhosts', () => {
  it('removes struck ink for good and carries pencil marks over', () => {
    const marks: Mark[] = [{ id: 'g', s: 5, e: 10, kind: 'ghost' }, { id: 'p', s: 11, e: 15, kind: 'pencil' }];
    const out = stripGhosts('keep XXXXX this ok', marks);
    expect(out.text).toBe('keep  this ok');
    expect(out.marks).toEqual([{ id: 'p', s: 6, e: 10, kind: 'pencil' }]);
    expect(out.text.slice(out.marks[0].s, out.marks[0].e)).toBe('this');
  });
});

describe('afterType', () => {
  it('a pasted paragraph is dry except for a trailing unfinished word', () => {
    const t = 'one two three';
    expect(afterType(t, null, 0, 0, t.length)).toEqual({ s: 7, e: 13 });
    const t2 = 'one two three ';
    expect(afterType(t2, null, 0, 0, t2.length)).toEqual({ s: 13, e: 14 });
  });
});

describe('ink: fuzz', () => {
  // a deterministic PRNG so failures reproduce
  const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  it('never loses a character to a strike, never strikes what was just typed, keeps marks in bounds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const p = new Pad();
      const alphabet = 'abcde  ,.\n';
      for (let step = 0; step < 220; step++) {
        const roll = r();
        const before = p.text;
        const caret = p.caret;
        if (roll < 0.5) {
          const ch = alphabet[Math.floor(r() * alphabet.length)];
          const at = p.caret;
          p.op({ t: 'ins', from: at, to: at, text: ch });
          expect(p.text.length).toBe(before.length + 1);
          expect(isGhostAt(p.marks, at), `seed ${seed} step ${step}: typed char struck`).toBe(false);
        } else if (roll < 0.75) {
          p.back();
          if (p.last === 'strike') expect(p.text).toBe(before);
          if (p.last === 'erase') expect(p.text.length).toBe(before.length - 1);
        } else if (roll < 0.82) {
          p.fwd();
          if (p.last === 'strike') expect(p.text).toBe(before);
        } else if (roll < 0.9) {
          p.click(Math.floor(r() * (p.text.length + 1)));
        } else if (roll < 0.95) {
          const a = Math.floor(r() * (p.text.length + 1)), b = Math.min(p.text.length, a + 1 + Math.floor(r() * 4));
          p.click(b);
          if (b > a) p.op({ t: 'back', from: a, to: b });
        } else {
          p.op({ t: 'wordBack', from: p.caret, to: p.caret });
        }
        // invariants
        expect(p.caret).toBeGreaterThanOrEqual(0);
        expect(p.caret).toBeLessThanOrEqual(p.text.length);
        for (const m of p.marks) { expect(m.s).toBeGreaterThanOrEqual(0); expect(m.e).toBeLessThanOrEqual(p.text.length); expect(m.e).toBeGreaterThan(m.s); }
        if (p.wet) { expect(p.wet.s).toBeGreaterThanOrEqual(0); expect(p.wet.e).toBeLessThanOrEqual(p.text.length); expect(p.wet.e).toBeGreaterThan(p.wet.s); }
        void caret;
      }
    }
  });
});
