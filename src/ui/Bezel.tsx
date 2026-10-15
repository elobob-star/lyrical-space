import { useRef, useState } from 'preact/hooks';
import { Dial } from './Dial';
import { Icon } from './icons';
import { currentSong, mode, saving, settings, updateCurrent, Mode } from '../store/state';
import { grease, latch, layer, rollClock, rollStats, tableTool } from '../store/ui';
import { recording } from '../engine/recorder';
import { feel } from '../engine/feel';
import { sectionAbbrev, sectionNames } from '../store/models';

const MODES: Mode[] = ['roll', 'table', 'bench'];
const LABELS: Array<[string, string]> = [['ROLL', 'FREEWRITE'], ['TABLE', 'CUT-UP'], ['BENCH', 'STRUCTURE']];

export function setMode(m: Mode): void {
  mode.value = m;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function Readout() {
  const song = currentSong.value;
  const m = mode.value;
  if (!song) return <div class="lcd" />;
  if (m === 'roll') {
    const { lines, words } = rollStats.value;
    const ck = rollClock.value;
    return (
      <div class="lcd" aria-label="Readout">
        <span class="hot">{String(lines).padStart(3, '0')}L</span>
        <span>{String(words).padStart(4, '0')}W</span>
        <span class="sp" />
        {latch.value && <span class="hot blink">LATCH</span>}
        {grease.value && <span class="hot">PEN</span>}
        <span class={ck !== null ? 'hot' : 'dim'}>{clock(ck ?? 0)}</span>
      </div>
    );
  }
  if (m === 'table') {
    const n = song.table.length;
    const tool = tableTool.value;
    return (
      <div class="lcd" aria-label="Readout">
        <span class="hot">{String(n).padStart(2, '0')}</span>
        <span>STRIP{n === 1 ? '' : 'S'}</span>
        <span class="sp" />
        {tool && <span class="hot blink">{tool === 'snip' ? 'SNIP' : 'TAPE'}</span>}
      </div>
    );
  }
  const names = sectionNames(song);
  const map = song.arrangement.map((a) => { const s = song.sections.find((x) => x.id === a.sectionId); return s ? sectionAbbrev(s, names) : ''; }).join(' ');
  return (
    <div class="lcd" aria-label="Readout">
      <span class="hot">{map || '—'}</span>
      <span class="sp" />
      <span>{song.bpm}{song.key ? ' ' + song.key : ''}</span>
    </div>
  );
}

export function Bezel() {
  const song = currentSong.value;
  const [editing, setEditing] = useState(false);
  const [spin, setSpin] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const idx = MODES.indexOf(mode.value);
  const lh = settings.value.leftHand;

  const finish = () => {
    const v = inp.current?.value.trim();
    if (song && v) updateCurrent((d) => { d.title = v; });
    setEditing(false);
  };

  const dial = (
    <div class="dial-wrap">
      <div class="legend">
        {LABELS.map(([l, sub], i) => (
          <button class={i === idx ? 'on' : ''} onClick={() => { feel('click'); setMode(MODES[i]); }}><b>{l}</b><small>{sub}</small></button>
        ))}
      </div>
      <Dial value={idx} onChange={(i) => setMode(MODES[i])} />
    </div>
  );
  const reel = (
    <button class={'reel-btn' + (spin ? ' spin' : '')} aria-label="Open tape rack"
      onClick={() => { feel('thock'); setSpin(true); setTimeout(() => setSpin(false), 650); layer.value = 'rack'; }}>
      <Icon n="reel" size={26} stroke={1.8} />
    </button>
  );
  const tape = (
    <button class="title-tape" onClick={() => { if (!editing) { setEditing(true); } }} aria-label="Song title">
      <span class="swatch" style={{ '--c': `var(--ink-${song?.ink ?? 0})` }} />
      {editing ? (
        <input ref={(el) => { inp.current = el; if (el && document.activeElement !== el) { el.focus(); el.select(); } }} defaultValue={song?.title ?? ''} maxLength={60} onBlur={finish}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      ) : (
        <><span class="t">{song?.title ?? '—'}</span><Icon n="edit" size={12} class="edit" /></>
      )}
    </button>
  );

  const rec = recording.value;
  return (
    <div class="bezel-top">
      <i class="screw" style={{ left: '5px', top: 'calc(var(--safe-top) + 5px)' }} />
      <i class="screw" style={{ right: '5px', top: 'calc(var(--safe-top) + 5px)' }} />
      <div class="nameplate" role="button" tabIndex={0} onClick={() => { feel('click'); layer.value = 'settings'; }}>
        <span class={'led on ' + (rec ? 'red blink' : saving.value ? 'amber' : 'green')} />
        <b>PORTASCRIBE</b><span class="mk">MK-I</span>
        <span class="grow" />
        <span class="grill" />
        <Icon n="gear" size={13} />
      </div>
      <div class="bezel-row" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
        {reel}
        <div class="mid">{tape}<Readout /></div>
        {dial}
      </div>
    </div>
  );
}
