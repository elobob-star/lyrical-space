# PORTASCRIBE // MK-I

A lyric notepad that behaves like a piece of studio hardware — a Teenage-Engineering-style
chassis wrapped around three very physical writing surfaces:

| Dial position | Surface | Technique it borrows |
|---|---|---|
| **ROLL** | spiral-bound tear-off pad | Kerouac / Dylan stream-of-consciousness freewriting. A **forward latch** turns backspace into *ghost ink*; a **grease pencil** harvests the gems; **PUNCH** sends them to the table. |
| **TABLE** | cork board of sticky notes | Bowie / Waits cut-ups. **Snip**, **tape**, **shuffle**, pull the **deal lever** for random fragments. |
| **BENCH** | ruled index cards | Cohen / Nick Drake structure. Verses & choruses, **takes**, **chord stamps**, **rhyme heat map**, syllable gutter, boneyard, cadence pad, loop recorder. |

Offline-first, no accounts, **no API keys**. Rhymes/syllables use a bundled CMU dictionary; Datamuse and the
Free Dictionary API are optional extras for associations and definitions.

Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Stack

Vite + TypeScript + Preact (signals, immer) → plain CSS/SVG UI → **Capacitor 8** → Android APK.
The same build also runs as a web page / PWA.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 — use a phone-sized viewport
npm test             # engine unit tests (vitest)
npm run build        # type-check + production bundle in dist/
```

Regenerate the pronunciation data (only needed if you change `scripts/build-cmu.mjs`): `npm run cmu`.
Regenerate icons: edit `assets/*.svg`, then `npm run icons && npx capacitor-assets generate --android`.

## Build the APK

Requirements: JDK 21 and the Android SDK (platform 36, build-tools 36). Set `ANDROID_HOME`.

```bash
npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone: copy the APK over and open it (allow "install unknown apps"), or `adb install -r app-debug.apk`.
A prebuilt debug APK lives in [`releases/`](releases/). GitHub Actions (`.github/workflows/android.yml`)
builds one on every push.

> The debug APK is signed with the standard Android debug key. For the Play Store you'll want your own
> release keystore (`./gradlew bundleRelease` with signing config) — not included on purpose.

## Credits

CMU Pronouncing Dictionary · SUBTLEX-US frequencies (via `subtlex-word-frequencies`) · Datamuse API ·
Free Dictionary API · Space Mono, Courier Prime, Special Elite, Caveat, Doto, Barlow Condensed (SIL OFL).
