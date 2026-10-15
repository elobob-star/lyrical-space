import { useRef, useState } from 'preact/hooks';
import { Dial } from './Dial';
import { Icon } from './icons';
import { currentSong, mode, saving, setSetting, settings, updateCurrent, Mode } from '../store/state';
import { layer } from '../store/ui';
import { recording } from '../engine/recorder';
import { feel } from '../engine/feel';

const MODES: Mode[] = ['roll', 'table', 'bench'];
const LABELS = ['ROLL', 'TABLE', 'BENCH'];

export function setMode(m: Mode): void {
  mode.value = m;
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
        {LABELS.map((l, i) => (
          <button class={i === idx ? 'on' : ''} onClick={() => { feel('click'); setMode(MODES[i]); }}>{l}</button>
        ))}
      </div>
      <Dial value={idx} onChange={(i) => setMode(MODES[i])} />
    </div>
  );
  const reel = (
    <button class={'reel-btn' + (spin ? ' spin' : '')} aria-label="Open tape rack"
      onClick={() => { feel('thock'); setSpin(true); setTimeout(() => setSpin(false), 650); layer.value = 'rack'; }}>
      <Icon n="reel" size={24} />
    </button>
  );
  const tape = (
    <button class="title-tape" onClick={() => { if (!editing) { setEditing(true); setTimeout(() => inp.current?.select(), 30); } }} aria-label="Song title">
      <span class="swatch" style={{ '--c': `var(--ink-${song?.ink ?? 0})` }} />
      {editing ? (
        <input ref={inp} defaultValue={song?.title ?? ''} maxLength={60} onBlur={finish}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      ) : (
        <span class="t">{song?.title ?? '—'}</span>
      )}
    </button>
  );

  const rec = recording.value;
  return (
    <div class="bezel-top">
      <div class="nameplate" role="button" tabIndex={0} onClick={() => { feel('click'); layer.value = 'settings'; }}>
        <span class={'led on ' + (rec ? 'red blink' : saving.value ? 'amber' : 'green')} />
        <b>PORTASCRIBE</b> <span>MK-I</span>
        <span class="grow" />
        <span>{rec ? 'REC' : settings.value.paper.toUpperCase()}</span>
        <Icon n="gear" size={11} />
      </div>
      <div class="bezel-row" style={{ flexDirection: lh ? 'row-reverse' : 'row' }}>
        {reel}
        {tape}
        {dial}
      </div>
    </div>
  );
}

export { setSetting };
