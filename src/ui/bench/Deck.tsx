import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { currentSong, saveBlob, deleteBlob, updateCurrent } from '../../store/state';
import { ID, Memo, uid } from '../../store/models';
import { ROOTS, TUNINGS, isFlatKey, keyName, parseKey, semisBetween, transposeChord } from '../../engine/music';
import { feel, metronomeOn, startMetronome, stopMetronome } from '../../engine/feel';
import { cancelRecording, recLevel, recording, startRecording, stopRecording } from '../../engine/recorder';
import { loopIds, playProgress, playingId, stopMemo, toggleLoop, togglePlay } from '../../engine/memoPlayer';
import { say } from '../../store/ui';
import { pushUndo } from '../../store/undo';
import { Icon } from '../icons';
import { Sheet, TextSheet } from '../Sheet';
import { SwitchRow } from '../Switch';

export const deckSheet = signal<null | 'key' | 'capo' | 'tuning' | 'bpm'>(null);
export const metro = signal(false);
const beatFlash = signal(0);
const memoSheet = signal<ID | null>(null);
const recTarget = signal<ID | 'song'>('song');
const recStarted = signal(0);

export function toggleMetronome(): void {
  const song = currentSong.value;
  if (!song) return;
  if (metronomeOn()) { stopMetronome(); metro.value = false; return; }
  metro.value = true;
  startMetronome(() => currentSong.peek()?.bpm ?? 90, (n) => { if (n >= 0) beatFlash.value = n + 1; });
}

export async function toggleRecord(target: ID | 'song'): Promise<void> {
  const song = currentSong.value;
  if (!song) return;
  if (recording.value) {
    const res = await stopRecording();
    if (metronomeOn() && metro.value) { stopMetronome(); metro.value = false; }
    if (!res || res.durMs < 400) { say('TOO SHORT — NOT KEPT'); return; }
    await keepMemo(uid(), res, recTarget.value === 'song' ? undefined : (recTarget.value as ID));
    return;
  }
  recTarget.value = target;
  try {
    stopMemo();
    if (metro.value || metronomeOn()) {
      // count-in: four clicks, then roll tape
      startMetronome(() => currentSong.peek()?.bpm ?? 90, (n) => {
        if (n >= 0) beatFlash.value = n + 1;
        if (n === 0) { recStarted.value = Date.now(); void startRecording().catch(() => say('MIC BLOCKED — ALLOW MICROPHONE ACCESS')); }
      }, 4);
      metro.value = true;
      feel('rec', 'light');
    } else {
      await startRecording();
      recStarted.value = Date.now();
      feel('rec', 'medium');
    }
  } catch {
    say('MIC BLOCKED — ALLOW MICROPHONE ACCESS IN ANDROID SETTINGS');
  }
}

async function keepMemo(id: ID, res: { blob: Blob; durMs: number; peaks: number[]; mime: string }, sectionId?: ID): Promise<void> {
  await saveBlob(id, res.blob);
  updateCurrent((d) => {
    const n = d.memos.filter((m) => (m.sectionId ?? null) === (sectionId ?? null)).length + 1;
    d.memos.push({ id, sectionId, label: (sectionId ? 'HUM ' : 'TAKE ') + String(n).padStart(2, '0'), durMs: res.durMs, peaks: res.peaks, mime: res.mime, createdAt: Date.now() });
  });
  feel('rec', 'medium');
  say(sectionId ? 'MELODY KEPT ON THIS CARD' : 'TAPE SAVED', { label: 'PLAY', run: () => { const m = currentSong.peek()?.memos.find((x) => x.id === id); if (m) void togglePlay(m); } });
}

