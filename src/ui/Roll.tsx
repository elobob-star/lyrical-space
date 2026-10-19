import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentSong, drawScraps, scraps, setSetting, settings, updateCurrent } from '../store/state';
import { currentPage, flip, hasWords, pageId, pages, pendingMarks, punchPage, turnPage, updatePage } from '../store/notebook';
import { Mark, Page, uid } from '../store/models';
import { diffEdit, rebaseMarks } from '../engine/textdiff';
import { InkOp, InkResult, Wet, addGhosts, cleanText, isWordCh, reduce, reduceDiff, stripGhosts } from '../engine/ink';
import { Snap, canRedo, canUndo, inkReset, openPage, record, redo as redoStep, undo as undoStep } from '../store/inkHistory';
import { indexAtPoint } from '../engine/hit';
import { feel, haptic, sound } from '../engine/feel';
import { makeStrips, sendTextToBench } from '../store/actions';
import { copyText, shareText } from '../engine/share';
import { pushUndo, undoable } from '../store/undo';
import { hintOnce, latch, pen, rollStats, say, sprint } from '../store/ui';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { setMode } from './Bezel';

/** keep the soft keyboard up when a small button is tapped */
const keepFocus = (e: Event) => e.preventDefault();
const pulsePen = signal(false);
const sprintSheet = signal(false);

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
  /** the ink still wet (the word being typed, and the space after the last one): backspace may really erase it */
  const wet = useRef<Wet | null>(null);
  const composing = useRef(false);
  const [preview, setPreviewState] = useState<[number, number] | null>(null);
  const pv = useRef<[number, number] | null>(null);
  const setPreview = (v: [number, number] | null) => { pv.current = v; setPreviewState(v); };
  const [bail, setBail] = useState(0);
  const g = pen.value;
  const lt = latch.value;

  if (lastPage.current !== page.id) { lastPage.current = page.id; wet.current = null; }
  useEffect(() => { openPage(page.id); }, [page.id]);
  useEffect(() => { wet.current = null; }, [inkReset.value]);
  useEffect(() => { const w = wet.current; if (w && w.e > live().text.length) wet.current = null; }, [text]);
  useEffect(() => { hintOnce('notebook', 'THE NOTEBOOK — JUST RAMBLE. A WORD YOU\'RE TYPING ERASES; ONCE YOU HIT SPACE IT STRIKES THROUGH'); }, []);

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
  const refuse = () => { feel('thud', 'medium'); };
  const opts = () => ({ ghost: settings.peek().ghost, latch: latch.peek() });
  const inkState = () => ({ text: live().text, marks: live().marks, wet: wet.current });
  const snapOf = (caret: number): Snap => ({ text: live().text, ghosts: live().marks.filter((m) => m.kind === 'ghost').map((m) => ({ ...m })), caret });

  /** Put a reducer decision into the page. `sync` = the DOM must be brought in line (it was not, or must be put back). */
  const applyInk = (res: InkResult, caretBefore: number, sync: boolean) => {
    const el = ta.current;
    wet.current = res.wet;
    if (res.kind === 'refuse') {
      if (el) { el.value = live().text; const n = live().text.length; el.setSelectionRange(n, n); }
      refuse();
      return;
    }
    if (res.kind === 'noop') {
      if (el && sync) { el.value = live().text; el.setSelectionRange(res.caret, res.caret); }
      haptic('light');
      return;
    }
    record(live().id, snapOf(caretBefore), res.kind, Date.now(), res.kind === 'type' && /\n/.test(res.text.slice(Math.max(0, res.caret - 1), res.caret)));
    commit(res.text, res.marks, sync || res.kind === 'strike' ? res.caret : undefined);
    if (res.kind === 'strike') { feel('key', null); haptic('light'); }
  };

  const opFor = (type: string, a: number, b: number): InkOp | null => {
    switch (type) {
      case 'deleteContentBackward': return { t: 'back', from: a, to: b };
      case 'deleteContentForward': return { t: 'fwd', from: a, to: b };
      case 'deleteWordBackward': return { t: 'wordBack', from: a, to: b };
      case 'deleteWordForward': return { t: 'wordFwd', from: a, to: b };
      case 'deleteSoftLineBackward': case 'deleteHardLineBackward': return { t: 'lineBack', from: a, to: b };
      default: return a !== b ? { t: 'back', from: a, to: b } : null; // cut, drag-out, …: a selection going away
    }
  };

  /** typewriter scroll: as you write down the page it follows you, keeping the line you're on in the upper two thirds */
  const follow = () => requestAnimationFrame(() => {
    const el = ta.current, root = mirror.current, sc = scroller.current;
    if (!el || !root || !sc || document.activeElement !== el) return;
    const c = el.selectionStart;
    let target: HTMLElement | null = null;
    root.querySelectorAll<HTMLElement>('[data-s]').forEach((sp) => { if (Number(sp.dataset.s) <= c) target = sp; });
    const sp = target as HTMLElement | null;
    const node = sp?.firstChild;
    if (!sp || !node) return;
    const range = document.createRange();
    range.setStart(node, Math.max(0, Math.min(c - Number(sp.dataset.s), node.textContent?.length ?? 0)));
    range.collapse(true);
    const r = range.getClientRects()[0] ?? sp.getBoundingClientRect();
    const rel = r.top - sc.getBoundingClientRect().top;
    const limit = sc.clientHeight * 0.62;
    if (rel > limit) sc.scrollTop += rel - limit;
  });

  // ----- undo / redo -----
  const restore = (to: Snap) => {
    const cur = live();
    const ed = diffEdit(cur.text, to.text);
    const pencils = to.pencils ? to.pencils.map((m) => ({ ...m })) : rebaseMarks(cur.marks.filter((m) => m.kind !== 'ghost'), ed);
    wet.current = null;
    commit(to.text, [...pencils, ...to.ghosts.map((g) => ({ ...g }))], Math.min(to.caret, to.text.length));
    follow();
  };
  const stepBack = () => {
    const el = ta.current;
    const cur = snapOf(el?.selectionStart ?? live().text.length);
    const to = undoStep(cur);
    if (!to) { haptic('light'); return; }
    if (to.pencils) cur.pencils = live().marks.filter((m) => m.kind !== 'ghost').map((m) => ({ ...m }));
    feel('click', 'light'); restore(to);
  };
  const stepForward = () => {
    const el = ta.current;
    const cur = snapOf(el?.selectionStart ?? live().text.length);
    const to = redoStep(cur);
    if (!to) { haptic('light'); return; }
    if (to.pencils) cur.pencils = live().marks.filter((m) => m.kind !== 'ghost').map((m) => ({ ...m }));
    feel('click', 'light'); restore(to);
  };

  const onBeforeInput = (ev: InputEvent) => {
    if (!ev.cancelable) return;
    const el = ta.current!;
    const type = ev.inputType;
    const a = el.selectionStart, b = el.selectionEnd;
    if (type === 'historyUndo') { ev.preventDefault(); stepBack(); return; }
    if (type === 'historyRedo') { ev.preventDefault(); stepForward(); return; }
    if (type.startsWith('delete')) {
      const op = opFor(type, a, b);
      if (!op) return;
      ev.preventDefault();
      applyInk(reduce(inkState(), op, opts()), a, true);
      return;
    }
    // typing over a selection: the old words are struck, the new ones go in after them
    if (a !== b && (type === 'insertText' || type === 'insertFromPaste') && (latch.peek() || settings.peek().ghost)) {
      const data = ev.data ?? (ev as any).dataTransfer?.getData?.('text') ?? '';
      if (!data) return;
      ev.preventDefault();
      applyInk(reduce(inkState(), { t: 'ins', from: a, to: b, text: data }, opts()), a, true);
    }
  };

  const onInput = (ev: Event) => {
    const el = ta.current!;
    const old = live().text;
    const nv = el.value;
    if (nv === old) return;
    const ed = diffEdit(old, nv, el.selectionStart);
    const { res, revert } = reduceDiff(inkState(), ed, nv, opts());
    if (revert || res.kind === 'refuse') {
      // an IME deleted something that should have been struck (or latched): put the page back and decide here
      el.value = old;
      applyInk(res, ed.start + ed.del, true);
      return;
    }
    applyInk(res, ed.start, false);
    // trust the real caret over the arithmetic: if they ever disagree, the caret is right
    const w = wet.current, c = el.selectionStart;
    if (w && c !== w.e && c > w.s && c <= live().text.length) w.e = c;
    follow();
    const it = (ev as InputEvent).inputType;
    if (it === 'insertLineBreak' || it === 'insertParagraph') { if (settings.peek().keys) sound('ding'); }
    else if (it === 'insertText') sound('key');
  };

  // the caret leaving the wet ink dries it (anywhere inside it is still fine)
  const onCaret = () => {
    const el = ta.current, w = wet.current;
    if (!el || !w || composing.current) return;
    if (el.selectionStart < w.s || el.selectionEnd > w.e) wet.current = null;
  };
  useEffect(() => {
    document.addEventListener('selectionchange', onCaret);
    return () => document.removeEventListener('selectionchange', onCaret);
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) stepForward(); else stepBack(); }
    else if (k === 'y') { e.preventDefault(); stepForward(); }
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
    record(live().id, snapOf(ta.current?.selectionStart ?? t.length), 'other');
    wet.current = null;
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
            {canUndo.value && <button class="pg-nav pg-undo" aria-label="Undo" onMouseDown={keepFocus} onClick={stepBack}><Icon n="undo" size={15} stroke={2} /></button>}
            {canRedo.value && <button class="pg-nav pg-undo" aria-label="Redo" onMouseDown={keepFocus} onClick={stepForward}><Icon n="redo" size={15} stroke={2} /></button>}
            <button class="pg-nav" aria-label="Earlier page" disabled={!prevP} onClick={() => go(-1)}><Icon n="left" size={15} stroke={2} /></button>
            <button class="pg-n pg-menu" aria-label="This page" onClick={() => { feel('click'); pageMenu.value = true; }}>P.{page.n}</button>
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
                {segs.map((s, i) => (
                  <span data-s={s.s} key={i}
                    class={(s.ghost ? 'g ' : '') + (s.pencil ? (s.punched ? 'p done ' : 'p ') : '') + (s.preview ? 'pv' : '')}>
                    {text.slice(s.s, s.e)}
                  </span>
                ))}
                <span ref={end} class="end">{'\u200b'}</span>
              </div>
              <div class="bail" style={{ height: bail + 'px' }} aria-hidden="true"><i /></div>
              <textarea ref={ta} class="roll-input" value={text} spellcheck={false} autocorrect="off" autocapitalize="sentences"
                readOnly={g} inputMode={g ? 'none' : 'text'} aria-label="Notebook page"
                onBeforeInput={onBeforeInput as any} onInput={onInput} onKeyUp={onCaret} onClick={onCaret} onKeyDown={onKeyDown}
                onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; onCaret(); }} />
            </div>
          </div>
        </div>
      </div>
      {pagesSheet.value && <PagesSheet />}
      {pageMenu.value && <PageMenu />}
    </div>
  );
}

