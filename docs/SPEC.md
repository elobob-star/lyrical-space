# FOOLSCAP — Product & Technical Spec

> A lyric notepad that behaves like a piece of studio hardware instead of an app.
> Offline-first. No accounts, no API keys, no AI writing a word for you. Ships as an Android APK
> (Capacitor) and still runs as a plain web page / PWA.

---

## 1. Vision

Most lyric apps are text editors with a rhyming dictionary stapled on. FOOLSCAP is built
around the *process* of writing a song, which is rarely linear, and around one specific enemy:
**perfectionism** — the blank white page that makes every sentence look final.

1. **Catch** a stray line before it escapes.
2. **Freewrite** from it, fast, without judging.
3. **Harvest** the accidental gems out of the mess.
4. **Cut up / recombine** until something sparks.
5. **Build** a structured song — verses, choruses, chords, takes.
6. **Polish** with rhyme, syllable and rhythm tooling that *shows* you things instead of writing for you.
7. **Play it through** from a music stand.

The techniques are borrowed from the writers the app was designed around — Kerouac/Dylan
(the scroll), Bowie/Burroughs (cut-ups), Waits (scraps of overheard talk), Cohen (stacks of
drafts per verse), Nick Drake (tunings, a tape running while you write).

### Design principles

| # | Principle | In practice |
|---|-----------|-------------|
| 1 | **Machine vs. media** | The *machine* is cold, matte and precise: putty aluminium, bone keycaps, one dark LCD. The *media* is warm and imperfect: paper, typewriter ink, wax pencil, masking tape. Never mix them. |
| 2 | **Nothing is ever really deleted** | Backspace on the Roll strikes through. Cut lines go to the Shoebox. Every destructive action can be undone from the LCD. Tapes keep a history of earlier versions. Binned tapes wait 30 days. |
| 3 | **Show, don't write** | No "generate me a verse". The app measures (syllables, stress, rhyme geometry) and offers raw material (words, your own scraps). The writer stays the writer. |
| 4 | **Every process welcome** | Freewriter, collagist, guitarist-first, rhyme-schemer, hummer: each has a door, all doors lead into the same song. |
| 5 | **One pile, one voice** | Every stray line lives in ONE place (the Shoebox). Every message comes from ONE place (the LCD). |
| 6 | **Works in a tunnel** | Writing, syllables, rhymes, meter are 100 % offline (bundled CMU dictionary). Online lookups are a bonus that degrades gracefully. |
| 7 | **Not a Material app** | No app bar, no hamburger, no FAB, no ripple, no floating toasts. |

### The notebook comes first (MK-II, second pass)

Picking a song before you've written a word is a quiet form of pressure. So the app now opens on a **notebook**
that belongs to no song: a yellow legal pad, dated pages, cursor ready. You ramble there; lines worth keeping are
punched into the Shoebox, and songs are built from the Shoebox later. The machine shrank to one slim row
(⏏ TAPES · LCD · dial) so the paper gets the screen. Songs written in MK-I/MK-II keep their freewrites: each song's
old roll became a notebook page, stamped with the song's name.

### What changed from MK-I (and why)

MK-II came out of a design review of MK-I. Most of the review was adopted; where it wasn't, the reason is below.

| MK-I | MK-II | Note |
|---|---|---|
| Sparks, Shoebox, Boneyard, Bones tray — four names for "a stray line" | **One Shoebox**, with a provenance stamp (CAUGHT / CUT FROM … / KEPT FROM …) | Old data migrates automatically. |
| Dark charcoal bezel, glossy colour keys, screws, brushed metal, tilt sheen | **Matte putty** chassis, recessed seams, EP-133-style bone keycaps with the label, LED and symbol printed on the cap | Charcoal stays as an optional finish. |
| Black floating toasts | **The LCD talks**: every message, hint and UNDO appears there; tap it to act | Chosen over "Dymo labels" so there is exactly one voice. |
| Table modes (SNIP / TAPE) + a lever | **Modeless**: tap a strip, tap a gap to snip; drop a strip on another's edge to tape; double-tap the mat for a slip; DEAL is a key | Snip by tap rather than two-finger spread: one-handed and discoverable. Single tap on the mat deselects, so new slips need a double-tap. |
| Radial WHEEL key | **WORDS** key: one tap = rhymes for the word under the caret, tabs for the rest | Not "double-tap a word": in a text field that's the OS's own word selection. |
| Latch = ghost ink | **Ghost ink always on** (DIP switch), with *typo grace*: the word you are still typing really erases; once it's finished, backspace strikes it through. **LATCH** = forward-only: backspace refused and a paper bail folds away everything but the last lines | The bail is the "only see the last two lines" idea from the very first concept. |
| Lines/words/clock that started ticking on the first key | Line odometer only; the timer is an opt-in **SPRINT** | |
| Export key on the Bench | Export from the tape's menu or the Stand | |
| — | **STAND** music-stand view, **hold-to-hum** per card, **METER** lens with downbeats, rhyme-scheme letters, **CUT-UP**, transpose, tape **history**, **paste-in importer**, memos in backups | |

