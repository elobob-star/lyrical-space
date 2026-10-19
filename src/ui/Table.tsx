import { signal } from '@preact/signals';
import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { addScrap, currentSong, drawScraps, removeScrap, updateCurrent } from '../store/state';
import { ID, SectionKind, Strip, sectionNames, uid } from '../store/models';
import { feel, haptic, sound } from '../engine/feel';
import { freeSpot, makeStrips, sendTextToBench } from '../store/actions';
import { cutUp, piecesOf, snip, tape, TapeHow } from '../store/strips';
import { cutting, hintOnce, say } from '../store/ui';
import { pushUndo, undoable } from '../store/undo';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Choices, Sheet, TextSheet } from './Sheet';
import { UndoChip } from './UndoChip';
import { setMode } from './Bezel';

const selected = signal<ID | null>(null);
const sheetState = signal<null | { kind: 'new'; x: number; y: number } | { kind: 'edit'; id: ID } | { kind: 'bench'; id: ID } | { kind: 'more'; id: ID }>(null);
/** stagger for strips that just landed (deal / cut-up) */
const arrival = new Map<ID, number>();

const hash = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Scissor-cut edges: never quite straight, but always the same for a given strip. */
const edgeCache = new Map<string, string>();
function edges(id: string): string {
  const hit = edgeCache.get(id);
  if (hit) return hit;
  let h = hash(id);
  const r = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  const L = [0, 30, 58, 100].map((y) => `${(r() * 2.6).toFixed(1)}px ${y}%`);
  const R = [100, 64, 36, 0].map((y) => `calc(100% - ${(r() * 2.6).toFixed(1)}px) ${y}%`);
  const out = `polygon(${[...L, ...R].join(',')})`;
  edgeCache.set(id, out);
  return out;
}

const snapshot = () => JSON.parse(JSON.stringify(currentSong.peek()?.table ?? [])) as Strip[];
const restore = (t: Strip[]) => updateCurrent((d) => { d.table = t; });
const topZ = (t: Strip[]) => Math.max(0, ...t.map((x) => x.z)) + 1;
const clampX = (v: number) => Math.max(-0.1, Math.min(0.92, v));
const clampY = (v: number) => Math.max(-0.02, Math.min(0.95, v));

function land(strips: Strip[]): void {
  strips.forEach((s, i) => arrival.set(s.id, i * 70));
  setTimeout(() => strips.forEach((s) => arrival.delete(s.id)), 1500);
}

export function deal(n = 4): number {
  const song = currentSong.peek();
  if (!song) return 0;
  const picks = drawScraps(n, song.table.map((s) => s.text));
  if (!picks.length) return 0;
  const before = snapshot();
  updateCurrent((d) => {
    const fresh = makeStrips(picks.map((p) => p.text), 'deal', d.table);
    land(fresh);
    d.table.push(...fresh);
  });
  pushUndo('table', 'DEAL', () => restore(before));
  return picks.length;
}

