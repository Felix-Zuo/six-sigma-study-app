# Six Sigma Study App

Private product repository for a mobile-first bilingual reader for the Six Sigma Black Belt training manual.

The goal is not to make a static PDF viewer. The app should turn the manual into a structured study product:

- switch Chinese and English with one always-available button
- keep page, chapter, paragraph, and figure alignment between languages
- tap any English word to open a half-screen explanation sheet
- support phrases and Six Sigma terms, not only isolated words
- save words or phrases into a local vocabulary book
- preserve original figures, tables, and chart images where structured rebuilding would reduce fidelity

## Current Decision

Use a PWA-first reader runtime wrapped with Capacitor for native Android packaging.

Why:

- The reader needs clickable inline text; web DOM spans make this easier and more precise than native text layout.
- The first usable product can run through a browser during development and the same codebase now builds a local Android debug APK.
- Capacitor keeps the Android packaging path close to the web reader while preserving a future route to iOS/TestFlight.
- Manual data can stay local-first, with optional sync added later.

## Repository Scope

This repo contains product planning, app scaffolding, content schema, pipeline scripts, generated app content, and the Capacitor Android shell.

It intentionally does **not** commit the full manual DOCX/PDF/PNG assets. Those files stay local and are transformed into generated content packages.

## Current Product State

- Android-first app: release APK and AAB build locally.
- Full manual: all 33 chapters, 449 aligned study pages, 174 generated reader sections.
- Offline runtime package: `manual.json`, 3954-entry offline learner dictionary, local vocabulary store, PWA install cache, and 470 bundled figure/table/formula PNG assets.
- Reader interactions: EN/ZH toggle with block-aware position restoration, table-of-contents search, persisted dark mode and font size controls, tap-to-lookup, phrase selection lookup, bottom-sheet explanations, local vocabulary save/status, due-based vocabulary review, vocabulary CSV export, and selected-text study notes.
- Page anchors: every generated content block carries a page anchor, and both English and Chinese content streams cover pages 6-449.
- Long chapter handling: English word buttons are mounted only near the viewport to avoid huge DOMs.
- Latest local release validation pass at the time of this note: 2026-06-22 08:18 Asia/Shanghai.

See [Release Verification](docs/08-release-verification.md) for the current evidence matrix.

## Local Start

```powershell
cd C:\findjob_sixsigma_app
npm install
npm run extract:manual
npm run lint:content
npm run qa:source-coverage
npm run build
npm run dev
```

`npm run extract:manual` expects local aligned DOCX copies at:

- `C:\findjob_sixsigma_sources\manual_en_aligned.docx`
- `C:\findjob_sixsigma_sources\manual_zh_aligned.docx`
- `C:\findjob_sixsigma_sources\ecdict.csv` for the ECDICT-derived offline learner dictionary subset

The script generates structured content for all 33 chapters into `content/processed`, then copies the full manual package into `apps/reader/public/content/manual.json` for runtime loading. It also extracts DOCX-embedded figures and table screenshots, deduplicates them by content hash, and writes the app assets under `apps/reader/public/content/assets/`.

For source-TOC-guided section anchors, the local source PDF is copied to:

- `C:\findjob_sixsigma_sources\source_manual.pdf`

The derived metadata committed to the repo is `content/source/source_toc_sections.json`; the original PDF is not committed.

`npm run qa:source-coverage` validates the local source PDF, source TOC anchors, generated block-level page coverage, 470 app assets, and sampled nonblank Poppler renders. The preferred Poppler runtime is copied to the pure-English path `C:\findjob_sixsigma_tools\poppler\Library\bin` to avoid Unicode path issues in older Poppler wrappers.

Current generated figure package:

- 470 PNG assets
- about 31.7 MB before APK compression
- bundled into both release APK and release AAB

## Key Folders

