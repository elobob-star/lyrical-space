# PORTASCRIBE // MK-I — Product & Technical Spec (v1)

> A lyric notepad that behaves like a piece of studio hardware instead of an app.
> Offline-first. No accounts, no API keys, no cloud. Ships as an installable Android APK
> (Capacitor) and still runs as a plain web page / PWA.

---

## 1. Vision

Most lyric apps are text editors with a rhyming dictionary stapled on. PORTASCRIBE is built
around the *process* of writing a song, which is rarely linear:

1. **Catch** a stray line before it escapes.
2. **Freewrite** from it, fast, without judging.
3. **Harvest** the accidental gems out of the mess.
4. **Cut up / recombine** until something sparks.
5. **Build** a structured song — verses, choruses, chords, takes.
6. **Polish** with rhyme, syllable and rhythm tooling that *shows* you things instead of writing for you.

Every step is a *physical-feeling* surface. You never open a menu; you flip a switch, turn
a dial, pull a lever, drag a strip of paper.

### Design principles

| # | Principle | In practice |
|---|-----------|-------------|
| 1 | **The page is sacred** | ≥ 85 % of the screen is unobstructed paper at rest. Tools are *recessed* into the bezel and come out only when needed. |
| 2 | **Nothing is ever really deleted** | Backspace in the Roll becomes ghost ink. Cut lines fall into the Boneyard. Every destructive action has UNDO. Songs go to a bin, not oblivion. |
| 3 | **Show, don't write** | No "generate me a verse". The app measures (syllables, rhyme geometry, stress) and offers *raw material* (words, associations) — the writer stays the writer. |
| 4 | **Every process welcome** | Freewriter, cut-up collagist, guitarist-first, rhyme-schemer, hummer: each has a door, all doors lead into the same data. |
| 5 | **Works in a tunnel** | 100 % offline for writing, syllables, rhymes (bundled CMU dictionary). Online lookups (Datamuse, dictionary) are a bonus that degrades gracefully. |
| 6 | **Not a Material app** | No app bar, no hamburger, no FAB, no ripple, no system-looking dialogs. |

### Deliberate departures from the first (Gemini-era) draft

The original draft leaned on Gemini Live / Flash / Nano Banana. This build runs *outside* AI
Studio and must need no keys, so:

| Original idea | v1 replacement (free, offline-first) |
|---|---|
| Hum → AI transcribes cadence grid | **Cadence Pad**: tap the rhythm with your thumb (tap = *da*, hold = *DUM*, pause = rest) → a stress template the lines are measured against. Also "steal cadence from this line". |
| Anti-Cliché Muse (LLM) | **The Reference Wheel**: Datamuse (rhymes, slant rhymes, "triggers", describing adjectives, synonyms, antonyms) + Free Dictionary, with a **meter filter** (same syllable count / same stress). Cliché-avoidance is built in by *showing the long tail*: results are ranked by rarity as an option. |
| AI cover art | **Generative cover & Lyric Cards** drawn on a canvas, seeded by title + lyrics + ink colour; exportable as PNG for sharing. |
| Firestore / Drive sync | **Local-first** (IndexedDB) + one-tap **Backup / Restore** to a JSON file and **Share** sheet. Cloud sync is a roadmap item. |

---

## 2. Industrial design language

### 2.1 The chassis

A matte-charcoal field recorder / pocket sampler. The paper "screen" is recessed into it.

* **Top bezel** (≈ 64 dp): `RACK` reel button · label-maker **title tape** · **rotary dial**.
  Silkscreened nameplate `PORTASCRIBE MK-I` (tap → DIP-switch settings).
* **Bottom bezel**: context keys (rubber keycaps with silkscreen legends and LEDs).
* **Screws, vents, tolerance lines** — used sparingly as texture, never as content.
* One accent: **signal orange** `#ff5b1f`. LEDs: green (safe/saved), red (recording), amber (latch / warning).

### 2.2 Paper stocks (themes)

| Stock | Feel | Use |
|---|---|---|
| **NEWSPRINT** (default) | warm greige, fibres, ink-black | day |
| **GRAPH** | cool bone with faint blue grid | analytic / lyric-as-math people |
| **MIDNIGHT** | warm dark paper, cream ink | night, stage |

The chassis is always charcoal. Each song also has an **ink colour** (8 marker colours) that tints
its tape spine, cover, LED glow and chord stamps — the "mood" of the song in one swatch.

### 2.3 Type

