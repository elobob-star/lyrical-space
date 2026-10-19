import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Chord, ID, Line } from '../../store/models';
import { RhymeMark } from '../../engine/rhyme';
import { diffEdit } from '../../engine/textdiff';
import { WordMeter, nextMeter } from '../../engine/words';
import {
  focusReq, focused, mergeUp, pasteLines, placeChord, removeChord, removeLine, setLineText, splitLine, focusLine,
} from '../../store/lines';
import { currentSong, updateSong } from '../../store/state';
import { cutLine } from '../../store/actions';
import { feel, haptic } from '../../engine/feel';
import { Lens, say } from '../../store/ui';
import { runUndo, undoable } from '../../store/undo';
import { activeTake } from '../../store/models';
import { Icon } from '../icons';
import { armedChord, charAt, startChordDrag } from './chordDrag';

export const lineMenu = signal<{ sid: ID; lid: ID } | null>(null);

export interface LineProps {
  songId: ID;
  sid: ID;
  line: Line;
  marks: RhymeMark[];
  marksKey: string;
  lens: Lens;
  scheme: string;
  words: WordMeter[];
  wordsKey: string;
  headroom: boolean;
  syl: number;
  fit: 'none' | 'exact' | 'near' | 'off';
  mism: boolean;
  gutter: boolean;
  neighbors: { prev?: ID; next?: ID };
}

interface Piece { s: number; e: number; mark?: RhymeMark; chord?: Chord; word?: WordMeter }

/** Split the text at every mark/chord/word boundary. Chords hang off the first piece of the word they sit on. */
function pieces(text: string, marks: RhymeMark[], chords: Chord[], words: WordMeter[]): Piece[] {
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) { cuts.add(m.start); cuts.add(m.end); }
  for (const w of words) { cuts.add(w.tok.start); cuts.add(w.tok.end); }
  const anchors = new Map<number, Chord>();
  for (const c of chords) {
    let i = Math.min(c.at, text.length);
    while (i < text.length && /\s/.test(text[i])) i++;
    anchors.set(i, anchors.has(i) ? anchors.get(i)! : c);
    cuts.add(i);
    let j = i;
    while (j < text.length && /\S/.test(text[j])) j++;
    cuts.add(j);
  }
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((x, y) => x - y);
  const out: Piece[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const s = pts[k], e = pts[k + 1];
    if (e <= s) continue;
    out.push({ s, e, mark: marks.find((m) => m.start <= s && m.end >= e), chord: anchors.get(s), word: words.find((w) => w.tok.start === s) });
  }
  const tail = anchors.get(text.length);
  if (tail && !out.some((p) => p.chord === tail)) out.push({ s: text.length, e: text.length, chord: tail });
  return out;
}

const glyph = (c: string) => (c === 'S' ? '/' : c === 's' ? '\\' : '˘');

function Mirror({ text, marks, chords, words, meter, stamp }: { text: string; marks: RhymeMark[]; chords: Chord[]; words: WordMeter[]; meter: boolean; stamp: (c: Chord) => any }) {
  return (
    <>
      {pieces(text, marks, meter ? [] : chords, meter ? words : []).map((p) => (
        <span key={p.s} data-s={p.s} data-k={p.word?.key}
          class={(p.mark ? `rh ${p.mark.kind} g${p.mark.group % 8} ` : '') + (p.chord ? 'cs ' : '') + (p.word ? 'mw' + (p.word.down ? ' down' : '') : '')}>
          {p.chord ? stamp(p.chord) : null}
          {p.word ? <i class={'ms' + (p.word.overridden ? ' ov' : '')} aria-hidden="true">{[...p.word.stress].map((c) => <b>{glyph(c)}</b>)}</i> : null}
          {text.slice(p.s, p.e)}
        </span>
      ))}
      {'​'}
    </>
  );
}