let flipDir: -1 | 0 | 1 = 0;
const pagesSheet = signal(false);
const pageMenu = signal(false);
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function stampDate(t: number): string {
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
const words = (t: string) => (t.match(/[\p{L}\p{N}'’]+/gu) ?? []).length;


/** What you can do with the page in front of you. */
function PageMenu() {
  const close = () => (pageMenu.value = false);
  const page = currentPage.value;
  if (!page) return null;
  const clean = cleanText(page.text, page.marks).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const struck = page.marks.some((m) => m.kind === 'ghost');
  const song = currentSong.value;
  return (
    <Sheet title={`THIS PAGE · P.${page.n}`} onClose={close}>
      <p class="hint">{words(page.text)} words{struck ? ' · some struck out' : ''}. Struck-out words are left out when you copy, share or send.</p>
      <div class="choices">
        <button class="choice" disabled={!clean} onClick={async () => { close(); feel('click'); if (await copyText(clean)) say('COPIED — WITHOUT THE STRUCK-OUT WORDS'); }}><span>COPY TEXT</span><small>to paste anywhere</small></button>
        <button class="choice" disabled={!clean} onClick={() => { close(); void shareText(`Foolscap · P.${page.n}`, clean); }}><span>SHARE…</span><small>send the page to an app</small></button>
        <button class="choice" disabled={!clean || !song} onClick={() => {
          close();
          if (!song) return;
          const sent = sendTextToBench(song.id, clean.split('\n'), 'new', 'verse');
          feel('thock', 'medium');
          undoable('bench', `P.${page.n} → A NEW VERSE ON THE BENCH`, sent.undo, undefined, 'TO THE BENCH');
          setMode('bench');
        }}><span>TO THE BENCH</span><small>its lines become a new verse</small></button>
        <button class="choice" disabled={!struck} onClick={() => {
          close();
          const cur = currentPage.peek();
          if (!cur) return;
          const was: Snap = {
            text: cur.text, caret: cur.text.length,
            ghosts: cur.marks.filter((m) => m.kind === 'ghost').map((m) => ({ ...m })),
            pencils: cur.marks.filter((m) => m.kind !== 'ghost').map((m) => ({ ...m })),
          };
          const tidy = stripGhosts(cur.text, cur.marks);
          record(cur.id, was, 'other');
          updatePage(cur.id, (d) => { d.text = tidy.text; d.marks = tidy.marks; });
          inkReset.value++;
          feel('shuffle', 'light'); say('STRUCK-OUT WORDS BURNED — UNDO BRINGS THEM BACK');
        }}><span>BURN THE STRIKES</span><small>delete struck-out ink for good</small></button>
      </div>
    </Sheet>
  );
}

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
  const laid = new Set<string>();
  updateCurrent((d) => { const fresh = makeStrips(texts, 'roll', d.table); fresh.forEach((f) => laid.add(f.id)); d.table.push(...fresh); });
  pushUndo('table', 'ON TABLE', () => updateCurrent((d) => { d.table = d.table.filter((x) => !laid.has(x.id)); }));
  setMode('table');
}

function scrollRollTop(): void {
  requestAnimationFrame(() => document.querySelector('.roll-scroll')?.scrollTo({ top: 0, behavior: 'smooth' }));
}
