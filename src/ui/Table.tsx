import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { addScrap, currentSong, removeScrap, scraps, updateCurrent, updateScrap } from '../store/state';
import { ID, Strip, sectionNames, uid } from '../store/models';
import { feel, haptic, sound } from '../engine/feel';
import { freeSpot, makeStrips, sendTextToBench } from '../store/actions';
import { indexAtPoint } from '../engine/hit';
import { say, tableTool } from '../store/ui';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Choices, Sheet, TextSheet } from './Sheet';
import { setMode } from './Bezel';

const selected = signal<ID | null>(null);
const taped = signal<ID | null>(null);
const sheetState = signal<null | { kind: 'edit' | 'new'; id?: ID } | { kind: 'bench'; id: ID } | { kind: 'join'; a: ID; b: ID }>(null);

function stripRemove(id: ID): Strip | null {
  const s = currentSong.value?.table.find((x) => x.id === id) ?? null;
  updateCurrent((d) => { d.table = d.table.filter((x) => x.id !== id); });
  if (selected.value === id) selected.value = null;
  return s;
}

function restoreStrip(s: Strip) { updateCurrent((d) => { d.table.push(s); }); }

const hashId = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;

export function dealFromScraps(): number {
  const song = currentSong.value;
  if (!song) return 0;
  const sparks = scraps.value.filter((s) => s.kind === 'spark');
  const bones = scraps.value.filter((s) => s.kind === 'bone');
  const pool = [...sparks.sort(() => Math.random() - 0.5), ...bones.sort(() => Math.random() - 0.5)].slice(0, 4);
  if (!pool.length) return 0;
  pool.forEach((p) => updateScrap(p.id, { used: p.used + 1 }));
  updateCurrent((d) => { d.table.push(...makeStrips(pool.map((p) => p.text), 'spark', d.table)); });
  return pool.length;
}