/** Press and hold a card's mic to hum how it goes; let go to keep it. */
export function humHandlers(sectionId: ID) {
  let held = false, started = false, t0 = 0;
  const down = (e: PointerEvent) => {
    if (recording.peek() && recTarget.peek() === 'song') { say('THE SCRATCH TAPE IS ROLLING'); return; }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
    held = true; started = false; t0 = performance.now();
    stopMemo();
    recTarget.value = sectionId;
    feel('rec', 'medium');
    startRecording().then(() => {
      started = true;
      recStarted.value = Date.now();
      if (!held) void finish();
    }).catch(() => { held = false; say('MIC BLOCKED — ALLOW MICROPHONE ACCESS'); });
  };
  const finish = async () => {
    if (!started) return;
    if (performance.now() - t0 < 450) { cancelRecording(); say('HOLD THE MIC AND HUM — LET GO TO KEEP IT'); return; }
    const res = await stopRecording();
    if (!res || res.durMs < 400) { say('TOO SHORT — NOT KEPT'); return; }
    await keepMemo(uid(), res, sectionId);
  };
  const up = () => { if (!held) return; held = false; void finish(); };
  return { onPointerDown: down, onPointerUp: up, onPointerCancel: up, onContextMenu: (e: Event) => e.preventDefault() };
}

export function tuningShort(t: string): string {
  const map: Record<string, string> = {
    'Standard EADGBE': 'STD', 'Drop D': 'DROP D', DADGAD: 'DADGAD', 'Open G': 'OPEN G', 'Open D': 'OPEN D', 'Half-step down': '♭ HALF',
    'Full step down': '♭ FULL', CGCFCE: 'CGCFCE', 'Open E': 'OPEN E', 'Ukulele GCEA': 'UKE',
  };
  return map[t] ?? t.toUpperCase().slice(0, 7);
}

