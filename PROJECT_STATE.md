# Six Sigma Study App Project State

Last updated: 2026-06-22 04:52 Asia/Shanghai

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
- Latest validated implementation commit: `2d794f7 Sectionize generic chapters from source TOC`
- Local worktree: expected clean after the state-sync commit that contains this note
- Latest implementation GitHub Actions state: CI passed for `9a775a4` in run `27917184492`
- Current product state: React/Vite reader reading all 33 chapters from runtime `manual.json`, with source-TOC-guided section anchors, section-preserving language toggle, persisted reading position across app restart, viewport-bound English word tokenization, tap-to-lookup bottom sheet, curated terminology, phrase-selection UI hook, persistent local vocabulary book, table of contents, extracted DOCX figure/table image assets, PWA manifest/service worker for browser installs, native Android service-worker cleanup to avoid stale app caches, and locally signed release APK/AAB builds.

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
- Installed Android Emulator 36.6.11 and Android 36 Google APIs x86_64 system image.
- Created local AVD `SixSigmaQA` and installed the debug APK on `emulator-5554`.
- Added native Android back-button handling through `@capacitor/app` so open sheets close before the app exits.
- Reworked the sticky reader header so long chapter titles no longer clip the page rail.
- Added ignored Android release signing configuration via `android\keystore.properties`.
- Added `npm run android:release-apk` and `npm run android:aab`.
- Generated local signing keystore at `C:\findjob_sixsigma_secrets\sixsigma-release.jks`.
- Built release APK at `C:\findjob_sixsigma_app\android\app\build\outputs\apk\release\app-release.apk`.
- Built release AAB at `C:\findjob_sixsigma_app\android\app\build\outputs\bundle\release\app-release.aab`.
- Added localStorage-backed reader position persistence for language, chapter, section, and scroll offset.
- Added DOCX image extraction in body order for paragraph-level drawing relationships.
- Deduplicated English/Chinese DOCX media by content hash into app figure assets.
- Generated 470 PNG figure/table/formula assets under `apps\reader\public\content\assets\figures`.
- Generated `apps\reader\public\content\assets\asset-manifest.json`.
- Added `image` content blocks and per-chapter `assets` lists to generated content.
- Added image asset validation for safe paths, dimensions, existence, and chapter asset metadata.
- Added reader image rendering with responsive width and lazy loading.
- Added PWA figure pre-cache from `asset-manifest.json`.
- Disabled service-worker registration in native Android and added native CacheStorage cleanup so upgraded APKs do not keep stale PWA caches.
- Added viewport-bound English tokenization: English text renders as plain text outside the reading viewport and becomes clickable word buttons only near the current scroll position, preventing long chapters from accumulating thousands of mounted button elements.
- Added `scripts/extract_source_toc.py` to derive source table-of-contents section metadata from the local source PDF.
- Added `content/source/source_toc_sections.json` with 33 source chapters and 142 source TOC sections.
- Updated full-manual extraction so Chapters 2-33 use source-TOC-guided section anchors where matching Word headings exist.
- Regenerated app content with 174 total sections across 33 chapters; Chapter 28 intentionally remains one section because its TOC-like titles are normal paragraphs rather than reliable Word headings.

## Verification In Current Stage

- `npm run lint:content`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- Mobile browser check at `http://127.0.0.1:5188/`: passed for first-screen render, English word lookup, save-to-vocabulary, Chinese toggle, term notes, and semantic table rendering
- GitHub Actions CI for `28f1a39`: passed
- GitHub Actions CI for `0e4b823`: passed
- GitHub Actions CI for `45c0ebf`: passed
- GitHub Actions CI for `7f5c71c`: passed
- GitHub Actions CI for `64f6d9e`: passed
- GitHub Actions CI for `2212e9b`: passed
- GitHub Actions CI for `acc268a`: passed
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
- Android emulator QA:
  - `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`: passed
  - First-screen Chapter 1 render: passed
  - English tap-to-lookup for `Six Sigma`: passed
  - Save-to-vocabulary and app relaunch persistence: passed
  - Native Android back button closes lookup and TOC sheets before exiting: passed
  - Chapter 7 English/Chinese visual check: passed
  - Chapter 26 English/Chinese visual check: passed after sticky header fix
  - Chapter 33 English/Chinese visual check: passed
  - QA screenshots are local under `C:\findjob_sixsigma_app\qa\screenshots` and are not committed because PNG files are ignored.
- Release build verification:
  - `npm run android:release-apk`: passed
  - `npm run android:aab`: passed
  - `apksigner verify --print-certs android\app\build\outputs\apk\release\app-release.apk`: passed
  - `jarsigner -verify -certs android\app\build\outputs\bundle\release\app-release.aab`: verified with expected self-signed certificate warnings
  - Release APK install and launch on `emulator-5554`: passed
- Reading position restart QA:
  - Entered Chapter 7 Chinese page 59 in the release APK
  - Forced-stopped `com.findjob.sixsigmastudy`
  - Relaunched via launcher intent
  - App restored Chapter 7 Chinese page 59: passed
