import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { addScrap, currentSong, drawScraps, removeScrap, updateCurrent } from '../store/state';
import { ID, SectionKind, Strip, sectionNames, uid } from '../store/models';
import { feel, haptic, sound } from '../engine/feel';
import { freeSpot, makeStrips, sendTextToBench } from '../store/actions';
import { cutUp, piecesOf, snip, tape, TapeHow } from '../store/strips';
import { hintOnce, say } from '../store/ui';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Choices, Sheet, TextSheet } from './Sheet';
import { setMode } from './Bezel';

const selected = signal<ID | null>(null);
const sheetState = signal<null | { kind: 'new'; x: number; y: number } | { kind: 'edit'; id: ID } | { kind: 'bench'; id: ID }>(null);
/** stagger for strips that just landed (deal / cut-up) */
const arrival = new Map<ID, number>();

const hash = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Scissor-cut edges: never quite straight, but always the same for a given strip. */
function edges(id: string): string {
  let h = hash(id);
  const r = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  const L = [0, 30, 58, 100].map((y) => `${(r() * 2.6).toFixed(1)}px ${y}%`);
  const R = [100, 64, 36, 0].map((y) => `calc(100% - ${(r() * 2.6).toFixed(1)}px) ${y}%`);
  return `polygon(${[...L, ...R].join(',')})`;
}

const snapshot = () => JSON.parse(JSON.stringify(currentSong.peek()?.table ?? [])) as Strip[];
const restore = (t: Strip[]) => updateCurrent((d) => { d.table = t; });
const topZ = (t: Strip[]) => Math.max(0, ...t.map((x) => x.z)) + 1;

function land(strips: Strip[]): void {
  strips.forEach((s, i) => arrival.set(s.id, i * 70));
  setTimeout(() => strips.forEach((s) => arrival.delete(s.id)), 1500);
}