const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function Deck() {
  const song = currentSong.value!;
  const rec = recording.value;
  const [, tick] = useState(0);
  useEffect(() => { if (!rec) return; const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, [rec]);
  const key = parseKey(song.key);
  const flash = beatFlash.value;
  return (
    <div class="deck-wrap">
      <div class="deck" role="toolbar" aria-label="Song settings">
        <button class="dchip" onClick={() => (deckSheet.value = 'key')}><i>KEY</i><b>{key ? keyName(key) : '—'}</b></button>
        <button class="dchip" onClick={() => (deckSheet.value = 'capo')}><i>CAPO</i><b>{song.capo || '0'}</b></button>
        <button class="dchip wide" onClick={() => (deckSheet.value = 'tuning')}><i>TUNE</i><b>{tuningShort(song.tuning)}</b></button>
        <button class="dchip" onClick={() => (deckSheet.value = 'bpm')}><i>BPM</i><b>{song.bpm}</b></button>
        <button class={'dchip dtog' + (metro.value ? ' on' : '')} onClick={() => { feel('click'); toggleMetronome(); }} aria-label="Metronome">
          <Icon n="metro" size={15} /><span class={'beat' + (flash % 2 ? ' a' : ' b')} />
        </button>
        <button class={'dchip dtog rec' + (rec && recTarget.value === 'song' ? ' on' : '')} onClick={() => void toggleRecord('song')} aria-label="Record scratch tape">
          <span class={'reels' + (rec && recTarget.value === 'song' ? ' spin' : playingId.value && song.memos.some((m) => m.id === playingId.value && !m.sectionId) ? ' spin' : '')}><i /><i /></span>
          {rec && recTarget.value === 'song' ? <b>{mmss(Date.now() - recStarted.value)}</b> : <b>REC</b>}
        </button>
      </div>
      <MemoPills memos={song.memos.filter((m) => !m.sectionId)} />
      {deckSheet.value === 'key' && <KeySheet />}
      {deckSheet.value === 'capo' && <CapoSheet />}
      {deckSheet.value === 'tuning' && <TuningSheet />}
      {deckSheet.value === 'bpm' && <BpmSheet />}
      {memoSheet.value && <MemoSheet id={memoSheet.value} />}
    </div>
  );
}

export function MemoPills({ memos }: { memos: Memo[] }) {
  if (!memos.length) return null;
  const pid = playingId.value;
  return (
    <div class="memos">
      {memos.map((m) => {
        const on = pid === m.id;
        const loop = loopIds.value.includes(m.id);
        return (
          <div class={'memo' + (on ? ' on' : '')} key={m.id}>
            <button class="mplay" aria-label={on ? 'Stop' : 'Play'} onClick={() => { feel('click'); void togglePlay(m); }}><Icon n={on ? 'stop' : 'play'} size={13} /></button>
            <button class="mwave" onClick={() => (memoSheet.value = m.id)} aria-label={`${m.label} options`}>
              <span class="bars">{m.peaks.map((p, i) => <i style={{ height: `${Math.max(12, p * 100)}%` }} class={on && i / m.peaks.length <= playProgress.value ? 'done' : ''} />)}</span>
              <span class="mlab">{m.label} · {mmss(m.durMs)}{loop ? ' ↻' : ''}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MemoSheet({ id }: { id: ID }) {
  const song = currentSong.value!;
  const m = song.memos.find((x) => x.id === id);
  const [rename, setRename] = useState(false);
  const close = () => (memoSheet.value = null);
  if (!m) return null;
  if (rename) return <TextSheet title="RENAME TAPE" value={m.label} onClose={close} onSave={(v) => updateCurrent((d) => { const x = d.memos.find((y) => y.id === id); if (x && v.trim()) x.label = v.trim().toUpperCase(); })} />;
  return (
    <Sheet title={m.label} onClose={close}>
      <div class="choices">
        <button class="choice" onClick={() => setRename(true)}><span>RENAME</span></button>
        <button class="choice" onClick={() => { toggleLoop(id); }}><span>{loopIds.value.includes(id) ? 'LOOP: ON ↻' : 'LOOP: OFF'}</span><small>repeat while writing</small></button>
        <button class="choice" onClick={() => {
          if (playingId.value === id) stopMemo();
          void deleteBlob(id);
          updateCurrent((d) => { d.memos = d.memos.filter((x) => x.id !== id); });
          close();
          say('TAPE ERASED');
        }}><span>ERASE</span><small>cannot be undone</small></button>
      </div>
    </Sheet>
  );
}

function KeySheet() {
  const song = currentSong.value!;
  const key = parseKey(song.key);
  const [minor, setMinor] = useState(key?.minor ?? false);
  const hasChords = song.sections.some((sec) => sec.takes.some((t) => t.lines.some((l) => l.chords.length)));
  const [move, setMove] = useState(true);
  const close = () => (deckSheet.value = null);
  const pick = (r: string) => {
    const next = parseKey(r + (minor ? 'm' : ''))!;
    const semis = key && hasChords && move ? semisBetween(key, next) : 0;
    const flat = isFlatKey(next);
    deckUndo('KEY', !!semis);
    updateCurrent((d) => {
      d.key = keyName(next);
      if (!semis) return;
      for (const sec of d.sections) for (const t of sec.takes) for (const l of t.lines) for (const c of l.chords) c.name = transposeChord(c.name, semis, flat);
    });
    feel('click');
    if (semis) say(`TRANSPOSED ${semis > 0 ? '+' : ''}${semis} → ${keyName(next)}`);
    close();
  };
  return (
    <Sheet title="KEY" onClose={close} right={<button class="btn small" onClick={() => { deckUndo('KEY'); updateCurrent((d) => { d.key = null; }); close(); }}>CLEAR</button>}>
      <div class="seg"><button class={!minor ? 'on' : ''} onClick={() => setMinor(false)}>MAJOR</button><button class={minor ? 'on' : ''} onClick={() => setMinor(true)}>MINOR</button></div>
      {key && hasChords && (
        <SwitchRow label="MOVE THE CHORDS TOO" hint="transpose every stamp into the new key" on={move} onChange={setMove} />
      )}
      <div class="grid4" style={{ marginTop: '10px' }}>
        {ROOTS.map((r) => (
          <button class={'cell' + (key && key.root === r && key.minor === minor ? ' on' : '')} key={r} onClick={() => pick(r)}>{r}{minor ? 'm' : ''}</button>
        ))}
      </div>
    </Sheet>
  );
}

function CapoSheet() {
  const song = currentSong.value!;
  const close = () => (deckSheet.value = null);
  return (
    <Sheet title="CAPO" onClose={close}>
      <div class="grid4">
        {Array.from({ length: 10 }, (_, i) => i).map((n) => (
          <button class={'cell' + (song.capo === n ? ' on' : '')} key={n} onClick={() => { feel('click'); deckUndo('CAPO'); updateCurrent((d) => { d.capo = n; }); close(); }}>{n === 0 ? 'NONE' : n}</button>
        ))}
      </div>
    </Sheet>
  );
}

function TuningSheet() {
  const song = currentSong.value!;
  const [custom, setCustom] = useState('');
  const close = () => (deckSheet.value = null);
  return (
    <Sheet title="TUNING" onClose={close}>
      <div class="list">
        {TUNINGS.map((t) => (
          <button class={'li' + (song.tuning === t ? ' on' : '')} key={t} onClick={() => { feel('click'); deckUndo('TUNING'); updateCurrent((d) => { d.tuning = t; }); close(); }}>{t}</button>
        ))}
      </div>
      <div class="row" style={{ marginTop: '10px' }}>
        <input class="field" placeholder="custom tuning…" value={custom} onInput={(e) => setCustom((e.target as HTMLInputElement).value)} />
        <button class="btn go" onClick={() => { if (custom.trim()) { deckUndo('TUNING'); updateCurrent((d) => { d.tuning = custom.trim(); }); close(); } }}>SET</button>
      </div>
    </Sheet>
  );
}

/** Remember the song's key / capo / tuning / tempo (and its chords, when a key change moves them) so the change can be undone. */
function deckUndo(label: string, withSections = false): void {
  const song = currentSong.peek();
  if (!song) return;
  const snap = JSON.parse(JSON.stringify({ key: song.key, capo: song.capo, tuning: song.tuning, bpm: song.bpm, sections: song.sections }));
  pushUndo('bench', label, () => updateCurrent((d) => {
    d.key = snap.key; d.capo = snap.capo; d.tuning = snap.tuning; d.bpm = snap.bpm;
    if (withSections) d.sections = snap.sections;
  }));
}

const taps: number[] = [];

function BpmSheet() {
  const song = currentSong.value!;
  const close = () => (deckSheet.value = null);
  const recorded = useRef(false);
  const set = (n: number) => {
    if (!recorded.current) { recorded.current = true; deckUndo('TEMPO'); }
    updateCurrent((d) => { d.bpm = Math.max(40, Math.min(240, Math.round(n))); });
  };
  const tap = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2200) taps.length = 0;
    taps.push(now);
    if (taps.length > 8) taps.shift();
    feel('tick', 'light');
    if (taps.length >= 2) set(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  };
  return (
    <Sheet title="TEMPO" onClose={close}>
      <div class="bpm-big">{song.bpm}<small>BPM</small></div>
      <input class="range" type="range" min={40} max={220} value={song.bpm} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} />
      <div class="row wrap" style={{ marginTop: '12px', justifyContent: 'space-between' }}>
        <button class="btn" onClick={() => set(song.bpm - 5)}>−5</button>
        <button class="btn" onClick={() => set(song.bpm - 1)}>−1</button>
        <button class="btn go tapbtn" onPointerDown={tap}>TAP</button>
        <button class="btn" onClick={() => set(song.bpm + 1)}>+1</button>
        <button class="btn" onClick={() => set(song.bpm + 5)}>+5</button>
      </div>
      <div class="row" style={{ marginTop: '12px' }}>
        <button class={'btn grow' + (metro.value ? ' go' : '')} onClick={() => toggleMetronome()}><Icon n="metro" size={16} /> {metro.value ? 'CLICK ON' : 'CLICK OFF'}</button>
      </div>
    </Sheet>
  );
}

export { recLevel, useRef };
