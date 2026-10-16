import { useState } from 'preact/hooks';
import { currentSong, putBackScrap, removeScrap, scraps, songs, updateScrap } from '../../store/state';
import { MODIFIERS, diatonic, keyName, modifyChord, parseKey } from '../../engine/music';
import { focused, addLineAfter, focusLine, setLineText } from '../../store/lines';
import { activeTake, provenance } from '../../store/models';
import { lineInfo, tokenize, wordInfo } from '../../engine/words';
import { rhymeKey } from '../../engine/phones';
import { diffEdit } from '../../engine/textdiff';
import { feel } from '../../engine/feel';
import { say, tray, cmuTick } from '../../store/ui';
import { Icon } from '../icons';
import { armedChord, startChordDrag } from './chordDrag';
import { deckSheet } from './Deck';

export function ChordTray() {
  const song = currentSong.value!;
  const key = parseKey(song.key);
  const stamps = diatonic(key);
  const armed = armedChord.value;
  const [custom, setCustom] = useState('');
  return (
    <div class="tray chords">
      <div class="tray-head">
        <span class="tray-title">CHORD STAMPS · <b>{key ? keyName(key) : 'COMMON'}</b>{song.capo ? <small> CAPO {song.capo}</small> : null}</span>
        <span class="grow" />
        <button class="tog" onClick={() => (deckSheet.value = 'key')}>KEY</button>
        <button class="tog" aria-label="Close" onClick={() => { tray.value = null; armedChord.value = null; }}><Icon n="close" size={13} /></button>
      </div>
      <div class="stamp-grid">
        {stamps.map((s) => (
          <button key={s.name} class={'tstamp' + (armed === s.name ? ' armed' : '')} aria-label={`Stamp ${s.name}`}
            onPointerDown={(e) => startChordDrag(e as any, s.name, null, () => { feel('click'); armedChord.value = armed === s.name ? null : s.name; })}>
            {s.name}{s.roman && <i>{s.roman}</i>}
          </button>
        ))}
      </div>
      <div class="mods">
        {MODIFIERS.map((m) => (
          <button key={m} class="mod" disabled={!armed} onClick={() => { if (armed) { feel('click'); armedChord.value = modifyChord(armed, m); } }}>{m}</button>
        ))}
        <input class="mod-in" placeholder="Am7/G" value={custom} maxLength={9}
          onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { armedChord.value = custom.trim(); setCustom(''); } }} />
        <button class="mod" onClick={() => { if (custom.trim()) { armedChord.value = custom.trim(); setCustom(''); feel('click'); } }}>ARM</button>
      </div>
      <div class="tray-hint">
        {armed ? <>ARMED <b>{armed}</b> — TAP A WORD TO STAMP · TAP THE STAMP AGAIN TO DISARM</> : 'DRAG A STAMP ONTO A WORD · OR TAP ONE TO ARM IT'}
      </div>
    </div>
  );
}

/** Context for ranking boneyard matches: syllables of the focused line + rhyme keys of the two lines above. */
function context() {
  const song = currentSong.value;
  const f = focused.value;
  if (!song) return { syl: 0, keys: [] as string[] };
  let sec = f && song.sections.find((s) => s.id === f.sid);
  if (!sec) {
    const last = song.arrangement[song.arrangement.length - 1];
    sec = song.sections.find((s) => s.id === last?.sectionId);
  }
  if (!sec) return { syl: 0, keys: [] as string[] };
  const lines = activeTake(sec).lines;
  const i = f ? lines.findIndex((l) => l.id === f.lid) : lines.length;
  const cur = i >= 0 && i < lines.length ? lines[i] : undefined;
  const keys: string[] = [];
  for (let k = (i < 0 ? lines.length : i) - 1; k >= 0 && keys.length < 2; k--) {
    const toks = tokenize(lines[k].text);
    const last = toks[toks.length - 1];
    const ph = last && wordInfo(last.norm).phones;
    const rk = ph ? rhymeKey(ph) : null;
    if (rk) keys.push(rk);
  }
  return { syl: cur && cur.text.trim() ? lineInfo(cur.text).syl : 0, keys };
}

