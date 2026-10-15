import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentSong, drawSpark, settings, updateCurrent } from '../store/state';
import { Mark, uid } from '../store/models';
import { diffEdit, rebaseMarks } from '../engine/textdiff';
import { indexAtPoint } from '../engine/hit';
import { feel, haptic, sound } from '../engine/feel';
import { punchPencil, pendingPencil } from '../store/actions';
import { say } from '../store/ui';
import { Key, Keys } from './Key';
import { Odometer } from './Odometer';
import { Icon } from './icons';
import { setMode } from './Bezel';

export const latch = signal(false);
export const grease = signal(false);
const pulseGrease = signal(false);

const isWordCh = (c: string | undefined) => !!c && /[\p{L}\p{N}'’]/u.test(c);

function snapWords(text: string, a: number, b: number): [number, number] {
  if (a > b) [a, b] = [b, a];
  while (a > 0 && isWordCh(text[a - 1])) a--;
  while (b < text.length && isWordCh(text[b])) b++;
  return [a, b];
}

/** Merge a set of ghost ranges into the mark list (adjacent/overlapping ghosts fuse). */
function addGhosts(marks: Mark[], ranges: Array<[number, number]>): Mark[] {
  let ghosts = marks.filter((m) => m.kind === 'ghost').map((m) => ({ ...m }));
  const rest = marks.filter((m) => m.kind !== 'ghost');
  for (const [s, e] of ranges) {
    if (e <= s) continue;
    const hits = ghosts.filter((g) => g.s <= e && g.e >= s);
    const ns = Math.min(s, ...hits.map((g) => g.s));
    const ne = Math.max(e, ...hits.map((g) => g.e));
    ghosts = ghosts.filter((g) => !hits.includes(g));
    ghosts.push({ id: hits[0]?.id ?? uid(), s: ns, e: ne, kind: 'ghost' });
  }
  return [...rest, ...ghosts];
}

const isGhostAt = (marks: Mark[], i: number) => marks.some((m) => m.kind === 'ghost' && i >= m.s && i < m.e);

/** Which characters should become ghosts when the span [s,e) is "deleted" under the latch? */
function strikeRanges(text: string, marks: Mark[], s: number, e: number, leftExtend = true): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let fresh = 0;
  for (let i = s; i < e; i++) if (!isGhostAt(marks, i)) fresh++;
  out.push([s, e]);
  let need = (e - s) - fresh;
  let i = s - 1;
  while (leftExtend && need > 0 && i >= 0) {
    if (!isGhostAt(marks, i)) { out.push([i, i + 1]); need--; }
    i--;
  }
  return out;
}

interface Seg { s: number; e: number; ghost: boolean; pencil: boolean; punched: boolean; preview: boolean }

function segments(text: string, marks: Mark[], preview: [number, number] | null): Seg[] {
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) { cuts.add(Math.max(0, m.s)); cuts.add(Math.min(text.length, m.e)); }
  if (preview) { cuts.add(preview[0]); cuts.add(preview[1]); }
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    if (e <= s) continue;
    const cov = marks.filter((m) => m.s <= s && m.e >= e);
    out.push({
      s, e,
      ghost: cov.some((m) => m.kind === 'ghost'),
      pencil: cov.some((m) => m.kind === 'pencil'),
      punched: cov.some((m) => m.kind === 'pencil' && m.punched),
      preview: !!preview && preview[0] <= s && preview[1] >= e,
    });
  }
  return out;
}

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

