import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Dial } from './Dial';
import { Icon } from './icons';
import { Key } from './Key';
import { currentSong, liveSongs, mode, saving, scraps, settings, songs, updateCurrent, Mode } from '../store/state';
import { dismissMsg, layer, latch, lcdMsg, lens, pen, rackTab, rollStats, sprint } from '../store/ui';
import { recLevel, recording } from '../engine/recorder';
import { feel } from '../engine/feel';
import { sectionAbbrev, sectionNames } from '../store/models';

const MODES: Mode[] = ['roll', 'table', 'bench'];
const LABELS: Array<[string, string]> = [['ROLL', 'FREEWRITE'], ['TABLE', 'CUT-UP'], ['BENCH', 'STRUCTURE']];

export function setMode(m: Mode): void {
  if (layer.peek() === 'rack') layer.value = null;
  if (mode.peek() !== m) feel('clack', 'medium');
  mode.value = m;
}

export function toggleRack(): void {
  feel('eject', 'medium');
  layer.value = layer.peek() === 'rack' ? null : 'rack';
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function useTick(on: boolean, ms = 500): void {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [on, ms]);
}

/** A message that scrolls past if it is wider than the glass. */
function Message({ text, id }: { text: string; id: number }) {
  const win = useRef<HTMLSpanElement>(null);
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const w = win.current, m = el.current;
    if (!w || !m) return;
    m.classList.remove('scroll');
    const dist = m.scrollWidth - w.clientWidth;
    if (dist > 4) {
      m.style.setProperty('--dist', dist + 12 + 'px');
      m.style.setProperty('--dur', Math.max(2.5, dist / 38) + 's');
      void m.offsetWidth;
      m.classList.add('scroll');
    }
  }, [id]);
  return <span class="msgwin" ref={win}><span class="msg" ref={el}>{text}</span></span>;
}

function Readout() {
  const song = currentSong.value;
  const m = mode.value;
  const ly = layer.value;
  const msg = lcdMsg.value;
  const rec = recording.value;
  const sp = sprint.value;
  useTick(!!sp || rec, rec ? 200 : 500);

  let body;
  if (rec) {
    const lv = recLevel.value;
    body = (
      <>
        <span class="hot blink">●</span><span class="hot">REC</span>
        <span class="meter">{[0.08, 0.2, 0.35, 0.5, 0.68, 0.85].map((t, i) => <i key={i} class={lv > t ? 'on' : ''} style={{ height: `${4 + i * 1.4}px` }} />)}</span>
        <span class="sp" />
      </>
    );
  } else if (msg) {
    body = <><Message text={msg.text} id={msg.id} />{msg.action && <span class="act">{msg.action.label}</span>}</>;
  } else if (ly === 'rack') {
    const tab = rackTab.value;
    const n = tab === 'tapes' ? liveSongs.value.length : tab === 'shoebox' ? scraps.value.length : songs.value.filter((s) => s.deletedAt).length;
    body = <><span>{tab === 'tapes' ? 'TAPE RACK' : tab === 'shoebox' ? 'SHOEBOX' : 'BIN'}</span><span class="sp" /><span class="hot">{String(n).padStart(2, '0')}</span></>;
  } else if (!song) {
    body = <span class="dim">NO TAPE</span>;
  } else if (m === 'roll') {
    const { lines } = rollStats.value;
    body = (
      <>
        <span class="hot">{String(lines).padStart(3, '0')}</span><span class="dim">LINES</span>
        <span class="sp" />
        {latch.value && <span class="hot">FWD</span>}
        {pen.value && <span class="hot">PEN</span>}
        {sp && <span class="hot">{mmss(sp.end - Date.now())}</span>}
      </>
    );
  } else if (m === 'table') {
    const n = song.table.length;
    body = <><span class="hot">{String(n).padStart(2, '0')}</span><span class="dim">{n === 1 ? 'STRIP' : 'STRIPS'}</span><span class="sp" /></>;
  } else {
    const names = sectionNames(song);
    const map = song.arrangement.map((a) => { const s = song.sections.find((x) => x.id === a.sectionId); return s ? sectionAbbrev(s, names) : ''; }).join(' ');
    const ln = lens.value;
    body = (
      <>
        <span class="msgwin">{map || <span class="dim">NO SECTIONS</span>}</span>
        {ln !== 'off' && <span class="hot">{ln === 'rhyme' ? 'RHY' : 'MTR'}</span>}
        <span class="dim">{song.bpm}{song.key ? ' ' + song.key : ''}</span>
      </>
    );
  }
  return (
    <button class={'lcd' + (msg ? ' talk' : '')} key={msg?.id ?? 'idle'} aria-label="Display" aria-live="polite"
      onClick={() => { if (msg?.action) { feel('click'); const run = msg.action.run; dismissMsg(); run(); } else if (msg) dismissMsg(); }}>
      {body}
    </button>
  );
}

export function Bezel() {
  const song = currentSong.value;
  const [editing, setEditing] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const idx = MODES.indexOf(mode.value);
  const lh = settings.value.leftHand;
  const rackOpen = layer.value === 'rack';

  const finish = () => {
    const v = inp.current?.value.trim();
    if (song && v) updateCurrent((d) => { d.title = v; });
    setEditing(false);
  };

  const dial = (
    <div class="dial-wrap" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
      <div class="legend" style={{ textAlign: lh ? 'left' : 'right' }}>
        {LABELS.map(([l, sub], i) => (
          <button key={l} class={i === idx && !rackOpen ? 'on' : ''} onClick={() => setMode(MODES[i])} style={lh ? { alignItems: 'flex-start' } : undefined}>
            <b>{l}</b><small>{sub}</small>
          </button>
        ))}
      </div>
      <Dial value={idx} onChange={(i) => setMode(MODES[i])} />
    </div>
  );
  const tape = (
    <button class="title-tape" onClick={() => { if (!editing && song) setEditing(true); }} aria-label="Song title">
      <span class="swatch" style={{ '--c': `var(--ink-${song?.ink ?? 0})` }} />
      {editing ? (
        <input ref={(el) => { inp.current = el; if (el && document.activeElement !== el) { el.focus(); el.select(); } }} defaultValue={song?.title ?? ''} maxLength={60} onBlur={finish}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} />
      ) : (
        <><span class="t">{song?.title ?? '—'}</span><Icon n="edit" size={12} class="edit" /></>
      )}
    </button>
  );

  const rec = recording.value;
  return (
    <div class="bezel-top">
      <div class="nameplate">
        <span class={'led on ' + (rec ? 'red blink' : saving.value ? 'amber' : 'green')} aria-hidden="true" />
        <b class="brand">PORTASCRIBE</b><span class="mk">MK-II</span>
        <span class="grow" />
        <span class="grill" aria-hidden="true" />
        <button class="setup" aria-label="Setup" onClick={() => { feel('click'); layer.value = 'settings'; }}><Icon n="gear" size={15} stroke={1.5} /></button>
      </div>
      <div class="seam" />
      <div class="bezel-row" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
        <div class="eject"><Key icon="eject" label="Tapes" led on={rackOpen} sound={null} onClick={toggleRack} /></div>
        <div class="mid">{tape}<Readout /></div>
        {dial}
      </div>
    </div>
  );
}