export function insertScrap(text: string): void {
  const song = currentSong.value;
  if (!song) return;
  const f = focused.value;
  let sec = f && song.sections.find((s) => s.id === f.sid);
  if (!sec) {
    const last = song.arrangement[song.arrangement.length - 1];
    sec = song.sections.find((s) => s.id === last?.sectionId);
  }
  if (!sec) { say('ADD A SECTION FIRST'); return; }
  const lines = activeTake(sec).lines;
  const cur = f && lines.find((l) => l.id === f.lid);
  if (cur && !cur.text.trim()) {
    setLineText(song.id, sec.id, cur.id, text, diffEdit(cur.text, text));
    focusLine(cur.id, text.length);
  } else {
    addLineAfter(song.id, sec.id, cur ? cur.id : lines[lines.length - 1]?.id ?? null, text);
  }
}

const agoShort = (t: number) => {
  const h = Math.floor((Date.now() - t) / 3_600_000);
  return h < 1 ? 'JUST NOW' : h < 24 ? `${h}H AGO` : `${Math.floor(h / 24)}D AGO`;
};

/** The Shoebox, opened over the Bench: MATCH ranks scraps by rhyme with the line above and fit to this line's length. */
export function ShoeboxTray() {
  void cmuTick.value;
  const [tab, setTab] = useState<'match' | 'all'>('match');
  const all = scraps.value;
  const song = currentSong.value;
  const ctx = context();
  const scored = all.map((b) => {
    const info = lineInfo(b.text);
    const last = info.tokens[info.tokens.length - 1];
    const ph = last && wordInfo(last.norm).phones;
    const rk = ph ? rhymeKey(ph) : null;
    const rhymes = !!rk && ctx.keys.includes(rk);
    const d = ctx.syl ? Math.abs(info.syl - ctx.syl) : 9;
    const score = (rhymes ? 3 : 0) + (d === 0 ? 2 : d === 1 ? 1 : 0) - Math.min(b.used, 2) * 0.1;
    return { b, info, rhymes, d, score };
  });
  const matches = scored.filter((s) => s.rhymes || s.d <= 1).sort((a, b) => b.score - a.score);
  const showing = tab === 'match' && matches.length === 0 && all.length > 0 ? 'all' : tab;
  const list = showing === 'match' ? matches : [...scored].sort((a, b) => b.b.createdAt - a.b.createdAt);
  return (
    <div class="tray shoebox">
      <div class="tray-head">
        <span class="tray-title"><b>SHOEBOX</b> <small>{all.length} SCRAPS{ctx.syl ? ` · LINE ${ctx.syl}σ` : ''}</small></span>
        <span class="grow" />
        <button class={'tog' + (tab === 'match' ? ' on' : '')} onClick={() => setTab('match')}>MATCH {matches.length}</button>
        <button class={'tog' + (tab === 'all' ? ' on' : '')} onClick={() => setTab('all')}>ALL</button>
        <button class="tog" aria-label="Close" onClick={() => { tray.value = null; }}><Icon n="close" size={13} /></button>
      </div>
      <div class="tray-body">
        {all.length === 0 && <div class="tray-note">EMPTY — CATCH LINES WITH THE TAB ON THE RIGHT, OR SWIPE A LINE LEFT TO CUT IT HERE</div>}
        {tab === 'match' && showing === 'all' && <div class="tray-note">NOTHING FITS {ctx.syl ? `${ctx.syl}σ ` : ''}OR RHYMES HERE YET — SHOWING EVERYTHING</div>}
        {list.map(({ b, info, rhymes }) => (
          <div class="scrap-row" key={b.id}>
            <button class="scrap-txt" onClick={() => { insertScrap(b.text); updateScrap(b.id, { used: b.used + 1 }); feel('chk', 'medium'); }}>
              <span>{b.text}</span>
              <small>{info.syl}σ{rhymes ? ' · RHYMES' : ''} · {b.songId === song?.id && b.from !== 'catch' ? 'FROM THIS SONG' : provenance(b, (id) => songs.peek().find((x) => x.id === id)?.title, agoShort)}</small>
            </button>
            <button class="scrap-x" aria-label="Remove from the shoebox" onClick={() => { const copy = b; removeScrap(b.id); say('SCRAP THROWN AWAY', { label: 'UNDO', run: () => putBackScrap(copy) }); }}><Icon n="close" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
