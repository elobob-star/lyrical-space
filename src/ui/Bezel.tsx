import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Dial } from './Dial';
import { Icon } from './icons';
import { Key } from './Key';
import { currentSong, liveSongs, mode, scraps, settings, songs, Mode } from '../store/state';
import { currentPage, pages } from '../store/notebook';
import { dismissMsg, layer, latch, lcdMsg, lens, pen, rackTab, sprint } from '../store/ui';
import { recLevel, recording } from '../engine/recorder';
import { feel } from '../engine/feel';
import { sectionAbbrev, sectionNames } from '../store/models';

const MODES: Mode[] = ['roll', 'table', 'bench'];
const LABELS = ['NOTEBOOK', 'TABLE', 'BENCH'];

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
  } else if (ly === 'settings') {
    body = <><span>SETUP</span><span class="sp" /><span class="dim">FOOLSCAP</span></>;
  } else if (ly === 'rack') {
    const tab = rackTab.value;
    const n = tab === 'tapes' ? liveSongs.value.length : tab === 'shoebox' ? scraps.value.length : songs.value.filter((s) => s.deletedAt).length;
    body = <><span>{tab === 'tapes' ? 'TAPE RACK' : tab === 'shoebox' ? 'SHOEBOX' : 'BIN'}</span><span class="sp" /><span class="hot">{String(n).padStart(2, '0')}</span></>;
  } else if (m === 'roll') {
    const pg = currentPage.value;
    const total = pages.value.length;
    const d = pg ? new Date(pg.createdAt) : null;
    body = (
      <>
        <span class="hot">P.{pg?.n ?? 1}</span>{pg && pg.n !== total && <span class="dim">/{total}</span>}
        {d && <span class="dim">{String(d.getDate()).padStart(2, '0')} {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()]}</span>}
        <span class="sp" />
        {latch.value && <span class="hot">FWD</span>}
        {pen.value && <span class="hot">PEN</span>}
        {sp && <span class="hot">{mmss(sp.end - Date.now())}</span>}
      </>
    );
  } else if (!song) {
    body = <span class="dim">NO TAPE</span>;
  } else if (m === 'table') {
    const n = song.table.length;
    body = <><span class="msgwin">{song.title}</span><span class="hot">{String(n).padStart(2, '0')}</span></>;
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
  const idx = MODES.indexOf(mode.value);
  const lh = settings.value.leftHand;
  const rackOpen = layer.value === 'rack';
  const dial = (
    <div class="dial-wrap" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
      <div class="legend" style={{ textAlign: lh ? 'left' : 'right' }}>
        {LABELS.map((l, i) => (
          <button key={l} class={i === idx && !rackOpen ? 'on' : ''} onClick={() => setMode(MODES[i])} style={lh ? { alignItems: 'flex-start' } : undefined}><b>{l}</b></button>
        ))}
      </div>
      <Dial value={idx} onChange={(i) => setMode(MODES[i])} />
    </div>
  );
  return (
    <div class="bezel-top">
      <div class="bezel-row" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
        <div class="eject"><Key icon="eject" label="Tapes" led on={rackOpen} sound={null} onClick={toggleRack} /></div>
        <div class="mid">
          <div class="lcd-wrap">
            <Readout />
            <button class={'lcd-gear' + (layer.value === 'settings' ? ' on' : '')} aria-label="Setup" onClick={() => { feel('click', 'light'); layer.value = layer.peek() === 'settings' ? null : 'settings'; }}><Icon n="gear" size={16} stroke={1.7} /></button>
          </div>
        </div>
        {dial}
      </div>
    </div>
  );
}