| Role | Face | Why |
|---|---|---|
| Silkscreen / UI | **Space Mono** (caps, wide tracking) | technical, instrument-panel |
| Lyrics (Bench, Roll) | **Courier Prime** | typewriter warmth; *monospace is required* so chord stamps can sit exactly above a character |
| Display (headers, stamps) | **Special Elite** | worn typewriter |
| Handwriting (strips, slips, tape labels) | **Caveat** | felt-pen scrawl |

### 2.4 Sound & touch (all synthesised with WebAudio — no audio files)

* Dial detent *click*, key *thock*, latch *clunk*, hole-punch *chk*, scissors *snip*, lever *ratchet*, typewriter *ding* (sprint end).
* Haptics: light tick per detent, medium for latch/punch/lever. Both independently switchable.
* Motion: mechanical, short (≤ 180 ms), ease-out with a hint of overshoot. Nothing floaty or "bouncy-Material".

---

## 3. Information architecture

```
                ┌────────── RACK (drawer, left) ─────────┐
                │ TAPES (songs) · SHOEBOX · BONEYARD · BIN │
                └─────────────────────────────────────────┘
 ┌ top bezel: [RACK] [ title tape ............ ] [ DIAL ] ┐
 │                                                         │
 │   ROLL   ──   TABLE   ──   BENCH     (three workspaces, │
 │  freewrite   cut & shuffle  structure  one shared song) │
 │                                                         │
 │ ▌Quick-Catch slip (right-edge tab, available everywhere)│
 └ bottom bezel: context keys ─────────────────────────────┘
        tray slot (chords / boneyard / results) slides up above the keys
```

Global objects:

* **Song ("tape")** – owns a Roll, a Table, a Bench (sections + arrangement), memos.
* **Shoebox** – global pile of *sparks*: raw one-liners, titles, overheard phrases.
* **Boneyard** – global pile of *bones*: lines cut from songs. Surfaces matches while writing.
* **Quick-Catch slip** – 2-second capture into the Shoebox from anywhere.

---

## 4. Surfaces in detail

### 4.1 ROLL — free-writing (home base)

Continuous warm-newsprint sheet, typewriter face, ruled lines.

* **Draw a Spark** – pulls a random Shoebox line (least-used first) and tapes it above the sheet as a prompt. Tap the slip to type it in as line one. Or type a fresh one.
* **Forward Latch** (amber LED switch) – when ON, delete/backspace *cannot* remove text. Instead the characters are struck through and remain as **ghost ink** (faint, line-through). Implemented robustly against IME composition (post-hoc restore, not just `beforeinput`).
* **Odometer** – mechanical rolling counter for LINES / WORDS plus a **sprint clock** (starts on first key). At 5:00 a typewriter *ding* + the Grease Pencil key pulses: *time to harvest*.
* **Grease Pencil** – a mode switch. Keyboard drops, the sheet becomes a drawing surface: *long-press then drag* over words to highlight in translucent yellow; tap a highlight to un-mark it. Normal swipe still scrolls.
* **PUNCH TO CARDS** – every un-punched highlight becomes a strip on the Table (ghost ink stripped), the highlight turns into a punched "cut-out", haptic *chk*.
* Roll text, marks and ghost ranges are stored per song and survive edits (range re-basing on every change).

### 4.2 TABLE — cut & shuffle (when stuck)

A cork-and-paper desktop with **strips** (paper slips in marker handwriting) you drag freely.

* **Sources**: punched Roll highlights, **Deal lever** (pulls 4 random Shoebox/Boneyard fragments), typed strips (`+ STRIP`).
* **Tools** (bottom keys): `SNIP` (tap a strip between words to cut it), `TAPE` (tap two strips → stack as 2 lines or glue as 1 line), `SHUFFLE` (re-scatter), `DEAL`, `+STRIP`.
* **Tap a strip** → floating action row: `EDIT` · `→ BENCH` · `BURY` (to Boneyard) · `✕`.
* **→ BENCH** asks which section to slot into (or a new one), appends as lines to its active take.
* Positions are stored as fractions of the board so rotation/resizing keeps layout.

### 4.3 BENCH — the song sheet

