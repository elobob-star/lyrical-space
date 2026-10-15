import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  addScrap, binSong, createSong, currentId, duplicateSong, liveSongs, mode, purgeSong, removeScrap, restoreSong,
  scraps, songs, updateCurrent, updateScrap, updateSong, flushAll,
} from '../store/state';
import { INKS, INK_NAMES, ID, Scrap, Song, lineCount } from '../store/models';
import { layer, rackTab, say, useBackClose } from '../store/ui';
import { feel } from '../engine/feel';
import { makeStrips } from '../store/actions';
import { Icon } from './icons';
import { Sheet, TextSheet } from './Sheet';

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'JUST NOW';
  if (m < 60) return `${m}M AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}D AGO` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }).toUpperCase();
};

function songText(s: Song): string {
  const parts = [s.title, s.roll.text];
  for (const sec of s.sections) for (const t of sec.takes) for (const l of t.lines) parts.push(l.text);
  return parts.join(' ').toLowerCase();
}

function Cassette({ s, onMenu }: { s: Song; onMenu: () => void }) {
  const cur = currentId.value === s.id;
  const open = () => { feel('thock', 'medium'); currentId.value = s.id; layer.value = null; };
  return (
    <div class={'cassette' + (cur ? ' cur' : '')} style={{ '--c': `var(--ink-${s.ink})` }}>
      <button class="cas-main" onClick={open} aria-label={`Open ${s.title}`}>
        <span class="cas-label">
          <span class="cas-title">{s.title}</span>
          <span class="cas-meta">{lineCount(s)} LINES · {s.arrangement.length} BLOCKS{s.key ? ` · ${s.key}` : ''}{s.bpm ? ` · ${s.bpm}` : ''}</span>
        </span>
        <span class="cas-reels"><i /><i /></span>
      </button>
      <span class="cas-when">{ago(s.updatedAt)}</span>
      <button class="cas-menu" onClick={onMenu} aria-label="Tape options"><Icon n="gear" size={16} /></button>
    </div>
  );
}

function TapeMenu({ id, onClose }: { id: ID; onClose: () => void }) {
  const s = songs.value.find((x) => x.id === id);
  const [rename, setRename] = useState(false);
  if (!s) return null;
  if (rename) return <TextSheet title="RENAME TAPE" value={s.title} onClose={onClose} onSave={(v) => v.trim() && updateSong(id, (d) => { d.title = v.trim(); })} />;
  return (
    <Sheet title={s.title} onClose={onClose}>
      <div class="grp">LABEL COLOUR</div>
      <div class="inks">
        {INKS.map((c, i) => <button key={i} class={'ink' + (s.ink === i ? ' on' : '')} style={{ background: c }} aria-label={INK_NAMES[i]} onClick={() => { feel('click'); updateSong(id, (d) => { d.ink = i; }); }} />)}
      </div>
      <div class="choices" style={{ marginTop: '14px' }}>
        <button class="choice" onClick={() => setRename(true)}><span>RENAME</span></button>
        <button class="choice" onClick={() => { duplicateSong(id); onClose(); say('DUPLICATED'); }}><span>DUPLICATE</span></button>
        <button class="choice danger" onClick={() => {
          binSong(id); onClose(); feel('thock', 'medium');
          say('MOVED TO THE BIN (30 DAYS)', { label: 'UNDO', run: () => { restoreSong(id); currentId.value = id; } });
        }}><span>TO THE BIN</span></button>
      </div>
    </Sheet>
  );
}

