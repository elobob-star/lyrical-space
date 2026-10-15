import { memo } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { Chord, ID, Line } from '../../store/models';
import { RhymeMark } from '../../engine/rhyme';
import { diffEdit } from '../../engine/textdiff';
import {
  focusReq, focused, mergeUp, pasteLines, placeChord, removeChord, removeLine, setLineText, splitLine, focusLine,
} from '../../store/lines';
import { currentSong } from '../../store/state';
import { buryLine } from '../../store/actions';
import { feel, haptic } from '../../engine/feel';
import { say } from '../../store/ui';
import { Icon } from '../icons';
import { armedChord, charAt, startChordDrag } from './chordDrag';
import { signal } from '@preact/signals';

export const lineMenu = signal<{ sid: ID; lid: ID } | null>(null);

export interface LineProps {
  songId: ID;
  sid: ID;
  line: Line;
  marks: RhymeMark[];
  marksKey: string;
  headroom: boolean;
  syl: number;
  fit: 'none' | 'exact' | 'near' | 'off';
  mism: boolean;
  gutter: boolean;
  neighbors: { prev?: ID; next?: ID };
}

interface Piece { s: number; e: number; mark?: RhymeMark; chord?: Chord }

/** Split the text at every mark/chord boundary. Chords hang off the first piece of the word they sit on. */
function pieces(text: string, marks: RhymeMark[], chords: Chord[]): Piece[] {
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) { cuts.add(m.start); cuts.add(m.end); }
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
    out.push({ s, e, mark: marks.find((m) => m.start <= s && m.end >= e), chord: anchors.get(s) });
  }
  const tail = anchors.get(text.length);
  if (tail && !out.some((p) => p.chord === tail)) out.push({ s: text.length, e: text.length, chord: tail });
  return out;
}

function Mirror({ text, marks, chords, stamp }: { text: string; marks: RhymeMark[]; chords: Chord[]; stamp: (c: Chord) => any }) {
  return (
    <>
      {pieces(text, marks, chords).map((p) => (
        <span key={p.s} data-s={p.s}
          class={(p.mark ? `rh ${p.mark.kind} g${p.mark.group % 8} ` : '') + (p.chord ? 'cs' : '')}>
          {p.chord ? stamp(p.chord) : null}{text.slice(p.s, p.e)}
        </span>
      ))}
      {'\u200b'}
    </>
  );
}

export const LineRow = memo(function LineRow(p: LineProps) {
  const { line } = p;
  const inp = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const lineEl = useRef<HTMLDivElement>(null);
  const setDx = (v: number) => {
    if (lineEl.current) lineEl.current.style.transform = v ? `translate3d(${v}px, 0, 0)` : '';
    wrap.current?.classList.toggle('swiping', v !== 0);
  };
  const sw = useRef<{ x: number; y: number; on: boolean; dx: number } | null>(null);

  // external focus requests (after split / merge / insert)
  useEffect(() => focusReq.subscribe((r) => {
    if (!r || r.lid !== line.id) return;
    const el = inp.current;
    if (!el) return;
    el.focus({ preventScroll: false });
    try { const c = Math.min(r.caret, el.value.length); el.setSelectionRange(c, c); } catch { /* ignore */ }
    focusReq.value = null;
  }), [line.id]);

  const onInput = (e: Event) => {
    const el = e.target as HTMLTextAreaElement;
    let nv = el.value;
    if (nv.includes('\n')) {
      // soft keyboards that insert a raw newline instead of an Enter key event
      const i = nv.indexOf('\n');
      const caret = (el.selectionStart ?? nv.length) - 1;
      nv = nv.replace(/\n/g, '');
      el.value = nv;
      setLineText(p.songId, p.sid, line.id, nv, diffEdit(line.text, nv));
      splitLine(p.songId, p.sid, line.id, Math.min(i, nv.length), Math.min(Math.max(caret, i), nv.length));
      return;
    }
    if (nv === line.text) return;
    setLineText(p.songId, p.sid, line.id, nv, diffEdit(line.text, nv, el.selectionStart ?? undefined));
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

  // ---- swipe left → Boneyard ----
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
    s.dx = Math.min(0, ddx);
    setDx(s.dx);
  };
  const up = () => {
    const s = sw.current;
    sw.current = null;
    if (s?.on) {
      if (s.dx < -100) {
        const gone = p.line.text.trim()
          ? buryLine(p.songId, p.sid, line.id)
          : { undo: removeLine(p.songId, p.sid, line.id), text: '' };
        feel('thock', 'medium');
        if (gone) say(gone.text ? 'FLICKED TO THE BONEYARD' : 'LINE REMOVED', { label: 'UNDO', run: gone.undo });
      }
      setDx(0);
    }
  };

  // armed chord: tapping the text stamps it
  const stampHere = (e: MouseEvent) => {
    const armed = armedChord.value;
    if (!armed || (e.target as HTMLElement).closest('.stamp')) return;
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
          if (gone) say(`PEELED OFF ${gone.name}`, { label: 'UNDO', run: () => placeChord(p.songId, p.sid, line.id, gone.at, gone.name) });
        });
      }}>{c.name}</button>
  );

  return (
    <div class="line-wrap" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div class="line-under"><Icon n="bones" size={18} /><span>BONEYARD</span></div>
      <div ref={lineEl} class={`line fit-${p.fit}` + (p.headroom ? ' hr' : '')} data-sid={p.sid} data-lid={line.id}>
        {p.gutter && (
          <button class={'gut' + (p.mism ? ' mism' : '')} aria-label="Line menu" onClick={() => { lineMenu.value = { sid: p.sid, lid: line.id }; }}>
            {p.syl || ''}{p.mism ? <i>≠</i> : null}
          </button>
        )}
        <div class="lbox" onClick={stampHere}>
          <div class="mir" aria-hidden="true"><Mirror text={line.text} marks={p.marks} chords={line.chords} stamp={stamp} /></div>
          <textarea ref={inp} class="lin" rows={1} value={line.text} spellcheck={false} autocapitalize="sentences" autocomplete="off" enterkeyhint="next"
            aria-label="Lyric line" onInput={onInput} onKeyDown={onKeyDown} onBeforeInput={onBeforeInput as any} onPaste={onPaste}
            onFocus={() => { focused.value = { sid: p.sid, lid: line.id }; }} />
        </div>
      </div>
    </div>
  );
}, (a, b) =>
  a.line === b.line && a.marksKey === b.marksKey && a.headroom === b.headroom && a.syl === b.syl && a.fit === b.fit &&
  a.mism === b.mism && a.gutter === b.gutter && a.neighbors.prev === b.neighbors.prev && a.neighbors.next === b.neighbors.next && a.sid === b.sid);

export { currentSong };
