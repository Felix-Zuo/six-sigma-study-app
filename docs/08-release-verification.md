# Release Verification

## Summary Matrix

| Area | Command / Evidence | Latest Expected Result | Residual Risk |
| --- | --- | --- | --- |
| Six Sigma content package | `npm run lint:content` | 33 chapters, 449 pages, catalog validation, dictionary uniqueness, image asset checks | Six Sigma-specific constants intentionally remain in this profile |
| Agent book import contract | `npm run lint:books` | validates request schema, generic book package shape, two catalog books, sample import package | converter automation is still future work |
| Public safety | `npm run audit:public` | tracked-file denylist and runtime JSON local-path scan pass | human rights review still required for new third-party books |
| Source coverage | `npm run qa:source-coverage` | source TOC, block page anchors, assets, sampled nonblank renders pass | exhaustive 557-page pixel comparison is out of scope |
| Multi-book UX | `npm run qa:multibook-ux` | study workbench, source jump, scroll lock, immersive mode, book-scoped vocab pass | real-device physical long-press QA remains separate |
| Target 3 product UX | `npm run qa:target3-product`; `npm run qa:notes`; `npm run qa:image-fidelity`; `npm run qa:sheet-gestures` | automatic opening, bottom navigation, independent pages, draggable sheets, favorites, Chinese image fidelity pass | CDP gestures are not a full physical-device matrix |
| Android key chapters | `npm run qa:android-key-chapters` | Chapters 1, 7, 26, and 33 render, lookup, align, and load images | WebView/CDP is not a full physical-device matrix |
| Release packaging | `npm run android:release-apk`; `npm run android:aab` | APK/AAB build with runtime packages and figure assets bundled | store upload-key policy is not finalized |

## Current Release Artifacts

This document records the current evidence that the Android study app is installable, complete enough for full-manual study, and not just a prototype.

## Repository And Build

- Repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local path: `C:\findjob_sixsigma_app`
- Latest local release validation pass when this document was updated: 2026-06-25 16:06 Asia/Shanghai
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
npm run qa:target3-product
npm run qa:notes
npm run qa:image-fidelity
npm run qa:sheet-gestures
npm run typecheck
npm run build
npm run android:release-apk
npm run android:aab
```

Android release APK runtime verification with WebView CDP forwarded to `127.0.0.1:9222`:

```powershell
node scripts\qa-language-toggle-cdp.mjs
npm run qa:android-key-chapters
node scripts\qa-vocab-export-cdp.mjs
node scripts\qa-notes-cdp.mjs
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
- 3954 offline dictionary entries are bundled: 94 curated course/term entries and 3860 ECDICT-derived learner entries.
- Dictionary generation covers 5582 of 5673 single-word manual forms; the remaining uncovered forms are mostly proper names, URL fragments, OCR/formatting artifacts, and unusual compound tokens.
- `manual.json`, `asset-manifest.json`, PWA shell files, hashed reader assets, and all figure PNGs are present in both APK and AAB.
- Targeted APK/AAB package checks found 917 APK zip entries and 925 AAB zip entries, including the full `manual.json`, 33 chapters, 449 pages, 3954 dictionary entries, and 470 figure PNGs.
- Chapter 28 remains one section because its TOC-like headings are normal paragraphs, not reliable Word headings.

## PWA Browser Offline QA

- `node scripts\qa-pwa-offline-cdp.mjs`: passed against Vite preview on `127.0.0.1:4175` and clean headless Chrome CDP on `127.0.0.1:9333`.
- Service worker cache: `six-sigma-study-v0.5.0`.
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
- Key chapter release APK QA: `npm run qa:android-key-chapters` passed on Chapters 1, 7, 26, and 33. It verified EN -> ZH -> EN position restoration, tap-to-lookup, no generic lookup fallback, no horizontal overflow, and all target chapter figure images loading without broken images. Chapter 33 specifically verified `left-to-right` opens the curated `left-to-right` phrase entry.
- Target 3 product QA: `npm run qa:target3-product` passed with automatic no-click opening, short bilingual opening copy, bottom navigation entries (`书库`, `单词`, `笔记`, `收藏`, `我的`), two-book home, dashboard metrics, English reader, Chinese reader with 2 preserved Chapter 1 images, draggable lookup sheet at about 52% and 92% height, body scroll lock, source return buttons, saved term/favorite `bookId`, and independent vocabulary/notes/favorites pages.
- Sheet gesture QA: `npm run qa:sheet-gestures` passed with the same draggable half/full sheet checks and scroll containment.
- Notes QA: `npm run qa:notes` passed with book-scoped note filtering, Chinese selection save/edit, source metadata, and 0 horizontal overflow.
- Image fidelity QA: `npm run qa:image-fidelity` passed for Chapters 1, 7, 26, and 33. English/Chinese image counts matched the expected chapter counts (2, 14, 50, and 25 respectively), every checked image loaded without broken assets, lookup opened in each chapter, and horizontal overflow stayed 0.
- Target 3 screenshots were captured under `qa/screenshots/target3-01-splash.png` through `target3-09-favorites.png`; public-safe copies are committed under `docs/assets/showcase/target3-*.png`.
- Dictionary lookup: Android WebView QA verified a clicked word after EN/ZH round trip used a real dictionary entry (`to`) rather than the generic fallback explanation.
- Dictionary coverage: browser CDP QA verified runtime `manual.json` contains ECDICT-derived learner entries, curated hits for `COPQ`, `DMADV`, `poka-yoke`, `5S`, and `Anderson-Darling`, and a real lookup sheet for `both` with phonetic text and 0 horizontal overflow. The current package inspection verified 3954 bundled dictionary entries.
- Full-manual validator: `npm run lint:content` now checks 33 chapters, pageCount 449, continuous chapter page ranges, manifest chapter paths, global duplicate section/block IDs, block page anchors, complete EN/ZH page coverage, image asset metadata consistency, unsafe asset paths, asset page bounds, and reader-style dictionary lookup key uniqueness.
- Source coverage validator: `npm run qa:source-coverage` passed with source PDF page count 557, manual page count 449, 9542 content blocks, 940 image blocks, 470 assets, 142 source TOC sections, 127 matched source section anchors, 15 explicitly allowed normal-paragraph source headings, and nonblank source-page renders for pages 9, 73, 396, 544, and 555.
- Current release package sizes after this validation pass: APK 37,836,140 bytes; AAB 35,619,526 bytes.
- Current release package inspection: APK 919 entries and AAB 927 entries; both include `content/catalog.json`, Six Sigma `manual.json`, Agent sample `manual.json`, and 470 figure PNG assets.

## Known Remaining Gaps

- The release key is local self-signed; final distribution/upload key policy is not decided.
- Physical-device long-press selection QA is still pending; WebView Selection API QA passes.
- Language restoration is accepted at section/block level across the full manual; exact sentence-level semantic pairing is not separately modeled.
- Some chapters need curated section mapping where headings are normal paragraphs; the source coverage validator now guards the current 15 allowed unmatched source headings.
- Exhaustive 557-page pixel comparison for figures/tables is not part of the normal gate; source-page render sampling and app figure checks are covered.
- Some table images are intentionally preserved as images; selected tables can be converted to semantic tables later.
- The local dictionary is manual-scoped rather than a full arbitrary English dictionary; remaining fallback tokens should be reviewed as proper names, OCR artifacts, URL fragments, or course-specific compounds.
- Saved notes currently render as a notes list; exact inline highlight rendering in the reading body is still pending.
