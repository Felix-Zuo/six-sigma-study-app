# Six Sigma Study App Project State

Last updated: 2026-06-22 02:34 Asia/Shanghai

## Objective

Build `six-sigma-study-app` into a complete, usable Android-first study app for the CSSC Six Sigma Black Belt manual.

The final product must support full-manual offline reading, position-preserving English/Chinese switching, tap-to-lookup word explanations, phrase lookup, Six Sigma terminology explanations, and a persistent vocabulary book. PWA is acceptable as an intermediate delivery shape, but final acceptance requires a buildable Android APK or AAB.

## Authoritative Paths

- App repository: `C:\findjob_sixsigma_app`
- Private GitHub repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local source documents: `C:\Users\左雅轩\Desktop\Find Job\6ς`
- Chinese aligned manual: `C:\Users\左雅轩\Desktop\Find Job\6ς\六西格玛黑带认证培训手册_中文译注版_打印学习版.docx`
- English aligned manual: `C:\Users\左雅轩\Desktop\Find Job\6ς\Six_Sigma_Black_Belt_Training_Manual_English_Reference_Page_Aligned.docx`

## Current Evidence

- Branch: `main`
- Latest validated implementation commit: `45c0ebf Add Capacitor Android debug build`
- Local worktree: expected clean after the state-sync commit that contains this note
- Latest known GitHub Actions state: CI passed for `45c0ebf`
- Current product state: React/Vite reader reading all 33 chapters from runtime `manual.json`, with section-preserving language toggle, tap-to-lookup bottom sheet, curated terminology, phrase-selection UI hook, persistent local vocabulary book, table of contents, PWA manifest/service worker base, and a Capacitor Android debug APK build.

## Completed In Current Stage

- Copied local aligned DOCX inputs to pure-English local processing paths:
  - `C:\findjob_sixsigma_sources\manual_en_aligned.docx`
  - `C:\findjob_sixsigma_sources\manual_zh_aligned.docx`
- Added `scripts/extract_chapter_content.py`.
- Generated `content/processed/chapters/ch01.json`:
  - 23 sections
  - 127 English blocks
  - 91 Chinese blocks
  - pages 6-13
- Generated `content/processed/dictionary/six-sigma-terms.json` with 16 curated terms.
- Connected the reader to generated Chapter 1 content.
- Added localStorage-backed vocabulary persistence.
- Added Chinese semantic table rendering and term-note sidebars.
- Added content validation for section-based lessons, dictionaries, manifests, and legacy samples.
- Added `scripts/extract_manual_content.py`.
- Generated full-manual content:
  - 33 chapters
  - 449 page manifest
  - 4288 English blocks
  - 4521 Chinese blocks
  - `content/processed/manual.json` and `apps/reader/public/content/manual.json`
- Added in-app table of contents and chapter switching.
- Moved full manual loading out of the JS bundle and into static `content/manual.json`.
- Added PWA manifest, SVG icon, and service worker base.
- Installed Android command-line tools to `C:\android-sdk`.
- Installed Android SDK platform-tools, Android 36 platform, and build-tools 36.0.0.
- Added Capacitor 8 Android project with app id `com.findjob.sixsigmastudy`.
- Built debug APK at `C:\findjob_sixsigma_app\android\app\build\outputs\apk\debug\app-debug.apk`.
- Confirmed the debug APK bundles `content/manual.json`, `manifest.webmanifest`, and `sw.js`.

## Verification In Current Stage

- `npm run lint:content`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- Mobile browser check at `http://127.0.0.1:5188/`: passed for first-screen render, English word lookup, save-to-vocabulary, Chinese toggle, term notes, and semantic table rendering
- GitHub Actions CI for `28f1a39`: passed
- GitHub Actions CI for `0e4b823`: passed
- GitHub Actions CI for `45c0ebf`: passed
- `npm run extract:manual`: passed
- `npm run lint:content`: passed for 33 chapter files plus `manual.json`
- `npm run typecheck`: passed
- `npm run build`: passed with main JS at about 203 KB, manual JSON served separately
- Browser check at `http://127.0.0.1:5188/`: Chapter 26 and Chapter 33 can be opened from table of contents; Chapter 33 Chinese toggle checked
- HTTP checks: `/manifest.webmanifest`, `/sw.js`, `/icons/icon.svg`, and `/content/manual.json` return 200
- `adb version`: passed from `C:\android-sdk\platform-tools\adb.exe`
- `npx cap sync android`: passed
- `android\gradlew.bat assembleDebug`: passed
- APK content check: `assets/public/content/manual.json`, `assets/public/manifest.webmanifest`, and `assets/public/sw.js` exist inside `app-debug.apk`

## Known Limitations

- The Android debug APK builds successfully, but release APK/AAB signing is not configured yet.
- Chapters 2-33 are connected as chapter-level sections; detailed subsection/page anchors still need refinement.
- Language position preservation is section-level for Chapter 1 and chapter-level for generic chapters, not sentence-level.
- Phrase lookup UI exists through text selection, but needs real touch-device QA.
- English tables in Chapter 1 are partly represented as Word paragraph fragments; Chinese tables render as semantic tables.
- Long chapters can render thousands of clickable English tokens; add virtualization or lazy tokenization before final mobile polish.
- No Android device or emulator is currently attached, so on-device install/runtime QA is still pending.

## Open GitHub Work Items

- #2 Implement reader position-preserving language toggle
- #6 Design full-manual conversion validator
- #7 Add PWA offline installation support

## Closed GitHub Work Items

- #1 Build Chapter 1 content extraction pipeline
- #3 Implement tap-to-lookup bottom sheet
- #4 Seed curated Six Sigma terminology dictionary
- #5 Persist vocabulary book locally

## Resume Protocol

After context compression or a new session, do this before making changes:

1. Read this file.
2. Run `git status --short` and `git log --oneline --decorate -5`.
3. Read `README.md`, `docs/03-content-pipeline.md`, `docs/04-data-model.md`, and the active GitHub issues.
4. Continue from the next action below instead of restarting the project from scratch.

## Next Action

Run on-device or emulator QA for the debug APK, then add release signing/AAB workflow and performance improvements for long chapters.

## Constraints

- Do not commit raw PDF, DOCX, or full-page rendered PNG assets unless explicitly approved.
- Keep processed app content structured and small enough for GitHub.
- Update this state file after each major implementation or verification stage.
- If the same blocker repeats three times, record the failed attempts and the exact user action needed.