* **Deck strip** (collapsible "masking tape"): **KEY** · **CAPO** · **TUNING** · **BPM** (tap-tempo + metronome with count-in) · **● REC** loop recorder.
* **Song map**: the *arrangement* as little blocks (`V1 C V2 C B C`). Drag to reorder, long-press for menu (repeat, remove, delete). A section can appear many times; repeats render as slim "↻ CHORUS" slips so you never copy-paste a chorus twice.
* **Section cards** stacked like index cards:
  * Header: kind tag (VERSE/PRE/CHORUS/BRIDGE/HOOK/INTRO/OUTRO/TAG) · rename · **take flipper** `‹ 02/04 ›` (swipe the header; `+` = blank or copy-of-this) · `♪` cadence · memo `●`.
  * Lines: gutter **syllable count** (colour-coded vs cadence), chord lane above text, mono lyric text.
  * **Enter** splits a line (chords follow), **Backspace at 0** merges up.
  * **Swipe a line left** → flicks into the **Boneyard** (UNDO toast). Gutter tap → line menu (stress pattern "da-DUM-da", move, duplicate, bury, delete, "use as cadence").
* **Magnetic chord stamps** – a slim tray of diatonic chords for the song key (or the common set if no key). *Drag* a metal stamp onto any word, or arm one and *tap* a chord lane. Tap a stamp to remove, drag to move. Modifier row: `m 7 maj7 sus4 add9 dim /bass`.
* **FLOW** (rhyme heat) – toggles colouring of rhyme geometry inside each section: perfect rhymes = tint, slant end-rhymes = dotted underline; internal rhymes included; stop-words ignored.
* **Boneyard tray** – pull-up tray; **MATCH** tab ranks bones by rhyme with the previous line's end word and syllable count of the focused line; tap to drop in.
* **Reference Wheel** (see 4.5).
* **Cadence Pad** (see 4.6).
* **Memos** – 4-bar loops or voice notes (MediaRecorder → IndexedDB) shown as waveform **pills** pinned to the song or a specific section; tap to play, long-press for loop/rename/delete.

### 4.4 RACK — library (drawer)

* **TAPES** – cassette-spine list (ink colour, title in marker, line count, edited time). Search across titles *and* lyrics. Swipe left = bin, long-press = duplicate/rename/recolour. New tape button = a blank cassette.
* **SHOEBOX** – sparks list, add/edit/delete, "send to Roll".
* **BONEYARD** – bones list, "send to Table / Bench", delete.
* **BIN** – deleted songs for 30 days.

### 4.5 Reference Wheel (replaces "pop-up menus")

Press-and-slide a hardware key; a mechanical wheel opens around your thumb with six sectors:

| Sector | Source | Notes |
|---|---|---|
| **RHYME** | CMU (offline) + Datamuse `rel_rhy` | stress-aware perfect rhymes |
| **SLANT** | CMU (offline) + Datamuse `rel_nry` | assonance / near rhymes |
| **SENSE** | Datamuse `rel_jjb` + `rel_trg` + `ml` | imagery: adjectives & associations |
| **LIKE** | Datamuse `rel_syn` | synonyms |
| **OPPOSE** | Datamuse `rel_ant` | antonyms |
| **DEFINE** | dictionaryapi.dev | definitions, examples |

Results land in a tray as chips with syllable superscripts. Filters: `= N SYL` (match the selected word) and `STRESS` (match stress pattern, via CMU on the candidate). Tapping a chip swaps the word (case & punctuation preserved). Online results are cached in IndexedDB; offline falls back to CMU for rhymes and says "NO SIGNAL" for the rest.

### 4.6 Cadence Pad

Per-section rhythm template, shown as tiles `da · DUM · rest`.

* **Tap it out**: tap = *da*, hold ≥ 220 ms = *DUM*, a pause > 1.6× the median gap inserts a rest.
* Or build with buttons, or **steal** the stress pattern of any line.
* Gutter numbers colour: on-template (ink), ±1 (ochre), further (red). Stress mismatch gets a small `≠` mark.

### 4.7 Quick-Catch slip, Dip-switches, Export

* **Slip** – a paper tab at the right edge; tap or pull it to write one line → Shoebox. Back button/outside tap closes.
* **Dip-switch panel** (tap the nameplate): paper stock · haptics · click sounds · typewriter keys · paper grain · text size · syllable gutter · online lookups · keep screen on · left-handed (flips dial & keys) · backup / restore · credits.
* **Export** (Share sheet / copy): plain text, Markdown, **ChordPro** (`[Am]` inline), chord-over-lyric text, JSON backup. **Lyric Card** → PNG poster (generative background from the ink colour + title seed).

---

## 5. Writing engine

### 5.1 Pronunciation (offline)