---

## 2. Industrial design language

### 2.1 The machine

* **Palette** — putty `#DFDBD2` with a 3 % monochrome noise, seams `#B8B3A8` + highlight `#ECE9E2`, silk-screen charcoal `#2B2A28`, one accent: signal orange `#FF4F00`. Charcoal finish mirrors it.
* **Top bezel** — one slim row: `[⏏ TAPES key] [LCD] [printed legend NOTEBOOK / TABLE / BENCH + mode dial]`. The song title lives on the paper (typed at the top of the Bench, a scrap of masking tape on the Table). SETUP sits in the Tape Rack.
* **LCD** — the only dark element. Dot-matrix (Doto). Idle readouts: Notebook `P.38 16 OCT · FWD · PEN · 09:41`; Table `BORROWED ROOM 07`; Bench `V1 C V2 C · RHY · 84 G`; Rack `TAPE RACK 12`; while recording `● REC ▮▮▮▯`. Messages scroll past like a marquee; an action (`UNDO`, `GO`, `PEN`) sits on the right — tap the glass to run it.
* **Keys** — a dark well, a bone keycap with a 3 px skirt that sinks 2 px on touch-down; LED top-left, 1.5 px technical symbol top-right, label bottom-left. One dark key per surface marks its main action. Five keys per surface. Disabled keys grey out.
* **Screen well** — paper sits in a shallow tray: 2 px lip, a 2–3 px inner shadow, nothing foggy.
* **Panels** — sheets and drawers are putty plates that slide up; the scrim never covers the top bezel, so the LCD stays readable.

### 2.2 The media

| Surface | Object |
|---|---|
| NOTEBOOK | a yellow legal pad: glued binding at the top, red double margin, blue rules the type stands on, a red rubber date stamp (dark at MIDNIGHT) |
| TABLE | a self-healing cutting mat with paper strips (scissor-cut edges, provenance by paper stock) and masking tape |
| BENCH | ruled index cards with a coloured top edge, a masking-tape deck strip, chrome chord stamps |
| RACK | cassette J-cards in a moulded tray; the Shoebox as index slips |
| STAND | one long lead sheet |

Paper stocks: **NEWSPRINT** (default) · **LEGAL** (pink wax) · **GRAPH** · **MIDNIGHT** (dark). The wax pencil is multiplied onto the paper with a rough, textured edge so the type stays crisp on top.

### 2.3 Type

| Role | Face |
|---|---|
| Everything the writer types (Roll, Table, Bench, Shoebox, Stand, fields) | **Courier Prime** — one typewriter face, so a line looks the same wherever it travels |
| The machine (keys, labels, panels) | **Space Grotesk** |
| LCD | **Doto** |

### 2.4 Sound & touch (all synthesised with WebAudio — no audio files)

Mode dial *clack* (rotary detent), TAPES *eject* (spring + ka-chunk), latch *clunk*, DIP *snap*, PUNCH *crunch*,
scissors *snip*, masking *tape* tear, *shuffle*, refused backspace *thud*, deal *ratchet*, typewriter *ding*.
Haptics on touch-down. Both switchable. Motion is short, springy, transform-only.

---

## 3. Information architecture