export function deal(n = 4): number {
  const song = currentSong.peek();
  if (!song) return 0;
  const picks = drawScraps(n, song.table.map((s) => s.text));
  if (!picks.length) return 0;
  updateCurrent((d) => {
    const fresh = makeStrips(picks.map((p) => p.text), 'deal', d.table);
    land(fresh);
    d.table.push(...fresh);
  });
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

interface Drag {
  id: ID; el: HTMLElement; px: number; py: number; ox: number; oy: number; rot: number; moved: boolean;
  lx: number; lt: number; tilt: number; cx: number; cy: number; r0: DOMRect; hit: HTMLElement;
  others: Array<{ id: ID; el: HTMLElement; r: DOMRect }> | null; target: { id: ID; el: HTMLElement; how: TapeHow } | null;
}

export function TableView() {
  const song = currentSong.value!;
  const board = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 600 });
  const sheet = sheetState.value;
  const sel = selected.value;

  useEffect(() => {
    const el = board.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    hintOnce('table', 'THE TABLE — DRAG STRIPS AROUND · TAP ONE, THEN A GAP TO CUT · DROP IT ON ANOTHER\'S EDGE TO TAPE');
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { selected.value = null; }, []);

  // ---- strip pointer handling (drag writes straight to the DOM: no re-render per move) ----
  const info = useRef<Drag | null>(null);
  const clearTarget = (d: Drag) => { d.target?.el.classList.remove('tape-stack', 'tape-join'); d.target = null; };
  const onDown = (e: PointerEvent, s: Strip) => {
    const el = e.currentTarget as HTMLElement;
    const hit = e.target as HTMLElement; // remember before capture retargets the pointer
    el.setPointerCapture(e.pointerId);
    info.current = { id: s.id, el, hit, px: e.clientX, py: e.clientY, ox: s.x, oy: s.y, rot: s.rot, moved: false, lx: e.clientX, lt: performance.now(), tilt: 0, cx: s.x, cy: s.y, r0: el.getBoundingClientRect(), others: null, target: null };
  };
  const onMove = (e: PointerEvent) => {
    const d = info.current;
    if (!d) return;
    let dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) {
      d.moved = true; haptic('light');
      if (selected.value) selected.value = null;
      d.others = [...board.current!.querySelectorAll<HTMLElement>('.strip')].filter((x) => x.dataset.id !== d.id).map((x) => ({ id: x.dataset.id!, el: x, r: x.getBoundingClientRect() }));
    }
    const nx = Math.max(-0.1, Math.min(0.92, d.ox + dx / size.w)), ny = Math.max(-0.02, Math.min(0.95, d.oy + dy / size.h));
    d.cx = nx; d.cy = ny;
    dx = (nx - d.ox) * size.w; dy = (ny - d.oy) * size.h;
    // paper lags behind the finger: tilt with horizontal velocity
    const now = performance.now();
    const vx = (e.clientX - d.lx) / Math.max(1, now - d.lt);
    d.tilt += (Math.max(-8, Math.min(8, vx * 12)) - d.tilt) * 0.35;
    d.lx = e.clientX; d.lt = now;
    d.el.classList.add('dragging');
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
    const d = info.current;
    info.current = null;
    if (d) { clearTarget(d); d.el.classList.remove('dragging'); d.el.style.transform = `rotate(${d.rot}deg)`; }
  };
  const onUp = (_e: PointerEvent, s: Strip) => {
    const d = info.current;
    info.current = null;
    if (!d) return;
    if (d.moved) {
      const tgt = d.target;
      clearTarget(d);
      if (tgt) {
        const before = snapshot();
        d.el.classList.remove('dragging');
        d.el.style.transform = `rotate(${d.rot}deg)`;
        updateCurrent((song2) => {
          const a = song2.table.find((x) => x.id === tgt.id), b = song2.table.find((x) => x.id === d.id);
          if (!a || !b) return;
          const t = tape(a, b, tgt.how);
          a.text = t.text; a.joints = t.joints; a.from = 'splice'; a.z = topZ(song2.table);
          song2.table = song2.table.filter((x) => x.id !== b.id);
        });
        feel('tape', 'medium');
        say(tgt.how === 'stack' ? 'TAPED UNDERNEATH' : 'TAPED END TO END', { label: 'UNDO', run: () => restore(before) });
        return;
      }
      // commit: set the final geometry on the element first so there is no visual jump, then update the store
      d.el.style.left = `${d.cx * 100}%`; d.el.style.top = `${d.cy * 100}%`;
      d.el.style.transform = `rotate(${d.rot}deg)`;
      d.el.classList.remove('dragging');
      d.el.animate([{ transform: `rotate(${d.rot + d.tilt * 0.6}deg) scale(1.04)` }, { transform: `rotate(${d.rot}deg) scale(1)` }], { duration: 300, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      updateCurrent((song2) => {
        const t = song2.table.find((x) => x.id === d.id);
        if (t) { t.x = d.cx; t.y = d.cy; t.z = topZ(song2.table); }
      });
      sound('thock');
      return;
    }
    // a tap: on a selected strip, a gap is a cut line
    const cut = d.hit.closest('[data-cut]') as HTMLElement | null;
    if (selected.value === s.id && cut) {
      const at = Number(cut.dataset.cut);
      const parts = snip(s, at);
      if (!parts) return;
      const before = snapshot();
      feel('snip', 'medium');
      updateCurrent((dd) => {
        const t = dd.table.find((x) => x.id === s.id);
        if (!t) return;
        const z = topZ(dd.table);
        const vertical = s.text[at] === '\n';
        t.text = parts[0].text; t.joints = parts[0].joints;
        if (!t.joints.length && t.from === 'splice') t.from = 'typed';
        dd.table.push({
          id: uid(), text: parts[1].text, joints: parts[1].joints, from: parts[1].joints.length ? 'splice' : t.from === 'splice' ? 'typed' : t.from,
          x: Math.min(0.82, t.x + (vertical ? 0.02 : 0.08)), y: Math.min(0.9, t.y + (vertical ? 0.1 : 0.07)), rot: (Math.random() - 0.5) * 6, z,
        });
      });
      say('SNIP', { label: 'UNDO', run: () => restore(before) }, 2200);
      return;
    }
    feel('click');
    selected.value = selected.value === s.id ? null : s.id;
    updateCurrent((d2) => { const t = d2.table.find((x) => x.id === s.id); if (t) t.z = topZ(d2.table); });
  };

  // ---- the mat: tap clears the selection, a double-tap writes a new slip there ----
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const onMat = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return;
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

  const strips = [...song.table].sort((a, b) => a.z - b.z);
  const selStrip = strips.find((s) => s.id === sel);

  return (
    <div class="mode-view table">
      <div class="board" ref={board} onPointerUp={onMat as any}>
        <div class="mat-rule" aria-hidden="true" />
        {strips.length === 0 && (
          <div class="empty-table">
            <b>AN EMPTY TABLE</b>
            <span>Punch lines out of the ROLL, press DEAL for scraps from the shoebox, or double-tap the mat to write a slip.</span>
          </div>
        )}
        {strips.map((s) => {
          const delay = arrival.get(s.id);
          return (
            <div key={s.id} data-id={s.id} data-rot={s.rot}
              class={'strip f-' + s.from + (sel === s.id ? ' sel' : '') + (delay !== undefined ? ' landing' : '')}
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, zIndex: s.z, transform: `rotate(${s.rot}deg)`, '--r': s.rot, animationDelay: delay !== undefined ? `${delay}ms` : undefined } as any}
              onPointerDown={(e) => onDown(e as any, s)} onPointerMove={onMove as any} onPointerUp={(e) => onUp(e as any, s)} onPointerCancel={cancelDrag}>
              <div class="paper" style={{ clipPath: edges(s.id) }}><StripBody s={s} /></div>
            </div>
          );
        })}
        {selStrip && (
          <div class="strip-actions" style={{
            left: `${Math.max(2, Math.min(52, selStrip.x * 100))}%`,
            top: selStrip.y > 0.12 ? `calc(${selStrip.y * 100}% - 48px)` : `calc(${selStrip.y * 100}% + 64px)`, zIndex: 1000,
          }}>
            <button onClick={() => { sheetState.value = { kind: 'edit', id: selStrip.id }; }}><Icon n="edit" size={14} />EDIT</button>
            <button class="go" onClick={() => { sheetState.value = { kind: 'bench', id: selStrip.id }; }}><Icon n="bench" size={14} />BENCH</button>
            <button aria-label="Keep in the shoebox" onClick={() => {
              const before = snapshot();
              const sc = addScrap(selStrip.text.replace(/\n/g, ' / '), 'table', song.id);
              updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== selStrip.id); });
              selected.value = null;
              feel('thock');
              say('FILED IN THE SHOEBOX', { label: 'UNDO', run: () => { restore(before); if (sc) removeScrap(sc.id); } });
            }}><Icon n="box" size={14} /></button>
            <button class="danger" aria-label="Throw away" onClick={() => {
              const before = snapshot();
              updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== selStrip.id); });
              selected.value = null;
              say('STRIP THROWN AWAY', { label: 'UNDO', run: () => restore(before) });
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
            updateCurrent((d) => { d.table.push({ id: uid(), text: t, x: sheet.x, y: sheet.y, rot: (Math.random() - 0.5) * 4, z: topZ(d.table), from: 'typed' }); });
            feel('thock');
          }} />
      )}
      {sheet?.kind === 'edit' && (
        <TextSheet title="EDIT STRIP" multiline value={song.table.find((s) => s.id === sheet.id)?.text ?? ''}
          onClose={() => (sheetState.value = null)}
          onSave={(v) => updateCurrent((d) => {
            const t = d.table.find((s) => s.id === sheet.id);
            if (!t || !v.trim() || v.trim() === t.text) return;
            t.text = v.trim(); t.joints = []; t.from = 'typed';
          })} />
      )}
      {sheet?.kind === 'bench' && <BenchChooser id={sheet.id} />}
    </div>
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
    const sid = sendTextToBench(song.id, [strip.text], target, kind);
    updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== id); });
    selected.value = null;
    feel('thock', 'medium');
    close();
    const nm = sectionNames(currentSong.peek()!).get(sid) ?? (kind ?? 'verse').toUpperCase();
    say(`→ ${nm}`, { label: 'GO', run: () => setMode('bench') });
    void before;
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
        { duration: 560, delay: i * 22, easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'backwards' },
      );
    });
  }));
}