export function TableView() {
  const song = currentSong.value!;
  const board = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 600 });
  const knobRef = useRef<HTMLDivElement>(null);
  const sheet = sheetState.value;
  const sel = selected.value;

  useEffect(() => {
    const el = board.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { selected.value = null; taped.value = null; tableTool.value = null; }, []);

  const tool = tableTool.value;

  // ---- strip pointer handling (drag writes straight to the DOM: no re-render per move) ----
  const info = useRef<{ id: ID; el: HTMLElement; px: number; py: number; ox: number; oy: number; rot: number; moved: boolean; lx: number; lt: number; tilt: number; cx: number; cy: number } | null>(null);
  const onDown = (e: PointerEvent, s: Strip) => {
    if (tool === 'snip') return; // handled on click
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    info.current = { id: s.id, el, px: e.clientX, py: e.clientY, ox: s.x, oy: s.y, rot: s.rot, moved: false, lx: e.clientX, lt: performance.now(), tilt: 0, cx: s.x, cy: s.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = info.current;
    if (!d) return;
    let dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; haptic('light'); if (selected.value) selected.value = null; }
    // keep the note on the board
    const nx = Math.max(-0.08, Math.min(0.9, d.ox + dx / size.w)), ny = Math.max(0, Math.min(0.94, d.oy + dy / size.h));
    d.cx = nx; d.cy = ny;
    dx = (nx - d.ox) * size.w; dy = (ny - d.oy) * size.h;
    // paper lags behind the finger: tilt with horizontal velocity
    const now = performance.now();
    const vx = (e.clientX - d.lx) / Math.max(1, now - d.lt);
    d.tilt += (Math.max(-9, Math.min(9, vx * 14)) - d.tilt) * 0.35;
    d.lx = e.clientX; d.lt = now;
    d.el.classList.add('dragging');
    d.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${d.rot + d.tilt}deg) scale(1.045)`;
  };
  const onUp = (e: PointerEvent, s: Strip) => {
    const d = info.current;
    info.current = null;
    if (!d) return;
    if (d.moved) {
      // commit: set the final geometry on the element first so there is no visual jump, then update the store
      d.el.style.left = `${d.cx * 100}%`; d.el.style.top = `${d.cy * 100}%`;
      d.el.style.transform = `rotate(${d.rot}deg)`;
      d.el.classList.remove('dragging');
      d.el.animate([{ transform: `rotate(${d.rot + d.tilt * 0.6}deg) scale(1.045)` }, { transform: `rotate(${d.rot}deg) scale(1)` }], { duration: 300, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      updateCurrent((song2) => {
        const z = Math.max(0, ...song2.table.map((x) => x.z)) + 1;
        const t = song2.table.find((x) => x.id === d.id);
        if (t) { t.x = d.cx; t.y = d.cy; t.z = z; }
      });
      sound('thock');
      return;
    }
    // tap
    if (tool === 'tape') {
      if (!taped.value) { taped.value = s.id; feel('click'); }
      else if (taped.value === s.id) { taped.value = null; }
      else { sheetState.value = { kind: 'join', a: taped.value, b: s.id }; }
      return;
    }
    feel('click');
    selected.value = selected.value === s.id ? null : s.id;
    updateCurrent((d2) => { const t = d2.table.find((x) => x.id === s.id); if (t) t.z = Math.max(0, ...d2.table.map((x) => x.z)) + 1; });
  };
  const onClickSnip = (e: MouseEvent, s: Strip) => {
    if (tool !== 'snip') return;
    const el = e.currentTarget as HTMLElement;
    const off = indexAtPoint(el, e.clientX, e.clientY, s.text.length);
    const txt = s.text;
    // snap to the nearest whitespace
    let l = off, rr = off;
    while (l > 0 && !/\s/.test(txt[l - 1])) l--;
    while (rr < txt.length && !/\s/.test(txt[rr])) rr++;
    const cut = off - l <= rr - off ? l : rr;
    const a = txt.slice(0, cut).trim(), b = txt.slice(cut).trim();
    if (!a || !b) { say('TAP BETWEEN WORDS TO CUT'); return; }
    feel('snip', 'medium');
    updateCurrent((d) => {
      const t = d.table.find((x) => x.id === s.id)!;
      t.text = a;
      const z = Math.max(0, ...d.table.map((x) => x.z));
      d.table.push({ id: uid(), text: b, x: Math.min(0.85, t.x + 0.05), y: Math.min(0.9, t.y + 0.11), rot: (Math.random() - 0.5) * 8, z: z + 1, from: t.from });
    });
  };

  // ---- lever (direct DOM, springs back) ----
  const lv = useRef<{ y: number; active: boolean; p: number; step: number } | null>(null);
  const LEVER_H = 150;
  const setLever = (p: number, spring: boolean) => {
    const k = knobRef.current;
    if (!k) return;
    k.classList.toggle('drag', !spring);
    k.style.transform = `translate3d(0, ${p * LEVER_H}px, 0)`;
  };
  const lvDown = (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); lv.current = { y: e.clientY, active: true, p: 0, step: 0 }; setLever(0, false); };
  const lvMove = (e: PointerEvent) => {
    const l = lv.current;
    if (!l?.active) return;
    l.p = Math.max(0, Math.min(1, (e.clientY - l.y) / LEVER_H));
    const step = Math.floor(l.p * 6);
    if (step !== l.step) { l.step = step; sound('tock'); haptic('light'); }
    setLever(l.p, false);
  };
  const lvUp = () => {
    const l = lv.current;
    if (!l?.active) return;
    lv.current = null;
    setLever(0, true);
    if (l.p > 0.8) {
      feel('ratchet', 'heavy');
      const n = dealFromScraps();
      say(n ? `DEALT ${n} FRAGMENTS` : 'SHOEBOX & BONEYARD ARE EMPTY — CATCH SOME LINES');
    }
  };

  const strips = [...song.table].sort((a, b) => a.z - b.z);
  const selStrip = strips.find((s) => s.id === sel);
  const joinInfo = sheet?.kind === 'join' ? sheet : null;

  return (
    <div class="mode-view table">
      <div class="board" ref={board} onClick={(e) => { if (e.target === e.currentTarget) selected.value = null; }}>
        <div class="board-label">{tool === 'snip' ? 'SNIP — TAP BETWEEN WORDS' : tool === 'tape' ? (taped.value ? 'TAPE — PICK THE SECOND STRIP' : 'TAPE — PICK THE FIRST STRIP') : `${strips.length} STRIP${strips.length === 1 ? '' : 'S'} ON THE TABLE`}</div>
        {strips.length === 0 && (
          <div class="empty-table">
            <b>EMPTY TABLE</b>
            <span>Punch highlights from the ROLL, pull the lever for random fragments, or add a strip.</span>
          </div>
        )}
        {strips.map((s) => {
          return (
            <div key={s.id} data-id={s.id} data-rot={s.rot}
              class={'strip n' + hashId(s.id) + ' f-' + s.from + (sel === s.id ? ' sel' : '') + (taped.value === s.id ? ' taped' : '') + (tool === 'snip' ? ' snippable' : '') + (s.from === 'splice' ? ' spliced' : '')}
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, zIndex: s.z, transform: `rotate(${s.rot}deg)`, '--r': s.rot } as any}
              onPointerDown={(e) => onDown(e as any, s)} onPointerMove={onMove as any} onPointerUp={(e) => onUp(e as any, s)} onPointerCancel={() => { const d = info.current; info.current = null; if (d) { d.el.classList.remove('dragging'); d.el.style.transform = `rotate(${d.rot}deg)`; } }}
              onClick={(e) => onClickSnip(e as any, s)}>
              <span class="st" data-s="0">{s.text}</span>
            </div>
          );
        })}
        {selStrip && (
          <div class="strip-actions" style={{
            left: `${Math.max(2, Math.min(70, selStrip.x * 100))}%`,
            top: selStrip.y > 0.14 ? `calc(${selStrip.y * 100}% - 46px)` : `calc(${selStrip.y * 100}% + 70px)`, zIndex: 1000,
          }}>
            <button onClick={() => { sheetState.value = { kind: 'edit', id: selStrip.id }; }}><Icon n="edit" size={15} />EDIT</button>
            <button class="go" onClick={() => { sheetState.value = { kind: 'bench', id: selStrip.id }; }}><Icon n="bench" size={15} />BENCH</button>
            <button onClick={() => {
              const s = stripRemove(selStrip.id);
              if (!s) return;
              const sc = addScrap(s.text, 'bone', song.id);
              feel('thock');
              say('BURIED IN THE BONEYARD', { label: 'UNDO', run: () => { restoreStrip(s); if (sc) removeScrap(sc.id); } });
            }}><Icon n="bones" size={15} />BURY</button>
            <button class="danger" aria-label="Delete strip" onClick={() => {
              const s = stripRemove(selStrip.id);
              if (s) say('STRIP REMOVED', { label: 'UNDO', run: () => restoreStrip(s) });
            }}><Icon n="trash" size={15} /></button>
          </div>
        )}
        <div class="lever-slot" aria-label="Deal lever">
          <span class="lever-label">DEAL</span>
          <div class="lever-track" />
          <div class="lever-knob" ref={knobRef}
            onPointerDown={lvDown as any} onPointerMove={lvMove as any} onPointerUp={lvUp} onPointerCancel={lvUp} />
        </div>
      </div>

      {sheet?.kind === 'new' && (
        <TextSheet title="NEW STRIP" multiline hand placeholder="a line, a fragment, a word…" okLabel="PIN IT"
          onClose={() => (sheetState.value = null)}
          onSave={(v) => { const t = v.trim(); if (t) updateCurrent((d) => { d.table.push(...makeStrips([t], 'typed', d.table)); }); }} />
      )}
      {sheet?.kind === 'edit' && (
        <TextSheet title="EDIT STRIP" multiline hand value={song.table.find((s) => s.id === sheet.id)?.text ?? ''}
          onClose={() => (sheetState.value = null)}
          onSave={(v) => updateCurrent((d) => { const t = d.table.find((s) => s.id === sheet.id); if (t) t.text = v.trim() || t.text; })} />
      )}
      {sheet?.kind === 'bench' && <BenchChooser id={sheet.id} />}
      {joinInfo && (
        <Sheet title="TAPE THEM TOGETHER" onClose={() => { sheetState.value = null; taped.value = null; }}>
          <Choices items={[{ id: 'stack', label: 'STACK ↓', hint: 'two lines, one strip' }, { id: 'join', label: 'JOIN →', hint: 'one line, glued with a space' }]}
            onPick={(k) => {
              updateCurrent((d) => {
                const a = d.table.find((s) => s.id === joinInfo.a), b = d.table.find((s) => s.id === joinInfo.b);
                if (!a || !b) return;
                a.text = a.text + (k === 'stack' ? '\n' : ' ') + b.text;
                a.from = 'splice';
                a.z = Math.max(0, ...d.table.map((x) => x.z)) + 1;
                d.table = d.table.filter((s) => s.id !== b.id);
              });
              feel('chk', 'medium');
              sheetState.value = null; taped.value = null;
            }} />
        </Sheet>
      )}
    </div>
  );
}

function BenchChooser({ id }: { id: ID }) {
  const song = currentSong.value!;
  const strip = song.table.find((s) => s.id === id);
  const names = sectionNames(song);
  const close = () => (sheetState.value = null);
  if (!strip) return null;
  const go = (target: ID | 'new', kind?: any) => {
    const sid = sendTextToBench(song.id, [strip.text], target, kind);
    const removed = stripRemove(id);
    feel('thock', 'medium');
    close();
    say(`SLOTTED INTO ${names.get(sid)?.toUpperCase() ?? (kind ?? 'verse').toUpperCase()}`, { label: 'GO TO BENCH', run: () => setMode('bench') });
    void removed;
  };
  return (
    <Sheet title="SLOT INTO THE BENCH" onClose={close}>
      <Choices
        items={[
          ...song.sections.map((s) => ({ id: s.id, label: names.get(s.id) ?? s.kind.toUpperCase(), hint: 'append' })),
          { id: 'new:verse', label: '+ NEW VERSE', hint: '' }, { id: 'new:chorus', label: '+ NEW CHORUS', hint: '' }, { id: 'new:bridge', label: '+ NEW BRIDGE', hint: '' },
        ]}
        onPick={(v) => (v.startsWith('new:') ? go('new', v.slice(4)) : go(v as ID))} />
    </Sheet>
  );
}

export function TableKeys() {
  const tool = tableTool.value;
  return (
    <Keys>
      <Key icon="strip" label="+Strip" tone="cap" sound="thock" onClick={() => (sheetState.value = { kind: 'new' })} />
      <Key icon="scissors" label="Snip" tone="blue" on={tool === 'snip'} led="orange" onClick={() => { tableTool.value = tool === 'snip' ? null : 'snip'; taped.value = null; selected.value = null; }} />
      <Key icon="tape" label="Tape" tone="green" on={tool === 'tape'} led="orange" onClick={() => { tableTool.value = tool === 'tape' ? null : 'tape'; taped.value = null; selected.value = null; }} />
      <Key icon="shuffle" label="Shuffle" tone="yellow" sound="ratchet" onClick={() => {
        // FLIP: remember where every note is, reshuffle, then animate each from old → new on the compositor
        const before = new Map<string, { x: number; y: number; rot: number }>();
        document.querySelectorAll<HTMLElement>('.board .strip').forEach((el) => {
          const r = el.getBoundingClientRect();
          before.set(el.dataset.id!, { x: r.left, y: r.top, rot: Number(el.dataset.rot) });
        });
        updateCurrent((d) => {
          const out: Strip[] = [];
          for (const s of d.table) {
            const p = freeSpot(out);
            out.push({ ...s, x: p.x, y: p.y, rot: (Math.random() - 0.5) * 6 });
          }
          d.table = out;
        });
        selected.value = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.querySelectorAll<HTMLElement>('.board .strip').forEach((el, i) => {
            const b = before.get(el.dataset.id!);
            if (!b) return;
            const r = el.getBoundingClientRect();
            const nr = Number(el.dataset.rot);
            el.animate(
              [{ transform: `translate3d(${b.x - r.left}px, ${b.y - r.top}px, 0) rotate(${b.rot}deg) scale(1.03)` }, { transform: `rotate(${nr}deg) scale(1)` }],
              { duration: 620, delay: i * 25, easing: 'cubic-bezier(.2,1.25,.3,1)', fill: 'backwards' },
            );
          });
        }));
      }} />
    </Keys>
  );
}