export const LineRow = memo(function LineRow(p: LineProps) {
  const { line } = p;
  const inp = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const lineEl = useRef<HTMLDivElement>(null);
  const meter = p.lens === 'meter';
  const setDx = (v: number) => {
    if (lineEl.current) lineEl.current.style.transform = v ? `translate3d(${v}px, 0, 0)` : '';
    wrap.current?.classList.toggle('swiping', v !== 0);
    wrap.current?.classList.toggle('armed-cut', v < -100);
  };
  const sw = useRef<{ x: number; y: number; on: boolean; dx: number } | null>(null);

  // headroom for chord stamps goes above the first row only — unless a chord lands on a wrapped row, then every row gets it
  const [wrapc, setWrapc] = useState(false);
  useLayoutEffect(() => {
    const mir = lineEl.current?.querySelector<HTMLElement>('.mir');
    if (!mir) return;
    const check = () => {
      const first = mir.firstElementChild as HTMLElement | null;
      if (!first || !p.headroom || meter) { setWrapc(false); return; }
      const t0 = first.getBoundingClientRect().top;
      let wrapped = false;
      mir.querySelectorAll<HTMLElement>('.cs').forEach((m) => { if (m.getBoundingClientRect().top - t0 > 8) wrapped = true; });
      setWrapc(wrapped);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(mir);
    return () => ro.disconnect();
  }, [line.text, line.chords, p.headroom, meter, p.marksKey, p.wordsKey]);

  // external focus requests (after split / merge / insert)
  useEffect(() => focusReq.subscribe((r) => {
    if (!r || r.lid !== line.id) return;
    const el = inp.current;
    if (!el) return;
    el.focus({ preventScroll: false });
    try { const c = Math.min(r.caret, el.value.length); el.setSelectionRange(c, c); } catch { /* ignore */ }
    focusReq.value = null;
  }), [line.id]);

  /** the stored text right now — several input events can land between renders */
  const liveText = () => {
    const sec = currentSong.peek()?.sections.find((x) => x.id === p.sid);
    return (sec && activeTake(sec).lines.find((l) => l.id === line.id)?.text) ?? line.text;
  };
  const onInput = (e: Event) => {
    const el = e.target as HTMLTextAreaElement;
    let nv = el.value;
    const was = liveText();
    if (nv.includes('\n')) {
      // soft keyboards that insert a raw newline instead of an Enter key event
      const i = nv.indexOf('\n');
      const caret = (el.selectionStart ?? nv.length) - 1;
      nv = nv.replace(/\n/g, '');
      el.value = nv;
      setLineText(p.songId, p.sid, line.id, nv, diffEdit(was, nv));
      splitLine(p.songId, p.sid, line.id, Math.min(i, nv.length), Math.min(Math.max(caret, i), nv.length));
      return;
    }
    if (nv === was) return;
    setLineText(p.songId, p.sid, line.id, nv, diffEdit(was, nv, el.selectionStart ?? undefined));
  };

  const neighbor = (id?: ID, end = false) => { if (id) focusLine(id, end ? 9999 : 0); };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLTextAreaElement;
    const a = el.selectionStart ?? 0, b = el.selectionEnd ?? 0;
    if (e.key === 'Enter') { e.preventDefault(); splitLine(p.songId, p.sid, line.id, a, b); feel('key', null); }
    else if (e.key === 'Backspace' && a === 0 && b === 0) { if (p.neighbors.prev) { e.preventDefault(); mergeUp(p.songId, p.sid, line.id); } }
    else if (e.key === 'ArrowUp' && a === 0) { e.preventDefault(); neighbor(p.neighbors.prev, true); }
    else if (e.key === 'ArrowDown' && a === el.value.length) { e.preventDefault(); neighbor(p.neighbors.next); }
  };
  const onBeforeInput = (e: InputEvent) => {
    const el = e.target as HTMLTextAreaElement;
    if (!e.cancelable) return;
    if (e.inputType === 'deleteContentBackward' && (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0 && p.neighbors.prev) {
      e.preventDefault();
      mergeUp(p.songId, p.sid, line.id);
    } else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      e.preventDefault();
      splitLine(p.songId, p.sid, line.id, el.selectionStart ?? 0, el.selectionEnd ?? 0);
    }
  };
  const onPaste = (e: ClipboardEvent) => {
    const t = e.clipboardData?.getData('text') ?? '';
    if (!t.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLTextAreaElement;
    pasteLines(p.songId, p.sid, line.id, el.selectionStart ?? 0, el.selectionEnd ?? 0, t);
  };

  // ---- swipe left → into the Shoebox ----
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.stamp')) return;
    sw.current = { x: e.clientX, y: e.clientY, on: false, dx: 0 };
  };
  const move = (e: PointerEvent) => {
    const s = sw.current;
    if (!s) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (!s.on) {
      if (ddx < -18 && Math.abs(ddx) > Math.abs(ddy) * 2) {
        s.on = true;
        try { wrap.current?.setPointerCapture(e.pointerId); } catch { /* */ }
        haptic('light');
      } else if (Math.abs(ddy) > 14) sw.current = null;
      return;
    }
    const was = s.dx < -100;
    s.dx = Math.min(0, ddx);
    if (was !== s.dx < -100) haptic('light');
    setDx(s.dx);
  };
  const up = () => {
    const s = sw.current;
    sw.current = null;
    if (s?.on) {
      if (s.dx < -100) {
        const gone = p.line.text.trim()
          ? cutLine(p.songId, p.sid, line.id)
          : { undo: removeLine(p.songId, p.sid, line.id), text: '' };
        feel('snip', 'medium');
        if (gone) undoable('bench', gone.text ? 'CUT → SHOEBOX' : 'LINE REMOVED', gone.undo);
      }
      setDx(0);
    }
  };

  // armed chord: tapping the text stamps it · meter lens: tapping a word cycles its stress / downbeat
  const tapText = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.stamp')) return;
    if (meter) {
      const w = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
      const wm = w && p.words.find((x) => x.key === w.dataset.k);
      if (!wm) return;
      const nx = nextMeter(wm);
      updateSong(p.songId, (d) => {
        const sec = d.sections.find((s) => s.id === p.sid);
        const l = sec && activeTake(sec).lines.find((x) => x.id === line.id);
        if (!l) return;
        const m = { ...(l.meter ?? {}) };
        if (nx) m[wm.key] = nx; else delete m[wm.key];
        l.meter = Object.keys(m).length ? m : undefined;
      });
      feel('click', 'light');
      return;
    }
    const armed = armedChord.value;
    if (!armed) return;
    const root = (e.currentTarget as HTMLElement).closest('.line') as HTMLElement;
    placeChord(p.songId, p.sid, line.id, charAt(root, e.clientX, e.clientY, line.text), armed);
    feel('chk', 'light');
  };

  const stamp = (c: Chord) => (
    <button class="stamp" aria-label={`Chord ${c.name}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        startChordDrag(e as any, c.name, { songId: p.songId, sid: p.sid, lid: line.id, at: c.at, name: c.name }, () => {
          const gone = removeChord(p.songId, p.sid, line.id, c.at);
          feel('thock', 'light');
          if (gone) say(`PEELED OFF ${gone.name}`, { label: 'UNDO', run: () => { runUndo('bench'); } });
        });
      }}>{c.name}</button>
  );

  return (
    <div class="line-wrap" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div class="line-under"><Icon n="box" size={16} /><span>SHOEBOX</span></div>
      <div ref={lineEl} class={`line fit-${p.fit}` + (p.headroom || meter ? ' hr' : '') + (meter || wrapc ? ' uni' : '')} data-sid={p.sid} data-lid={line.id}>
        {p.gutter && (
          <button class={'gut' + (p.mism ? ' mism' : '')} aria-label="Line menu" onClick={() => { lineMenu.value = { sid: p.sid, lid: line.id }; }}>
            {p.syl || ''}{p.mism ? <i>≠</i> : null}
          </button>
        )}
        <div class="lbox" onClick={tapText}>
          <div class="mir" aria-hidden="true"><Mirror text={line.text} marks={p.marks} chords={line.chords} words={p.words} meter={meter} stamp={stamp} /></div>
          <textarea ref={inp} class="lin" rows={1} value={line.text} spellcheck={false} autocapitalize="sentences" autocomplete="off" enterkeyhint="next"
            aria-label="Lyric line" onInput={onInput} onKeyDown={onKeyDown} onBeforeInput={onBeforeInput as any} onPaste={onPaste}
            onFocus={() => { focused.value = { sid: p.sid, lid: line.id }; }} />
        </div>
        {p.lens === 'rhyme' && <span class="scheme" aria-label={p.scheme ? `Rhyme ${p.scheme}` : undefined}>{p.scheme}</span>}
      </div>
    </div>
  );
}, (a, b) =>
  a.line === b.line && a.marksKey === b.marksKey && a.headroom === b.headroom && a.syl === b.syl && a.fit === b.fit && a.lens === b.lens &&
  a.scheme === b.scheme && a.wordsKey === b.wordsKey &&
  a.mism === b.mism && a.gutter === b.gutter && a.neighbors.prev === b.neighbors.prev && a.neighbors.next === b.neighbors.next && a.sid === b.sid);