Bundled **CMU Pronouncing Dictionary** (~126 k words, BSD-style licence), compacted to a sorted
text file (`src/data/cmu.txt`, 1 char per phone) and binary-searched at runtime — no big Map in memory.

* **Syllables** = vowel phones. OOV words fall back to a vowel-group heuristic.
* **Stress** per syllable (primary → `S`; secondary/none → `u`; content monosyllables → `S`, function monosyllables → `u`).
* **Rhyme key** = phones from the last stressed vowel to the end, stress stripped.
* **Slant key** = the stressed vowel only (assonance).
* **Offline rhyme search** scans the dictionary for matching keys.

### 5.2 Flow view

For each section: tokenise lines → group tokens by rhyme key (≥ 2 distinct words) → assign ink colours.
End-words additionally group by slant key. Stop-words never form internal groups.

### 5.3 Ghost-ink model

`marks: {id, s, e, kind: 'ghost'|'pencil', punched?}`. Each `input` event is diffed against the previous
text (common prefix/suffix) and every mark is **re-based**. In latch mode a pure deletion is reverted and the
deleted span (plus extra characters leftwards if the span was already ghost) becomes a ghost mark.

---

## 6. Data model (IndexedDB, local-first)

```ts
Song    { id, title, ink, createdAt, updatedAt, deletedAt?, bpm, key?, capo, tuning,
          roll{ text, marks[], spark?, sprintMs }, table: Strip[],
          sections: Section[], arrangement: {id, sectionId}[], memos: Memo[] }
Section { id, kind, name?, take, takes: Take[], cadence?: ('u'|'S'|'r')[] }
Take    { id, lines: Line[] }
Line    { id, text, chords: {at, name}[] }
Strip   { id, text, x, y, rot, z, from }                 // x,y in 0..1 of board
Scrap   { id, text, kind: 'spark'|'bone', createdAt, songId?, used }
Memo    { id, sectionId?, label, durMs, peaks[], mime }   // blob stored separately
Settings{ paper, haptics, clicks, keys, grain, textSize, gutter, online, awake, leftHand, … }
```

Stores: `songs`, `scraps`, `blobs`, `kv` (settings, API cache). Writes are debounced per song and flushed on `pagehide`.

## 7. Integrations (all free, no key)

| Service | Used for | Offline behaviour |
|---|---|---|
| CMU dict (bundled) | syllables, stress, rhyme, flow view | full |
| **Datamuse** `api.datamuse.com` | rhyme/slant ranking, associations, synonyms | cached → CMU fallback |
| **Free Dictionary** `api.dictionaryapi.dev` | definitions | cached → "NO SIGNAL" |
| WebAudio | clicks, metronome, waveform | local |
| MediaRecorder | memos | local |
| Capacitor Haptics / Share / Filesystem / App / StatusBar | native feel, export, back button | local |

## 8. Architecture

* **Vite + TypeScript + Preact + @preact/signals + immer**; plain hand-written CSS with design tokens. ~100 KB gz JS before the dictionary.
* **Capacitor 8** wraps `dist/` into an Android project (`android/`). `minSdk 24`. Permissions: `RECORD_AUDIO`.
* App state lives in signals; persistence is a side-effect subscriber (no component writes to IDB directly).
* Pure engine modules (`src/engine/*`) are unit-tested with Vitest; UI is smoke-tested with Playwright at phone viewport.
* CI: GitHub Actions builds a debug APK on every push and attaches it as an artifact.

## 9. v1 scope

**In:** everything in §4 except items listed under roadmap.
**Out / roadmap:** cloud sync (Drive/Firestore), Android *share-into-Portascribe* intent, home-screen quick-catch widget, collaborative writing with friends, audio-to-MIDI hum capture, lyric-video export, Play Store signing/listing, iOS build.

## 10. Acceptance checklist (v1)

* [ ] Cold start < 2 s on mid-range Android; fully usable offline.
* [ ] Roll: typing, latch ghost ink, grease highlight, punch → strips on Table.
* [ ] Table: drag, snip, tape, shuffle, deal, → Bench.
* [ ] Bench: lines, takes, arrangement, chords, flow view, syllable gutter, boneyard flick, cadence.
* [ ] Wheel returns rhymes offline and associations online.
* [ ] Memo record/play/loop works in the APK (mic permission prompt).
* [ ] Export text / ChordPro / backup JSON; import backup.
* [ ] Back button closes overlays before leaving the app.
* [ ] Debug APK installs and launches.
