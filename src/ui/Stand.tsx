import { useEffect, useRef, useState } from 'preact/hooks';
import { Chord, Line, Song, activeTake, sectionNames } from '../store/models';
import { currentSong } from '../store/state';
import { layer, useBackClose } from '../store/ui';
import { feel } from '../engine/feel';
import { kvGet, kvSet } from '../store/db';
import { Icon } from './icons';
import { tuningShort } from './bench/Deck';

interface Block { name: string; kind: string; lines: Line[]; repeat: boolean }

function blocks(song: Song): Block[] {
  const names = sectionNames(song);
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const a of song.arrangement) {
    const sec = song.sections.find((s) => s.id === a.sectionId);
    if (!sec) continue;
    out.push({ name: names.get(sec.id) ?? sec.kind.toUpperCase(), kind: sec.kind, lines: activeTake(sec).lines.filter((l) => l.text.trim() || l.chords.length), repeat: seen.has(sec.id) });
    seen.add(sec.id);
  }
  return out;
}

/** Lyric with chord names hung above the words they land on (wraps correctly at any size). */
function Sung({ line, chords }: { line: Line; chords: boolean }) {
  const text = line.text;
  if (!chords || !line.chords.length) return <div class="sl">{text || ' '}</div>;
  const cuts = new Set([0, text.length]);
  const at = new Map<number, Chord>();
  for (const c of line.chords) {
    let i = Math.min(c.at, text.length);
    while (i < text.length && /\s/.test(text[i])) i++;
    if (!at.has(i)) at.set(i, c);
    cuts.add(i);
    let j = i;
    while (j < text.length && /\S/.test(text[j])) j++;
    cuts.add(j); // the word a chord lands on never breaks away from it
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const parts = [];
  for (let k = 0; k < pts.length - 1; k++) parts.push({ s: pts[k], e: pts[k + 1] });
  if (at.has(text.length)) parts.push({ s: text.length, e: text.length });
  return (
    <div class="sl ch">
      {parts.map((p) => (
        <span class={at.get(p.s) ? 'sg anc' : 'sg'} key={p.s}>{at.get(p.s) && <b class="cn">{at.get(p.s)!.name}</b>}{text.slice(p.s, p.e) || (at.get(p.s) ? '\u00a0\u00a0' : '')}</span>
      ))}
    </div>
  );
}

interface Prefs { size: number; speed: number; chords: boolean; compact: boolean }
const DEFAULTS: Prefs = { size: 0, speed: 1, chords: true, compact: false };
const SIZES = [17, 20, 24, 29];

export function Stand() {
  const song = currentSong.value;
  const close = () => { layer.value = null; };
  useBackClose(true, close);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [chrome, setChrome] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const pos = useRef(0);

  useEffect(() => { void kvGet<Prefs>('stand').then((p) => p && setPrefs({ ...DEFAULTS, ...p })); }, []);
  const set = (p: Partial<Prefs>) => { const n = { ...prefs, ...p }; setPrefs(n); void kvSet('stand', n); feel('click', 'light'); };

  // auto-scroll paced by the song's tempo: one sung line ≈ two bars of 4/4 at speed 1×
  useEffect(() => {
    if (!playing || !song) return;
    const el = body.current!;
    const row = el.querySelector('.sl') as HTMLElement | null;
    const rowH = row ? row.getBoundingClientRect().height + 4 : 40;
    const secsPerLine = (8 * 60) / Math.max(40, song.bpm);
    const pxPerSec = (rowH / secsPerLine) * prefs.speed;
    pos.current = el.scrollTop;
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      pos.current += pxPerSec * dt;
      el.scrollTop = pos.current;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setPlaying(false); setChrome(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, prefs.speed, prefs.size, song?.bpm]);

  const onScroll = () => {
    const el = body.current!;
    if (!playing) pos.current = el.scrollTop;
    const p = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;
    if (bar.current) bar.current.style.transform = `scaleX(${p})`;
  };

  if (!song) return null;
  const meta = [song.key && `KEY ${song.key}`, song.capo ? `CAPO ${song.capo}` : '', tuningShort(song.tuning) !== 'STD' && tuningShort(song.tuning), `${song.bpm} BPM`].filter(Boolean).join('  ·  ');
  const bl = blocks(song);
  const toggle = () => { const n = !playing; setPlaying(n); setChrome(!n); feel(n ? 'snap' : 'click', 'light'); };

  return (
    <div class="stand" style={{ '--stand-ts': SIZES[prefs.size] + 'px' }} role="dialog" aria-label="Music stand">
      <div class="stand-progress"><i ref={bar} /></div>
      <div class={'stand-head' + (chrome ? '' : ' hide')}>
        <div class="st-top">
          <b class="st-name">{song.title}</b>
          <button class="btn small" aria-label="Export or share" onClick={() => { layer.value = 'export'; }}><Icon n="send" size={13} /></button>
          <button class="btn small" aria-label="Close the stand" onClick={close}><Icon n="close" size={13} stroke={2} /></button>
        </div>
        <div class="st-sub">
          <small>{meta}</small>
          <span class="grow" />
          <button class={'tog' + (prefs.chords ? ' on' : '')} onClick={() => set({ chords: !prefs.chords })}>CHORDS</button>
          <button class={'tog' + (prefs.compact ? ' on' : '')} aria-label="Fold repeats" onClick={() => set({ compact: !prefs.compact })}>FOLD ↻</button>
        </div>
      </div>
      <div class="stand-body" ref={body} onScroll={onScroll} onClick={toggle}>
        <div class="stand-sheet">
          {bl.length === 0 && <p class="stand-empty">Nothing on the Bench yet — build some sections first.</p>}
          {bl.map((b, i) => (
            <section class={'sb k-' + b.kind + (b.repeat && prefs.compact ? ' compact' : '')} key={i}>
              <h4>{b.name}{b.repeat ? <small> ↻</small> : null}</h4>
              {!(b.repeat && prefs.compact) && b.lines.map((l) => <Sung key={l.id} line={l} chords={prefs.chords} />)}
            </section>
          ))}
          <div class="stand-end">— END —</div>
        </div>
      </div>
      <div class={'stand-ctl' + (chrome ? '' : ' hide')} onClick={(e) => e.stopPropagation()}>
        <div class="grp-ctl">
          <button class="btn small" aria-label="Smaller" disabled={prefs.size === 0} onClick={() => set({ size: prefs.size - 1 })}>A−</button>
          <button class="btn small" aria-label="Bigger" disabled={prefs.size === SIZES.length - 1} onClick={() => set({ size: prefs.size + 1 })}>A+</button>
        </div>
        <button class={'btn go play'} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}><Icon n={playing ? 'pause' : 'play'} size={16} />{playing ? 'PAUSE' : 'SCROLL'}</button>
        <div class="grp-ctl">
          <button class="btn small" aria-label="Slower" onClick={() => set({ speed: Math.max(0.25, Math.round((prefs.speed - 0.1) * 100) / 100) })}><Icon n="minus" size={12} stroke={2} /></button>
          <span class="spd">{prefs.speed.toFixed(1)}×</span>
          <button class="btn small" aria-label="Faster" onClick={() => set({ speed: Math.min(4, Math.round((prefs.speed + 0.1) * 100) / 100) })}><Icon n="plus" size={12} stroke={2} /></button>
        </div>
      </div>
    </div>
  );
}