```
 ┌ top bezel: [⏏ TAPES] [ LCD ] [ legend · DIAL ] ────────────────┐
 │                                                               │
 │ NOTEBOOK ←— one desk, the dial pans across it —→ TABLE  BENCH │
 │                                                               │
 │   (TAPES swaps the desk for the Rack, inside the same window) │
 │ ▌CATCH slip (right edge, on Table and Bench)                  │
 └ bottom bezel: five context keys ──────────────────────────────┘
```

* **Notebook** – global, made of pages. Belongs to no song. The app always opens on its newest page.
* **Tape** (song) – owns a Table, a Bench (sections, takes, arrangement), memos, history.
* **Shoebox** – the one global pile of stray lines. Fed by PUNCH (notebook), CATCH, cut Bench lines, kept Table work. Drained by DRAW (notebook), DEAL (Table), the Shoebox drawer (Bench).

---

## 4. Surfaces

### 4.1 NOTEBOOK — rambling (home)

Keys: **LATCH · PEN · DRAW · PUNCH · SPRINT**

* **Pages** — each page carries a red date stamp and a number. Come back after **45 minutes away or on a new day** and a fresh page is waiting (a blank page is reused, never stacked); `+` tears off a new one by hand. `‹ ›` (or a swipe on the header) flips through earlier pages, which stay writable. Tap the date stamp for the index: every page with its date and first line, searchable.

* **Ghost ink** — the rules, in plain words (`src/engine/ink.ts`, unit-tested and fuzzed):
  * the word you are still typing is *wet*: backspace erases it for real, so typos cost nothing;
  * a space, punctuation or Enter *finishes* the word. From then on backspace strikes it through in graphite instead of erasing it;
  * the space or punctuation you just typed is itself erasable, until a full word has been written after it;
  * whatever you type is always clean ink — also when you tap into the middle of struck-out text (struck runs split around the new text);
  * moving the caret out of the wet ink dries it; typing over a selection strikes the old words and writes after them. (SETUP: GHOST INK.)
* **UNDO / REDO** — in the page header the moment there is something to take back (typing in one breath is one step; a strike, a paste, a new line each their own; Ctrl+Z on a keyboard). Struck words come back with it.
* **THIS PAGE** (tap `P.n`) — COPY TEXT and SHARE (struck-out words left out), TO THE BENCH (the lines become a new verse), BURN THE STRIKES (delete struck ink for good; undoable).
* **Typewriter scroll** — as you write down the page it follows you, keeping the line you're on in the upper two thirds.
* **LATCH** — forward only. Backspace is refused with a thud, the caret is pinned to the end, and a paper bail folds away everything above the last lines ("FORWARD ONLY") so you can't reread and judge. Unlatch and the bail lifts.
* **DRAW** — a random scrap from the Shoebox (least-used first) is taped to the top of the page; ANOTHER / WRITE FROM IT (appends it and puts the caret after it).
* **PEN** — wax pencil. Tap a phrase (bounded by line breaks and sentence punctuation) to mark it, tap again to clear; press-hold-drag for an exact range.
* **PUNCH** — every marked phrase is die-cut out (they fly off the page) into the **Shoebox**, stamped `NOTEBOOK P.38`, and stays on the page as a cut-out. The LCD offers ON TABLE to lay them straight onto the current song's Table.
* **SPRINT** — opt-in timed freewrite (5–60 min). Countdown on the LCD; at the bell the PEN key pulses and the LCD offers PEN.

### 4.2 TABLE — cut & recombine

Keys: **SLIP · DEAL · CUT-UP · SHUFFLE · SWEEP · UNDO**

* Strips are dragged freely (velocity tilt). Paper may **hang off any edge of the mat** — only enough to grab it again
  (56 px across, 30 px down) has to stay on — so two wide strips can still be laid side by side and taped. New strips land
  wholly on the mat. Shadows are plain boxes, not filters, and tapping a strip writes nothing to the song — that is what
  keeps it quick on a phone.
* **Cutting has no tool to pick up or put down.** **Tap** a strip and its scissors come out: every place it can be cut —
  a gap between words, or the seam between two lines — shows as a dashed line.
  * **tap a dashed line** to cut there (a tap within reach of one is enough), or **press and slide** along the strip: a
    guide (dashed line + scissors) follows the finger to the nearest cut; **let go** to cut;
  * pulled off its own paper, a picked-up strip simply moves instead; a tap away from any cut puts it down;
  * **slash** across the mat (start on bare mat) to cut every strip the stroke crosses — vertical strokes cut between
    words, horizontal ones between lines;
  * the two pieces start where they were cut and slide apart.