function StripBody({ s }: { s: Strip }) {
  const joints = s.joints ?? [];
  let base = 0;
  return (
    <>
      {s.text.split('\n').map((ln, i) => {
        const at = base;
        base += ln.length + 1;
        return (
          <>
            {i > 0 && <i class={'hseam' + (joints.includes(at - 1) ? ' taped' : '')} data-cut={at - 1} />}
            <span class="sl">
              {piecesOf(ln, at, joints).map((p) => (p.gap !== undefined
                ? <span class={'gap' + (p.joint ? ' joint' : '')} data-cut={p.gap}>{p.t}</span>
                : <span class="w">{p.t}</span>))}
            </span>
          </>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Cutting: every place a strip can be cut is a "candidate" (a gap between words, or the seam between two lines).
// Pressing anywhere on a strip aims at the nearest one; sliding re-aims; letting go cuts. Nothing needs precise tapping.
// ---------------------------------------------------------------------------------------------------------------
interface Cand {
  at: number; kind: 'gap' | 'seam';
  x: number; y1: number; y2: number; x1: number; x2: number; // gap: centre x and line band · seam: y and strip extent
  nx: number; ny: number;                                   // client position of the paper that follows the cut
}

function candidates(el: HTMLElement): Cand[] {
  const paper = el.querySelector<HTMLElement>('.paper')!.getBoundingClientRect();
  const out: Cand[] = [];
  el.querySelectorAll<HTMLElement>('.gap[data-cut]').forEach((g) => {
    const r = g.getClientRects()[0] ?? g.getBoundingClientRect();
    const nr = (g.nextElementSibling as HTMLElement | null)?.getBoundingClientRect();
    out.push({
      at: Number(g.dataset.cut), kind: 'gap', x: r.left + r.width / 2, y1: r.top - 3, y2: r.bottom + 3, x1: paper.left, x2: paper.right,
      nx: (nr?.left ?? r.right) - 13, ny: (nr?.top ?? r.top) - 9,
    });
  });
  el.querySelectorAll<HTMLElement>('.hseam[data-cut]').forEach((h) => {
    const r = h.getBoundingClientRect();
    const nr = (h.nextElementSibling as HTMLElement | null)?.getBoundingClientRect();
    out.push({
      at: Number(h.dataset.cut), kind: 'seam', x: (paper.left + paper.right) / 2, y1: r.top + r.height / 2, y2: r.top + r.height / 2, x1: paper.left, x2: paper.right,
      nx: paper.left, ny: (nr?.top ?? r.bottom) - 7,
    });
  });
  return out;
}

function aimAt(cands: Cand[], px: number, py: number, only?: Cand['kind']): { c: Cand; d: number } | null {
  let best: Cand | null = null, bd = Infinity;
  for (const c of cands) {
    if (only && c.kind !== only) continue;
    let d: number;
    if (c.kind === 'gap') {
      const out = py < c.y1 ? c.y1 - py : py > c.y2 ? py - c.y2 : 0;
      d = Math.abs(px - c.x) + out * 2.2;
    } else {
      const outX = px < c.x1 ? c.x1 - px : px > c.x2 ? px - c.x2 : 0;
      d = Math.abs(py - c.y1) * 1.15 + outX;
    }
    if (d < bd) { bd = d; best = c; }
  }
  return best ? { c: best, d: bd } : null;
}

/** The part of a straight stroke that lies inside a rectangle (Liang–Barsky). */
function clipSeg(x0: number, y0: number, x1: number, y1: number, r: DOMRect, pad = 2): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - (r.left - pad), r.right + pad - x0, y0 - (r.top - pad), r.bottom + pad - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

interface Drag {
  id: ID; el: HTMLElement; hit: HTMLElement; px: number; py: number; cx: number; cy: number;
  ox: number; oy: number; rot: number; moved: boolean; dead: boolean; hold?: number;
  nx: number; ny: number; lx: number; lt: number; tilt: number; r0: DOMRect;
  others: Array<{ id: ID; el: HTMLElement; r: DOMRect }> | null; target: { id: ID; el: HTMLElement; how: TapeHow } | null;
  aim: { cands: Cand[]; cur: Cand | null } | null;
}
interface Slash { x0: number; y0: number; x1: number; y1: number; on: boolean }
interface Ctl { down: (e: PointerEvent, s: Strip) => void; move: (e: PointerEvent) => void; up: (e: PointerEvent, s: Strip) => void; cancel: () => void }

const HOLD_MS = 330;
/** a long press must not open the system's context menu — it would cancel the touch the scissors are riding on */
const noMenu = (e: Event) => e.preventDefault();

const StripView = memo(function StripView({ s, sel, delay, ctl }: { s: Strip; sel: boolean; delay?: number; ctl: Ctl }) {
  return (
    <div data-id={s.id} data-rot={s.rot}
      class={'strip f-' + s.from + (sel ? ' sel' : '') + (delay !== undefined ? ' landing' : '')}
      style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, zIndex: s.z, transform: `rotate(${s.rot}deg)`, '--r': s.rot, '--x': s.x, animationDelay: delay !== undefined ? `${delay}ms` : undefined } as any}
      onPointerDown={(e) => ctl.down(e as any, s)} onPointerMove={ctl.move as any} onPointerUp={(e) => ctl.up(e as any, s)} onPointerCancel={ctl.cancel}
      onContextMenu={noMenu}>
      <i class="shade" aria-hidden="true" />
      <div class="paper" style={{ clipPath: edges(s.id) }}><StripBody s={s} /></div>
    </div>
  );
});

export function TableView() {
  const song = currentSong.value!;
  const board = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);
  const slashEl = useRef<HTMLDivElement>(null);
  const size = useRef({ w: 360, h: 600 });
  const sheet = sheetState.value;
  const sel = selected.value;
  const cut = cutting.value;

  useEffect(() => {
    const el = board.current!;
    const ro = new ResizeObserver(() => { size.current = { w: el.clientWidth, h: el.clientHeight }; });
    ro.observe(el);
    size.current = { w: el.clientWidth, h: el.clientHeight };
    hintOnce('table-cut', 'THE TABLE — DRAG A STRIP · HOLD IT TO CUT · SLASH ACROSS THE MAT TO CUT SEVERAL · DROP ONE ON ANOTHER\'S EDGE TO TAPE');
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { selected.value = null; cutting.value = false; }, []);

  const g = useRef<Drag | null>(null);
  const sl = useRef<Slash | null>(null);
  const clearTarget = (d: Drag) => { d.target?.el.classList.remove('tape-stack', 'tape-join'); d.target = null; };

  // ---- the guide: a dashed line (and a pair of scissors) showing exactly where the cut will fall ----
  const placeGuide = (c: Cand) => {
    const el = guide.current, b = board.current;
    if (!el || !b) return;
    const br = b.getBoundingClientRect();
    el.hidden = false;
    el.dataset.kind = c.kind;
    if (c.kind === 'gap') {
      el.style.width = '0px'; el.style.height = `${c.y2 - c.y1 + 16}px`;
      el.style.transform = `translate3d(${c.x - br.left}px, ${c.y1 - br.top - 8}px, 0)`;
    } else {
      el.style.height = '0px'; el.style.width = `${c.x2 - c.x1 + 16}px`;
      el.style.transform = `translate3d(${c.x1 - br.left - 8}px, ${c.y1 - br.top}px, 0)`;
    }
  };
  const hideGuide = () => { if (guide.current) guide.current.hidden = true; };

  const beginAim = (d: Drag, x: number, y: number) => {
    const cands = candidates(d.el);
    if (!cands.length) { d.dead = true; say('ONE WORD — NOTHING TO CUT'); feel('thud', 'light'); return; }
    d.aim = { cands, cur: null };
    d.el.classList.add('aiming');
    haptic('medium');
    aimMove(d, x, y, true);
  };
  const aimMove = (d: Drag, x: number, y: number, first = false) => {
    if (!d.aim) return;
    const hit = aimAt(d.aim.cands, x, y);
    if (!hit || hit.c === d.aim.cur) return;
    d.aim.cur = hit.c;
    placeGuide(hit.c);
    if (!first) haptic('light');
  };
  const endAim = (d: Drag) => { hideGuide(); d.el.classList.remove('aiming'); };

  /** Cut each strip at the chosen place. One UNDO takes back the lot. */
  const doCut = (items: Array<{ id: ID; cand: Cand }>): boolean => {
    const b = board.current;
    if (!b) return false;
    const br = b.getBoundingClientRect();
    const W = br.width, H = br.height;
    const before = snapshot();
    const nudges: Array<{ id: ID; dx: number; dy: number }> = [];
    let n = 0;
    updateCurrent((d) => {
      let z = topZ(d.table);
      for (const { id, cand } of items) {
        const t = d.table.find((x) => x.id === id);
        if (!t) continue;
        const parts = snip(t, cand.at);
        if (!parts) continue;
        const seam = t.text[cand.at] === '\n';
        const orig = t.from;
        const px = clampX((cand.nx - br.left) / W), py = clampY((cand.ny - br.top) / H);
        const [ldx, ldy, rdx, rdy] = seam ? [0, -2, 0, 8] : [-3, 0, 8, 3];
        t.text = parts[0].text; t.joints = parts[0].joints;
        if (!t.joints.length && t.from === 'splice') t.from = 'typed';
        t.x = clampX(t.x + ldx / W); t.y = clampY(t.y + ldy / H);
        const nid = uid();
        d.table.push({
          id: nid, text: parts[1].text, joints: parts[1].joints, from: parts[1].joints.length ? 'splice' : orig === 'splice' ? 'typed' : orig,
          x: clampX(px + rdx / W), y: clampY(py + rdy / H), rot: t.rot + (Math.random() - 0.5) * 1.6, z: z++,
        });
        nudges.push({ id: t.id, dx: ldx, dy: ldy }, { id: nid, dx: rdx, dy: rdy });
        n++;
      }
    });
    if (!n) return false;
    selected.value = null;
    feel('snip', 'medium');
    undoable('table', n > 1 ? `SNIP ×${n}` : 'SNIP', () => restore(before), 2200);
    // the pieces start where they were cut and slide apart
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const { id, dx, dy } of nudges) {
        const el = b.querySelector<HTMLElement>(`.strip[data-id="${id}"]`);
        if (!el || (!dx && !dy)) continue;
        const rot = Number(el.dataset.rot);
        el.animate([{ transform: `translate3d(${-dx}px, ${-dy}px, 0) rotate(${rot}deg)` }, { transform: `translate3d(0, 0, 0) rotate(${rot}deg)` }], { duration: 300, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      }
    }));
    return true;
  };

  // ---- strip pointer handling (drag writes straight to the DOM: no re-render per move) ----
  const onDown = (e: PointerEvent, s: Strip) => {
    const el = e.currentTarget as HTMLElement;
    const hit = e.target as HTMLElement; // remember before capture retargets the pointer
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const d: Drag = {
      id: s.id, el, hit, px: e.clientX, py: e.clientY, cx: e.clientX, cy: e.clientY, ox: s.x, oy: s.y, rot: s.rot, moved: false, dead: false,
      nx: s.x, ny: s.y, lx: e.clientX, lt: performance.now(), tilt: 0, r0: el.getBoundingClientRect(), others: null, target: null, aim: null,
    };
    g.current = d;
    if (cutting.value) { beginAim(d, e.clientX, e.clientY); return; }
    // hold still and the scissors come out
    d.hold = window.setTimeout(() => { if (g.current === d && !d.moved && !d.aim && !d.dead) beginAim(d, d.cx, d.cy); }, HOLD_MS);
  };
  const onMove = (e: PointerEvent) => {
    const d = g.current;
    if (!d || d.dead) return;
    d.cx = e.clientX; d.cy = e.clientY;
    if (d.aim) { aimMove(d, e.clientX, e.clientY); return; }
    let dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true; clearTimeout(d.hold); haptic('light');
      if (selected.value) selected.value = null;
      d.others = [...board.current!.querySelectorAll<HTMLElement>('.strip')].filter((x) => x.dataset.id !== d.id).map((x) => ({ id: x.dataset.id!, el: x, r: x.getBoundingClientRect() }));
      d.el.classList.add('dragging');
    }
    const { w, h } = size.current;
    // the strip stays on the mat: its whole width and height, not just its corner
    const maxX = Math.max(d.ox, 1 - d.r0.width / w), maxY = Math.max(d.oy, 1 - d.r0.height / h);
    const nx = Math.max(-0.02, Math.min(maxX, d.ox + dx / w)), ny = Math.max(-0.02, Math.min(maxY, d.oy + dy / h));
    d.nx = nx; d.ny = ny;
    dx = (nx - d.ox) * w; dy = (ny - d.oy) * h;
    // paper lags behind the finger: tilt with horizontal velocity
    const now = performance.now();
    const vx = (e.clientX - d.lx) / Math.max(1, now - d.lt);
    d.tilt += (Math.max(-8, Math.min(8, vx * 12)) - d.tilt) * 0.35;
    d.lx = e.clientX; d.lt = now;
    d.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${d.rot + d.tilt}deg) scale(1.04)`;
    // touching another strip's bottom or right edge offers a piece of masking tape
    const L = d.r0.left + dx, T = d.r0.top + dy, R = L + d.r0.width;
    let best: Drag['target'] = null, bestD = 22;
    for (const o of d.others ?? []) {
      const ox = Math.min(R, o.r.right) - Math.max(L, o.r.left);
      const oy = Math.min(T + d.r0.height, o.r.bottom) - Math.max(T, o.r.top);
      const ds = Math.abs(T - o.r.bottom);
      if (ds < bestD && ox > Math.min(d.r0.width, o.r.width) * 0.3) { best = { id: o.id, el: o.el, how: 'stack' }; bestD = ds; }
      const dj = Math.abs(L - o.r.right);
      if (dj < bestD && oy > Math.min(d.r0.height, o.r.height) * 0.45) { best = { id: o.id, el: o.el, how: 'join' }; bestD = dj; }
    }
    if (best?.id !== d.target?.id || best?.how !== d.target?.how) {
      clearTarget(d);
      if (best) { best.el.classList.add(best.how === 'stack' ? 'tape-stack' : 'tape-join'); haptic('light'); }
      d.target = best;
    }
  };
  const cancelDrag = () => {
    const d = g.current;
    g.current = null;
    if (!d) return;
    clearTimeout(d.hold);
    clearTarget(d);
    endAim(d);
    d.el.classList.remove('dragging');
    d.el.style.transform = `rotate(${d.rot}deg)`;
  };
  const onUp = (e: PointerEvent, s: Strip) => {
    const d = g.current;
    g.current = null;
    if (!d) return;
    clearTimeout(d.hold);
    if (d.aim) {
      endAim(d);
      const r = d.el.getBoundingClientRect(), cur = d.aim.cur;
      const near = e.clientX > r.left - 48 && e.clientX < r.right + 48 && e.clientY > r.top - 48 && e.clientY < r.bottom + 48;
      if (cur && near) doCut([{ id: d.id, cand: cur }]);
      return;
    }
    if (d.dead) return;
    if (d.moved) {
      const tgt = d.target;
      clearTarget(d);
      d.el.classList.remove('dragging');
      const before = snapshot();
      if (tgt) {
        d.el.style.transform = `rotate(${d.rot}deg)`;
        updateCurrent((song2) => {
          const a = song2.table.find((x) => x.id === tgt.id), b = song2.table.find((x) => x.id === d.id);
          if (!a || !b) return;
          const t = tape(a, b, tgt.how);
          a.text = t.text; a.joints = t.joints; a.from = 'splice'; a.z = topZ(song2.table);
          song2.table = song2.table.filter((x) => x.id !== b.id);
        });
        feel('tape', 'medium');
        undoable('table', tgt.how === 'stack' ? 'TAPED UNDERNEATH' : 'TAPED END TO END', () => restore(before));
        return;
      }
      // commit: set the final geometry on the element first so there is no visual jump, then update the store
      d.el.style.left = `${d.nx * 100}%`; d.el.style.top = `${d.ny * 100}%`;
      d.el.style.transform = `rotate(${d.rot}deg)`;
      d.el.animate([{ transform: `rotate(${d.rot + d.tilt * 0.6}deg) scale(1.04)` }, { transform: `rotate(${d.rot}deg) scale(1)` }], { duration: 280, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      updateCurrent((song2) => {
        const t = song2.table.find((x) => x.id === d.id);
        if (t) { t.x = d.nx; t.y = d.ny; t.z = topZ(song2.table); }
      });
      pushUndo('table', 'MOVE', () => restore(before));
      sound('thock');
      return;
    }
    // a plain tap picks the strip up (no store write: it is only a highlight)
    feel('click');
    selected.value = selected.value === s.id ? null : s.id;
  };

  // ---- the mat: a stroke across it slices whatever it crosses · a double-tap writes a new slip · a tap clears the selection ----
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const bare = (e: PointerEvent) => e.target === e.currentTarget;
  const matDown = (e: PointerEvent) => {
    if (!bare(e)) return;
    try { board.current!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    sl.current = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, on: false };
  };
  const matMove = (e: PointerEvent) => {
    const s = sl.current;
    if (!s) return;
    s.x1 = e.clientX; s.y1 = e.clientY;
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    if (!s.on && len > 22) { s.on = true; haptic('light'); if (selected.value) selected.value = null; }
    const el = slashEl.current, b = board.current;
    if (!s.on || !el || !b) return;
    const br = b.getBoundingClientRect();
    el.hidden = false;
    el.style.width = `${len}px`;
    el.style.transform = `translate3d(${s.x0 - br.left}px, ${s.y0 - br.top}px, 0) rotate(${Math.atan2(s.y1 - s.y0, s.x1 - s.x0)}rad)`;
  };
  const matUp = (e: PointerEvent) => {
    const s = sl.current;
    sl.current = null;
    if (slashEl.current) slashEl.current.hidden = true;
    if (!bare(e)) return;
    if (s?.on) {
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
      const vertical = Math.abs(dy) >= Math.abs(dx) * 0.8;
      const items: Array<{ id: ID; cand: Cand }> = [];
      board.current!.querySelectorAll<HTMLElement>('.strip').forEach((el) => {
        const ch = clipSeg(s.x0, s.y0, s.x1, s.y1, el.getBoundingClientRect());
        if (!ch || Math.hypot(ch[2] - ch[0], ch[3] - ch[1]) < 8) return;
        const cands = candidates(el);
        const hit = aimAt(cands, (ch[0] + ch[2]) / 2, (ch[1] + ch[3]) / 2, vertical ? 'gap' : cands.some((c) => c.kind === 'seam') ? 'seam' : undefined);
        if (hit && hit.d < 46) items.push({ id: el.dataset.id!, cand: hit.c });
      });
      if (!items.length || !doCut(items)) { feel('thud', 'light'); say('NOTHING TO CUT ALONG THAT LINE'); }
      return;
    }
    const now = performance.now(), L = lastTap.current;
    if (now - L.t < 360 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 30) {
      const r = board.current!.getBoundingClientRect();
      sheetState.value = { kind: 'new', x: Math.max(0.02, Math.min(0.6, (e.clientX - r.left) / r.width - 0.1)), y: Math.max(0.02, Math.min(0.9, (e.clientY - r.top) / r.height - 0.02)) };
      lastTap.current = { t: 0, x: 0, y: 0 };
      feel('click');
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    selected.value = null;
  };

  const H = useRef<Ctl>({ down: onDown, move: onMove, up: onUp, cancel: cancelDrag });
  H.current = { down: onDown, move: onMove, up: onUp, cancel: cancelDrag };
  const ctl = useRef<Ctl>({
    down: (e, s) => H.current.down(e, s), move: (e) => H.current.move(e), up: (e, s) => H.current.up(e, s), cancel: () => H.current.cancel(),
  }).current;

  const strips = [...song.table].sort((a, b) => a.z - b.z);
  const selStrip = strips.find((s) => s.id === sel);
  // the action bar sits over its strip, nudged left so it never runs off the mat
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current, b = board.current;
    if (!el || !b || !selStrip) return;
    el.style.left = `${Math.max(4, Math.min(selStrip.x * b.clientWidth, b.clientWidth - el.offsetWidth - 4))}px`;
  }, [sel, selStrip?.x]);

  return (
    <div class={'mode-view table' + (cut ? ' cutting' : '')}>
      <div class={'board' + (cut ? ' cutting' : '')} ref={board} onContextMenu={noMenu} onPointerDown={matDown as any} onPointerMove={matMove as any} onPointerUp={matUp as any} onPointerCancel={() => { sl.current = null; if (slashEl.current) slashEl.current.hidden = true; }}>
        <div class="mat-rule" aria-hidden="true" />
        <div class="mat-label" aria-hidden="true">{song.title}</div>
        <UndoChip surface="table" />
        {cut && <div class="cut-banner" aria-hidden="true"><Icon n="scissors" size={12} stroke={2} /> PRESS A STRIP · SLIDE TO THE CUT · LET GO</div>}
        {strips.length === 0 && (
          <div class="empty-table">
            <b>AN EMPTY TABLE</b>
            <span>Press DEAL for lines from the shoebox — punched from the notebook or caught along the way — or double-tap the mat to write a slip.</span>
          </div>
        )}
        {strips.map((s) => <StripView key={s.id} s={s} sel={sel === s.id} delay={arrival.get(s.id)} ctl={ctl} />)}
        <div class="cutguide" ref={guide} hidden aria-hidden="true"><i><Icon n="scissors" size={13} stroke={2} /></i></div>
        <div class="slash" ref={slashEl} hidden aria-hidden="true" />
        {selStrip && (
          <div class="strip-actions" ref={bar} style={{
            left: '4px',
            top: selStrip.y > 0.12 ? `calc(${selStrip.y * 100}% - 48px)` : `calc(${selStrip.y * 100}% + 64px)`, zIndex: 1000,
          }}>
            <button onClick={() => { sheetState.value = { kind: 'edit', id: selStrip.id }; }}><Icon n="edit" size={14} />EDIT</button>
            <button onClick={() => { selected.value = null; cutting.value = true; feel('snip', 'light'); say('SCISSORS — PRESS A STRIP, SLIDE TO THE CUT, LET GO'); }}><Icon n="scissors" size={14} />SNIP</button>
            <button class="go" onClick={() => { sheetState.value = { kind: 'bench', id: selStrip.id }; }}><Icon n="bench" size={14} />BENCH</button>
            <button aria-label="More" onClick={() => { sheetState.value = { kind: 'more', id: selStrip.id }; }}><Icon n="dots" size={16} /></button>
            <button class="danger" aria-label="Throw away" onClick={() => {
              const before = snapshot();
              updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== selStrip.id); });
              selected.value = null;
              undoable('table', 'STRIP THROWN AWAY', () => restore(before));
            }}><Icon n="trash" size={14} /></button>
          </div>
        )}
      </div>

      {sheet?.kind === 'new' && (
        <TextSheet title="NEW SLIP" multiline placeholder="a line, a fragment, a word…" okLabel="LAY IT DOWN"
          onClose={() => (sheetState.value = null)}
          onSave={(v) => {
            const t = v.trim();
            if (!t) return;
            const before = snapshot();
            updateCurrent((d) => { d.table.push({ id: uid(), text: t, x: sheet.x, y: sheet.y, rot: (Math.random() - 0.5) * 4, z: topZ(d.table), from: 'typed' }); });
            pushUndo('table', 'NEW SLIP', () => restore(before));
            feel('thock');
          }} />
      )}
      {sheet?.kind === 'edit' && (
        <TextSheet title="EDIT STRIP" multiline value={song.table.find((s) => s.id === sheet.id)?.text ?? ''}
          onClose={() => (sheetState.value = null)}
          onSave={(v) => {
            const before = snapshot();
            let changed = false;
            updateCurrent((d) => {
              const t = d.table.find((s) => s.id === sheet.id);
              if (!t || !v.trim() || v.trim() === t.text) return;
              t.text = v.trim(); t.joints = []; t.from = 'typed'; changed = true;
            });
            if (changed) pushUndo('table', 'EDIT', () => restore(before));
          }} />
      )}
      {sheet?.kind === 'bench' && <BenchChooser id={sheet.id} />}
      {sheet?.kind === 'more' && <MoreSheet id={sheet.id} />}
    </div>
  );
}


/** The less common things you can do with one strip. */
function MoreSheet({ id }: { id: ID }) {
  const song = currentSong.value!;
  const strip = song.table.find((s) => s.id === id);
  const close = () => (sheetState.value = null);
  if (!strip) return null;
  const multi = strip.text.includes('\n');
  const words = strip.text.split(/\s+/).filter(Boolean);
  const done = (label: string, before: Strip[], extra?: () => void) => { selected.value = null; close(); undoable('table', label, () => { restore(before); extra?.(); }); };
  return (
    <Sheet title="THIS STRIP" onClose={close}>
      <div class="choices">
        <button class="choice" onClick={() => {
          const before = snapshot();
          updateCurrent((d) => { const t = d.table.find((x) => x.id === id); if (t) d.table.push({ ...JSON.parse(JSON.stringify(t)), id: uid(), x: clampX(t.x + 0.05), y: clampY(t.y + 0.06), z: topZ(d.table) }); });
          feel('thock'); done('COPIED', before);
        }}><span>DUPLICATE</span><small>a second copy beside it</small></button>
        <button class="choice" disabled={words.length < 2} onClick={() => {
          const before = snapshot();
          updateCurrent((d) => {
            const t = d.table.find((x) => x.id === id);
            if (!t) return;
            const out: Strip[] = d.table.filter((x) => x.id !== id);
            let z = topZ(d.table);
            const fresh: Strip[] = [];
            words.forEach((w, k) => {
              const p = k === 0 ? { x: t.x, y: t.y } : freeSpot([...out, ...fresh]);
              fresh.push({ id: uid(), text: w, from: 'cut', x: p.x, y: p.y, rot: (Math.random() - 0.5) * 8, z: z++ });
            });
            land(fresh);
            d.table = [...out, ...fresh];
          });
          feel('snip', 'medium'); done('SPLIT INTO WORDS', before);
        }}><span>SPLIT INTO WORDS</span><small>every word its own slip</small></button>
        <button class="choice" disabled={!multi} onClick={() => {
          const before = snapshot();
          updateCurrent((d) => {
            const t = d.table.find((x) => x.id === id);
            if (!t) return;
            let cur: { text: string; joints: number[] } = { text: t.text, joints: t.joints ?? [] };
            const pieces: Array<{ text: string; joints: number[] }> = [];
            for (let guard = 0; guard < 40; guard++) {
              const i = cur.text.indexOf('\n');
              if (i < 0) break;
              const parts = snip(cur, i);
              if (!parts) break;
              pieces.push(parts[0]); cur = parts[1];
            }
            pieces.push(cur);
            t.text = pieces[0].text; t.joints = pieces[0].joints;
            let z = topZ(d.table);
            pieces.slice(1).forEach((p, k) => d.table.push({ id: uid(), text: p.text, joints: p.joints, from: 'cut', x: clampX(t.x + 0.02 * (k + 1)), y: clampY(t.y + 0.085 * (k + 1)), rot: t.rot + (Math.random() - 0.5) * 2, z: z++ }));
          });
          feel('snip', 'medium'); done('SPLIT INTO LINES', before);
        }}><span>SPLIT INTO LINES</span><small>each line on its own strip</small></button>
        <button class="choice" onClick={() => {
          const before = snapshot();
          const sc = addScrap(strip.text.replace(/\n/g, ' / '), 'table', song.id);
          updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== id); });
          feel('thock'); done('FILED IN THE SHOEBOX', before, () => { if (sc) removeScrap(sc.id); });
        }}><span>KEEP IN THE SHOEBOX</span><small>for another day</small></button>
      </div>
    </Sheet>
  );
}

function BenchChooser({ id }: { id: ID }) {
  const song = currentSong.value!;
  const strip = song.table.find((s) => s.id === id);
  const names = sectionNames(song);
  const close = () => (sheetState.value = null);
  if (!strip) return null;
  const go = (target: ID | 'new', kind?: SectionKind) => {
    const before = snapshot();
    const benchBefore = JSON.parse(JSON.stringify({ sections: song.sections, arrangement: song.arrangement }));
    const sid = sendTextToBench(song.id, [strip.text], target, kind);
    updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== id); });
    selected.value = null;
    feel('thock', 'medium');
    close();
    const nm = sectionNames(currentSong.peek()!).get(sid) ?? (kind ?? 'verse').toUpperCase();
    say(`→ ${nm}`, { label: 'GO', run: () => setMode('bench') });
    pushUndo('table', 'SENT TO THE BENCH', () => updateCurrent((d) => { d.table = before; d.sections = benchBefore.sections; d.arrangement = benchBefore.arrangement; }));
  };
  return (
    <Sheet title="SLOT INTO THE BENCH" onClose={close}>
      <Choices
        items={[
          ...song.sections.map((s) => ({ id: s.id, label: names.get(s.id) ?? s.kind.toUpperCase(), hint: 'add to the end' })),
          { id: 'new:verse', label: '+ NEW VERSE', hint: '' }, { id: 'new:chorus', label: '+ NEW CHORUS', hint: '' }, { id: 'new:bridge', label: '+ NEW BRIDGE', hint: '' },
        ]}
        onPick={(v) => (v.startsWith('new:') ? go('new', v.slice(4) as SectionKind) : go(v as ID))} />
    </Sheet>
  );
}

/** FLIP: remember where each strip is, apply a change, then glide every strip from old to new on the compositor. */
function glide(change: () => void): void {
  const before = new Map<string, { x: number; y: number; rot: number }>();
  document.querySelectorAll<HTMLElement>('.board .strip').forEach((el) => {
    const r = el.getBoundingClientRect();
    before.set(el.dataset.id!, { x: r.left, y: r.top, rot: Number(el.dataset.rot) });
  });
  change();
  selected.value = null;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('.board .strip').forEach((el, i) => {
      const b = before.get(el.dataset.id!);
      if (!b) return;
      const r = el.getBoundingClientRect();
      const nr = Number(el.dataset.rot);
      el.animate(
        [{ transform: `translate3d(${b.x - r.left}px, ${b.y - r.top}px, 0) rotate(${b.rot}deg) scale(1.03)` }, { transform: `rotate(${nr}deg) scale(1)` }],
        { duration: 520, delay: i * 20, easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'backwards' },
      );
    });
  }));
}

export function TableKeys() {
  const song = currentSong.value;
  const n = song?.table.length ?? 0;
  return (
    <Keys dense>
      <Key icon="slip" label="Slip" sound="click" onClick={() => { sheetState.value = { kind: 'new', ...freeSpot(currentSong.peek()?.table ?? []) }; }} />
      <Key icon="draw" label="Deal" tone="dark" sound="ratchet" onClick={() => {
        const got = deal(4);
        say(got ? `DEALT ${got} FROM THE SHOEBOX` : 'THE SHOEBOX IS EMPTY — CATCH SOME LINES FIRST');
      }} />
      <Key icon="scissors" label="Snip" led on={cutting.value} sound="snip" disabled={!n && !cutting.value}
        onClick={() => {
          cutting.value = !cutting.value;
          selected.value = null;
          say(cutting.value ? 'SCISSORS — PRESS A STRIP, SLIDE TO THE CUT, LET GO' : 'SCISSORS PUT DOWN', undefined, 3000);
        }} />
      <Key icon="cutup" label="Cut-up" sound="snip" disabled={!n} onClick={() => {
        const before = snapshot();
        let cuts = 0, pieces = 0;
        updateCurrent((d) => {
          const out: Strip[] = [];
          let z = topZ(d.table);
          for (const s of d.table) {
            const frags = cutUp(s.text);
            if (frags.length < 2) { out.push(s); continue; }
            cuts++;
            frags.forEach((f, k) => {
              const p = freeSpot(out);
              out.push({ id: uid(), text: f, from: 'cut', x: k === 0 ? s.x : p.x, y: k === 0 ? s.y : p.y, rot: (Math.random() - 0.5) * 8, z: z++ });
              pieces++;
            });
          }
          land(out.filter((s) => s.from === 'cut' && !before.some((b) => b.id === s.id)));
          d.table = out;
        });
        if (!cuts) { say('NOTHING LONG ENOUGH TO CUT UP'); return; }
        feel('snip', 'medium');
        undoable('table', `CUT ${cuts} INTO ${pieces} — NOW REARRANGE`, () => restore(before), undefined, 'CUT-UP');
      }} />
      <Key icon="shuffle" label="Shuffle" sound="shuffle" disabled={n < 2} onClick={() => {
        const before = snapshot();
        glide(() => updateCurrent((d) => {
          const out: Strip[] = [];
          for (const s of [...d.table].sort(() => Math.random() - 0.5)) { const p = freeSpot(out); out.push({ ...s, x: p.x, y: p.y, rot: (Math.random() - 0.5) * 6 }); }
          d.table = out;
        }));
        pushUndo('table', 'SHUFFLE', () => glide(() => restore(before)));
      }} />
      <Key icon="sweep" label="Sweep" sound="shuffle" disabled={!n} onClick={() => {
        const before = snapshot();
        // new writing (typed, taped, edited) is kept in the shoebox; copies of things that live elsewhere are just cleared
        const keep = before.filter((s) => s.from === 'typed' || s.from === 'splice');
        const filed = keep.map((s) => addScrap(s.text.replace(/\n/g, ' / '), 'table', currentSong.peek()?.id)).filter(Boolean);
        updateCurrent((d) => { d.table = []; });
        selected.value = null;
        undoable('table', filed.length ? `TABLE CLEARED · ${filed.length} KEPT IN THE SHOEBOX` : 'TABLE CLEARED', () => { restore(before); filed.forEach((f) => f && removeScrap(f.id)); }, undefined, 'SWEEP');
      }} />
    </Keys>
  );
}