export function RollView() {
  const song = currentSong.value!;
  const text = song.roll.text;
  const marks = song.roll.marks;
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const prev = useRef(text);
  const lastSong = useRef(song.id);
  const [preview, setPreviewState] = useState<[number, number] | null>(null);
  const pv = useRef<[number, number] | null>(null);
  const setPreview = (v: [number, number] | null) => { pv.current = v; setPreviewState(v); };
  const [sprint, setSprint] = useState<{ start: number; dinged: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const g = grease.value;
  const lt = latch.value;

  if (lastSong.current !== song.id) { lastSong.current = song.id; prev.current = text; }
  useEffect(() => { prev.current = text; }, [text, song.id]);

  // auto-size textarea so the page (not the textarea) scrolls
  useLayoutEffect(() => {
    const el = ta.current, sc = scroller.current;
    if (!el || !sc) return;
    const slip = (sc.querySelector('.spark-slip') as HTMLElement | null)?.offsetHeight ?? 0;
    el.style.height = '0px';
    el.style.height = Math.max(el.scrollHeight, sc.clientHeight - slip) + 'px';
  }, [text, song.roll.spark, g]);

  // sprint clock
  useEffect(() => {
    if (!sprint) return;
    const t = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [sprint?.start]);
  useEffect(() => {
    if (sprint && !sprint.dinged && now - sprint.start >= 300_000) {
      setSprint({ ...sprint, dinged: true });
      sound('ding'); haptic('heavy');
      pulseGrease.value = true;
      say('5:00 — SPRINT DONE. TIME TO HARVEST', { label: 'GREASE', run: () => { grease.value = true; pulseGrease.value = false; } });
    }
  }, [now]);

  const commit = (nt: string, nm: Mark[], caret?: number) => {
    updateCurrent((d) => { d.roll.text = nt; d.roll.marks = nm; });
    prev.current = nt;
    if (caret !== undefined) {
      requestAnimationFrame(() => {
        const el = ta.current;
        if (el) { el.value = nt; el.setSelectionRange(caret, caret); }
      });
    }
  };

  const strike = (s: number, e: number, caretAfter: number) => {
    const m = song.roll.marks;
    commit(prev.current, addGhosts(m, strikeRanges(prev.current, m, s, e)), caretAfter);
    feel('thock', 'light');
  };

  const onBeforeInput = (ev: InputEvent) => {
    if (!latch.value || !ev.cancelable) return;
    const el = ta.current!;
    const t = prev.current;
    const a = el.selectionStart, b = el.selectionEnd;
    const type = ev.inputType;
    if (!type.startsWith('delete')) return;
    ev.preventDefault();
    if (a !== b) { strike(a, b, b); return; }
    if (type === 'deleteContentForward') { if (a < t.length) strike(a, a + 1, a + 1); return; }
    if (type === 'deleteWordForward') {
      let e = a; while (e < t.length && /\s/.test(t[e])) e++; while (e < t.length && !/\s/.test(t[e])) e++;
      strike(a, e, e); return;
    }
    if (type === 'deleteWordBackward' || type === 'deleteSoftLineBackward' || type === 'deleteHardLineBackward') {
      let s = a; while (s > 0 && (/\s/.test(t[s - 1]) || isGhostAt(song.roll.marks, s - 1))) s--;
      while (s > 0 && !/\s/.test(t[s - 1]) && !isGhostAt(song.roll.marks, s - 1)) s--;
      strike(s, a, a); return;
    }
    // deleteContentBackward & friends: strike the nearest live char left of the caret
    let i = a - 1;
    while (i >= 0 && isGhostAt(song.roll.marks, i)) i--;
    if (i >= 0) strike(i, i + 1, a);
    else { haptic('light'); }
  };

  const onInput = (ev: Event) => {
    const el = ta.current!;
    const old = prev.current;
    const nv = el.value;
    if (nv === old) return;
    if (!sprint && nv.length > 0) setSprint({ start: Date.now(), dinged: false });
    const caret = el.selectionStart;
    const ed = diffEdit(old, nv, caret);
    if (lt && ed.del > 0 && ed.ins === 0) {
      // IME path that slipped past beforeinput: put the text back and ghost it
      const m = song.roll.marks;
      const caretAfter = ed.start + ed.del;
      commit(old, addGhosts(m, strikeRanges(old, m, ed.start, ed.start + ed.del)), caretAfter);
      el.value = old;
      el.setSelectionRange(caretAfter, caretAfter);
      feel('thock', 'light');
      return;
    }
    const nm = rebaseMarks(song.roll.marks, ed);
    commit(nv, nm);
    const it = (ev as InputEvent).inputType;
    if (it === 'insertLineBreak' || it === 'insertParagraph') { if (settings.peek().keys) sound('ding'); }
    else if (it === 'insertText') sound('key');
  };

  // ----- grease pencil: long-press, then drag -----
  const segs = useMemo(() => segments(text, marks, preview), [text, marks, preview]);
  const offsetAt = (x: number, y: number): number => indexAtPoint(mirror.current!, x, y, text.length);

  useEffect(() => {
    if (!g) return;
    const root = mirror.current!;
    const sc = scroller.current!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let auto: ReturnType<typeof setInterval> | undefined;
    let down: { x: number; y: number } | null = null;
    let active = false, anchor = 0, last = { x: 0, y: 0 }, moved = false;

    const stopAuto = () => { if (auto) clearInterval(auto); auto = undefined; };
    const refresh = (x: number, y: number) => {
      const o = offsetAt(x, y);
      setPreview([Math.min(anchor, o), Math.max(anchor, o)]);
    };
    const start = (x: number, y: number) => {
      down = { x, y }; last = { x, y }; moved = false; active = false;
      timer = setTimeout(() => {
        active = true; anchor = offsetAt(x, y); setPreview([anchor, anchor]); haptic('medium');
        auto = setInterval(() => {
          const r = sc.getBoundingClientRect();
          if (last.y < r.top + 46) sc.scrollTop -= 8; else if (last.y > r.bottom - 46) sc.scrollTop += 8; else return;
          refresh(last.x, last.y);
        }, 16);
      }, 280);
    };
    const mv = (x: number, y: number, e: Event) => {
      last = { x, y };
      if (!down) return;
      if (!active) { if (Math.hypot(x - down.x, y - down.y) > 9) { moved = true; clearTimeout(timer); } return; }
      e.preventDefault();
      refresh(x, y);
    };
    const end = () => {
      clearTimeout(timer); stopAuto();
      if (active) {
        const p = pv.current;
        if (p && p[1] > p[0]) {
          updateCurrent((d) => {
            const [a, b] = snapWords(d.roll.text, p[0], p[1]);
            d.roll.marks.push({ id: uid(), s: a, e: b, kind: 'pencil' });
            d.roll.marks = mergePencils(d.roll.marks);
          });
          feel('click', 'light');
        }
        setPreview(null);
      } else if (down && !moved) {
        const o = offsetAt(down.x, down.y);
        const hit = song.roll.marks.find((m) => m.kind === 'pencil' && !m.punched && o >= m.s && o <= m.e);
        if (hit) { updateCurrent((d) => { d.roll.marks = d.roll.marks.filter((m) => m.id !== hit.id); }); feel('click', 'light'); }
      }
      active = false; down = null;
    };
    const ts = (e: TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e: TouchEvent) => mv(e.touches[0].clientX, e.touches[0].clientY, e);
    const ms = (e: MouseEvent) => start(e.clientX, e.clientY);
    const mm = (e: MouseEvent) => { if (down) mv(e.clientX, e.clientY, e); };
    root.addEventListener('touchstart', ts, { passive: true });
    root.addEventListener('touchmove', tm, { passive: false });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
    root.addEventListener('mousedown', ms);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', end);
    return () => {
      clearTimeout(timer); stopAuto();
      root.removeEventListener('touchstart', ts); root.removeEventListener('touchmove', tm);
      root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', end);
      root.removeEventListener('mousedown', ms); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', end);
      setPreview(null);
    };
  }, [g, song.id, text]);

  useEffect(() => { if (g) ta.current?.blur(); }, [g]);

  const lines = text.split('\n').filter((l) => l.trim()).length;
  const words = (text.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;
  const elapsed = sprint ? now - sprint.start : 0;

  return (
    <div class={'mode-view roll' + (g ? ' grease' : '') + (lt ? ' latched' : '')}>
      <div class="roll-head">
        <button class="clock" onClick={() => { setSprint(null); setNow(Date.now()); feel('click'); }} aria-label="Sprint clock; tap to reset">
          <span class={'led ' + (sprint ? 'on red blink' : '')} />
          <span class="clk">{fmtClock(elapsed)}</span>
        </button>
        <span class="grow" />
        <span class="ctr"><i>LINES</i><Odometer value={lines} /></span>
        <span class="ctr"><i>WORDS</i><Odometer value={words} digits={4} /></span>
      </div>
      <div class="roll-scroll" ref={scroller}>
        {song.roll.spark && (
          <div class="spark-slip">
            <span class="tape-bit" />
            <div class="txt">{song.roll.spark}</div>
            <div class="acts">
              <button onClick={() => {
                const sp = song.roll.spark!;
                const nt = sp + '\n' + text;
                commit(nt, rebaseMarks(marks, { start: 0, del: 0, ins: sp.length + 1 }));
                updateCurrent((d) => { delete d.roll.spark; });
                feel('thock');
              }}>TYPE IT IN</button>
              <button aria-label="Dismiss spark" onClick={() => updateCurrent((d) => { delete d.roll.spark; })}><Icon n="close" size={14} /></button>
            </div>
          </div>
        )}
        <div class="roll-sheet">
          <div class="roll-stack">
            <div class="roll-mirror" ref={mirror} aria-hidden="true">
              {text === '' && <span class="ph">Start typing. Don't fix anything. Or draw a spark.</span>}
              {segs.map((s) => (
                <span data-s={s.s} key={s.s + '-' + s.e}
                  class={(s.ghost ? 'g ' : '') + (s.pencil ? (s.punched ? 'p done ' : 'p ') : '') + (s.preview ? 'pv' : '')}>
                  {text.slice(s.s, s.e)}
                </span>
              ))}
              {'​'}
            </div>
            <textarea ref={ta} class="roll-input" value={text} spellcheck={false} autocorrect="off" autocapitalize="sentences"
              readOnly={g} inputMode={g ? 'none' : 'text'} aria-label="The roll"
              onBeforeInput={onBeforeInput as any} onInput={onInput} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fuse overlapping pencil marks so highlights stay tidy. */
function mergePencils(marks: Mark[]): Mark[] {
  const pen = marks.filter((m) => m.kind === 'pencil' && !m.punched).sort((a, b) => a.s - b.s);
  const keep = marks.filter((m) => !(m.kind === 'pencil' && !m.punched));
  const out: Mark[] = [];
  for (const m of pen) {
    const last = out[out.length - 1];
    if (last && m.s <= last.e) last.e = Math.max(last.e, m.e); else out.push({ ...m });
  }
  return [...keep, ...out];
}

export function RollKeys() {
  const song = currentSong.value;
  const pending = pendingPencil(song);
  return (
    <Keys>
      <Key icon="latch" label="Latch" on={latch.value} led="amber" sound="clunk"
        onClick={() => { latch.value = !latch.value; if (latch.value) say('LATCHED — backspace now leaves ghost ink', undefined, 2200); }} />
      <Key icon="grease" label="Grease" on={grease.value} led="yellow" pulse={pulseGrease.value && !grease.value}
        onClick={() => { grease.value = !grease.value; pulseGrease.value = false; if (grease.value) say('PRESS & HOLD, THEN DRAG OVER WORDS', undefined, 2600); }} />
      <Key icon="spark" label="Spark" sound="ratchet" onClick={() => {
        const s = drawSpark();
        if (!s) { say('SHOEBOX EMPTY — CATCH A LINE WITH THE SLIP →'); return; }
        updateCurrent((d) => { d.roll.spark = s.text; });
      }} />
      <Key icon="punch" label="Punch" hot={pending > 0} badge={pending || null} sound="chk" onClick={() => {
        const n = punchPencil();
        if (!n) { say(pending ? 'ONLY GHOST INK IN THOSE MARKS' : 'NOTHING MARKED — GREASE-DRAG OVER LINES FIRST'); return; }
        haptic('heavy');
        say(`PUNCHED ${n} → TABLE`, { label: 'GO TO TABLE', run: () => setMode('table') });
      }} />
    </Keys>
  );
}
