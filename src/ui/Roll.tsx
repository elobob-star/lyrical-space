import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentSong, drawScraps, scraps, setSetting, settings, updateCurrent } from '../store/state';
import { currentPage, flip, hasWords, pageId, pages, pendingMarks, punchPage, turnPage, updatePage } from '../store/notebook';
import { Mark, Page, uid } from '../store/models';
import { diffEdit, rebaseMarks } from '../engine/textdiff';
import { indexAtPoint } from '../engine/hit';
import { feel, haptic, sound } from '../engine/feel';
import { makeStrips } from '../store/actions';
import { hintOnce, latch, pen, rollStats, say, sprint } from '../store/ui';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { setMode } from './Bezel';

const pulsePen = signal(false);
const sprintSheet = signal(false);

const isWordCh = (c: string | undefined) => !!c && /[\p{L}\p{N}'’]/u.test(c);

function snapWords(text: string, a: number, b: number): [number, number] {
  if (a > b) [a, b] = [b, a];
  while (a > 0 && isWordCh(text[a - 1])) a--;
  while (b < text.length && isWordCh(text[b])) b++;
  return [a, b];
}

/** The phrase under a tap: bounded by line breaks and sentence punctuation (commas stay inside). */
export function phraseAt(text: string, i: number): [number, number] | null {
  const stop = /[\n.!?;:—–]/;
  i = Math.max(0, Math.min(i, text.length - 1));
  if (text[i] === '\n' && i > 0) i--;
  let a = i, b = i;
  while (a > 0 && !stop.test(text[a - 1])) a--;
  while (b < text.length && !stop.test(text[b])) b++;
  if (b < text.length && text[b] !== '\n') b++; // keep the full stop with the phrase
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  return b > a ? [a, b] : null;
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

/** Which characters become ghosts when [s,e) is "deleted" (already-ghost chars push the strike further left). */
function strikeRanges(marks: Mark[], s: number, e: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[s, e]];
  let fresh = 0;
  for (let i = s; i < e; i++) if (!isGhostAt(marks, i)) fresh++;
  let need = (e - s) - fresh;
  let i = s - 1;
  while (need > 0 && i >= 0) {
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

/** Fuse overlapping pencil marks so highlights stay tidy. */
function mergePencils(marks: Mark[]): Mark[] {
  const live = marks.filter((m) => m.kind === 'pencil' && !m.punched).sort((a, b) => a.s - b.s);
  const keep = marks.filter((m) => !(m.kind === 'pencil' && !m.punched));
  const out: Mark[] = [];
  for (const m of live) {
    const last = out[out.length - 1];
    if (last && m.s <= last.e) last.e = Math.max(last.e, m.e); else out.push({ ...m });
  }
  return [...keep, ...out];
}

// ---------- sprint (a timed, keep-the-pen-moving freewrite) ----------
let sprintTimer: ReturnType<typeof setTimeout> | undefined;
export function startSprint(min: number): void {
  clearTimeout(sprintTimer);
  sprint.value = { end: Date.now() + min * 60_000, min };
  setSetting('sprint', min);
  feel('snap', 'medium');
  say(`${min} MINUTES — DON'T STOP, DON'T FIX`);
  sprintTimer = setTimeout(() => {
    sprint.value = null;
    sound('ding'); haptic('heavy');
    pulsePen.value = true;
    say('TIME. NOW HARVEST — PICK UP THE PEN', { label: 'PEN', run: () => { setMode('roll'); pen.value = true; pulsePen.value = false; } }, 9000);
  }, min * 60_000);
}
export function stopSprint(): void {
  clearTimeout(sprintTimer);
  sprint.value = null;
  feel('snap', 'light');
  say('SPRINT STOPPED');
}

/** Visual flourish: the marked phrases are die-cut out of the roll and slide off toward the Table. */
function flyPunched(root: HTMLElement | null): void {
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const spans = [...root.querySelectorAll<HTMLElement>('.p:not(.done)')];
  spans.slice(0, 24).forEach((sp, i) => {
    for (const r of sp.getClientRects()) {
      if (r.width < 4) continue;
      const chip = document.createElement('div');
      chip.className = 'punch-chip';
      chip.textContent = sp.textContent;
      Object.assign(chip.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.appendChild(chip);
      const rot = (Math.random() - 0.5) * 10;
      chip.animate([
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
        { transform: 'translate3d(0,0,0) scale(.94)', opacity: 1, offset: 0.18 },
        { transform: `translate3d(0,-6px,0) scale(1.02) rotate(${rot / 3}deg)`, opacity: 1, offset: 0.32 },
        { transform: `translate3d(${window.innerWidth}px, ${-20 + Math.random() * 40}px, 0) rotate(${rot}deg)`, opacity: 0.9 },
      ], { duration: 720, delay: i * 45, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = () => chip.remove();
    }
  });
}

export function RollView() {
  const page = currentPage.value!;
  const text = page.text;
  const marks = page.marks;
  const st = settings.value;
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLSpanElement>(null);
  const lastPage = useRef(page.id);
  /** live page state: handlers can fire several times between renders, so never trust the render closure */
  const live = () => currentPage.peek()!;
  const write = (recipe: (d: Page) => void) => updatePage(currentPage.peek()!.id, recipe);
  /** the word still being typed: backspace may really erase it (typo grace) */
  const wet = useRef<{ s: number; e: number } | null>(null);
  const [preview, setPreviewState] = useState<[number, number] | null>(null);
  const pv = useRef<[number, number] | null>(null);
  const setPreview = (v: [number, number] | null) => { pv.current = v; setPreviewState(v); };
  const [bail, setBail] = useState(0);
  const g = pen.value;
  const lt = latch.value;

  if (lastPage.current !== page.id) { lastPage.current = page.id; wet.current = null; }
  useEffect(() => { hintOnce('notebook', 'THE NOTEBOOK — JUST RAMBLE. BACKSPACE STRIKES THROUGH, IT NEVER ERASES'); }, []);

  // the mirror is in normal flow (it defines the page height); the textarea simply overlays it.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const set = () => sc.style.setProperty('--roll-h', sc.clientHeight + 'px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  // line/word counts for the readout: throttled so typing never pays for it
  useEffect(() => {
    const calc = () => {
      const lines = text.split('\n').filter((l) => l.trim()).length;
      const words = (text.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;
      rollStats.value = { lines, words };
    };
    const t = setTimeout(calc, rollStats.peek().words === 0 && rollStats.peek().lines === 0 ? 0 : 220);
    return () => clearTimeout(t);
  }, [text, page.id]);

  // ----- forward latch: carriage only moves forward; a paper bail folds away everything but the last two lines -----
  useLayoutEffect(() => {
    if (!lt) { setBail(0); return; }
    const el = end.current, sheet = mirror.current;
    if (!el || !sheet) return;
    const lh = parseFloat(getComputedStyle(sheet).lineHeight) || 27;
    const top = el.offsetTop; // the end marker sits on the caret's line (the latch pins the caret to the end)
    setBail(Math.max(0, top - lh * 2 - 3)); // the current line and the two before it stay in view
    const sc = scroller.current;
    if (sc && document.activeElement === ta.current) {
      const want = top - sc.clientHeight * 0.45;
      if (want > sc.scrollTop) sc.scrollTop = want;
    }
  }, [lt, text]);
  useEffect(() => {
    if (!lt) return;
    const pin = () => {
      const el = ta.current;
      if (!el || document.activeElement !== el) return;
      const n = el.value.length;
      if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n);
    };
    pin();
    document.addEventListener('selectionchange', pin);
    return () => document.removeEventListener('selectionchange', pin);
  }, [lt]);

  const commit = (nt: string, nm: Mark[], caret?: number) => {
    write((d) => { d.text = nt; d.marks = nm; });
    if (caret !== undefined) {
      const el = ta.current;
      if (el) { el.value = nt; el.setSelectionRange(caret, caret); }
      requestAnimationFrame(() => { const e2 = ta.current; if (e2 && e2.value === nt) e2.setSelectionRange(caret, caret); });
    }
  };

  const strike = (s: number, e: number, caretAfter: number) => {
    const m = live().marks;
    commit(live().text, addGhosts(m, strikeRanges(m, s, e)), caretAfter);
    feel('key', null);
    haptic('light');
  };
  const refuse = () => { feel('thud', 'medium'); };
  const ghostOn = () => settings.peek().ghost;

  const onBeforeInput = (ev: InputEvent) => {
    const el = ta.current!;
    const t = live().text;
    const marksNow = live().marks;
    const a = el.selectionStart, b = el.selectionEnd;
    const type = ev.inputType;
    if (!ev.cancelable) return;
    if (type.startsWith('delete')) {
      if (latch.value) { ev.preventDefault(); refuse(); return; }
      if (!ghostOn()) return;
      const w = wet.current;
      // typo grace: still inside the word you're typing → a real erase
      if (type === 'deleteContentBackward' && a === b && w && a === w.e && w.e > w.s) return;
      ev.preventDefault();
      if (a !== b) { strike(a, b, b); wet.current = null; return; }
      if (type === 'deleteContentForward') { if (a < t.length) strike(a, a + 1, a + 1); return; }
      if (type === 'deleteWordForward') {
        let e = a; while (e < t.length && /\s/.test(t[e])) e++; while (e < t.length && !/\s/.test(t[e])) e++;
        strike(a, e, e); return;
      }
      if (type === 'deleteWordBackward' || type === 'deleteSoftLineBackward' || type === 'deleteHardLineBackward') {
        let s = a; while (s > 0 && (/\s/.test(t[s - 1]) || isGhostAt(marksNow, s - 1))) s--;
        while (s > 0 && !/\s/.test(t[s - 1]) && !isGhostAt(marksNow, s - 1)) s--;
        strike(s, a, a); wet.current = null; return;
      }
      let i = a - 1;
      while (i >= 0 && isGhostAt(marksNow, i)) i--;
      if (i >= 0) strike(i, i + 1, a); else haptic('light');
      wet.current = null;
      return;
    }
    // typing over a selection: the old words are struck, the new ones go in after them
    if (a !== b && (type === 'insertText' || type === 'insertFromPaste') && (latch.value || ghostOn())) {
      const data = ev.data ?? (ev as any).dataTransfer?.getData?.('text') ?? '';
      if (!data) return;
      ev.preventDefault();
      const ghosts = addGhosts(marksNow, strikeRanges(marksNow, a, b));
      const nt = t.slice(0, b) + data + t.slice(b);
      commit(nt, rebaseMarks(ghosts, { start: b, del: 0, ins: data.length }), b + data.length);
      wet.current = null;
    }
  };

  const onInput = (ev: Event) => {
    const el = ta.current!;
    const old = live().text;
    const nv = el.value;
    if (nv === old) return;
    const caret = el.selectionStart;
    const ed = diffEdit(old, nv, caret);
    if (ed.del > 0 && ed.ins === 0) {
      // deletions that slipped past beforeinput (Android IMEs): decide after the fact
      const w = wet.current;
      const graced = !latch.value && (!ghostOn() || (w && ed.start >= w.s && ed.start + ed.del <= w.e));
      if (!graced) {
        el.value = old;
        if (latch.value) { el.setSelectionRange(old.length, old.length); refuse(); return; }
        const m = live().marks;
        const caretAfter = ed.start + ed.del;
        commit(old, addGhosts(m, strikeRanges(m, ed.start, ed.start + ed.del)), caretAfter);
        el.setSelectionRange(caretAfter, caretAfter);
        feel('key', null);
        wet.current = null;
        return;
      }
      if (w) w.e = Math.max(w.s, w.e - ed.del);
    } else if (ed.ins > 0) {
      const added = nv.slice(ed.start, ed.start + ed.ins);
      const w = wet.current;
      if (/\s/.test(added)) {
        const tail = /\S+$/.exec(added);
        wet.current = tail ? { s: ed.start + ed.ins - tail[0].length, e: ed.start + ed.ins } : null;
      } else if (w && ed.start >= w.s && ed.start + ed.del <= w.e) w.e = w.e - ed.del + ed.ins; // still the same word (IME composition grows it)
      else wet.current = { s: ed.start, e: ed.start + ed.ins };
    }
    commit(nv, rebaseMarks(live().marks, ed));
    const it = (ev as InputEvent).inputType;
    if (it === 'insertLineBreak' || it === 'insertParagraph') { if (settings.peek().keys) sound('ding'); }
    else if (it === 'insertText') sound('key');
  };
  // moving the caret somewhere else dries the ink
  const onCaret = () => {
    const el = ta.current, w = wet.current;
    if (el && w && (el.selectionStart !== w.e || el.selectionEnd !== w.e)) wet.current = null;
  };

  // ----- the pen: tap a phrase to mark it; press, hold, then drag for an exact range -----
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
      }, 300);
    };
    const mv = (x: number, y: number, e: Event) => {
      last = { x, y };
      if (!down) return;
      if (!active) { if (Math.hypot(x - down.x, y - down.y) > 9) { moved = true; clearTimeout(timer); } return; }
      e.preventDefault();
      refresh(x, y);
    };
    const finish = () => {
      clearTimeout(timer); stopAuto();
      const cur = currentPage.peek();
      if (!cur) return;
      if (active) {
        const p = pv.current;
        if (p && p[1] > p[0]) {
          write((d) => {
            const [a, b] = snapWords(d.text, p[0], p[1]);
            d.marks.push({ id: uid(), s: a, e: b, kind: 'pencil' });
            d.marks = mergePencils(d.marks);
          });
          feel('click', 'light');
        }
        setPreview(null);
      } else if (down && !moved) {
        const o = offsetAt(down.x, down.y);
        const hit = cur.marks.find((m) => m.kind === 'pencil' && o >= m.s && o <= m.e);
        if (hit?.punched) { say('ALREADY PUNCHED OUT'); }
        else if (hit) { write((d) => { d.marks = d.marks.filter((m) => m.id !== hit.id); }); feel('click', 'light'); }
        else {
          const ph = phraseAt(cur.text, Math.min(o, cur.text.length - 1));
          if (ph) {
            write((d) => { d.marks.push({ id: uid(), s: ph[0], e: ph[1], kind: 'pencil' }); d.marks = mergePencils(d.marks); });
            feel('click', 'light');
          }
        }
      }
      active = false; down = null;
    };
    const ts = (e: TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e: TouchEvent) => mv(e.touches[0].clientX, e.touches[0].clientY, e);
    const ms = (e: MouseEvent) => start(e.clientX, e.clientY);
    const mm = (e: MouseEvent) => { if (down) mv(e.clientX, e.clientY, e); };
    const te = (e: TouchEvent) => { if (active || (down && !moved)) e.preventDefault(); finish(); };
    root.addEventListener('touchstart', ts, { passive: true });
    root.addEventListener('touchmove', tm, { passive: false });
    root.addEventListener('touchend', te);
    root.addEventListener('touchcancel', finish);
    root.addEventListener('mousedown', ms);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', finish);
    return () => {
      clearTimeout(timer); stopAuto();
      root.removeEventListener('touchstart', ts); root.removeEventListener('touchmove', tm);
      root.removeEventListener('touchend', te); root.removeEventListener('touchcancel', finish);
      root.removeEventListener('mousedown', ms); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', finish);
      setPreview(null);
    };
  }, [g, page.id]);

  useEffect(() => { if (g) ta.current?.blur(); }, [g]);
  useEffect(() => () => { pen.value = false; }, []);

  const typeSpark = () => {
    const sp = live().spark!;
    const t = live().text;
    const pre = !t ? '' : t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
    const nt = t + pre + sp + '\n';
    commit(nt, live().marks, nt.length);
    write((d) => { delete d.spark; });
    feel('thock');
    pen.value = false;
    setTimeout(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(nt.length, nt.length); } }, 30);
  };

  const list = pages.value;
  const idx = list.findIndex((p) => p.id === page.id);
  const prevP = list[idx - 1], nextP = list[idx + 1];
  const isLatest = !nextP;
  const go = (dir: -1 | 1) => { if (!(dir < 0 ? prevP : nextP)) { haptic('light'); return; } flipDir = dir; feel('shuffle', 'light'); flip(dir); };
  const head = useRef<{ x: number; y: number } | null>(null);

  return (
    <div class={'mode-view roll' + (g ? ' pen' : '') + (lt ? ' latched' : '')}>
      <div class="roll-scroll" ref={scroller}>
        <div class={'leaf' + (flipDir ? (flipDir < 0 ? ' flip-back' : ' flip-fwd') : '')} key={page.id} onAnimationEnd={() => { flipDir = 0; }}>
          <div class="pad-gum" aria-hidden="true" />
          <header class="page-head"
            onPointerDown={(e) => { head.current = { x: e.clientX, y: e.clientY }; }}
            onPointerUp={(e) => {
              const h = head.current; head.current = null;
              if (h && Math.abs(e.clientX - h.x) > 50 && Math.abs(e.clientX - h.x) > Math.abs(e.clientY - h.y) * 1.5) go(e.clientX > h.x ? -1 : 1);
            }}>
            <button class="pg-stamp" aria-label="All pages" onClick={() => { feel('click'); pagesSheet.value = true; }}>
              <b>{stampDate(page.createdAt)}</b>
              {page.fromSong && <small>FROM {page.fromSong}</small>}
            </button>
            <span class="grow" />
            <button class="pg-nav" aria-label="Earlier page" disabled={!prevP} onClick={() => go(-1)}><Icon n="left" size={15} stroke={2} /></button>
            <span class="pg-n">P.{page.n}</span>
            <button class="pg-nav" aria-label="Later page" disabled={!nextP} onClick={() => go(1)}><Icon n="right" size={15} stroke={2} /></button>
            <button class="pg-new" aria-label="New page" disabled={isLatest && !hasWords(page) && !page.spark}
              onClick={() => { flipDir = 1; pen.value = false; feel('tape', 'medium'); const p2 = turnPage(); say(`NEW PAGE · P.${p2.n}`); setTimeout(() => (document.querySelector('.roll-input') as HTMLTextAreaElement | null)?.focus(), 80); }}><Icon n="plus" size={15} stroke={2} /></button>
          </header>
          {!isLatest && <div class="pg-older">AN EARLIER PAGE — STILL YOURS TO WRITE ON</div>}
          {page.spark && (
            <div class="draw-slip" key={page.spark}>
              <span class="tape-bit" />
              <div class="from">FROM THE SHOEBOX</div>
              <div class="txt">{page.spark}</div>
              <div class="acts">
                <button onClick={() => { const n = drawScraps(1, [page.spark!])[0]; if (n) { write((d) => { d.spark = n.text; }); feel('ratchet', 'light'); } }}><Icon n="shuffle" size={13} /> ANOTHER</button>
                <button class="go" onClick={typeSpark}>WRITE FROM IT</button>
                <button aria-label="Put it back" onClick={() => write((d) => { delete d.spark; })}><Icon n="close" size={13} /></button>
              </div>
            </div>
          )}
          <div class="roll-sheet">
            <div class="roll-stack">
              <div class="roll-mirror" ref={mirror} aria-hidden="true">
                {text === '' && <span class="ph">Start anywhere. Don't fix anything.{'\n'}Or press DRAW for a line from the shoebox.</span>}
                {segs.map((s) => (
                  <span data-s={s.s} key={s.s + '-' + s.e}
                    class={(s.ghost ? 'g ' : '') + (s.pencil ? (s.punched ? 'p done ' : 'p ') : '') + (s.preview ? 'pv' : '')}>
                    {text.slice(s.s, s.e)}
                  </span>
                ))}
                <span ref={end} class="end">{'\u200b'}</span>
              </div>
              <div class="bail" style={{ height: bail + 'px' }} aria-hidden="true"><i /></div>
              <textarea ref={ta} class="roll-input" value={text} spellcheck={false} autocorrect="off" autocapitalize="sentences"
                readOnly={g} inputMode={g ? 'none' : 'text'} aria-label="Notebook page"
                onBeforeInput={onBeforeInput as any} onInput={onInput} onKeyUp={onCaret} onClick={onCaret} />
            </div>
          </div>
        </div>
      </div>
      {pagesSheet.value && <PagesSheet />}
    </div>
  );
}

