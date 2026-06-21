# Release Verification

This document records the current evidence that the Android study app is installable, complete enough for full-manual study, and not just a prototype.

## Repository And Build

- Repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local path: `C:\findjob_sixsigma_app`
- Latest verified implementation commit when this document was updated: `0a25113`
- Latest verified implementation GitHub Actions run: `27921587212`
- Release APK: `C:\findjob_sixsigma_app\android\app\build\outputs\apk\release\app-release.apk`
- Release AAB: `C:\findjob_sixsigma_app\android\app\build\outputs\bundle\release\app-release.aab`

## Required Local Inputs

These stay outside Git:

- `C:\findjob_sixsigma_sources\manual_en_aligned.docx`
- `C:\findjob_sixsigma_sources\manual_zh_aligned.docx`
- `C:\findjob_sixsigma_sources\source_manual.pdf`
- `C:\findjob_sixsigma_sources\ecdict.csv`
- `C:\findjob_sixsigma_secrets\sixsigma-release.jks`
- `C:\findjob_sixsigma_app\android\keystore.properties`

## Verification Commands

Run from `C:\findjob_sixsigma_app`:

```powershell
npm run extract:manual
npm run build:dictionary
npm run lint:content
npm run qa:source-coverage
npm run typecheck
npm run build
npm run android:release-apk
npm run android:aab
```

Package inspection:

```powershell
$tool = Get-ChildItem 'C:\android-sdk\build-tools' -Recurse -Filter apksigner.bat |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName
& $tool verify --print-certs 'android/app/build/outputs/apk/release/app-release.apk'
jarsigner -verify 'android/app/build/outputs/bundle/release/app-release.aab'
```

PWA offline browser verification:

```powershell
# Serve the production build on 127.0.0.1:4175 and expose a clean Chrome
# instance through CDP on 127.0.0.1:9333, then run:
node scripts\qa-pwa-offline-cdp.mjs
```

Dictionary browser verification:

```powershell
# Serve the production build on 127.0.0.1:4175 and expose a clean Chrome
# instance through CDP on 127.0.0.1:9333, then run:
node scripts\qa-dictionary-cdp.mjs
```

## Current Content Evidence

- 33 chapters are generated into app content.
- 449 aligned study pages are represented in the manifest.
- 174 reader sections are generated across the manual.
- 9542 generated content blocks carry page anchors; English and Chinese block coverage spans every page from 6 through 449.
- 470 deduplicated PNG figure/table/formula assets are bundled.
- 3952 offline dictionary entries are bundled: 92 curated course/term entries and 3860 ECDICT-derived learner entries.
- Dictionary generation covers 5582 of 5673 single-word manual forms; the remaining uncovered forms are mostly proper names, URL fragments, OCR/formatting artifacts, and unusual compound tokens.
- `manual.json`, `asset-manifest.json`, PWA shell files, hashed reader assets, and all figure PNGs are present in both APK and AAB.
- Targeted APK/AAB package checks count 481 public runtime entries for the reader shell, manifest, service worker, manual, asset manifest, and figures.
- Chapter 28 remains one section because its TOC-like headings are normal paragraphs, not reliable Word headings.

## PWA Browser Offline QA

- `node scripts\qa-pwa-offline-cdp.mjs`: passed against Vite preview on `127.0.0.1:4175` and clean headless Chrome CDP on `127.0.0.1:9333`.
- Service worker cache: `six-sigma-study-v0.4.0`.
- Online cache state: 479 entries, including `/`, `/index.html`, hashed JS/CSS shell assets, `content/manual.json`, `manifest.webmanifest`, and 470 figure assets.
- Offline reload state: CDP network offline, cache-ignored reload rendered `Chapter 1: What is Six Sigma?`, 23 sections, service-worker controller present, and horizontal overflow 0.

## Android Runtime QA

Verified on local emulator `SixSigmaQA` / `emulator-5554`.