export function TableKeys() {
  const song = currentSong.value;
  const n = song?.table.length ?? 0;
  return (
    <Keys>
      <Key icon="slip" label="Slip" sound="click" onClick={() => { sheetState.value = { kind: 'new', ...freeSpot(currentSong.peek()?.table ?? []) }; }} />
      <Key icon="draw" label="Deal" tone="dark" sound="ratchet" onClick={() => {
        const got = deal(4);
        say(got ? `DEALT ${got} FROM THE SHOEBOX` : 'THE SHOEBOX IS EMPTY — CATCH SOME LINES FIRST');
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
        say(`CUT ${cuts} INTO ${pieces} — NOW REARRANGE`, { label: 'UNDO', run: () => restore(before) });
      }} />
      <Key icon="shuffle" label="Shuffle" sound="shuffle" disabled={n < 2} onClick={() => glide(() => updateCurrent((d) => {
        const out: Strip[] = [];
        for (const s of [...d.table].sort(() => Math.random() - 0.5)) { const p = freeSpot(out); out.push({ ...s, x: p.x, y: p.y, rot: (Math.random() - 0.5) * 6 }); }
        d.table = out;
      }))} />
      <Key icon="sweep" label="Sweep" sound="shuffle" disabled={!n} onClick={() => {
        const before = snapshot();
        // new writing (typed, taped, edited) is kept in the shoebox; copies of things that live elsewhere are just cleared
        const keep = before.filter((s) => s.from === 'typed' || s.from === 'splice');
        const filed = keep.map((s) => addScrap(s.text.replace(/\n/g, ' / '), 'table', currentSong.peek()?.id)).filter(Boolean);
        updateCurrent((d) => { d.table = []; });
        selected.value = null;
        say(filed.length ? `TABLE CLEARED · ${filed.length} KEPT IN THE SHOEBOX` : 'TABLE CLEARED', { label: 'UNDO', run: () => { restore(before); filed.forEach((f) => f && removeScrap(f.id)); } });
      }} />
    </Keys>
  );
}
