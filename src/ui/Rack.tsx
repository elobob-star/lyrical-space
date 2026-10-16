import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  addScrap, binSong, createSong, currentId, duplicateSong, liveSongs, mode, purgeSong, putBackScrap, removeScrap, restoreSong,
  restoreVersion, scraps, songs, updateCurrent, updateScrap, updateSong, flushAll,
} from '../store/state';
import { INKS, INK_NAMES, ID, Line, Song, activeTake, lineCount, newSection, provenance, uid } from '../store/models';
import { layer, rackTab, say } from '../store/ui';
import { feel } from '../engine/feel';
import { makeStrips } from '../store/actions';
import { listSnapshots, Snapshot } from '../store/history';
import { parseLyrics } from '../engine/importText';
import { parseKey, keyName } from '../engine/music';
import { Icon } from './icons';
import { Key, Keys } from './Key';
import { Sheet, TextSheet } from './Sheet';
import { setMode } from './Bezel';
import { signal } from '@preact/signals';

const importOpen = signal(false);

export const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'JUST NOW';
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}D AGO` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }).toUpperCase();
};
const stamp = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();

function songText(s: Song): string {
  const parts = [s.title, s.roll.text];
  for (const sec of s.sections) for (const t of sec.takes) for (const l of t.lines) parts.push(l.text);
  return parts.join(' ').toLowerCase();
}
function firstLine(s: Song): string {
  for (const a of s.arrangement) {
    const sec = s.sections.find((x) => x.id === a.sectionId);
    const l = sec && activeTake(sec).lines.find((x) => x.text.trim());
    if (l) return l.text.trim();
  }
  return s.roll.text.trim().split('\n')[0] ?? '';
}

function JCard({ s, onMenu }: { s: Song; onMenu: () => void }) {
  const cur = currentId.value === s.id;
  const open = () => { feel('eject', 'medium'); currentId.value = s.id; layer.value = null; };
  const meta = [s.key && `KEY ${s.key}`, `${s.bpm} BPM`, `${s.sections.length} SEC`, `${lineCount(s)} LN`].filter(Boolean).join(' · ');
  return (
    <div class={'jcard' + (cur ? ' cur' : '')} style={{ '--c': `var(--ink-${s.ink})` }}>
      <button class="jc-main" onClick={open} aria-label={`Load ${s.title}`}>
        <span class="jc-stripe" />
        <span class="jc-label">
          <span class="jc-title">{s.title}</span>
          <span class="jc-first">{firstLine(s) || '—'}</span>
          <span class="jc-meta">{meta} · {ago(s.updatedAt)}</span>
        </span>
        {cur && <i class="led on jc-led" aria-label="In the deck" />}
      </button>
      <button class="jc-menu" onClick={onMenu} aria-label="Tape options"><Icon n="dots" size={18} /></button>
    </div>
  );
}

function HistorySheet({ id, onClose }: { id: ID; onClose: () => void }) {
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [pick, setPick] = useState<Snapshot | null>(null);
  useEffect(() => { flushAll(); setTimeout(() => void listSnapshots(id).then(setList), 120); }, [id]);
  if (pick) {
    const s = pick.song;
    return (
      <Sheet title={`${stamp(pick.at)}`} onClose={() => setPick(null)}>
        <pre class="preview">{songPreview(s)}</pre>
        <div class="row wrap" style={{ marginTop: '12px' }}>
          <button class="btn" onClick={async () => { await restoreVersion(s, true); feel('chk', 'medium'); say('OLD VERSION LOADED AS A COPY'); onClose(); }}>AS A COPY</button>
          <span class="grow" />
          <button class="btn go" onClick={async () => { await restoreVersion(s, false); feel('chk', 'medium'); say('ROLLED BACK — THE NEWER VERSION IS IN HISTORY TOO'); onClose(); }}>ROLL BACK TO THIS</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="TAPE HISTORY" onClose={onClose}>
      <p class="hint">Earlier states of this tape, kept automatically while you work. Rolling back never loses the newer version.</p>
      {list === null && <div class="tray-note">READING THE TAPE…</div>}
      {list && list.length === 0 && <div class="tray-note">NO EARLIER VERSIONS YET — THEY APPEAR AS YOU KEEP WRITING.</div>}
      <div class="list">
        {list?.map((sn) => (
          <button class="li hist" key={sn.key} onClick={() => setPick(sn)}>
            <b>{stamp(sn.at)}</b><small>{lineCount(sn.song)} LINES · {firstLine(sn.song).slice(0, 42) || '—'}</small>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function songPreview(s: Song): string {
  const out: string[] = [s.title, ''];
  for (const a of s.arrangement) {
    const sec = s.sections.find((x) => x.id === a.sectionId);
    if (!sec) continue;
    out.push(`[${sec.name || sec.kind.toUpperCase()}]`, ...activeTake(sec).lines.map((l) => l.text), '');
  }
  if (s.roll.text.trim()) out.push('— ROLL —', s.roll.text.trim().slice(0, 600));
  return out.join('\n');
}

function TapeMenu({ id, onClose }: { id: ID; onClose: () => void }) {
  const s = songs.value.find((x) => x.id === id);
  const [view, setView] = useState<'menu' | 'rename' | 'history'>('menu');
  if (!s) return null;
  if (view === 'rename') return <TextSheet title="RENAME TAPE" value={s.title} ui onClose={onClose} onSave={(v) => v.trim() && updateSong(id, (d) => { d.title = v.trim(); })} />;
  if (view === 'history') return <HistorySheet id={id} onClose={onClose} />;
  return (
    <Sheet title={s.title} onClose={onClose}>
      <div class="grp">SPINE COLOUR</div>
      <div class="inks">
        {INKS.map((c, i) => <button key={i} class={'ink' + (s.ink === i ? ' on' : '')} style={{ background: c }} aria-label={INK_NAMES[i]} onClick={() => { feel('click'); updateSong(id, (d) => { d.ink = i; }); }} />)}
      </div>
      <div class="choices" style={{ marginTop: '14px' }}>
        <button class="choice" onClick={() => setView('rename')}><span>RENAME</span></button>
        <button class="choice" onClick={() => { duplicateSong(id); onClose(); say('DUPLICATED'); }}><span>DUPLICATE</span><small>a fresh copy to wreck</small></button>
        <button class="choice" onClick={() => setView('history')}><span>HISTORY</span><small>roll back to earlier</small></button>
        <button class="choice" onClick={() => { currentId.value = id; onClose(); layer.value = 'export'; }}><span>EXPORT · SHARE</span><small>text, chords, card</small></button>
        <button class="choice danger" onClick={() => {
          binSong(id); onClose(); feel('thock', 'medium');
          say('MOVED TO THE BIN (30 DAYS)', { label: 'UNDO', run: () => { restoreSong(id); currentId.value = id; } });
        }}><span>TO THE BIN</span></button>
      </div>
    </Sheet>
  );
}

function Shoebox({ q }: { q: string }) {
  const list = scraps.value.filter((s) => !q || s.text.toLowerCase().includes(q));
  const [add, setAdd] = useState('');
  const [edit, setEdit] = useState<ID | null>(null);
  const editing = scraps.value.find((s) => s.id === edit);
  const titleOf = (id?: ID) => songs.value.find((x) => x.id === id)?.title;
  const catchIt = () => { if (add.trim()) { addScrap(add, 'catch'); setAdd(''); feel('chk'); } };
  return (
    <div class="shoebox">
      <form class="catch-row" onSubmit={(e) => { e.preventDefault(); catchIt(); }}>
        <input class="field" placeholder="catch a line…" value={add} enterKeyHint="send" onInput={(e) => setAdd((e.target as HTMLInputElement).value)} />
        <button class="btn go" type="submit" aria-label="Catch"><Icon n="plus" size={15} stroke={2} /></button>
      </form>
      {list.length === 0 && <div class="tray-note">{q ? 'NOTHING IN THE BOX MATCHES.' : 'THE SHOEBOX IS EMPTY. CATCH STRAY LINES HERE OR WITH THE TAB ON THE RIGHT EDGE — CUT LINES LAND HERE TOO.'}</div>}
      {list.map((s) => (
        <div class="slip" key={s.id}>
          <button class="slip-txt" onClick={() => setEdit(s.id)}>{s.text}</button>
          <div class="slip-foot">
            <span class="prov">{provenance(s, titleOf, ago)}{s.used ? ` · DRAWN ${s.used}×` : ''}</span>
            <span class="grow" />
            <button aria-label="Write from it on the Roll" onClick={() => {
              updateCurrent((d) => { d.roll.spark = s.text; });
              updateScrap(s.id, { used: s.used + 1 });
              setMode('roll'); feel('thock', 'medium');
            }}><Icon n="draw" size={15} /></button>
            <button aria-label="Lay it on the Table" onClick={() => {
              updateCurrent((d) => { d.table.push(...makeStrips([s.text], 'deal', d.table)); });
              updateScrap(s.id, { used: s.used + 1 });
              say('ON THE TABLE', { label: 'GO', run: () => setMode('table') });
              feel('chk', 'light');
            }}><Icon n="strip" size={15} /></button>
            <button aria-label="Throw away" onClick={() => { const c = s; removeScrap(s.id); say('SCRAP THROWN AWAY', { label: 'UNDO', run: () => putBackScrap(c) }); }}><Icon n="trash" size={15} /></button>
          </div>
        </div>
      ))}
      {editing && <TextSheet title="EDIT SCRAP" multiline value={editing.text} onClose={() => setEdit(null)} onSave={(v) => v.trim() && updateScrap(editing.id, { text: v.trim() })} />}
    </div>
  );
}

function ImportSheet() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const close = () => (importOpen.value = false);
  const parsed = useMemo(() => (text.trim() ? parseLyrics(text) : null), [text]);
  const go = () => {
    if (!parsed || !parsed.sections.length) return;
    const song = createSong((title.trim() || parsed.title || 'UNTITLED').toUpperCase());
    const k = parsed.key ? parseKey(parsed.key) : null;
    updateCurrent((d) => {
      d.key = k ? keyName(k) : null;
      if (parsed.bpm) d.bpm = Math.max(40, Math.min(240, parsed.bpm));
      if (parsed.capo) d.capo = parsed.capo;
      d.sections = parsed.sections.map((p) => {
        const lines: Line[] = p.lines.map((l) => ({ id: uid(), text: l.text, chords: l.chords }));
        const sec = newSection(p.kind, lines.length ? lines : undefined);
        if (p.name) sec.name = p.name;
        return sec;
      });
      d.arrangement = parsed.arrangement.map((i) => ({ id: uid(), sectionId: d.sections[i].id }));
    });
    void song;
    close();
    layer.value = null;
    mode.value = 'bench';
    feel('eject', 'medium');
    say(`IMPORTED ${parsed.sections.length} SECTIONS`);
  };
  const lines = parsed ? parsed.sections.reduce((n, s) => n + s.lines.length, 0) : 0;
  return (
    <Sheet title="PASTE A SONG IN" onClose={close}>
      <p class="hint">Plain lyrics, chords-over-lyrics, <b>[Verse]</b> / <b>Chorus:</b> headers or ChordPro. Blank lines split sections; a block that comes back word for word becomes the chorus.</p>
      <input class="field ui" placeholder="title (optional)" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
      <textarea class="field" rows={9} style={{ marginTop: '8px', fontSize: '13.5px' }} placeholder={'[Verse 1]\nG          Em\nRain on the roof of a borrowed room\n…'} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="row" style={{ marginTop: '10px' }}>
        <span class="muted tiny">{parsed ? `${parsed.sections.length} SECTIONS · ${lines} LINES · ${parsed.arrangement.length} BLOCKS` : 'NOTHING YET'}</span>
        <span class="grow" />
        <button class="btn go" disabled={!parsed?.sections.length} onClick={go}><Icon n="import" size={14} /> MAKE A TAPE</button>
      </div>
    </Sheet>
  );
}

export function Rack() {
  const tab = rackTab.value;
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<ID | null>(null);
  const needle = q.trim().toLowerCase();
  const tapes = useMemo(
    () => liveSongs.value.filter((s) => !needle || songText(s).includes(needle)).sort((a, b) => b.updatedAt - a.updatedAt),
    [liveSongs.value, needle],
  );
  const bin = songs.value.filter((s) => s.deletedAt);
  useEffect(() => { flushAll(); }, []);
  useEffect(() => { setQ(''); }, [tab]);
  return (
    <div class="rack" role="region" aria-label="Tape rack">
      {tab !== 'bin' && (
        <div class="rack-search">
          <Icon n="search" size={15} />
          <input placeholder={tab === 'tapes' ? 'search titles & lyrics…' : 'search the shoebox…'} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {q && <button onClick={() => setQ('')} aria-label="Clear search"><Icon n="close" size={13} /></button>}
        </div>
      )}
      <div class="rack-body">
        {tab === 'tapes' && (
          <>
            {tapes.map((s) => <JCard key={s.id} s={s} onMenu={() => setMenu(s.id)} />)}
            {tapes.length === 0 && <div class="tray-note">{needle ? 'NO TAPE MATCHES.' : 'NO TAPES. PRESS NEW.'}</div>}
          </>
        )}
        {tab === 'shoebox' && <Shoebox q={needle} />}
        {tab === 'bin' && (
          <>
            {bin.length === 0 && <div class="tray-note">THE BIN IS EMPTY. BINNED TAPES WAIT HERE FOR 30 DAYS.</div>}
            {bin.map((s) => (
              <div class="jcard binned" key={s.id} style={{ '--c': `var(--ink-${s.ink})` }}>
                <div class="jc-main"><span class="jc-stripe" /><span class="jc-label"><span class="jc-title">{s.title}</span><span class="jc-meta">BINNED {ago(s.deletedAt!)}</span></span></div>
                <button class="btn small" onClick={() => { restoreSong(s.id); feel('chk'); }}>RESTORE</button>
                <button class="btn small danger" onClick={() => { void purgeSong(s.id); feel('thock'); }}>ERASE</button>
              </div>
            ))}
          </>
        )}
      </div>
      {menu && <TapeMenu id={menu} onClose={() => setMenu(null)} />}
      {importOpen.value && <ImportSheet />}
    </div>
  );
}

export function RackKeys() {
  const tab = rackTab.value;
  const pick = (t: typeof tab) => { rackTab.value = t; };
  return (
    <Keys>
      <Key icon="plus" label="New" tone="dark" sound="chk" onClick={() => { createSong(); layer.value = null; feel('eject', 'medium'); say('A BLANK TAPE — START ANYWHERE'); }} />
      <Key icon="import" label="Paste in" aria="Import" sound="click" onClick={() => { importOpen.value = true; }} />
      <Key icon="reel" label="Tapes" led on={tab === 'tapes'} sound="click" onClick={() => pick('tapes')} />
      <Key icon="box" label="Shoebox" led on={tab === 'shoebox'} sound="click" onClick={() => pick('shoebox')} />
      <Key icon="bin" label="Bin" led on={tab === 'bin'} sound="click" onClick={() => pick('bin')} />
    </Keys>
  );
}
