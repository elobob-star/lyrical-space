import { useRef } from 'preact/hooks';
import { backupAll, importBackup, liveSongs, scraps, setSetting, settings } from '../store/state';
import { Chassis, Paper } from '../store/models';
import { layer, say } from '../store/ui';
import { shareFile } from '../engine/share';
import { feel } from '../engine/feel';
import { version } from '../../package.json';
import { Sheet } from './Sheet';

function Dip({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class="dip-row" role="switch" aria-checked={on} onClick={() => { feel('snap', 'light'); onChange(!on); }}>
      <span class={'dip' + (on ? ' on' : '')}><i /></span>
      <span class="dl"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </button>
  );
}

export function Settings() {
  const st = settings.value;
  const close = () => { layer.value = null; };
  const file = useRef<HTMLInputElement>(null);
  return (
    <Sheet title={`SETUP · FOOLSCAP v${version}`} onClose={close}>
      <div class="grp">FINISH</div>
      <div class="seg">
        {(['alu', 'charcoal'] as Chassis[]).map((c) => (
          <button key={c} class={st.chassis === c ? 'on' : ''} onClick={() => { feel('click'); setSetting('chassis', c); }}>{c === 'alu' ? 'PUTTY' : 'CHARCOAL'}</button>
        ))}
      </div>
      <div class="grp">PAPER STOCK</div>
      <div class="seg">
        {(['newsprint', 'legal', 'graph', 'midnight'] as Paper[]).map((p) => (
          <button key={p} class={st.paper === p ? 'on' : ''} onClick={() => { feel('click'); setSetting('paper', p); }}>{p}</button>
        ))}
      </div>
      <div class="grp">TYPE SIZE</div>
      <div class="seg">
        {['SMALL', 'MEDIUM', 'LARGE'].map((l, i) => <button key={l} class={st.textSize === i ? 'on' : ''} onClick={() => { feel('click'); setSetting('textSize', i); }}>{l}</button>)}
      </div>
      <div class="grp">WRITING</div>
      <Dip label="GHOST INK" hint="on the Roll, backspace strikes finished words through instead of erasing them" on={st.ghost} onChange={(v) => setSetting('ghost', v)} />
      <Dip label="SYLLABLE GUTTER" hint="per-line syllable count on the Bench" on={st.gutter} onChange={(v) => setSetting('gutter', v)} />
      <Dip label="ONLINE LOOKUPS" hint="Datamuse & dictionary — rhymes always work offline" on={st.online} onChange={(v) => setSetting('online', v)} />
      <Dip label="KEEP SCREEN ON" hint="no dimming while you write (the stand always keeps it on)" on={st.awake} onChange={(v) => setSetting('awake', v)} />
      <Dip label="LEFT-HANDED" hint="dial and tape key swap sides" on={st.leftHand} onChange={(v) => setSetting('leftHand', v)} />
      <div class="grp">FEEL</div>
      <Dip label="HAPTICS" hint="a buzz on keys, latches and punches" on={st.haptics} onChange={(v) => setSetting('haptics', v)} />
      <Dip label="MECHANICAL SOUNDS" hint="synthesised clacks, snips and tape — no samples" on={st.clicks} onChange={(v) => setSetting('clicks', v)} />
      <Dip label="TYPEWRITER KEYS" hint="a tick per keystroke on the Roll, and the bell on return" on={st.keys} onChange={(v) => setSetting('keys', v)} />
      <Dip label="PAPER GRAIN" hint="fibre texture in the paper" on={st.grain} onChange={(v) => setSetting('grain', v)} />
      <div class="grp">LIBRARY</div>
      <div class="row wrap">
        <button class="btn" onClick={async () => {
          say('PACKING THE BACKUP…');
          const json = await backupAll();
          void shareFile(`foolscap-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([json], { type: 'application/json' }), 'Foolscap backup');
        }}>BACKUP ALL</button>
        <button class="btn" onClick={() => file.current?.click()}>RESTORE…</button>
        <input ref={file} class="hidden-file" type="file" accept="application/json,.json" onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            const r = await importBackup(await f.text());
            say(`RESTORED ${r.songs} TAPES, ${r.scraps} SCRAPS, ${r.pages} PAGES`);
          } catch { say('THAT FILE IS NOT A FOOLSCAP BACKUP'); }
          (e.target as HTMLInputElement).value = '';
        }} />
      </div>
      <p class="hint" style={{ marginTop: '10px' }}>{liveSongs.value.length} tapes and {scraps.value.length} scraps, stored on this device only. Backups include voice memos.</p>
      <div class="grp">CREDITS</div>
      <p class="hint">
        Pronunciations: CMU Pronouncing Dictionary. Frequencies: SUBTLEX-US. Related words: Datamuse. Definitions: Free Dictionary API.
        Type: Space Grotesk, Courier Prime, Doto (SIL OFL). No accounts, no keys, no tracking — and no machine writes a word for you.
      </p>
    </Sheet>
  );
}