* A picked-up strip also gets a small bar: EDIT · BENCH · ⋯ · throw away. **⋯** holds DUPLICATE, SPLIT INTO WORDS,
  SPLIT INTO LINES and KEEP IN THE SHOEBOX.
* **Hold a strip against any edge of another for a moment** → taped: under it or on top (two lines), after it or in
  front (one line). Tape is never an accident: the edges have to nearly touch (within 14 px) and overlap well; a faint
  outline shows on that edge, and after ~0.3 s the tape sticks (solid, with a buzz) — only then does letting go tape
  them. Drop it straight away, or slide on past, and it is just paper laid nearby. The two halves of a fresh cut never
  stick back together by themselves: an edge a strip was already touching when picked up is ignored until it has left it.
  Joints keep a small see-through piece of tape; snipping a joint peels it.
* **Double-tap the mat** → a new slip right there. **SLIP** does the same in a free spot.
* **DEAL** — four scraps from the Shoebox. **CUT-UP** — slices every strip into 2–4-word fragments (Burroughs/Bowie). **SHUFFLE** — re-scatters (FLIP animation). **SWEEP** — clears the mat; typed and taped work is kept in the Shoebox, copies are just cleared.
* **UNDO** — a key on the row, awake whenever there is something to take back; the LCD offers it right after an action
  too. It takes back what you can't easily redo by hand — cuts, tape, throwing away, edits, splits, a deal, a cut-up, a
  shuffle, a sweep — and never a move. Taking back a cut leaves every strip where you have pushed it since.
* **→ BENCH** slots a strip into a section (or a new verse/chorus/bridge).

### 4.3 BENCH — the song

Keys: **WORDS · CHORDS · LENS · SHOEBOX · STAND**

