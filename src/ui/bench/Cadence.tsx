import { signal } from '@preact/signals';
import { useRef, useState } from 'preact/hooks';
import { ID } from '../../store/models';
import { Beat, HOLD_MS, TapEvent, tapsToPattern } from '../../engine/cadence';
import { currentSong, updateCurrent } from '../../store/state';
import { recordSection } from '../../store/lines';
import { feel, haptic, sound } from '../../engine/feel';
import { Sheet } from '../Sheet';
import { Icon } from '../icons';

export const cadenceFor = signal<ID | null>(null);

const label = (b: Beat) => (b === 'S' ? 'DUM' : b === 'u' ? 'da' : '·');

export function CadenceSheet() {
  const sid = cadenceFor.value;
  const song = currentSong.value;
  const sec = song?.sections.find((s) => s.id === sid);
  const [pat, setPat] = useState<Beat[]>(sec?.cadence ?? []);
  const [pad, setPad] = useState<TapEvent[]>([]);
  const down = useRef(0);
  const [pressed, setPressed] = useState(false);
  const close = () => (cadenceFor.value = null);
  if (!sec) return null;

  const add = (b: Beat) => { feel('click', 'light'); setPat((p) => [...p, b]); };
  const save = () => {
    if (song && sid) recordSection(song.id, sid, 'CADENCE');
    updateCurrent((d) => { const s = d.sections.find((x) => x.id === sid); if (s) { if (pat.length) s.cadence = pat; else delete s.cadence; } });
    feel('chk', 'medium');
    close();
  };
  const padDown = (e: PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); down.current = performance.now(); setPressed(true); haptic('light'); };
  const padUp = () => {
    if (!down.current) return;
    const dur = performance.now() - down.current;
    down.current = 0;
    setPressed(false);
    sound(dur >= HOLD_MS ? 'thock' : 'tick');
    setPad((p) => [...p, { t: performance.now() - dur, dur }]);
  };

  const padPattern = tapsToPattern(pad);
  return (
    <Sheet title={`CADENCE · ${sec.kind.toUpperCase()}`} onClose={close} right={<button class="btn small" onClick={() => { setPat([]); setPad([]); }}>CLEAR</button>}>
      <p class="hint">Tap the rhythm with your thumb — short = <b>da</b>, hold = <b>DUM</b>, pause = rest. Lines in this section get measured against it.</p>
      <div
        class={'tap-pad' + (pressed ? ' down' : '')} role="button" aria-label="Tap pad" onPointerDown={padDown as any} onPointerUp={padUp} onPointerCancel={padUp}>
        <span>{pad.length ? padPattern.map(label).join(' ') : 'TAP HERE'}</span>
      </div>
      <div class="row" style={{ marginTop: '8px' }}>
        <button class="btn small" onClick={() => { setPat(padPattern); setPad([]); }} disabled={!pad.length}>USE TAPS</button>
        <button class="btn small" onClick={() => setPad([])} disabled={!pad.length}>RESET PAD</button>
        <span class="grow" />
        <span class="muted tiny">{pat.filter((b) => b !== 'r').length} BEATS</span>
      </div>
      <div class="tiles">
        {pat.length === 0 && <span class="muted tiny">NO TEMPLATE — BUILD ONE BELOW</span>}
        {pat.map((b, i) => (
          <button key={i} class={'tile ' + b} aria-label={`Beat ${i + 1}: ${label(b)}. Tap to cycle.`}
            onClick={() => setPat((p) => p.map((x, j) => (j === i ? (x === 'u' ? 'S' : x === 'S' ? 'r' : 'u') : x)))}
            onContextMenu={(e) => { e.preventDefault(); setPat((p) => p.filter((_, j) => j !== i)); }}>{label(b)}</button>
        ))}
      </div>
      <div class="row" style={{ marginTop: '6px' }}>
        <button class="btn small" onClick={() => add('u')}>+ da</button>
        <button class="btn small" onClick={() => add('S')}>+ DUM</button>
        <button class="btn small" onClick={() => add('r')}>+ rest</button>
        <button class="btn small" onClick={() => setPat((p) => p.slice(0, -1))} aria-label="Backspace"><Icon n="left" size={14} /></button>
        <span class="grow" />
        <button class="btn go" onClick={save}>SAVE</button>
      </div>
    </Sheet>
  );
}
