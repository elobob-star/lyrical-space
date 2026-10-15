import { useEffect } from 'preact/hooks';
import { boot, currentSong, mode, ready, settings } from './store/state';
import { handleBack, keyboardOpen, layer, toast, dismissToast } from './store/ui';
import { Bezel } from './ui/Bezel';
import { RollKeys, RollView } from './ui/Roll';
import { TableKeys, TableView } from './ui/Table';
import { BenchKeys, BenchView } from './ui/Bench';
import { Rack } from './ui/Rack';
import { Settings } from './ui/Settings';
import { Slip } from './ui/Slip';
import { ExportSheet } from './ui/Export';
import { loadCmu } from './engine/cmuLoader';
import { resetWordCache } from './engine/words';
import { onCmuReady } from './engine/cmu';
import { cmuTick } from './store/ui';

export function App() {
  useEffect(() => {
    void boot();
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
        if (mode.value !== 'roll') { mode.value = 'roll'; return; }
        void CapApp.minimizeApp();
      });
      off = () => void h.remove();
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#17181b' });
      } catch { /* status bar plugin optional */ }
    });
    return () => { off?.(); vv?.removeEventListener('resize', sync); window.removeEventListener('resize', sync); };
  }, []);

  // wake lock
  const awake = settings.value.awake;
  useEffect(() => {
    if (!awake) return;
    let lock: any;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* denied */ } };
    void req();
    const vis = () => { if (document.visibilityState === 'visible') void req(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release?.(); };
  }, [awake]);

  if (!ready.value) return <div class="chassis boot"><div class="boot-msg">PORTASCRIBE MK-I<br /><small>WARMING UP…</small></div></div>;

  const st = settings.value;
  const m = mode.value;
  const song = currentSong.value;
  const t = toast.value;
  const order = { roll: 0, table: 1, bench: 2 } as const;

  return (
    <div class={'chassis' + (keyboardOpen.value ? ' kb-open' : '')} data-paper={st.paper} data-ts={st.textSize} data-grain={st.grain ? 'on' : 'off'}>
      <Bezel />
      <div class="screen">
        <div class="paper-bg" />
        {song && (
          <div class="mode-view-wrap" key={m + song.id} style={{ '--from': order[m] === 0 ? '-14px' : '14px' }}>
            {m === 'roll' && <RollView />}
            {m === 'table' && <TableView />}
            {m === 'bench' && <BenchView />}
          </div>
        )}
        <Slip />
      </div>
      <div class="bezel-bottom" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.key, .keyslot')) e.preventDefault(); }}>
        {m === 'roll' && <RollKeys />}
        {m === 'table' && <TableKeys />}
        {m === 'bench' && <BenchKeys />}
      </div>
      {layer.value === 'rack' && <Rack />}
      {layer.value === 'settings' && <Settings />}
      {layer.value === 'export' && <ExportSheet />}
      {t && (
        <div class="toast" role="status">
          <span>{t.msg}</span>
          {t.action && <button onClick={() => { t.action!.run(); dismissToast(); }}>{t.action.label}</button>}
        </div>
      )}
    </div>
  );
}
