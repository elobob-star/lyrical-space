import { useRef } from 'preact/hooks';
import { backupAll, importBackup, liveSongs, scraps, setSetting, settings } from '../store/state';
import { pages } from '../store/notebook';
import { Chassis, Paper } from '../store/models';
import { layer, say } from '../store/ui';
import { shareFile } from '../engine/share';
import { feel } from '../engine/feel';
import { version } from '../../package.json';
import { Sheet } from './Sheet';
import { SwitchRow } from './Switch';

const FINISHES: Array<{ id: Chassis; name: string }> = [{ id: 'alu', name: 'PUTTY' }, { id: 'charcoal', name: 'CHARCOAL' }];
const PAPERS: Array<{ id: Paper; name: string }> = [
  { id: 'legal', name: 'LEGAL' }, { id: 'newsprint', name: 'NEWSPRINT' }, { id: 'graph', name: 'GRAPH' }, { id: 'midnight', name: 'MIDNIGHT' },
];
const SIZES = [{ n: 0, name: 'SMALL', px: 13 }, { n: 1, name: 'MEDIUM', px: 16 }, { n: 2, name: 'LARGE', px: 19.5 }];

export function Settings() {
  const st = settings.value;
  const close = () => { layer.value = null; };
  const file = useRef<HTMLInputElement>(null);
  const tog = <K extends 'ghost' | 'gutter' | 'online' | 'awake' | 'leftHand' | 'haptics' | 'clicks' | 'keys' | 'grain'>(k: K) => (v: boolean) => setSetting(k, v as any);
  return (
    <Sheet title="SETUP" right={<span class="ver">FOOLSCAP v{version}</span>} onClose={close}>
      <section class="set-card">
        <h4>LOOK</h4>
        <div class="set-label">FINISH</div>
        <div class="finishes">
          {FINISHES.map((f) => (
            <button key={f.id} class={'finish-btn' + (st.chassis === f.id ? ' on' : '')} aria-pressed={st.chassis === f.id} onClick={() => { feel('click'); setSetting('chassis', f.id); }}>
              <i class={'fin ' + f.id}><s /><s /><s class="hot" /></i><b>{f.name}</b>
            </button>
          ))}
        </div>
        <div class="set-label">PAPER</div>
        <div class="papers">
          {PAPERS.map((p) => (
            <button key={p.id} data-paper={p.id} class={'paper-btn' + (st.paper === p.id ? ' on' : '')} aria-pressed={st.paper === p.id} onClick={() => { feel('click'); setSetting('paper', p.id); }}>
              <i class="pp"><span>verse</span></i><b>{p.name}</b>
            </button>
          ))}
        </div>
        <div class="set-label">TYPE SIZE</div>
        <div class="sizes">
          {SIZES.map((z) => (
            <button key={z.n} class={'size-btn' + (st.textSize === z.n ? ' on' : '')} aria-pressed={st.textSize === z.n} onClick={() => { feel('click'); setSetting('textSize', z.n); }}>
              <span style={{ fontSize: z.px + 'px' }}>Aa</span><b>{z.name}</b>
            </button>
          ))}
        </div>
        <SwitchRow label="PAPER GRAIN" hint="fibre texture in the paper" on={st.grain} onChange={tog('grain')} />
      </section>

      <section class="set-card">
        <h4>WRITING</h4>
        <SwitchRow label="GHOST INK" hint="a finished word is struck through, never erased — the word you're still typing erases normally" on={st.ghost} onChange={tog('ghost')} />
        <SwitchRow label="SYLLABLE GUTTER" hint="a syllable count beside every line on the Bench" on={st.gutter} onChange={tog('gutter')} />
        <SwitchRow label="ONLINE LOOKUPS" hint="Datamuse & dictionary — rhymes always work offline" on={st.online} onChange={tog('online')} />
        <SwitchRow label="KEEP SCREEN ON" hint="no dimming while you write (the stand always keeps it on)" on={st.awake} onChange={tog('awake')} />
        <SwitchRow label="LEFT-HANDED" hint="the dial and the tape key swap sides" on={st.leftHand} onChange={tog('leftHand')} />
      </section>

      <section class="set-card">
        <h4>FEEL</h4>
        <SwitchRow label="HAPTICS" hint="a buzz on keys, latches and cuts" on={st.haptics} onChange={tog('haptics')} />
        <SwitchRow label="MECHANICAL SOUNDS" hint="synthesised clacks, snips and tape — no samples" on={st.clicks} onChange={tog('clicks')} />
        <SwitchRow label="TYPEWRITER KEYS" hint="a tick per keystroke in the notebook, and the bell on return" on={st.keys} onChange={tog('keys')} />
      </section>

      <section class="set-card">
        <h4>LIBRARY</h4>
        <div class="stats">
          <div><b>{liveSongs.value.length}</b><small>TAPES</small></div>
          <div><b>{pages.value.length}</b><small>PAGES</small></div>
          <div><b>{scraps.value.length}</b><small>SCRAPS</small></div>
        </div>
        <div class="row">
          <button class="btn grow" onClick={async () => {
            say('PACKING THE BACKUP…');
            const json = await backupAll();
            void shareFile(`foolscap-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([json], { type: 'application/json' }), 'Foolscap backup');
          }}>BACKUP ALL</button>
          <button class="btn grow" onClick={() => file.current?.click()}>RESTORE…</button>
        </div>
        <input ref={file} class="hidden-file" type="file" accept="application/json,.json" onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            const r = await importBackup(await f.text());
            say(`RESTORED ${r.songs} TAPES, ${r.scraps} SCRAPS, ${r.pages} PAGES`);
          } catch { say('THAT FILE IS NOT A FOOLSCAP BACKUP'); }
          (e.target as HTMLInputElement).value = '';
        }} />
        <p class="hint small">Stored on this device only. Backups include voice memos, and also open in the earlier Portascribe MK-I.</p>
      </section>

      <p class="credits">
        Pronunciations: CMU Pronouncing Dictionary · Frequencies: SUBTLEX-US · Related words: Datamuse · Definitions: Free Dictionary API · Type: Space Grotesk, Courier Prime, Doto (SIL OFL).
        No accounts, no keys, no tracking — and no machine writes a word for you.
      </p>
    </Sheet>
  );
}
