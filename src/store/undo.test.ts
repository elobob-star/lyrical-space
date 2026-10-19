import { beforeEach, describe, expect, it } from 'vitest';
import { createSong, currentId, songs, updateSong } from './state';
import { activeTake, newLine, newTake } from './models';
import { moveLine, removeLine, setLineText, splitLine, addSection, recordTake } from './lines';
import { runUndo, undoDepth, undoable, clearUndo } from './undo';
import { cutLine, sendTextToBench } from './actions';
import { lcdMsg } from './ui';

const song = () => songs.value.find((s) => s.id === currentId.value)!;
const lines = (si = 0, ti?: number) => { const sec = song().sections[si]; return (ti === undefined ? activeTake(sec) : sec.takes[ti]).lines.map((l) => l.text); };

beforeEach(() => {
  songs.value = [];
  createSong('T');
  addSection(song().id, 'verse');
  clearUndo(song().id);
  const sid = song().sections[0].id;
  updateSong(song().id, (d) => { d.sections[0].takes[0].lines = [newLine('a'), newLine('b'), newLine('c')]; });
  void sid;
});

describe('bench undo', () => {
  it('undoing a deleted line puts it back (the removed line must not be a revoked proxy)', () => {
    const s = song(), sec = s.sections[0];
    const undo = removeLine(s.id, sec.id, activeTake(sec).lines[1].id);
    expect(lines()).toEqual(['a', 'c']);
    expect(() => undo()).not.toThrow();
    expect(lines()).toEqual(['a', 'b', 'c']);
  });

  it('undo acts on the take it recorded, not on the one showing now', () => {
    const s = song(), sec = s.sections[0];
    splitLine(s.id, sec.id, activeTake(sec).lines[2].id, 1, 1); // Enter at the end of "c" on take 1
    expect(lines(0, 0)).toEqual(['a', 'b', 'c', '']);
    // a second take, with its own work, is now the active one
    updateSong(s.id, (d) => { d.sections[0].takes.push(newTake([newLine('NEW IDEA')])); d.sections[0].take = 1; });
    expect(runUndo('bench')).toBe(true);
    expect(lines(0, 1)).toEqual(['NEW IDEA']);          // take 2 untouched
    expect(lines(0, 0)).toEqual(['a', 'b', 'c']);        // take 1 put back
    expect(song().sections[0].take).toBe(0);              // and brought to the front so you see it
  });

  it('typing undo after switching takes still finds its line', () => {
    const s = song(), sec = s.sections[0];
    const l = activeTake(sec).lines[0];
    setLineText(s.id, sec.id, l.id, 'a!', { start: 1, del: 0, ins: 1 });
    updateSong(s.id, (d) => { d.sections[0].takes.push(newTake([newLine('other')])); d.sections[0].take = 1; });
    runUndo('bench');
    expect(lines(0, 0)[0]).toBe('a');
  });

  it('a failing undo does not wedge the stack or the chip', () => {
    undoable('bench', 'BOOM', () => { throw new Error('nope'); });
    const depth = undoDepth('bench');
    expect(() => runUndo('bench')).not.toThrow();
    expect(undoDepth('bench')).toBe(depth - 1);
  });

  it('moving a line is not an undo step', () => {
    const s = song(), sec = s.sections[0];
    const before = undoDepth('bench');
    moveLine(s.id, sec.id, activeTake(sec).lines[0].id, -1);
    moveLine(s.id, sec.id, activeTake(sec).lines[0].id, 1);
    expect(lines()).toEqual(['b', 'a', 'c']);
    expect(undoDepth('bench')).toBe(before);
  });

  it('the LCD UNDO belongs to its own action: it will not undo a later one', () => {
    const s = song(), sec = s.sections[0];
    let first = 0;
    undoable('bench', 'FIRST', () => { first++; });
    const lcdUndo = lcdMsg.value!.action!.run;
    recordTake(s.id, sec.id, 'SECOND'); // a later step is now on top
    lcdUndo();
    expect(first).toBe(0);               // it refused: more has happened since
    expect(undoDepth('bench')).toBe(2);
    runUndo('bench');                     // the chip steps back one at a time
    runUndo('bench');
    expect(first).toBe(1);
    lcdUndo();                            // and a second tap on the old LCD message is harmless
    expect(first).toBe(1);
  });

  it('cutting a line to the shoebox and undoing restores the line in its own take', () => {
    const s = song(), sec = s.sections[0];
    const gone = cutLine(s.id, sec.id, activeTake(sec).lines[1].id)!;
    expect(lines()).toEqual(['a', 'c']);
    updateSong(s.id, (d) => { d.sections[0].takes.push(newTake([newLine('x')])); d.sections[0].take = 1; });
    gone.undo();
    expect(lines(0, 0)).toEqual(['a', 'b', 'c']);
    expect(lines(0, 1)).toEqual(['x']);
  });

  it('sending lines to the bench can be taken back without touching anything written since', () => {
    const s = song();
    const sent = sendTextToBench(s.id, ['one', 'two'], 'new', 'chorus');
    expect(song().sections.length).toBe(2);
    updateSong(s.id, (d) => { d.sections[0].takes[0].lines.push(newLine('typed later')); });
    sent.undo();
    expect(song().sections.length).toBe(1);
    expect(lines(0)).toEqual(['a', 'b', 'c', 'typed later']);
  });
});