let flipDir: -1 | 0 | 1 = 0;
const pagesSheet = signal(false);
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function stampDate(t: number): string {
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
const words = (t: string) => (t.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;

function PagesSheet() {
  const close = () => (pagesSheet.value = false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = [...pages.value].reverse().filter((p) => !needle || p.text.toLowerCase().includes(needle));
  const cur = currentPage.value?.id;
  return (
    <Sheet title={`THE NOTEBOOK · ${pages.value.length} PAGES`} onClose={close}>
      <input class="field ui" placeholder="search every page…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="list pages-list" style={{ marginTop: '10px' }}>
        {list.map((p) => {
          const first = p.text.trim().split('\n').find((l) => l.trim()) ?? '';
          const hit = needle ? p.text.toLowerCase().indexOf(needle) : -1;
          const snippet = hit >= 0 ? '…' + p.text.slice(Math.max(0, hit - 24), hit + 48).replace(/\s+/g, ' ') + '…' : first;
          return (
            <button class={'li hist' + (p.id === cur ? ' cur' : '')} key={p.id} onClick={() => { flipDir = 0; pageId.value = p.id; close(); feel('click'); }}>
              <b>P.{p.n} · {stampDate(p.createdAt)}{p.fromSong ? ` · ${p.fromSong}` : ''}</b>
              <small>{snippet || '— blank —'}{p.text.trim() ? ` · ${words(p.text)} words` : ''}</small>
            </button>
          );
        })}
        {list.length === 0 && <div class="tray-note">NO PAGE MENTIONS THAT.</div>}
      </div>
    </Sheet>
  );
}

function SprintSheet() {
  const close = () => (sprintSheet.value = false);
  const last = settings.value.sprint;
  return (
    <Sheet title="SPRINT" onClose={close}>
      <p class="hint">A timed freewrite. Keep the pen moving until the bell — no rereading, no fixing. Pair it with the <b>LATCH</b> for a true forward-only run.</p>
      <div class="grid4">
        {[5, 10, 15, 20, 25, 30, 45, 60].map((m) => (
          <button key={m} class={'cell' + (m === last ? ' on' : '')} onClick={() => { close(); startSprint(m); setTimeout(() => (document.querySelector('.roll-input') as HTMLTextAreaElement | null)?.focus(), 60); }}>{m}<small style={{ fontSize: '9px', marginLeft: '2px' }}>MIN</small></button>
        ))}
      </div>
    </Sheet>
  );
}

export function RollKeys() {
  const page = currentPage.value;
  const pending = pendingMarks(page);
  return (
    <>
      <Keys>
        <Key icon="latch" label="Latch" led on={latch.value} sound="clunk"
          onClick={() => {
            latch.value = !latch.value;
            if (latch.value) { pen.value = false; say('LATCHED — FORWARD ONLY. NO BACKSPACE, NO LOOKING BACK'); }
            else say('UNLATCHED');
          }} />
        <Key icon="grease" label="Pen" led on={pen.value} pulse={pulsePen.value && !pen.value}
          onClick={() => { pen.value = !pen.value; pulsePen.value = false; if (pen.value) { latch.value = false; say('PEN — TAP A LINE WORTH KEEPING · HOLD & DRAG FOR EXACT WORDS'); } }} />
        <Key icon="draw" label="Draw" sound="ratchet" onClick={() => {
          const cur = currentPage.peek();
          if (!cur) return;
          const s = drawScraps(1, cur.spark ? [cur.spark] : [])[0];
          if (!s) { say('THE SHOEBOX IS EMPTY — PUNCH OR CATCH A LINE FIRST'); return; }
          updatePage(cur.id, (d) => { d.spark = s.text; });
          scrollRollTop();
        }} />
        <Key icon="punch" label="Punch" tone="dark" led on={pending > 0} pulse={pending > 0} badge={pending || null} sound={null} onClick={() => {
          const cur = currentPage.peek();
          if (!cur || !pendingMarks(cur)) { feel('thud', 'light'); say('NOTHING MARKED — TAP LINES WITH THE PEN FIRST'); return; }
          flyPunched(document.querySelector('.roll-mirror') as HTMLElement | null);
          const ids = punchPage(cur);
          feel('punch', 'heavy');
          if (!ids.length) { say('ONLY STRUCK-OUT INK IN THOSE MARKS'); return; }
          say(`PUNCHED ${ids.length} INTO THE SHOEBOX`, { label: 'ON TABLE', run: () => layOnTable(ids) });
        }} />
        <Key icon="timer" label={sprint.value ? 'Stop' : 'Sprint'} aria="Sprint" led on={!!sprint.value} sound="click"
          onClick={() => { if (sprint.value) stopSprint(); else sprintSheet.value = true; }} />
      </Keys>
      {sprintSheet.value && <SprintSheet />}
    </>
  );
}

/** Lay freshly punched scraps straight onto the current song's Table. */
function layOnTable(ids: string[]): void {
  const texts = scraps.peek().filter((s) => ids.includes(s.id)).map((s) => s.text);
  if (!currentSong.peek() || !texts.length) return;
  updateCurrent((d) => { d.table.push(...makeStrips(texts, 'roll', d.table)); });
  setMode('table');
}

function scrollRollTop(): void {
  requestAnimationFrame(() => document.querySelector('.roll-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }));
}
