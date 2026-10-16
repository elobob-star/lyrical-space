import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ID, SECTION_KINDS, Section, SectionKind, Song, activeTake, sectionAbbrev, sectionNames,
} from '../store/models';
import { currentSong, updateCurrent } from '../store/state';
import { analyzeFlow, rhymeScheme } from '../engine/rhyme';
import { lineInfo, stressWords } from '../engine/words';
import { fitLine, stressToPattern } from '../engine/cadence';
import { feel, haptic } from '../engine/feel';
import { addTake, cutLine } from '../store/actions';
import {
  addLineAfter, addSection, duplicateLine, moveEntry, moveLine, removeEntry, removeLine, repeatEntry,
} from '../store/lines';
import { cmuTick, hintOnce, layer, lens, Lens, say, tray } from '../store/ui';
import { settings } from '../store/state';
import { Key, Keys } from './Key';
import { Icon } from './icons';
import { Sheet, TextSheet } from './Sheet';
import { LineRow, lineMenu } from './bench/BenchLine';
import { ChordTray, ShoeboxTray } from './bench/Trays';
import { Deck, MemoPills, humHandlers } from './bench/Deck';
import { recording } from '../engine/recorder';
import { CadenceSheet, cadenceFor } from './bench/Cadence';
import { WordsTray, openWords } from './bench/Muse';
import { armedChord, chordGhost } from './bench/chordDrag';

const selectedEntry = signal<ID | null>(null);
const sectionSheet = signal<ID | null>(null);
const addSheet = signal(false);
const takeSheet = signal<ID | null>(null);

const abbrev = (_song: Song, sec: Section, names: Map<ID, string>): string => sectionAbbrev(sec, names);

