# Release Verification

This document records the current evidence that the Android study app is installable, complete enough for full-manual study, and not just a prototype.

## Repository And Build

- Repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local path: `C:\findjob_sixsigma_app`
- Latest verified commit when this document was created: `5facc71`
- Latest verified GitHub Actions run: `27917388255`
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

## Current Content Evidence

- 33 chapters are generated into app content.
- 449 aligned study pages are represented in the manifest.
- 174 reader sections are generated across the manual.
- 470 deduplicated PNG figure/table/formula assets are bundled.
- `manual.json`, `asset-manifest.json`, and all figure PNGs are present in both APK and AAB.
- Chapter 28 remains one section because its TOC-like headings are normal paragraphs, not reliable Word headings.

## Android Runtime QA

Verified on local emulator `SixSigmaQA` / `emulator-5554`.

- Chapter 1: first-screen render, tap-to-lookup, curated Six Sigma term lookup, save-to-vocabulary.
- Chapter 7: section anchors, phrase selection lookup, phrase save with `page: 61` and `sectionId: ch07-s02-major-process-components`.
- Chapter 21: source-TOC section anchors and figure presence.
- Chapter 26: 50 figure images, EN/ZH section titles, no broken images, no horizontal overflow, bounded word-token count while scrolling.
- Chapter 33: 25 figure images, EN/ZH switching, no broken images, no horizontal overflow, bounded word-token count.
- Native Android: service worker registration is skipped and CacheStorage is cleared to avoid stale APK upgrades.
- Vocabulary: persisted in localStorage under `six-sigma-study:vocab:v1`.

## Known Remaining Gaps

- The release key is local self-signed; final distribution/upload key policy is not decided.
- Physical-device long-press selection QA is still pending; WebView Selection API QA passes.
- Paragraph/sentence-level language switching is not fully implemented; current restoration is section/page/scroll based.
- Some chapters need curated section mapping where headings are normal paragraphs.
- Full source-page-by-source-page visual comparison for figures/tables is not complete.
- Some table images are intentionally preserved as images; selected tables can be converted to semantic tables later.