- Chapter 1: first-screen render, tap-to-lookup, curated Six Sigma term lookup, save-to-vocabulary.
- Chapter 7: section anchors, phrase selection lookup, phrase save with `page: 61` and `sectionId: ch07-s02-major-process-components`.
- Chapter 21: source-TOC section anchors and figure presence.
- Chapter 26: 50 figure images, EN/ZH section titles, no broken images, no horizontal overflow, bounded word-token count while scrolling.
- Chapter 33: 25 figure images, EN/ZH switching, no broken images, no horizontal overflow, bounded word-token count.
- Language toggle: Chapter 26 page 325 Android WebView CDP QA verified English block index 120 stays on Chinese block index 120, then returns to nearby English block index 119 with 0 horizontal overflow and tap-to-lookup still opening the bottom sheet.
- Language toggle sweep: browser CDP QA sampled one comparable section/block in every chapter, verified EN -> ZH -> EN stays in the same section, block position remains within tolerance, and horizontal overflow stays 0 for all 33 samples.
- Reader comfort controls: dark mode and standard/large/extra-large font sizes persist across app relaunch under `six-sigma-study:reader-preferences:v1`.
- Extra-large dark-mode WebView QA: Chapters 1, 7, 26, and 33 had 0 horizontal overflow and 0 visible broken images across sampled scroll positions.
- Table-of-contents search: local offline search matches English/Chinese chapter and section titles, chapter numbers, and page numbers; verified `Minitab`, `439`, and `价值流图` queries in Android WebView.
- Native Android: service worker registration is skipped and CacheStorage is cleared to avoid stale APK upgrades.
- Vocabulary: persisted in localStorage under `six-sigma-study:vocab:v1`; old vocabulary records migrate to include `reviewCount`, `correctStreak`, and `nextReviewAt`.
- Vocabulary review: Android WebView QA verified adding a term from lookup, due-count display, due/all filters, `认识` scheduling, `再记` scheduling, and 0 horizontal overflow in the vocabulary panel.
- Vocabulary export: Android WebView QA verified CSV export with header, review fields, source text, quote/comma escaping, clipboard fallback, and 0 horizontal overflow.
- Study notes: Android WebView QA verified selected Chinese text can be saved with language/page/section metadata, edited in the notes panel, and rendered with 0 horizontal overflow.
- Dictionary lookup: Android WebView QA verified a clicked word after EN/ZH round trip used a real dictionary entry (`to`) rather than the generic fallback explanation.
- Dictionary coverage: browser CDP QA verified runtime `manual.json` contains 3952 entries, 3860 ECDICT-derived entries, curated hits for `COPQ`, `DMADV`, `poka-yoke`, `5S`, and `Anderson-Darling`, and a real lookup sheet for `both` with phonetic text and 0 horizontal overflow.
- Full-manual validator: `npm run lint:content` now checks 33 chapters, pageCount 449, continuous chapter page ranges, manifest chapter paths, global duplicate section/block IDs, block page anchors, complete EN/ZH page coverage, image asset metadata consistency, unsafe asset paths, asset page bounds, and reader-style dictionary lookup key uniqueness.
- Source coverage validator: `npm run qa:source-coverage` passed with source PDF page count 557, manual page count 449, 9542 content blocks, 940 image blocks, 470 assets, 142 source TOC sections, 127 matched source section anchors, 15 explicitly allowed normal-paragraph source headings, and nonblank source-page renders for pages 9, 73, 396, 544, and 555.
- Current release package sizes after this validation pass: APK 37,822,535 bytes; AAB 35,605,671 bytes.

## Known Remaining Gaps

- The release key is local self-signed; final distribution/upload key policy is not decided.
- Physical-device long-press selection QA is still pending; WebView Selection API QA passes.
- Language restoration is accepted at section/block level across the full manual; exact sentence-level semantic pairing is not separately modeled.
- Some chapters need curated section mapping where headings are normal paragraphs; the source coverage validator now guards the current 15 allowed unmatched source headings.
- Exhaustive 557-page pixel comparison for figures/tables is not part of the normal gate; source-page render sampling and app figure checks are covered.
- Some table images are intentionally preserved as images; selected tables can be converted to semantic tables later.
- The local dictionary is manual-scoped rather than a full arbitrary English dictionary; remaining fallback tokens should be reviewed as proper names, OCR artifacts, URL fragments, or course-specific compounds.
- Saved notes currently render as a notes list; exact inline highlight rendering in the reading body is still pending.
