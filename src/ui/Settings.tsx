import { useRef } from 'preact/hooks';
import { importBackup, liveSongs, scraps, setSetting, settings, songs } from '../store/state';
import { Paper } from '../store/models';
import { layer, say } from '../store/ui';
import { backupJson } from '../engine/export';
import { shareFile } from '../engine/share';
import { feel } from '../engine/feel';
import { version } from '../../package.json';
import { Sheet } from './Sheet';

function Dip({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class="dip-row" role="switch" aria-checked={on} onClick={() => { feel('click'); onChange(!on); }}>
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
    <Sheet title={`DIP SWITCHES · MK-I v${version}`} onClose={close}>
      <div class="grp">PAPER STOCK</div>
      <div class="seg">
        {(['newsprint', 'graph', 'midnight'] as Paper[]).map((p) => (
          <button key={p} class={st.paper === p ? 'on' : ''} onClick={() => { feel('click'); setSetting('paper', p); }}>{p.toUpperCase()}</button>
        ))}
      </div>
      <div class="grp">TYPE SIZE</div>
      <div class="seg">
        {['SMALL', 'MEDIUM', 'LARGE'].map((l, i) => <button key={l} class={st.textSize === i ? 'on' : ''} onClick={() => { feel('click'); setSetting('textSize', i); }}>{l}</button>)}
      </div>
      <div class="grp">FEEL</div>
      <Dip label="HAPTICS" hint="buzz on clicks, latches and punches" on={st.haptics} onChange={(v) => setSetting('haptics', v)} />
      <Dip label="MECHANICAL SOUNDS" hint="synthesised clicks, clunks and snips" on={st.clicks} onChange={(v) => setSetting('clicks', v)} />
      <Dip label="TYPEWRITER KEYS" hint="a tiny tick per keystroke in the Roll + carriage bell" on={st.keys} onChange={(v) => setSetting('keys', v)} />
      <Dip label="PAPER GRAIN" hint="fibre texture on the sheet" on={st.grain} onChange={(v) => setSetting('grain', v)} />
      <div class="grp">WRITING</div>
      <Dip label="SYLLABLE GUTTER" hint="per-line syllable count on the Bench" on={st.gutter} onChange={(v) => setSetting('gutter', v)} />
      <Dip label="ONLINE LOOKUPS" hint="Datamuse & dictionary (rhymes always work offline)" on={st.online} onChange={(v) => setSetting('online', v)} />
      <Dip label="KEEP SCREEN ON" hint="no dimming while you write" on={st.awake} onChange={(v) => setSetting('awake', v)} />
      <Dip label="LEFT-HANDED CHASSIS" hint="flips the dial & rack button" on={st.leftHand} onChange={(v) => setSetting('leftHand', v)} />
      <div class="grp">LIBRARY</div>
      <div class="row wrap">
        <button class="btn" onClick={() => { layer.value = 'export'; }}>EXPORT THIS TAPE</button>
        <button class="btn" onClick={() => {
          const json = backupJson(songs.value.filter((s) => !s.deletedAt), scraps.value);
          void shareFile(`portascribe-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([json], { type: 'application/json' }), 'Portascribe backup');
        }}>BACKUP ALL</button>
        <button class="btn" onClick={() => file.current?.click()}>RESTORE…</button>
        <input ref={file} class="hidden-file" type="file" accept="application/json,.json" onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            const r = await importBackup(await f.text());
            say(`RESTORED ${r.songs} TAPES, ${r.scraps} SCRAPS`);
          } catch { say('THAT FILE IS NOT A PORTASCRIBE BACKUP'); }
          (e.target as HTMLInputElement).value = '';
        }} />
      </div>
      <p class="hint" style={{ marginTop: '10px' }}>{liveSongs.value.length} tapes stored on this device only. Voice memos are not included in backups yet.</p>
      <div class="grp">CREDITS</div>
      <p class="hint">
        Pronunciations: CMU Pronouncing Dictionary. Frequency: SUBTLEX-US. Related words: Datamuse API. Definitions: Free Dictionary API.
        Type: Space Mono, Courier Prime, Special Elite, Caveat (SIL OFL). Built with Preact + Capacitor. No accounts, no keys, no tracking.
      </p>
    </Sheet>
  );
}
