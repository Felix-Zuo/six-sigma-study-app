# Release Verification

This document records the current evidence that the Android study app is installable, complete enough for full-manual study, and not just a prototype.

## Repository And Build

- Repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local path: `C:\findjob_sixsigma_app`
- Latest verified implementation commit when this document was updated: `7f5d2ec`
- Latest verified implementation GitHub Actions run: `27919872550`
- Release APK: `C:\findjob_sixsigma_app\android\app\build\outputs\apk\release\app-release.apk`
- Release AAB: `C:\findjob_sixsigma_app\android\app\build\outputs\bundle\release\app-release.aab`

## Required Local Inputs

These stay outside Git:

- `C:\findjob_sixsigma_sources\manual_en_aligned.docx`
- `C:\findjob_sixsigma_sources\manual_zh_aligned.docx`
- `C:\findjob_sixsigma_sources\source_manual.pdf`
- `C:\findjob_sixsigma_secrets\sixsigma-release.jks`
- `C:\findjob_sixsigma_app\android\keystore.properties`

## Verification Commands

Run from `C:\findjob_sixsigma_app`:

```powershell
npm run extract:manual
npm run lint:content
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

## Current Content Evidence

- 33 chapters are generated into app content.
- 449 aligned study pages are represented in the manifest.
- 174 reader sections are generated across the manual.
- 470 deduplicated PNG figure/table/formula assets are bundled.
- 69 offline dictionary entries are bundled, covering high-frequency Six Sigma, statistics, Minitab/chart, lean, software-command, and basic study words.
- `manual.json`, `asset-manifest.json`, PWA shell files, hashed reader assets, and all figure PNGs are present in both APK and AAB.
- Targeted APK/AAB package checks count 479 public runtime entries for the reader shell, manifest, service worker, manual, asset manifest, and figures.
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
- Reader comfort controls: dark mode and standard/large/extra-large font sizes persist across app relaunch under `six-sigma-study:reader-preferences:v1`.
- Extra-large dark-mode WebView QA: Chapters 1, 7, 26, and 33 had 0 horizontal overflow and 0 visible broken images across sampled scroll positions.
- Table-of-contents search: local offline search matches English/Chinese chapter and section titles, chapter numbers, and page numbers; verified `Minitab`, `439`, and `价值流图` queries in Android WebView.
- Native Android: service worker registration is skipped and CacheStorage is cleared to avoid stale APK upgrades.
- Vocabulary: persisted in localStorage under `six-sigma-study:vocab:v1`; old vocabulary records migrate to include `reviewCount`, `correctStreak`, and `nextReviewAt`.
- Vocabulary review: Android WebView QA verified adding a term from lookup, due-count display, due/all filters, `认识` scheduling, `再记` scheduling, and 0 horizontal overflow in the vocabulary panel.
- Vocabulary export: Android WebView QA verified CSV export with header, review fields, source text, quote/comma escaping, clipboard fallback, and 0 horizontal overflow.
- Study notes: Android WebView QA verified selected Chinese text can be saved with language/page/section metadata, edited in the notes panel, and rendered with 0 horizontal overflow.
- Dictionary lookup: Android WebView QA verified a clicked word after EN/ZH round trip used a real dictionary entry (`to`) rather than the generic fallback explanation.
- Full-manual validator: `npm run lint:content` now checks 33 chapters, pageCount 449, continuous chapter page ranges, manifest chapter paths, global duplicate section/block IDs, image asset metadata consistency, unsafe asset paths, asset page bounds, and reader-style dictionary lookup key uniqueness.

## Known Remaining Gaps

- The release key is local self-signed; final distribution/upload key policy is not decided.
- Physical-device long-press selection QA is still pending; WebView Selection API QA passes.
- Block-aware language restoration is implemented and Android WebView verified; sentence-exact restoration across every extracted paragraph remains a future refinement.
- Some chapters need curated section mapping where headings are normal paragraphs.
- Full source-page-by-source-page visual comparison for figures/tables is not complete.
- Some table images are intentionally preserved as images; selected tables can be converted to semantic tables later.
- The local dictionary is a curated study seed, not a full general English learner dictionary yet.
- Saved notes currently render as a notes list; exact inline highlight rendering in the reading body is still pending.