function SongMap({ song, names }: { song: Song; names: Map<ID, string> }) {
  const sel = selectedEntry.value;
  const seen = new Set<ID>();
  const selIdx = song.arrangement.findIndex((a) => a.id === sel);
  return (
    <div class="songmap-wrap">
      <div class="songmap" role="list">
        {song.arrangement.map((a) => {
          const sec = song.sections.find((s) => s.id === a.sectionId);
          if (!sec) return null;
          const rep = seen.has(sec.id);
          seen.add(sec.id);
          return (
            <button key={a.id} role="listitem" class={`mblock k-${sec.kind}` + (rep ? ' rep' : '') + (sel === a.id ? ' sel' : '')}
              onClick={() => {
                feel('click');
                selectedEntry.value = sel === a.id ? null : a.id;
                document.getElementById('arr-' + a.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
              {rep ? '↻' : ''}{abbrev(song, sec, names)}
            </button>
          );
        })}
        <button class="mblock add" aria-label="Add section" onClick={() => { feel('click'); addSheet.value = true; }}><Icon n="plus" size={14} /></button>
      </div>
      {sel && selIdx >= 0 && (
        <div class="mapbar">
          <button aria-label="Move earlier" disabled={selIdx === 0} onClick={() => { feel('click'); moveEntry(song.id, sel, -1); }}><Icon n="left" size={15} /></button>
          <button aria-label="Move later" disabled={selIdx === song.arrangement.length - 1} onClick={() => { feel('click'); moveEntry(song.id, sel, 1); }}><Icon n="right" size={15} /></button>
          <button onClick={() => { feel('chk'); repeatEntry(song.id, sel); }}><Icon n="repeat" size={15} />REPEAT</button>
          <button class="danger" onClick={() => {
            const r = removeEntry(song.id, sel);
            selectedEntry.value = null;
            feel('thock', 'medium');
            if (r) say(r.buried ? `REMOVED — ${r.buried} LINES KEPT IN THE SHOEBOX` : 'REMOVED FROM THE SONG', { label: 'UNDO', run: r.undo });
          }}><Icon n="trash" size={15} />REMOVE</button>
        </div>
      )}
    </div>
  );
}

function SectionCard({ song, sec, entryId, names, lane, lens: ln }: { song: Song; sec: Section; entryId: ID; names: Map<ID, string>; lane: boolean; lens: Lens }) {
  const take = activeTake(sec);
  const takes = sec.takes.length;
  const tIdx = Math.min(sec.take, takes - 1);
  const texts = take.lines.map((l) => l.text);
  const cmu = cmuTick.value;
  const sig = texts.join('\u0001');
  const marks = useMemo(() => (ln === 'rhyme' ? analyzeFlow(texts) : null), [ln, sig, cmu]);
  const scheme = useMemo(() => (marks ? rhymeScheme(texts, marks) : null), [marks]);
  const meterSig = take.lines.map((l) => (l.meter ? JSON.stringify(l.meter) : '')).join('\u0001');
  const infos = useMemo(() => take.lines.map((l) => lineInfo(l.text, l.meter)), [sig, meterSig, cmu]);
  const tpl = sec.cadence;
  const gutter = settings.value.gutter;
  const swipe = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const [dir, setDir] = useState<'l' | 'r' | ''>('');
  const hum = useMemo(() => humHandlers(sec.id), [sec.id]);

  const go = (d: -1 | 1) => {
    const n = tIdx + d;
    if (n < 0 || n >= takes) { haptic('light'); return; }
    feel('click', 'medium');
    setDir(d > 0 ? 'l' : 'r');
    updateCurrent((x) => { const s = x.sections.find((q) => q.id === sec.id); if (s) s.take = n; });
  };
  const hd = {
    onPointerDown: (e: PointerEvent) => { if ((e.target as HTMLElement).closest('button')) return; swipe.current = { x: e.clientX, y: e.clientY, on: false }; },
    onPointerMove: (e: PointerEvent) => {
      const s = swipe.current; if (!s || s.on) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { s.on = true; go(dx < 0 ? 1 : -1); }
    },
    onPointerUp: () => { swipe.current = null; },
    onPointerCancel: () => { swipe.current = null; },
  };
  const secMemos = song.memos.filter((m) => m.sectionId === sec.id);
  const recThis = recording.value;
  return (
    <section class={`card k-${sec.kind} stack-${Math.min(takes - 1, 2)}` + (selectedEntry.value === entryId ? ' sel' : '')} id={'arr-' + entryId}>
      <header class="card-head" {...(hd as any)}>
        <button class="ktag" onClick={() => { feel('click'); sectionSheet.value = sec.id; }}>{names.get(sec.id)}</button>
        <span class="grow" />
        {takes > 1 && <button class="mini" aria-label="Previous take" disabled={tIdx === 0} onClick={() => go(-1)}><Icon n="left" size={14} /></button>}
        <button class="take" onClick={() => { takeSheet.value = sec.id; }} aria-label="Take options">TAKE {String(tIdx + 1).padStart(2, '0')}/{String(takes).padStart(2, '0')}</button>
        {takes > 1 && <button class="mini" aria-label="Next take" disabled={tIdx === takes - 1} onClick={() => go(1)}><Icon n="right" size={14} /></button>}
        <button class={'mini' + (tpl?.length ? ' lit' : '')} aria-label="Cadence" onClick={() => { feel('click'); cadenceFor.value = sec.id; }}><Icon n="note" size={15} /></button>
        <button class={'mini hum' + (recThis ? ' lit rec' : '')} aria-label="Hold to hum a melody for this section" {...(hum as any)}><Icon n="mic" size={15} /></button>
      </header>
      {tpl && tpl.length > 0 && (
        <div class="cad" aria-label="Cadence template">
          {tpl.map((b, i) => <span key={i} class={'ct ' + b}>{b === 'S' ? 'DUM' : b === 'u' ? 'da' : '·'}</span>)}
        </div>
      )}
      <MemoPills memos={secMemos} />
      <div class={'lines dir-' + dir} key={take.id} onAnimationEnd={() => setDir('')}>
        {take.lines.map((l, i) => {
          const info = infos[i];
          const ft = fitLine(tpl, info.syl, info.stress);
          const m = marks ? marks[i] : [];
          return (
            <LineRow key={l.id} songId={song.id} sid={sec.id} line={l} marks={m} marksKey={m.map((x) => `${x.start}-${x.end}-${x.group}${x.kind[0]}`).join(',')}
              lens={ln} scheme={scheme?.[i] ?? ''} words={info.words} wordsKey={ln === 'meter' ? info.words.map((w) => w.key + w.stress + (w.down ? '|' : '')).join(',') : ''}
              headroom={lane || l.chords.length > 0} syl={info.syl} fit={ft.fit} mism={ft.stressMismatch} gutter={gutter}
              neighbors={{ prev: take.lines[i - 1]?.id, next: take.lines[i + 1]?.id }} />
          );
        })}
      </div>
      <button class="addline" onClick={() => { feel('click'); addLineAfter(song.id, sec.id, null); }}><Icon n="plus" size={12} /> LINE</button>
    </section>
  );
}

function RepeatSlip({ sec, names, from }: { sec: Section; names: Map<ID, string>; from: ID }) {
  return (
    <button class={`repeat-slip k-${sec.kind}`} id={'arr-' + from} onClick={() => { feel('click'); selectedEntry.value = from; }}>
      <Icon n="repeat" size={14} /> {names.get(sec.id)} <small>(repeat)</small>
    </button>
  );
}

function LineMenu() {
  const m = lineMenu.value;
  const song = currentSong.value!;
  if (!m) return null;
  const sec = song.sections.find((s) => s.id === m.sid);
  const line = sec && activeTake(sec).lines.find((l) => l.id === m.lid);
  const close = () => (lineMenu.value = null);
  if (!sec || !line) return null;
  const info = lineInfo(line.text, line.meter);
  return (
    <Sheet title={`LINE · ${info.syl} SYL`} onClose={close}>
      <div class="stressline">{line.text.trim() ? stressWords(info.stress) : 'EMPTY LINE'}</div>
      <div class="choices">
        <button class="choice" onClick={() => { moveLine(song.id, sec.id, line.id, -1); close(); }}><span>↑ MOVE UP</span></button>
        <button class="choice" onClick={() => { moveLine(song.id, sec.id, line.id, 1); close(); }}><span>↓ MOVE DOWN</span></button>
        <button class="choice" onClick={() => { duplicateLine(song.id, sec.id, line.id); close(); }}><span>DUPLICATE</span></button>
        <button class="choice" disabled={!line.text.trim()} onClick={() => {
          const pat = stressToPattern(info.stress);
          updateCurrent((d) => { const s = d.sections.find((q) => q.id === sec.id); if (s) s.cadence = pat; });
          feel('chk', 'medium'); say('CADENCE COPIED FROM THIS LINE'); close();
        }}><span>USE AS CADENCE</span><small>measure the section against it</small></button>
        <button class="choice" onClick={() => {
          const gone = line.text.trim() ? cutLine(song.id, sec.id, line.id) : { text: '', undo: removeLine(song.id, sec.id, line.id) };
          close(); feel('snip', 'medium');
          if (gone) say(gone.text ? 'CUT → SHOEBOX' : 'LINE REMOVED', { label: 'UNDO', run: gone.undo });
        }}><span>CUT → SHOEBOX</span><small>keep it for another song</small></button>
        <button class="choice danger" onClick={() => {
          const undo = removeLine(song.id, sec.id, line.id);
          close(); feel('thock', 'medium');
          say('LINE DELETED', { label: 'UNDO', run: undo });
        }}><span>DELETE</span></button>
      </div>
    </Sheet>
  );
}

function SectionSheet({ id }: { id: ID }) {
  const song = currentSong.value!;
  const sec = song.sections.find((s) => s.id === id);
  const [rename, setRename] = useState(false);
  const close = () => (sectionSheet.value = null);
  if (!sec) return null;
  const names = sectionNames(song);
  if (rename) return <TextSheet title="RENAME SECTION" value={sec.name ?? ''} placeholder={names.get(id)} onClose={close}
    onSave={(v) => updateCurrent((d) => { const s = d.sections.find((q) => q.id === id); if (s) { if (v.trim()) s.name = v.trim(); else delete s.name; } })} />;
  return (
    <Sheet title={names.get(id) ?? 'SECTION'} onClose={close}>
      <div class="kinds">
        {SECTION_KINDS.map((k) => (
          <button key={k} class={'kind' + (sec.kind === k ? ' on' : '')} onClick={() => { feel('click'); updateCurrent((d) => { const s = d.sections.find((q) => q.id === id); if (s) s.kind = k; }); }}>{k.toUpperCase()}</button>
        ))}
      </div>
      <div class="choices" style={{ marginTop: '10px' }}>
        <button class="choice" onClick={() => setRename(true)}><span>RENAME</span></button>
        <button class="choice" onClick={() => {
          const arrId = song.arrangement.find((a) => a.sectionId === id)?.id;
          const nid = addSection(song.id, sec.kind, arrId);
          // copy the active take into the new section
          const src = activeTake(sec);
          updateCurrent((d) => {
            const s = d.sections.find((q) => q.id === nid);
            if (s) s.takes[0].lines = src.lines.map((l) => ({ ...l, id: Math.random().toString(36).slice(2, 9), chords: l.chords.map((c) => ({ ...c })) }));
          });
          close(); say('DUPLICATED AS A NEW SECTION');
        }}><span>DUPLICATE</span><small>as an independent copy</small></button>
      </div>
    </Sheet>
  );
}

function TakeSheet({ id }: { id: ID }) {
  const song = currentSong.value!;
  const sec = song.sections.find((s) => s.id === id);
  const close = () => (takeSheet.value = null);
  if (!sec) return null;
  return (
    <Sheet title="TAKES" onClose={close}>
      <p class="hint">Swipe a section header left/right to flip between takes. Try a whole new angle without losing the old one.</p>
      <div class="choices">
        <button class="choice" onClick={() => { addTake(song.id, id, false); close(); feel('chk', 'medium'); }}><span>+ BLANK TAKE</span><small>start fresh</small></button>
        <button class="choice" onClick={() => { addTake(song.id, id, true); close(); feel('chk', 'medium'); }}><span>+ COPY OF THIS</span><small>revise a duplicate</small></button>
        {sec.takes.length > 1 && (
          <button class="choice danger" onClick={() => {
            const t = activeTake(sec);
            const snapshot = JSON.parse(JSON.stringify(sec));
            updateCurrent((d) => {
              const s = d.sections.find((q) => q.id === id)!;
              s.takes.splice(Math.min(s.take, s.takes.length - 1), 1);
              s.take = Math.max(0, Math.min(s.take, s.takes.length - 1));
            });
            close();
            say(`TAKE DELETED (${t.lines.filter((l) => l.text.trim()).length} LINES)`, { label: 'UNDO', run: () => updateCurrent((d) => { const i = d.sections.findIndex((q) => q.id === id); if (i >= 0) d.sections[i] = snapshot; }) });
          }}><span>DELETE THIS TAKE</span></button>
        )}
      </div>
    </Sheet>
  );
}

function AddSheet() {
  const song = currentSong.value!;
  const names = sectionNames(song);
  const close = () => (addSheet.value = false);
  const sel = selectedEntry.value;
  return (
    <Sheet title="ADD TO THE SONG" onClose={close}>
      <div class="grp">NEW SECTION</div>
      <div class="kinds">
        {SECTION_KINDS.map((k) => (
          <button key={k} class="kind" onClick={() => {
            const sid = addSection(song.id, k, sel ?? undefined);
            feel('chk', 'medium'); close();
            const entry = currentSong.peek()?.arrangement.find((a) => a.sectionId === sid);
            if (entry) { selectedEntry.value = entry.id; setTimeout(() => document.getElementById('arr-' + entry.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); }
          }}>{k.toUpperCase()}</button>
        ))}
      </div>
      {song.sections.length > 0 && (
        <>
          <div class="grp" style={{ marginTop: '14px' }}>REPEAT AN EXISTING ONE</div>
          <div class="kinds">
            {song.sections.map((s) => (
              <button key={s.id} class="kind rep" onClick={() => {
                updateCurrent((d) => {
                  const i = sel ? d.arrangement.findIndex((a) => a.id === sel) : -1;
                  const entry = { id: Math.random().toString(36).slice(2, 9), sectionId: s.id };
                  if (i >= 0) d.arrangement.splice(i + 1, 0, entry); else d.arrangement.push(entry);
                });
                feel('chk', 'medium'); close();
              }}>↻ {names.get(s.id)}</button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function BenchView() {
  const song = currentSong.value!;
  const ln = lens.value;
  const t = tray.value;
  const names = sectionNames(song);
  const seen = new Set<ID>();
  const lane = t === 'chords';
  const ghost = chordGhost.value;
  useEffect(() => () => { armedChord.value = null; }, []);
  useEffect(() => { hintOnce('bench', 'THE BENCH — BUILD THE SONG. SWIPE A LINE LEFT TO CUT IT · TAP A SYLLABLE COUNT FOR MORE'); }, []);

  return (
    <div class={'mode-view bench lens-' + ln + (lane ? ' lanes' : '') + (armedChord.value ? ' armed' : '')}>
      <Deck />
      <SongMap song={song} names={names} />
      <div class="bench-scroll">
        {song.arrangement.length === 0 && (
          <div class="empty-bench">
            <b>AN EMPTY BENCH</b>
            <span>Start a verse here, paste a whole song in from the TAPES rack, or send strips over from the TABLE.</span>
            <button class="btn go" onClick={() => { addSection(song.id, 'verse'); feel('chk'); }}>+ FIRST VERSE</button>
          </div>
        )}
        {song.arrangement.map((a) => {
          const sec = song.sections.find((s) => s.id === a.sectionId);
          if (!sec) return null;
          const rep = seen.has(sec.id);
          seen.add(sec.id);
          return rep
            ? <RepeatSlip key={a.id} sec={sec} names={names} from={a.id} />
            : <SectionCard key={a.id} song={song} sec={sec} entryId={a.id} names={names} lane={lane} lens={ln} />;
        })}
        {song.arrangement.length > 0 && <button class="add-section" onClick={() => { feel('click'); addSheet.value = true; }}><Icon n="plus" size={13} /> ADD SECTION</button>}
        <div class="bench-tail" />
      </div>
      {t === 'chords' && <ChordTray />}
      {t === 'shoebox' && <ShoeboxTray />}
      {t === 'words' && <WordsTray />}

      {lineMenu.value && <LineMenu />}
      {sectionSheet.value && <SectionSheet id={sectionSheet.value} />}
      {takeSheet.value && <TakeSheet id={takeSheet.value} />}
      {addSheet.value && <AddSheet />}
      {cadenceFor.value && <CadenceSheet />}
      {ghost && <div class="stamp ghost" style={{ left: ghost.x, top: ghost.y }}>{ghost.name}</div>}
    </div>
  );
}

const LENS_NEXT: Record<Lens, Lens> = { off: 'rhyme', rhyme: 'meter', meter: 'off' };

export function BenchKeys() {
  const t = tray.value;
  const ln = lens.value;
  return (
    <Keys>
      <Key icon="words" label="Words" led on={t === 'words'} sound="thock" onClick={() => { if (t === 'words') tray.value = null; else openWords(); }} />
      <Key icon="chord" label="Chords" led on={t === 'chords'} sound="thock" onClick={() => { tray.value = t === 'chords' ? null : 'chords'; if (t === 'chords') armedChord.value = null; }} />
      <Key icon="lens" label={ln === 'off' ? 'Lens' : ln === 'rhyme' ? 'Rhyme' : 'Meter'} aria="Lens" led={ln === 'meter' ? 'green' : 'amber'} on={ln !== 'off'} sound="clunk"
        onClick={() => {
          const n = LENS_NEXT[lens.peek()];
          lens.value = n;
          if (n === 'meter') { (document.activeElement as HTMLElement | null)?.blur?.(); armedChord.value = null; }
          say(n === 'rhyme' ? 'LENS: RHYME — COLOURS & SCHEME LETTERS' : n === 'meter' ? 'LENS: METER — TAP A WORD TO FLIP ITS STRESS OR MARK A DOWNBEAT' : 'LENS OFF', undefined, 2400);
        }} />
      <Key icon="box" label="Shoebox" led on={t === 'shoebox'} sound="thock" onClick={() => { tray.value = t === 'shoebox' ? null : 'shoebox'; }} />
      <Key icon="stand" label="Stand" tone="dark" sound="clunk" onClick={() => { tray.value = null; layer.value = 'stand'; }} />
    </Keys>
  );
}
