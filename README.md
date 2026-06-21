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

This repo contains product planning, app scaffolding, content schema, and pipeline scripts.

It intentionally does **not** commit the full manual DOCX/PDF/PNG assets. Those files stay local and are transformed into generated content packages.

## Local Start

```powershell
cd C:\findjob_sixsigma_app
npm install
npm run extract:manual
npm run lint:content
npm run build
npm run dev
```

`npm run extract:manual` expects local aligned DOCX copies at:

- `C:\findjob_sixsigma_sources\manual_en_aligned.docx`
- `C:\findjob_sixsigma_sources\manual_zh_aligned.docx`

The script generates structured content for all 33 chapters into `content/processed`, then copies the full manual package into `apps/reader/public/content/manual.json` for runtime loading.

## Key Folders

- `apps/reader`: mobile reader PWA prototype
- `content/schemas`: app content contracts
- `content/processed/chapters/ch01.json`: generated real Chapter 1 bilingual content
- `content/processed/manual.json`: generated full-manual bilingual content package
- `content/processed/dictionary/six-sigma-terms.json`: curated local terminology seed
- `content/processed/manual.sample.json`: small legacy sample lesson for UI development
- `scripts`: validation and extraction tools
- `docs`: PRD, architecture, roadmap, research, and ADRs

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

This debug APK is unsigned for release distribution. A release APK/AAB needs a signing key before it is suitable for sharing outside local testing.

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