- `apps/reader`: mobile reader PWA prototype
- `content/schemas`: app content contracts
- `content/processed/chapters/ch01.json`: generated real Chapter 1 bilingual content
- `content/processed/manual.json`: generated full-manual bilingual content package
- `content/processed/dictionary/six-sigma-terms.json`: curated Six Sigma terms plus manual-scoped ECDICT learner dictionary subset
- `content/processed/manual.sample.json`: small legacy sample lesson for UI development
- `apps/reader/public/content/assets`: generated offline figure assets used by the app
- `scripts`: validation and extraction tools
- `docs`: PRD, architecture, roadmap, research, and ADRs

Android WebView key chapter QA expects a running release APK with WebView DevTools forwarded to `127.0.0.1:9222`:

```powershell
npm run qa:android-key-chapters
```

## Android Build

Local Android SDK path used for the first debug build:

```powershell
$env:ANDROID_HOME = "C:\android-sdk"
$env:ANDROID_SDK_ROOT = "C:\android-sdk"
$env:PATH = "C:\android-sdk\platform-tools;C:\android-sdk\cmdline-tools\latest\bin;$env:PATH"
npm run android:apk
```

Debug APK output:

```text
C:\findjob_sixsigma_app\android\app\build\outputs\apk\debug\app-debug.apk
```

This debug APK is for local testing.

Release APK/AAB builds use `android\keystore.properties`, which is ignored by Git. Start from `android\keystore.properties.example`, keep the actual keystore outside the repo, then run:

```powershell
npm run android:release-apk
npm run android:aab
```

Release outputs:

```text
C:\findjob_sixsigma_app\android\app\build\outputs\apk\release\app-release.apk
C:\findjob_sixsigma_app\android\app\build\outputs\bundle\release\app-release.aab
```

Build APK and AAB sequentially. Running both Android release scripts in parallel can make Vite compete over the same `apps\reader\dist` directory.

Current release package checks verify that both APK and AAB contain:

- `index.html`, `manifest.webmanifest`, and `sw.js`
- Vite hashed JS/CSS reader shell assets
- `content/manual.json`
- `content/assets/asset-manifest.json`
- 470 figure PNG files

The local signing certificate SHA-256 currently used for release builds is:

```text
126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba
```

## Android Emulator QA

The local QA emulator is named `SixSigmaQA`:

```powershell
$env:ANDROID_HOME = "C:\android-sdk"
$env:ANDROID_SDK_ROOT = "C:\android-sdk"
$env:PATH = "C:\android-sdk\emulator;C:\android-sdk\platform-tools;C:\android-sdk\cmdline-tools\latest\bin;$env:PATH"
emulator -avd SixSigmaQA -no-window -gpu swiftshader_indirect -no-audio -no-boot-anim -no-snapshot
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell monkey -p com.findjob.sixsigmastudy -c android.intent.category.LAUNCHER 1
```

Primary Android QA coverage currently focuses on Chapters 1, 7, 21, 26, and 33. Chapter 7 is used for section and phrase-selection checks; Chapters 26 and 33 are used for long, image-heavy chapter checks.

After launching the release APK and forwarding the app WebView CDP socket to `127.0.0.1:9222`, run these targeted Android QA checks:

```powershell
node scripts\qa-language-toggle-cdp.mjs
npm run qa:android-key-chapters
```

## PWA Offline QA

With the production build served by `vite preview` on `127.0.0.1:4175` and a clean Chrome instance exposed through CDP on `127.0.0.1:9333`, run:

```powershell
node scripts\qa-pwa-offline-cdp.mjs
```

The current passing run verified service-worker control, 479 cached runtime entries including 470 figures, offline reload rendering, 23 Chapter 1 sections, and 0 horizontal overflow.

## Dictionary QA

The committed learner dictionary is generated from curated course terms plus an ECDICT subset scoped to words that appear in this manual.

```powershell
npm run build:dictionary
node scripts\qa-dictionary-cdp.mjs
```

The current package contains 3954 runtime dictionary entries, including 3860 ECDICT-derived entries. The passing dictionary QA verified real lookup UI for `both` and curated hits for terms such as `COPQ`, `DMADV`, `poka-yoke`, `5S`, and `Anderson-Darling`; Android key chapter QA also verifies the curated `left-to-right` phrase entry.
