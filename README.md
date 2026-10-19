# FOOLSCAP

The notebook-first successor to Portascribe MK-I (it installs as its own app, `dev.foolscap.app`, so both can sit side by side; use BACKUP ALL → RESTORE to carry writing across, either way). A lyric notepad that behaves like a piece of studio hardware — a matte, Teenage-Engineering-style machine
wrapped around warm, imperfect paper. Built to beat perfectionism, not to write for you.

| Dial | Surface | Keys | Borrowed from |
|---|---|---|---|
| **NOTEBOOK** | a yellow legal pad of dated pages that belongs to no song — the app opens here | LATCH · PEN · DRAW · PUNCH · SPRINT | Dylan / Waits: just ramble. A fresh page after a break, old pages a flip back. The word you're typing erases; once you hit space, backspace strikes it through. UNDO when you want it. LATCH = forward only. PEN taps the gems, PUNCH files them into the shoebox. |
| **TABLE** | a cutting mat with paper strips | SLIP · DEAL · SNIP · CUT-UP · SHUFFLE · SWEEP | Bowie / Burroughs / Waits: hold a strip (or pick up the scissors) and let go where the guide says to cut, slash across the mat to cut several, drop one on another's edge to tape, deal scraps from the shoebox, cut everything up. |
| **BENCH** | ruled index cards | WORDS · CHORDS · LENS · SHOEBOX · STAND | Cohen / Nick Drake: sections and takes, chord stamps, rhyme & meter lenses, hold-to-hum per card, tuning/capo/tempo, a scratch tape, and a music stand that scrolls at tempo. |

**⏏ TAPES** opens the rack: cassette J-cards, the **Shoebox** (one pile for every stray line), the bin, tape history,
**PASTE IN** (plain lyrics, chords-over-lyrics or ChordPro). **SETUP** is the gear at the end of the LCD — one tap from anywhere. The **CATCH** slip on the right edge files a
line into the shoebox while you're working on a song. The **LCD** is the machine's only voice — tap it to UNDO or follow a hint.

Offline-first, no accounts, **no API keys**, no AI. Rhymes, syllables and stress come from a bundled CMU dictionary;
Datamuse and the Free Dictionary API are optional extras.

Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Stack

Vite + TypeScript + Preact (signals, immer) → plain CSS/SVG UI → **Capacitor 8** → Android APK.
The same build runs as a web page / PWA.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 — use a phone-sized viewport
npm test             # engine unit tests (vitest)
npm run build        # type-check + production bundle in dist/
```

Browser checks (need the dev server running; Chromium via Playwright):

```bash
node scripts/e2e/flows.mjs out/     # ~90 interactions across every surface
node scripts/e2e/undo.mjs out/      # undo everywhere, the page menu, the LCD gear
URL=http://127.0.0.1:4173/ node scripts/e2e/upgrade.mjs   # an older install's data opened by this build (vite preview)
node scripts/e2e/tour.mjs out/      # screenshots of every surface
node scripts/e2e/sheets.mjs out/    # screenshots of every sheet, light and dark
```

Regenerate the pronunciation data (only needed if you change `scripts/build-cmu.mjs`): `npm run cmu`.
Regenerate icons: edit `assets/*.svg`, then `npm run icons && npx capacitor-assets generate --android`.

## iPhone

Foolscap also runs on iPhone — as an installable **web app** (free, no Mac: Safari → Share → Add to Home Screen), as a
**sideloaded native app**, or through **TestFlight**. The `ios/` project is built on a Mac runner by
`.github/workflows/ios.yml`. Step by step, costs and caveats: [`docs/IOS.md`](docs/IOS.md).

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
Free Dictionary API · Space Grotesk, Courier Prime, Doto (SIL OFL).
