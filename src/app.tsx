import { useEffect, useRef, useState } from 'preact/hooks';
import { boot, currentSong, mode, ready, settings, Mode } from './store/state';
import { handleBack, keyboardOpen, layer } from './store/ui';
import { Bezel, setMode } from './ui/Bezel';
import { RollKeys, RollView } from './ui/Roll';
import { TableKeys, TableView } from './ui/Table';
import { BenchKeys, BenchView } from './ui/Bench';
import { Rack, RackKeys } from './ui/Rack';
import { Settings } from './ui/Settings';
import { Slip } from './ui/Slip';
import { ExportSheet } from './ui/Export';
import { Stand } from './ui/Stand';
import { loadCmu } from './engine/cmuLoader';
import { resetWordCache } from './engine/words';
import { onCmuReady } from './engine/cmu';
import { cmuTick, say } from './store/ui';
import { setOnFreshPage } from './store/notebook';

const ORDER: Record<Mode, number> = { roll: 0, table: 1, bench: 2 };
const VIEWS: Record<Mode, () => preact.JSX.Element> = { roll: RollView, table: TableView, bench: BenchView };

/** The three surfaces lie side by side on one desk; turning the dial pans across it. */
function Desk() {
  const m = mode.value;
  const song = currentSong.value;
  const last = useRef(m);
  const [panes, setPanes] = useState<Array<{ m: Mode; cls: string }>>([{ m, cls: 'fade-in' }]);
  useEffect(() => {
    const from = last.current;
    last.current = m;
    if (from === m) return;
    const right = ORDER[m] > ORDER[from];
    setPanes([{ m: from, cls: right ? 'exit-l' : 'exit-r' }, { m, cls: right ? 'enter-r' : 'enter-l' }]);
    const t = setTimeout(() => setPanes([{ m, cls: '' }]), 440);
    return () => clearTimeout(t);
  }, [m]);
  if (!song) return null;
  return (
    <div class="desk">
      {panes.map((p) => {
        const View = VIEWS[p.m];
        // the notebook belongs to no song, so it doesn't reload when the tape changes
        return <div class={'pane ' + p.cls} key={p.m === 'roll' ? 'notebook' : p.m + song.id} aria-hidden={p.m !== m}><View /></div>;
      })}
    </div>
  );
}

export function App() {
  useEffect(() => {
    void boot();
    setOnFreshPage(() => { if (mode.peek() === 'roll') say('A FRESH PAGE — THE LAST ONE IS A FLIP BACK'); });
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
    onCmuReady(() => { resetWordCache(); cmuTick.value++; });
    idle(() => void loadCmu());

    // keyboard + viewport tracking
    let maxH = window.innerHeight;
    const vv = window.visualViewport;
    const sync = () => {
      const h = vv?.height ?? window.innerHeight;
      maxH = Math.max(maxH, window.innerHeight, h);
      document.documentElement.style.setProperty('--vvh', h + 'px');
      keyboardOpen.value = maxH - h > 120;
    };
    sync();
    vv?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);

    // hardware back button / swipe-back
    let off: (() => void) | undefined;
    void import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const { App: CapApp } = await import('@capacitor/app');
      const h = await CapApp.addListener('backButton', () => {
        if (handleBack()) return;
        if (layer.peek()) { layer.value = null; return; }
        if (mode.peek() !== 'roll') { setMode('roll'); return; }
        void CapApp.minimizeApp();
      });
      off = () => void h.remove();
    });
    return () => { off?.(); vv?.removeEventListener('resize', sync); window.removeEventListener('resize', sync); };
  }, []);

  // sheets dim everything below the top bezel, so the LCD stays readable while they're open
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', el.getBoundingClientRect().bottom + 'px'));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready.value]);

  // status-bar icon contrast follows the chassis finish
  const finish = settings.value.chassis;
  useEffect(() => {
    void import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: finish === 'alu' ? Style.Light : Style.Dark });
      } catch { /* optional */ }
    });
    const c = finish === 'alu' ? '#dfdbd2' : '#2a2927';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', c);
    document.body.style.background = c;
  }, [finish]);

  // wake lock (always on while the music stand is up)
  const awake = settings.value.awake || layer.value === 'stand';
  useEffect(() => {
    if (!awake) return;
    let lock: any;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* denied */ } };
    void req();
    const vis = () => { if (document.visibilityState === 'visible') void req(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release?.(); };
  }, [awake]);

  // opening the rack puts the keyboard away
  const ly = layer.value;
  useEffect(() => { if (ly === 'rack') (document.activeElement as HTMLElement | null)?.blur?.(); }, [ly]);

  if (!ready.value) return <div class="chassis boot" data-chassis="alu"><div class="boot-msg">PORTASCRIBE MK-II<br /><small>WARMING UP…</small></div></div>;

  const st = settings.value;
  const m = mode.value;
  const rack = ly === 'rack';

  return (
    <div class={'chassis' + (keyboardOpen.value ? ' kb-open' : '')} data-paper={st.paper} data-chassis={st.chassis} data-ts={st.textSize} data-grain={st.grain ? 'on' : 'off'}>
      <div ref={top}><Bezel /></div>
      <div class="screen">
        <div class="paper-bg" />
        <Desk />
        {rack && <Rack />}
        {!rack && m !== 'roll' && <Slip />}
      </div>
      <div class="bezel-bottom" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.key')) e.preventDefault(); }}>
        {rack ? <RackKeys /> : m === 'roll' ? <RollKeys /> : m === 'table' ? <TableKeys /> : <BenchKeys />}
      </div>
      <div id="overlays" />
      {ly === 'settings' && <Settings />}
      {ly === 'export' && <ExportSheet />}
      {ly === 'stand' && <Stand />}
    </div>
  );
}