function ScrapList({ kind, q }: { kind: Scrap['kind']; q: string }) {
  const list = scraps.value.filter((s) => s.kind === kind && (!q || s.text.toLowerCase().includes(q)));
  const [add, setAdd] = useState('');
  const [edit, setEdit] = useState<ID | null>(null);
  const editing = scraps.value.find((s) => s.id === edit);
  return (
    <div class="scrap-list">
      <div class="row" style={{ marginBottom: '10px' }}>
        <input class="field" style={{ fontSize: '14px' }} placeholder={kind === 'spark' ? 'jot a spark…' : 'bury a line…'} value={add} enterKeyHint="send"
          onInput={(e) => setAdd((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && add.trim()) { addScrap(add, kind); setAdd(''); feel('chk'); } }} />
        <button class="btn go" onClick={() => { if (add.trim()) { addScrap(add, kind); setAdd(''); feel('chk'); } }}>ADD</button>
      </div>
      {list.length === 0 && <div class="tray-note">{kind === 'spark' ? 'THE SHOEBOX IS EMPTY. THE CATCH SLIP ON THE RIGHT EDGE FEEDS IT.' : 'NOTHING BURIED. SWIPE A BENCH LINE LEFT TO FLICK IT HERE.'}</div>}
      {list.map((s) => (
        <div class="scrap" key={s.id}>
          <button class="stxt" onClick={() => setEdit(s.id)}>{s.text}</button>
          <div class="sact">
            {kind === 'spark' ? (
              <button aria-label="Use as spark in the Roll" onClick={() => {
                updateCurrent((d) => { d.roll.spark = s.text; });
                updateScrap(s.id, { used: s.used + 1 });
                mode.value = 'roll'; layer.value = null; feel('thock', 'medium');
              }}><Icon n="spark" size={15} /></button>
            ) : null}
            <button aria-label="Put on the Table" onClick={() => {
              updateCurrent((d) => { d.table.push(...makeStrips([s.text], kind === 'spark' ? 'spark' : 'bone', d.table)); });
              say('PINNED TO THE TABLE', { label: 'GO', run: () => { mode.value = 'table'; layer.value = null; } });
              feel('chk', 'light');
            }}><Icon n="strip" size={15} /></button>
            <button aria-label="Delete" onClick={() => { const c = s; removeScrap(s.id); say('REMOVED', { label: 'UNDO', run: () => { scraps.value = [c, ...scraps.value]; } }); }}><Icon n="trash" size={15} /></button>
          </div>
        </div>
      ))}
      {editing && <TextSheet title="EDIT" multiline value={editing.text} onClose={() => setEdit(null)} onSave={(v) => v.trim() && updateScrap(editing.id, { text: v.trim() })} />}
    </div>
  );
}

export function Rack() {
  const close = () => { layer.value = null; };
  useBackClose(true, close);
  const tab = rackTab.value;
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<ID | null>(null);
  const [closing, setClosing] = useState(false);
  const needle = q.trim().toLowerCase();
  const tapes = useMemo(
    () => liveSongs.value.filter((s) => !needle || songText(s).includes(needle)).sort((a, b) => b.updatedAt - a.updatedAt),
    [liveSongs.value, needle],
  );
  const bin = songs.value.filter((s) => s.deletedAt);
  useEffect(() => { flushAll(); }, []);
  const TABS: Array<[typeof tab, string, number]> = [
    ['tapes', 'TAPES', liveSongs.value.length],
    ['shoebox', 'SHOEBOX', scraps.value.filter((s) => s.kind === 'spark').length],
    ['boneyard', 'BONES', scraps.value.filter((s) => s.kind === 'bone').length],
    ['bin', 'BIN', bin.length],
  ];
  const shut = () => { setClosing(true); setTimeout(close, 160); };
  return (
    <div class={'rack' + (closing ? ' out' : '')}>
      <div class="rack-head">
        <button class="reel-btn" onClick={shut} aria-label="Close rack"><Icon n="left" size={22} /></button>
        <div class="rack-title"><b>TAPE RACK</b><span>{liveSongs.value.length} TAPES</span></div>
        <button class="btn go" onClick={() => { createSong(); feel('chk', 'medium'); layer.value = null; }}><Icon n="plus" size={16} /> NEW TAPE</button>
      </div>
      <div class="rack-search">
        <Icon n="search" size={16} />
        <input placeholder="search titles & lyrics…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {q && <button onClick={() => setQ('')} aria-label="Clear search"><Icon n="close" size={14} /></button>}
      </div>
      <div class="rack-body">
        {tab === 'tapes' && (
          <>
            {tapes.map((s) => <Cassette key={s.id} s={s} onMenu={() => setMenu(s.id)} />)}
            {tapes.length === 0 && <div class="tray-note">{needle ? 'NO TAPE MATCHES.' : 'NO TAPES. HIT NEW TAPE.'}</div>}
          </>
        )}
        {tab === 'shoebox' && <ScrapList kind="spark" q={needle} />}
        {tab === 'boneyard' && <ScrapList kind="bone" q={needle} />}
        {tab === 'bin' && (
          <>
            {bin.length === 0 && <div class="tray-note">THE BIN IS EMPTY. DELETED TAPES WAIT HERE FOR 30 DAYS.</div>}
            {bin.map((s) => (
              <div class="cassette bin" key={s.id} style={{ '--c': `var(--ink-${s.ink})` }}>
                <div class="cas-main"><span class="cas-label"><span class="cas-title">{s.title}</span><span class="cas-meta">DELETED {ago(s.deletedAt!)}</span></span></div>
                <button class="btn small" onClick={() => { restoreSong(s.id); feel('chk'); }}>RESTORE</button>
                <button class="btn small danger" onClick={() => { void purgeSong(s.id); }}>ERASE</button>
              </div>
            ))}
          </>
        )}
      </div>
      <div class="rack-tabs">
        {TABS.map(([id, label, n]) => (
          <button key={id} class={tab === id ? 'on' : ''} onClick={() => { feel('click'); rackTab.value = id; }}>{label}<small>{n}</small></button>
        ))}
      </div>
      {menu && <TapeMenu id={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
