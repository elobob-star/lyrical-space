# Foolscap on iPhone

Foolscap is a web app wrapped by Capacitor, so the same code runs on iPhone. There are three ways to get it onto a phone;
they differ in what they cost and what you need.

| | What you need | Cost | Looks & feels like | Catches |
|---|---|---|---|---|
| **A. Web app** ("Add to Home Screen") | an iPhone, Safari | free | an app: its own icon, full screen, works offline | no haptics (Safari has no vibration API); data lives in that home-screen app only |
| **B. Sideload the real app** | the iPhone + a Mac or Windows PC | free (Apple ID) | the real native app | the free certificate **expires after 7 days** — you re-sign it (AltStore does this automatically while the PC is on) |
| **C. TestFlight / App Store** | an Apple Developer account | US$99 / year | the real native app, installed from TestFlight | needs the account and a few secrets (below) |

Nothing here needs a Mac of your own except the optional "build it yourself" route — GitHub's Mac runners do the building.

---

## A. The web app (free, works today — and your friends can use it too)

The web app is the same code in a browser tab that installs like an app. One link works for **iPhone and Android**, so
a friend only needs the link — nothing to download from an app store.

**Put it online once (about 3 minutes, free).** The repository is private, and GitHub Pages is not free for private
repositories, so use a host that is:

1. Sign up at **netlify.com** (free; "Sign up with GitHub" is easiest).
2. **Add new site → Import an existing project → GitHub →** pick `lyrical-space`, and choose the **main** branch.
   The settings come from `netlify.toml` (build `npm run build`, publish `dist`) — just press **Deploy**.
3. After a minute you get a link like `https://something.netlify.app`. Every merge to main updates it by itself.
   *(In Site configuration → Change site name you can make it `foolscap-yourname.netlify.app`.)*

*(Alternatives with the same two settings: Cloudflare Pages or Vercel. Or make the repository public and run the
"Publish the web app" workflow for GitHub Pages — but that puts the code in public view.)*

**Install it (each person, on their own phone):**
* **iPhone:** open the link in **Safari** → **Share** → **Add to Home Screen**.
* **Android:** open it in Chrome → ⋮ → **Install app** (or Add to Home screen).

Open it once while online and wait a few seconds: the dictionary is cached and from then on it works with no network.

**Good to know**
* Everyone's writing lives **only on their own phone** — a friend gets their own empty notebook, you never see theirs and they never see yours.
  There is no account and no sync.
* No haptic buzz on iPhone web apps (Safari has no vibration API); sounds start after the first tap and follow the silent switch; "keep screen on" needs iOS 16.4+.
* Storage is separate from Safari's own tabs and from the native app — use **Setup → BACKUP ALL** before deleting the icon.
  The backup file opens in every Foolscap (and the old Portascribe MK-I), so it also moves your notebook to a new phone.

## B. The real app, sideloaded for free

1. In GitHub: **Actions → Build iOS →** the latest run → download the artifact **foolscap-ios** → unzip → `Foolscap-unsigned.ipa`.
2. Install it with a re-signing tool using your normal Apple ID:
   * **AltStore** (altstore.io; Windows/Mac) — refreshes the app by itself every few days while the computer is on the same Wi-Fi, or
   * **Sideloadly** (sideloadly.io; Windows/Mac) — drag the IPA in, press Start. Re-do it every 7 days.
   * On the iPhone: **Settings → Privacy & Security → Developer Mode → on**, and trust your Apple ID under *General → VPN & Device Management*.
3. A free Apple ID is limited to 3 sideloaded apps at a time.

(`Foolscap-simulator.zip` in the same artifact is for the Xcode iOS Simulator on a Mac: `xcrun simctl install booted App.app`.)

## C. TestFlight (the proper way, US$99/year)

1. Join the **Apple Developer Program**, then in *App Store Connect* create an app with the bundle id **dev.foolscap.app**.
2. In the developer portal create an **Apple Distribution certificate** (export it as `.p12`) and an **App Store provisioning profile** for that bundle id.
3. In App Store Connect → *Users and Access → Integrations* create an **API key** (App Manager); note its Key ID and Issuer ID and download the `.p8`.
4. Add these repository secrets (*Settings → Secrets and variables → Actions*):
   `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64` (`base64 -i file`), `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the file's text).
5. **Actions → iOS → TestFlight → Run workflow.** The build arrives in TestFlight after Apple's processing; invite friends by e-mail or a public link.

> `ios-testflight.yml` follows Apple's documented flow but has **not been run** (it needs your account). If it fails, the log names the step — the usual culprits are a profile that does not match the bundle id, or a certificate without its private key.

## Build it on your own Mac

```bash
npm install
npm run ios:open        # builds the web app, syncs it into ios/, opens Xcode
```

In Xcode choose your **Team** under *Signing & Capabilities* and press Run (an iPhone on a cable, or a Simulator). Swift packages resolve by themselves.

---

## What was done for iPhone

* `ios/` — the Capacitor 8 project (Swift Package Manager, no CocoaPods). Bundle id `dev.foolscap.app` (same as Android), iOS 16.4+, portrait only.
* **Keyboard** — `@capacitor/keyboard` in `native` resize mode: the web view shrinks above the keyboard (like Android) so the machine keeps its shape; the "previous / next / done" bar is hidden; the page also follows iOS's visual-viewport slide.
* **Audio** — the audio session is `playAndRecord` with speaker output and *mix with others*: clicks, the metronome and hummed memos are heard with the ringer on silent, come out of the speaker, and your backing music keeps playing.
* **Microphone** — usage description in `Info.plist` for hold-to-hum; recordings are `audio/mp4` on iOS (WebKit has no webm recorder) and play back everywhere.
* **Screen on** — `@capacitor-community/keep-awake` (iOS web views have no Wake Lock API).
* **Safe areas** — `contentInset: never` + `env(safe-area-inset-*)`; the notch, Dynamic Island and home bar are respected.
* **No zoom on focus** — the viewport disables pinch/auto zoom (iOS otherwise zooms into text fields under 16 px).
* **Installable web app** — apple-touch-icon, manifest, and a service worker (`public/sw.js`) so the web version works offline.

## Honest status

This was built **without access to a Mac or an iPhone**. What *was* verified: the web code in Chromium (including the offline service worker), the Capacitor sync, and that the project files are well-formed. What is **not verified** until the *Build iOS* workflow turns green and someone holds a phone:

1. the Xcode build itself (the workflow logs will tell);
2. the notebook's ghost-ink behaviour with the iOS keyboard (autocorrect, the suggestion bar, the double-space-period shortcut);
3. keyboard resize / safe-area feel on a real device, haptics, the microphone prompt, and the share sheet for backups.

Please try these and report what feels off — they are all small, local fixes.