- Figure asset verification:
  - `npm run extract:manual`: passed with 33 chapters, 4759 English blocks, 4990 Chinese blocks
  - Generated content contains 470 unique asset references and 940 bilingual image blocks
  - Figure asset package size: 33,217,038 bytes
  - `npm run lint:content`: passed with image asset existence/dimension checks
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - HTTP checks returned 200 for `content/assets/asset-manifest.json` and sample figure assets from Chapters 1, 7, 26, and 33
  - `npm run android:release-apk`: passed after sequential build
  - `npm run android:aab`: passed after sequential build
  - APK size: 37,300,231 bytes
  - AAB size: 35,083,385 bytes
  - APK content check: 470 figure PNG files, `assets/public/content/assets/asset-manifest.json`, and `assets/public/content/manual.json` are present
  - AAB content check: 470 figure PNG files, `base/assets/public/content/assets/asset-manifest.json`, and `base/assets/public/content/manual.json` are present
  - `apksigner verify --print-certs android\app\build\outputs\apk\release\app-release.apk`: passed
  - `jarsigner -verify -certs android\app\build\outputs\bundle\release\app-release.aab`: verified with expected self-signed certificate warnings
  - Android WebView DOM QA after force-stop/relaunch:
    - native platform detection returned `android`
    - service worker registrations: 0
    - CacheStorage keys: empty
    - Chapter 7: 14 image elements, loaded visible figures, no broken images, no horizontal overflow
    - Chapter 26: 50 image elements, loaded visible figures, no broken images, no horizontal overflow
    - Chapter 33: 25 image elements, first figures load, no broken images, no horizontal overflow
  - Android screenshots are local under `C:\findjob_sixsigma_app\qa\screenshots` and are ignored by Git.
- Long-chapter performance verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed after fixing local `android\local.properties` with `sdk.dir=C\:\\android-sdk`
  - Release APK install and relaunch on `emulator-5554`: passed
  - Android WebView DOM QA for Chapter 26:
    - native platform detection returned `android`
    - service worker registrations: 0
    - CacheStorage keys: empty
    - 50 figure images, no broken images, no horizontal overflow
    - top/middle/bottom scroll sampling kept mounted `.wordToken` elements bounded at about 189-346 instead of accumulating across the whole chapter
    - tap-to-lookup opened the bottom sheet and save-to-vocabulary persisted to `six-sigma-study:vocab:v1`
  - Android WebView DOM QA for Chapter 33:
    - 25 figure images, no broken images, no horizontal overflow
    - mounted `.wordToken` elements remained about 263 near the current viewport
    - Chinese toggle changed the same chapter to Chinese text with 0 English word buttons; switching back restored English click targets
  - `npm run android:aab`: passed
  - APK size: 37,300,435 bytes
  - AAB size: 35,083,577 bytes
  - APK content check: 470 figure PNG files, `assets/public/content/assets/asset-manifest.json`, and `assets/public/content/manual.json` are present
  - AAB content check: 470 figure PNG files, `base/assets/public/content/assets/asset-manifest.json`, and `base/assets/public/content/manual.json` are present
  - `apksigner verify --print-certs android\app\build\outputs\apk\release\app-release.apk`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - `jarsigner -verify android\app\build\outputs\bundle\release\app-release.aab`: verified with expected self-signed certificate warnings
  - `npm run lint:content`: passed
- Source-TOC sectionization verification:
  - `scripts/extract_source_toc.py`: passed with 33 source chapters and 142 source sections
  - `npm run extract:manual`: passed with 33 chapters, 4640 English blocks, and 4902 Chinese blocks
  - `npm run lint:content`: passed with 174 generated sections across the manual
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - Android release APK WebView QA:
    - Chapter 7: 6 sections, 14 figures, no broken images, no horizontal overflow
    - Chapter 21: 5 sections, 1 figure, no broken images, no horizontal overflow
    - Chapter 26: 4 sections, 50 figures, no broken images, no horizontal overflow; English and Chinese section titles verified
    - Chapter 33: 5 sections, 25 figures, no broken images, no horizontal overflow
    - Ch26 language toggle verified: Chinese mode has 0 `.wordToken` buttons; English mode restores viewport-bound word buttons
  - `npm run android:release-apk`: passed
  - `npm run android:aab`: passed
  - APK size: 37,317,623 bytes
  - AAB size: 35,100,761 bytes
  - APK content check: 470 figure PNG files, `assets/public/content/assets/asset-manifest.json`, and `assets/public/content/manual.json` are present
  - AAB content check: 470 figure PNG files, `base/assets/public/content/assets/asset-manifest.json`, and `base/assets/public/content/manual.json` are present
  - `apksigner verify --print-certs android\app\build\outputs\apk\release\app-release.apk`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - `jarsigner -verify android\app\build\outputs\bundle\release\app-release.aab`: verified with expected self-signed certificate warnings

## Known Limitations

- The release signing key is a local self-signed key for this project; store upload key policy and distribution channel are not finalized.
- Chapters 2-33 now use source-TOC-guided section anchors where reliable Word headings exist, but chapters whose section titles are normal paragraphs need curated manual mapping before further splitting.
- Language position preservation is section-level, not sentence-level.
- Phrase lookup UI exists through text selection, but still needs real touch-device QA.
- English tables in Chapter 1 are partly represented as Word paragraph fragments; Chinese tables render as semantic tables.
- Long chapters now use viewport-bound English tokenization; deeper low-end-device profiling is still pending.
- Detailed paragraph-level anchors still need refinement beyond current section-level restoration.
- Figure assets now preserve DOCX-embedded originals, but full source-page-by-source-page visual comparison is not complete.
- Some extracted table images are intentionally rendered as images; later passes can convert selected tables to semantic tables where fidelity allows.

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

Improve curated manual section mapping for normal-paragraph titles, phrase-selection QA, low-end-device performance profiling, and full-source visual comparison for extracted figures/tables.

## Constraints

- Do not commit raw PDF, DOCX, or full-page rendered PNG assets unless explicitly approved.
- Keep processed app content structured and small enough for GitHub.
- Update this state file after each major implementation or verification stage.
- If the same blocker repeats three times, record the failed attempts and the exact user action needed.
