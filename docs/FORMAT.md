# Foolscap files

Everything Foolscap holds can live outside the app, as plain files, so the writing outlives any one install or any one
version of the interface. This page is the contract: anything that reads these files can pick up where Foolscap left off.

## The folder

Setup › LIBRARY › **CHOOSE A FOLDER** (Android app, or a browser that can open folders such as Chrome). If the folder you
pick isn't already a Foolscap folder and isn't empty, a `Foolscap/` folder is made inside it.

```
Foolscap/
  foolscap-library.json            everything — the file the app reads back
  README.txt
  Copies/foolscap-library-YYYY-MM-DD.json   one copy per day, the newest 14 kept
  Notebook/p0001 YYYY-MM-DD.txt    each notebook page, struck-out words left out
  Songs/<title>.txt                each song, chords above the lines
  Shoebox.txt                      every scrap, one per line
  Memos/<memo id>.webm|m4a|ogg|wav voice memos
```

- The folder is brought up to date a few seconds after every change (and when the app goes to the background).
  Only files whose content changed are written. Text files for a renamed song or a burnt page are removed — only ever
  files the app wrote itself.
- When the app starts with a folder linked, or when a folder is chosen, it first **picks up** what is in the folder:
  every song and page is matched by `id`, and the one with the newer `updatedAt` wins; scraps are matched by `id`.
  So two installs (or two versions of the app) can share one folder, and choosing the same folder twice never doubles
  anything. On a fresh install the sample tape and welcome page simply make way.
- If `foolscap-library.json` can't be read, the newest file in `Copies/` is used instead.
- Where a folder isn't possible (Safari on iPhone), **SAVE A COPY** writes the same JSON (with voice memos inlined, see
  below) through the share sheet, and **OPEN A COPY…** reads one back. The app nudges at most once a week when nothing
  outside it holds the latest work.

## foolscap-library.json

One JSON object. Unknown fields must be kept by anything that rewrites the file.

| field | |
|---|---|
| `app` | always `"portascribe"` (the original name — kept so copies open in every build) |
| `format` | `"foolscap-library"` |
| `schema` | `4` |
| `appVersion` | the app version that wrote it, e.g. `"0.5.1"` |
| `savedAt` | ISO time |
| `songs` | `Song[]`, including songs in the Bin (`deletedAt` set) |
| `pages` | `Page[]` — the notebook, ascending page numbers |
| `scraps` | `Scrap[]` — the shoebox |
| `settings` | the Setup switches |
| `blobs` | only in a saved copy: `{ [memoId]: "data:<mime>;base64,…" }` |

Times are milliseconds since 1970. Ids are short random strings. Text offsets count UTF-16 code units, as JavaScript does.

**Page** — `{ id, n, createdAt, updatedAt, text, marks: Mark[], spark?, fromSong? }`.
`text` is everything typed, including struck-out words. `n` is the page number shown on the page.

**Mark** — `{ id, s, e, kind: "ghost" | "pencil", punched? }`, a range `[s, e)` of the page text.
`ghost` = struck through (still in `text`); `pencil` = marked with the pen; `punched` = already sent to the shoebox.

**Song** — `{ id, title, ink, createdAt, updatedAt, deletedAt?, bpm, key, capo, tuning, sections, arrangement, table, memos, roll }`.
- `sections`: `{ id, kind, name?, take, takes: Take[], cadence? }` — `kind` is one of verse, pre, chorus, bridge, hook,
  intro, outro, tag; `take` is the index of the take in use.
- `Take`: `{ id, lines: Line[] }`; `Line`: `{ id, text, chords: { at, name }[], meter? }` — a chord sits over character `at`.
- `arrangement`: `{ id, sectionId }[]`, the order the sections are played in (a section may appear more than once).
- `table`: the strips on the Table — `{ id, text, x, y, rot, z, from, joints? }`; `x`/`y` are fractions of the mat
  (they may be a little below 0 or above 1: paper can hang off the edge), `joints` are text offsets where two strips were taped.
- `memos`: `{ id, sectionId?, label, durMs, peaks, mime, createdAt }` — the audio is `Memos/<id>.<ext>` in the folder,
  or `blobs[id]` in a saved copy.
- `roll`: the per-song freewrite of the first build (MK-I); new writing lives in `pages`.

**Scrap** — `{ id, text, from: "catch" | "cut" | "table" | "roll", createdAt, songId?, page?, used }`.