* **Deck strip** (masking tape): KEY · CAPO · TUNING · BPM (tap tempo, metronome with count-in) · ● REC scratch tape with spinning reels. Changing KEY transposes every chord stamp (switchable).
* **Song map** — the arrangement as blocks; repeats are outlined; tap to select → move / repeat / remove (a section's lines go to the Shoebox when its last use is removed).
* **Cards** — kind tag (rename / re-kind / duplicate), **takes** `‹ 02/04 ›` (swipe the header, 3D page flip), ♪ cadence, 🎤 **hold-to-hum**: press and hold to record how this section goes, let go to keep it (pinned to the card).
* **Lines** — syllable gutter (coloured against the cadence; ≠ for stress mismatch; tap for the line menu), Enter splits, Backspace at 0 merges, multi-line paste splits. **Swipe left** → cut into the Shoebox.
* **WORDS** — the word under the caret: RHYME · SLANT · SENSE · LIKE · OPPOSE · DEFINE tabs; filters = syllables, STRESS, RARE; tap a word to swap it in (case kept). With no caret it's a free lookup.
* **CHORDS** — diatonic stamps for the key, modifiers, custom; drag onto a word or arm + tap.
* **LENS** (cycles) — **RHYME**: perfect rhymes tinted, slant end-rhymes dotted, **scheme letters** (AABB…) in the margin. **METER**: scansion marks (`/` stressed, `˘` unstressed, `\` secondary) over every syllable; tap a word to flip a one-syllable word's stress, then to mark a **downbeat** bar before it, then back. Overrides feed the cadence fit.
* **SHOEBOX** drawer — MATCH ranks scraps that rhyme with the line above and fit this line's length; ALL. Tap to drop in.
* **STAND** — see 4.5.

### 4.4 TAPE RACK (⏏ TAPES)

Shown inside the screen well; the bottom keys become **NEW · PASTE IN · TAPES · SHOEBOX · BIN**.

* **TAPES** — J-card spines: ink stripe, title, first line, KEY · BPM · sections · lines · edited. Tap to load; ⋯ → spine colour, rename, duplicate, **history**, export · share, bin. Search covers titles and lyrics.
* **History** — earlier states are snapshotted automatically (at most every 3 min of editing, last 80 kept). Preview one, then ROLL BACK (the newer state is snapshotted first) or open AS A COPY.
* **PASTE IN** — plain lyrics, chords-over-lyrics, `[Verse 1]` / `Chorus:` / `Chorus x2` headers, or ChordPro (`{title}`, `{key}`, `{tempo}`, `{soc}`, `[Am]`…). Blank lines split sections; a block that comes back word for word becomes the chorus; bare repeated headers become repeats.
* **SHOEBOX** — index slips with provenance and DRAWN n×; catch a line, write from it on the Roll, lay it on the Table, edit, throw away.
* **BIN** — 30 days, restore or erase.

### 4.5 STAND — play it through

The whole arrangement on one lead sheet in the current paper stock, chords hung over the words they land on (and never torn from them when lines wrap). **SCROLL** auto-scrolls paced by the tempo (one sung line ≈ two bars of 4/4 at 1.0×), speed ±, A−/A+, CHORDS on/off, FOLD repeats. Tap the sheet to start/stop; the chrome hides while scrolling. Keeps the screen awake.

### 4.6 CATCH, SETUP, export

* **CATCH** — a slip peeking from the right edge on every surface. Type, Enter, Enter… DONE. The LCD confirms.
* **SETUP** — one tap on the **gear at the end of the LCD**, from anywhere. Calm cards: LOOK (finish, paper and type size as pictures, paper grain), WRITING (ghost ink, syllable gutter, online lookups, keep screen on, left-handed), FEEL (haptics, sounds, typewriter keys), LIBRARY (counts, backup/restore with memos).
* **Export** — lyrics, chords-over, ChordPro, Markdown; copy / file / share; generative **Lyric Card** PNG.

---

## 5. Writing engine

* **Pronunciation** — bundled CMU dictionary (~126 k words), 1 char/phone, binary-searched. Syllables = vowel phones; OOV fallback by vowel groups.
* **Stress** — per syllable (`S` primary, `s` secondary, `u` none); one-syllable function words `u`, content words `S`. Per-word overrides keyed `${index}:${word}` so they fall away when the word changes.
* **Rhyme** — key from the last stressed vowel; slant key = stressed vowel. Flow analysis groups perfect rhymes (≥ 2 distinct words) then slant end-rhymes; scheme letters come from the end-word groups.
* **Ghost ink** — `marks {s,e,kind:'ghost'|'pencil',punched?}` re-based on every edit (diff of common prefix/suffix); a ghost mark is *split* around an edit inside it, a pencil mark stretches. The decision "erase or strike?" is a pure reducer (`reduce` / `reduceDiff`): `beforeinput` feeds it where the event is cancelable, and the post-hoc diff feeds it when an IME already changed the text. Handlers read live store state, never the render closure (several input events can arrive between renders).
* **Undo** — the notebook keeps snapshots per page (text + struck ink, bursts coalesced); Table and Bench keep a LIFO stack per song and surface (`store/undo.ts`) whose entries are inverse operations (on the Table: what a change added, took away or rewrote, by strip id — positions are left alone; on the Bench: a take's lines, the arrangement, key/capo/tuning/tempo). Moves — of strips, lines, sections, chord stamps — are not undo steps. On the Bench the undo is a small inked arrow beside the title, only there when there is something to take back.
* **The folder** — Setup › LIBRARY › CHOOSE A FOLDER mirrors everything into a folder of the writer's choosing as plain files (`foolscap-library.json`, a dated copy per day, a text file per page and per song, the shoebox, voice memos) a few seconds after each change. On Android it is a Storage Access Framework folder with a lasting permission (`FolderPlugin.java`); in Chrome, File System Access. A fresh install offers "BEEN HERE BEFORE?" on the first page: choosing the folder picks everything up (matched by id, newest wins, nothing doubled). Where neither exists (Safari on iPhone), SAVE A COPY / OPEN A COPY, with a gentle weekly reminder. The file format is the contract in [`FORMAT.md`](FORMAT.md).
* **Importer** — two passes: rows → blocks (headers, directives, chord lines → column-anchored chords, inline `[C]`), then blocks → sections + arrangement.
* **Cut-up** — 2–4-word fragments, never leaving a single word at the end.

## 6. Data model (IndexedDB, local-first)

```ts
Page    { id, n, createdAt, updatedAt, text, marks[], spark?, fromSong? }   // the notebook
Song    { id, title, ink, createdAt, updatedAt, deletedAt?, bpm, key?, capo, tuning,
          roll{…legacy, migrated to pages}, table: Strip[],
          sections: Section[], arrangement: {id, sectionId}[], memos: Memo[] }
Section { id, kind, name?, take, takes: Take[], cadence?: ('u'|'S'|'r')[] }
Take    { id, lines: Line[] }
Line    { id, text, chords: {at, name}[], meter?: { [`${i}:${word}`]: { s?, d? } } }
Strip   { id, text, x, y, rot, z, from: 'roll'|'deal'|'typed'|'splice'|'cut', joints?: number[] }
Scrap   { id, text, from: 'catch'|'cut'|'table'|'roll'(notebook), createdAt, songId?, page?, used }
Memo    { id, sectionId?, label, durMs, peaks[], mime }        // audio blob stored separately
Settings{ paper, chassis, haptics, clicks, keys, grain, textSize, gutter, online, awake, leftHand, ghost, sprint }
```

Stores: `songs`, `scraps`, `blobs`, `kv`, `history`, `pages` (DB v3; on first run the old rolls become pages, once). Writes are debounced per song and flushed on `pagehide`;
the version being overwritten becomes a history snapshot when the last one is ≥ 3 min old.
Backups: `{app:'portascribe', version:3, songs, scraps, pages, blobs:{memoId: dataURL}}`.

## 7. Integrations (all free, no key)

| Service | Used for | Offline behaviour |
|---|---|---|
| CMU dict (bundled) | syllables, stress, rhyme, lenses, offline rhymes | full |
| Datamuse `api.datamuse.com` | rhyme/slant ranking, sense, synonyms, antonyms | cached → CMU fallback |
| Free Dictionary `api.dictionaryapi.dev` | definitions | cached → "NO SIGNAL" |
| WebAudio · MediaRecorder | sounds, metronome, memos | local |
| Capacitor Haptics / Share / Filesystem / App / StatusBar | native feel, export, back button | local |

## 8. Architecture

Vite + TypeScript + Preact (+ signals, immer); hand-written CSS with tokens; Capacitor 8 → Android (`minSdk 24`, `RECORD_AUDIO`).
State lives in signals; persistence is a side-effect subscriber. All sheets render through one overlay layer at the chassis level.
The three surfaces are panes on one "desk"; the outgoing pane stays mounted for the 420 ms pan.

## 9. Verification

* `npm test` — engine unit tests (dictionary, syllables, stress, rhyme, scheme, diff/rebase, cadence, music, transpose, importer, meter overrides, migration, export).
* `scripts/e2e/flows.mjs` — ~90 interactions at phone size: typo grace, ghost ink, typing inside struck ink, notebook undo/redo, latch & bail, draw, pen tap/drag, punch → table, deal, drag, tap-to-cut and slide-to-cut on a picked-up strip, slash, split into words, the UNDO key, tape, cut-up + LCD undo, shuffle, sweep + undo, double-tap slip, slot to bench, split/merge, chord drag, swipe → shoebox, shoebox drawer, words swap, tabs, both lenses + meter override, transpose, stand auto-scroll, catch, rack shoebox, history, paste-in import, finish switch.
* `scripts/e2e/undo.mjs` (notebook strikes, burn, page menu; bench typing / Enter / tempo undo, moves are not undo steps; the LCD gear), `folder.mjs` (link a folder, write, wipe the app's storage, pick the folder up again), `two-phones.mjs` (two people on one link each keep their own notebook; nothing typed leaves the phone), `persist.mjs` (production bundle), `upgrade.mjs` (an MK-I/MK-II database opened by this build: rolls → pages, bones → shoebox, migration runs once), `perf.mjs` (4× CPU throttle), `tour.mjs` / `sheets.mjs` (screenshots).

## 10. Roadmap

Android *share-into-Portascribe* intent (catch from any app), home-screen CATCH widget, cloud sync, collaborative
writing, per-line alternates, Play Store signing. Physical-device pass still to do: Gboard composition with ghost ink
and the latch (the ink reducer is covered with an emulated IME in Chromium, but not on a real keyboard), mic permission on first hold-to-hum.
