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
| Target 4 product audit | `npm run qa:target4-flow` | opening, home, second book, settings, TOC, immersive mode, lookup half/full, exact source return, Chinese image fidelity, notes, favorites, and vocabulary pass | real-device physical long-press QA remains separate |
| Android key chapters | `npm run qa:android-key-chapters` | Chapters 1, 7, 26, and 33 render, lookup, align, and load images | WebView/CDP is not a full physical-device matrix |
| Lexical learning | `npm run qa:lexical-learning`; `npm run qa:lexical-ui` | structured senses, phonetics, context meanings, bilingual examples, native TTS bridge, and mobile layout pass | final voice quality depends on the device TTS voice |
| Maturity regressions | `npm run qa:maturity-regressions`; `npm run qa:motion-ui`; `npm run qa:motion-continuity` | per-book position isolation, due-only review, practice resume, safe reset, sheet boundaries/a11y, native/fallback motion paths, scrolled-card Reader continuity | CDP gestures do not replace a broad physical-device matrix |
| Public artifact isolation | `npm run qa:public-artifact`; `npm run qa:private-isolation` | normal web dist contains no private bank; Android sync cleans transient staging | local private source remains the user's responsibility |
| Context glossary | `npm run qa:context-glosses` | 3875 blocks, 8591 sentences, 105048 meanings, page 8/9 regressions pass | 383 low-confidence sentences intentionally expose no asserted word meaning |
| Release packaging | `npm run android:release-apk`; `npm run android:aab` | APK/AAB build with runtime packages and figure assets bundled | store upload-key policy is not finalized |

## Current Release Artifacts

This document records the current evidence that the Android study app is installable, complete enough for full-manual study, and not just a prototype.

## Repository And Build

- Repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local path: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app`
- Latest local release validation pass when this document was updated: 2026-07-13 Asia/Shanghai
- Release APK: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`
- Release AAB: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`

## Required Local Inputs

These stay outside Git:

- `D:\0A OpenClaw\projects\6sigma\sources\manual_en_aligned.docx`
- `D:\0A OpenClaw\projects\6sigma\sources\manual_zh_aligned.docx`
- `D:\0A OpenClaw\projects\6sigma\sources\source_manual.pdf`
- `D:\0A OpenClaw\projects\6sigma\sources\ecdict.csv`
- `D:\0A OpenClaw\projects\6sigma\secrets\sixsigma-release.jks`
- `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\keystore.properties`

## Verification Commands

Run from `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app`:

```powershell
npm run extract:manual
npm run build:dictionary
npm run lint:content
npm run qa:source-coverage
npm run qa:target3-product
npm run qa:notes
npm run qa:image-fidelity
npm run qa:sheet-gestures
npm run qa:target4-flow
npm run qa:learning-modules
npm run qa:lexical-ui
npm run qa:motion-ui
npm run qa:motion-continuity
npm run qa:maturity-regressions
npm run qa:public-artifact
npm run qa:dictionary-boundaries
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
$tool = Get-ChildItem 'D:\0A OpenClaw\projects\6sigma\tools\android-sdk\build-tools' -Recurse -Filter apksigner.bat |
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
- 8994 generated content blocks carry page anchors; English and Chinese block coverage spans every page from 6 through 449.
- 475 PNG figure/table/formula assets are bundled, including five reviewed source-PDF recovery crops.
- 3980 public offline dictionary entries are bundled: 94 curated course/term entries and 3886 ECDICT-derived learner entries.
- Local Android builds additionally stage a 3550-entry ECDICT supplement generated from the ignored private question bank; the supplement remains outside Git with the private bank.
- Dictionary generation covers 5592 of 5681 single-word manual/question forms; the remaining uncovered forms are mostly proper names, URL fragments, OCR/formatting artifacts, and unusual compound tokens.
- `manual.json`, `asset-manifest.json`, PWA shell files, hashed reader assets, and all figure PNGs are present in both APK and AAB.
- Current APK/AAB checks include the full `manual.json`, 33 chapters, 449 pages, 3980 public dictionary entries, 475 figure PNGs, and the ignored local private-question-bank plus supplemental-dictionary runtime assets.
- Chapter 28 remains one section because its TOC-like headings are normal paragraphs, not reliable Word headings.

## PWA Browser Offline QA

- `node scripts\qa-pwa-offline-cdp.mjs`: passed against Vite preview on `127.0.0.1:4175` and clean headless Chrome CDP on `127.0.0.1:9333`.
- Service worker cache: `six-sigma-study-v0.8.7`; content JSON uses network-first refresh with offline cache fallback.
- Online cache state includes `/`, `/index.html`, hashed JS/CSS shell assets, `content/manual.json`, `manifest.webmanifest`, and all 475 figure assets.
- Offline reload state: CDP network offline, cache-ignored reload rendered `Chapter 1: What is Six Sigma?`, 23 sections, service-worker controller present, and horizontal overflow 0.

## Android Runtime QA

Verified on local emulator `SixSigmaQA` / `emulator-5554`.

### Beta 0.8.7 Source-Aware Motion Continuity

- `npm run qa:motion-continuity`: a 390 x 844 library view was scrolled 502 CSS pixels before opening a compact book card. Shared paper/title elements remained continuous, the target Reader was prepared at its saved scroll anchor before snapshot, all nested Reader layers were collapsed into one camera plane, settlement retained the exact scroll position, and horizontal overflow remained zero.
- Intermediate frames at 90/240/430/680/900 ms were captured and inspected. The compact card recedes before the Reader hierarchy appears; the shared title remains the orientation cue; no unrelated folder layers, duplicate body text, black capture region, or post-transition jump is visible.
- `npm run qa:motion-ui`: folder extract, module page turn, folder close, Reader open, Reader close, and reduced-motion fallback remain covered after the source-specific choreography changes.
- The signed APK was installed and launched on `emulator-5554`. The live Android WebView was exposed through CDP; the scrolled-card continuity contract and all five spatial routes plus reduced-motion fallback passed against native `https://localhost/`, including transition names, destination preparation, settlement, cleanup, and zero overflow.
- The full regression pass exposed and fixed a vocabulary fast-entry race: the review entry now waits for the active dictionary and uses the aligned block translation before revealing the answer.
- Final APK: 40,729,625 bytes, SHA-256 `5D3DBF691734B7AEBA719B98650C6810C68BDE9F40DA47B3A02DB0BDAC4AA453`; APK Signature Scheme v2 verified with one signer; package metadata `807` / `0.8.7-beta`.
- Final AAB: 38,481,937 bytes, SHA-256 `166BB31968F0A7560E112DA57ADC38ABA2F64F1C9E10DA78D9C1867440F82C14`; JAR signature verification passed with expected self-signed/no-timestamp warnings.

### Beta 0.8.6 Cinematic Folder Motion

- `npm run qa:motion-ui`: all five source-aware paths passed: folder extract, module page turn, folder close, Reader book open, and Reader book close. The folder path exposed independent cover/tab/module pseudo-elements, used the touched side tab at `351px, 122px` as its origin, settled with zero running animations, and had zero horizontal overflow.
- Reduced-motion verification passed: opening animation timing stayed at or below 1 ms and route navigation used the direct fallback without View Transition animation.
- `npm run qa:maturity-regressions`: all 13 logic, persistence, accessibility, Reader, question, vocabulary, sheet, and navigation isolation scenarios passed after the animation changes.
- `npm run qa:target4-flow`, `npm run qa:learning-ui`, `npm run qa:lexical-ui`, and `npm run qa:ai-context-ui`: all product flows passed with centered compact metrics, working lookups, stable question sessions, and the expected `Beta 0.8.6` settings version.
- `npm run qa:image-fidelity`: Chapters 1/7/26/33 retained 2/14/50/25 images in both English and Chinese, with no broken images or horizontal overflow.
- Signed Android Release installed and launched on `emulator-5554` as `versionCode 806` / `versionName 0.8.6-beta`; the 1080 x 2148 home capture retained the complete folder composition and centered metrics.
- Final APK: 40,727,537 bytes, SHA-256 `6932FBB9A92497C334FBDB4ABEB78754D1CD0CDC3203E568841289A15FB63E0D`; APK Signature Scheme v2 verified with one signer.
- Final AAB: 38,479,855 bytes, SHA-256 `BD26F1586E1CB3A127B73576685CFE16F66C67037CAA3202C617055B7DE1E47F`; JAR signature verified with expected self-signed/no-timestamp warnings.
- Final public-artifact isolation passed after both release builds; ordinary web `dist` contained no private question-bank or supplemental-dictionary data.

### Beta 0.8.5 Five-Round Product Maturity Pass

- `npm run qa:maturity-regressions`: 13 isolated scenarios passed in production preview and Vite development/StrictMode, including cross-book position isolation, a post-load fetch-spy navigation audit, reload-stable wrong priority, reader focus/immersive continuity, one roving keyboard word-entry point with arrow-key lookup, reachable `1/1` daily completion, fixed question sessions and duplicate-submit lock, malformed-storage preservation/salvage through snapshot-difference persistence, absolute exam timeout with saved answers, full correction reset, storage-failure survival, modal focus/keyboard/breakpoint behavior, accessible Chinese navigation labels, and page-scroll isolation.
- `npm run qa:learning-ui`, `npm run qa:lexical-ui`, and `npm run qa:ai-context-ui`: answer reveal before explicit next, rich lexical data, correct contextual examples, question lookup return, and Beta 0.8.5 DeepSeek correction export all passed.
- `npm run qa:motion-ui`: native View Transitions completed with no running animations after settlement; reduced-motion used the no-transition fallback with durations at or below 1 ms and zero horizontal overflow.
- `npm run qa:image-fidelity`: Chapters 1/7/26/33 retained 2/14/50/25 EN and ZH images, with zero broken images and zero horizontal overflow.
- Native Android checks passed: Keystore save/restart/clear/restart and `qa:android-back-stack` for question session, Reader tools, immersive mode, and lookup sheet priority.
- Public artifact isolation passed after release build: normal `dist` contains no private bank or supplement; Android assets contain 1000 local questions plus 3550 private-question dictionary entries.
- Final APK: 40,725,849 bytes, SHA-256 `58B690342B0BABBD0751A16D5F29785BFC77B731DDDB95F6643CB1E98CADA5C9`; v2 signature verified with one signer; release install/launch verified as code/name `805` / `0.8.5-beta`.
- Final AAB: 38,478,174 bytes, SHA-256 `E0F721314E7119CBBBCF3DF6DF5BBCB79FF32C168373CD10EB504A6C2042C487`; JAR signature verified with expected self-signed/no-timestamp warnings.

### Beta 0.8.4 Product Maturity And Regression Hardening

- `npm run qa:maturity-regressions`: eight isolated CDP scenarios passed: p6/p4 cross-book restoration, due-only `1/1` vocabulary review, first-unanswered practice resume, one-second absolute exam timeout and automatic submission, persistent data reset, storage-failure resilience, keyboard sheet resizing, 759/760/800/859/860px sheet boundaries, accessible H1, and `aria-current` navigation.
- `npm run qa:motion-ui`: native navigation called `startViewTransition` once and exposed 14 live transition animations; reduced-motion opening completed in about 204ms with 0.001ms active animation timing and fallback navigation.
- `npm run qa:target4-flow`: all 13 key product views passed; notes and favorites screenshots have different SHA-256 hashes, fixing the previous false-positive evidence path.
- Final Android WebView run asserted Capacitor platform `android`. Chapters 1/7/26/33 retained 2/14/50/25 images in both languages, with zero broken images and zero horizontal overflow.
- `npm run qa:learning-ui` and `npm run qa:lexical-ui`: due count, answer-stage three-way memory grading, 1006-question local bank, question lookup, `scope` ordinary dictionary entry/context, bilingual examples, and native pronunciation passed.
- Public artifact isolation: normal `dist` scanned 493 entries with zero private violations. Android sync copied 1000 questions and 3550 supplemental terms into native assets, then removed transient private staging.
- Final APK: 40,722,541 bytes, SHA-256 `FA2AF476A967D4AFD10A88FE34EB3404B05ACBC840BF3384B55E0BFA43F52F53`; v2 signature verified with one signer; installed as code/name `804` / `0.8.4-beta`.
- Final AAB: 38,474,876 bytes, SHA-256 `A9922942D0D274E2E2B1FA6E3BC72D3254053108E0A2E53AEFB494B4EAF2CF37`; JAR signature verified with expected local self-signed/no-timestamp warnings.

### Beta 0.8.3 Quiet Aperture Frontend

- `npm run qa:target3-product` and `npm run qa:target4-flow`: passed with the new Home, Vocabulary, Practice, Notes, and Settings bottom navigation, two-book runtime, the layered home work page, EN/ZH reader, preserved Chinese figures, TOC, immersive mode, independent study pages, and zero horizontal overflow.
- `npm run qa:sheet-gestures`: passed at about 52% and 92% sheet heights with body lock and `overscroll: contain`.
- `npm run qa:learning-ui`, `npm run qa:lexical-ui`, and `npm run qa:ai-context-ui`: passed vocabulary recall, contextual examples, question lookup, answer flow, pronunciation metadata, accepted DeepSeek correction reuse/export, Beta 0.8.3 settings state, and secret exclusion.
- `npm run qa:image-fidelity`: passed Chapters 1, 7, 26, and 33 with matched EN/ZH counts 2, 14, 50, and 25, zero broken images, successful lookup, and zero horizontal overflow.
- Screenshot helpers wait 1250 ms before capture so the evidence records the settled layered state rather than an intentional transition frame.
- `npm run qa:motion-ui`: passed with native View Transition support, normal layered motion above 500 ms, reduced-motion animation durations at or below 1 ms, and zero horizontal overflow in both modes.
- Final APK: 40,716,973 bytes, SHA-256 `DC5945FB7045898304869E4E244D660BA78363C5DB35A8C21DAC2B394DD9D830`; v2 signature verified; version code/name `803` / `0.8.3-beta`; release install and launch passed on `SixSigmaQA`.
- Final AAB: 38,469,282 bytes, SHA-256 `C736593D129235C448A184CB3EEAC8BE5012EAD4F7E1924CAFAD2AD56E503051`; JAR signature verification passed.

### Beta 0.8.2 AI Context Correction

- `npm run qa:context-corrections`: passed strict format, source hash, accepted merge, provenance, API-key exclusion, and offline `revert` regression checks.
- `npm run qa:ai-context-ui`: passed at 390x844 with a mocked strict DeepSeek response: proposal phrase/meaning/sentence, user acceptance, exact reuse without a second request, accepted-only JSON export, Beta 0.8.2 settings state, and zero horizontal overflow.
- Android emulator Keystore cycle passed: save fake key, verify only ciphertext/IV in app-private preferences, restart and read configured state, clear, restart and read unconfigured state.
- DeepSeek live billing/API execution was intentionally not run because no user key is stored in the repository or test environment. The request contract was checked against the official V4 model, Thinking Mode, Tool Calls strict-mode, and Chat Completion documentation on 2026-07-12.
- Final APK: 40,712,065 bytes, SHA-256 `BC41B21A46D211BCE4BC4AAB32D8F421B4163E9DD4D1F11AEACF0E9A2D261A26`; v2 signature verified; version code/name `802` / `0.8.2-beta`; Release install and launch passed on `SixSigmaQA`.
- Final AAB: 38,464,391 bytes, SHA-256 `4ECB1E4D6A2C3F2F23FC307B959897CFA54B6E2EA3FD6F2EBB50B3BC080C1DCD`; JAR signature verified with expected local self-signed certificate warnings.

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
- Native pronunciation: Android WebView QA verified the custom Capacitor `TextToSpeech` bridge against the installed Google TTS service; `distinguish` playback was accepted without a UI error. Browser builds use Web Speech as a fallback.
- Rich lexical regression: Android WebView QA verified `constant`, `equation`, and `distinguish` phonetics, full semicolon-separated senses, corrected sentence meanings, bilingual examples, and zero horizontal overflow.
- Vocabulary: persisted in localStorage under `six-sigma-study:vocab:v1`; old vocabulary records migrate to include `reviewCount`, `correctStreak`, and `nextReviewAt`.
- Vocabulary review: Android WebView QA verified adding a term from lookup, due-count display, due/all filters, `认识` scheduling, `再记` scheduling, and 0 horizontal overflow in the vocabulary panel.
- Vocabulary export: Android WebView QA verified CSV export with header, review fields, source text, quote/comma escaping, clipboard fallback, and 0 horizontal overflow.
- Study notes: Android WebView QA verified selected Chinese text can be saved with language/page/section metadata, edited in the notes panel, and rendered with 0 horizontal overflow.
- Key chapter release APK QA: `npm run qa:android-key-chapters` passed on Chapters 1, 7, 26, and 33. It verified EN -> ZH -> EN position restoration, tap-to-lookup, no generic lookup fallback, no horizontal overflow, and all target chapter figure images loading without broken images. Chapter 33 specifically verified `left-to-right` opens the curated `left-to-right` phrase entry.
- Target 3 product QA: `npm run qa:target3-product` passed with automatic no-click opening, short bilingual opening copy, bottom navigation entries (`首页`, `单词`, `刷题`, `笔记`, `我的`), two-book home, three dashboard metrics, English reader, Chinese reader with 2 preserved Chapter 1 images, draggable lookup sheet at about 52% and 92% height, body scroll lock, source return buttons, saved term/favorite `bookId`, and independent vocabulary/notes/favorites pages.
- Target 4 product audit: `npm run qa:target4-flow` passed against a clean mobile CDP run. It verified automatic opening, 5-item bottom navigation, two-book home, Import Practice Workbook rendering, Settings/About panels with GitHub link and data controls, English reader, TOC search sheet, immersive mode, lookup half/full states, exact source-return highlight for `ch01-overview-en-001`, Chinese reader with loaded image, notes/favorites/vocabulary pages, and `bookId: six-sigma-black-belt` persistence for created study data.
- Target 4 screenshots were captured under `qa/target4-audit/screenshots/round1-01-opening.png` through `round1-13-vocab.png`; public-safe copies are committed under `docs/assets/showcase/target4-*.png`.
- Target 4 product fixes: visible sample-book wording now uses Import Practice Workbook copy; reader floating study docks were removed after screenshot audit showed they could occlude Chinese text; source-return anchors now preserve block-level pending scroll and highlighting; localStorage writes fail softly in restricted contexts; stale manual fetches are ignored when switching books.
- Sheet gesture QA: `npm run qa:sheet-gestures` passed with the same draggable half/full sheet checks and scroll containment.
- Notes QA: `npm run qa:notes` passed with book-scoped note filtering, Chinese selection save/edit, source metadata, and 0 horizontal overflow.
- Image fidelity QA: `npm run qa:image-fidelity` passed for Chapters 1, 7, 26, and 33. English/Chinese image counts matched the expected chapter counts (2, 14, 50, and 25 respectively), every checked image loaded without broken assets, lookup opened in each chapter, and horizontal overflow stayed 0.
- Target 3 screenshots were captured under `qa/screenshots/target3-01-splash.png` through `target3-09-favorites.png`; public-safe copies are committed under `docs/assets/showcase/target3-*.png`.
- Dictionary lookup: Android WebView QA verified a clicked word after EN/ZH round trip used a real dictionary entry (`to`) rather than the generic fallback explanation.
- Dictionary coverage: browser CDP QA verified runtime `manual.json` contains ECDICT-derived learner entries, curated hits for `COPQ`, `DMADV`, `poka-yoke`, `5S`, and `Anderson-Darling`, and rich lookup profiles for the reported regression terms. The current package inspection verified 3980 public entries plus the ignored 3550-entry private-question supplement.
- Full-manual validator: `npm run lint:content` now checks 33 chapters, pageCount 449, continuous chapter page ranges, manifest chapter paths, global duplicate section/block IDs, block page anchors, complete EN/ZH page coverage, image asset metadata consistency, unsafe asset paths, asset page bounds, and reader-style dictionary lookup key uniqueness.
- Source coverage validator: `npm run qa:source-coverage` passed with source PDF page count 557, manual page count 449, 8994 content blocks, 952 image blocks, 475 assets, 142 source TOC sections, 127 matched source section anchors, 15 explicitly allowed normal-paragraph source headings, and nonblank source-page renders for pages 9, 73, 396, 544, and 555.
- Current release package sizes after this validation pass: APK 38,885,997 bytes; AAB 36,638,342 bytes.
- Current release package inspection: APK 926 entries and AAB 934 entries; both include `content/catalog.json`, Six Sigma `manual.json`, Import Practice Workbook `content/books/agent-import-sample/manual.json`, 475 figure PNG assets, and the ignored local private question-bank plus supplemental dictionary runtime assets.
- Signature verification: `apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk` returned exit code 0 with APK Signature Scheme v2 verified and one signer. `jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab` returned exit code 0; the expected local self-signed certificate trust-chain warning remains because the release key is local.

## 2026-07-12 Context Lookup Regression Pass

- Content and runtime gates passed: `lint:content`, `lint:books`, `typecheck`, `build`, `qa:source-coverage`, and `qa:learning-modules`.
- Mobile interaction at 412x915 verified Chapter 1 page 8 `prospects = 潜在客户`, the matching bilingual marketing sentence, and Chapter 1 page 9 word buttons in both source blocks.
- The page 9 cross-block sentence is restored through `organization should improve first.` and the continuation lookup returns `should = 应该`.
- Unverified dictionary-first inference has been removed. Low-confidence occurrence alignment returns an explicit unavailable state while flash review falls back to the broad dictionary senses.
- APK/AAB release builds passed. APK inspection found `contextGlossesVersion = 1.1.0` and the expected page 8/9 regression entries.
- APK: 40,700,409 bytes, SHA-256 `679CFB4548DA13C77711F1135E7E37235058BED2D742EB3390FE7687EB985B97`, v2 signature verified, one signer.
- AAB: 38,452,752 bytes, SHA-256 `52F31EAEE9DAD4E9BB2BF9B594C9FC4D5F22B2A524ECBFD031611AB2DE06FB4F`, JAR verification passed with the expected local self-signed trust warning.
- No physical Android device was connected during this pass; `adb devices -l` returned an empty device list.

## Known Remaining Gaps

- The release key is local self-signed; final distribution/upload key policy is not decided.
- Physical-device long-press selection QA is still pending; WebView Selection API QA passes.
- Language restoration is accepted at section/block level across the full manual; exact sentence-level semantic pairing is not separately modeled.
- Some chapters need curated section mapping where headings are normal paragraphs; the source coverage validator now guards the current 15 allowed unmatched source headings.
- Exhaustive 557-page pixel comparison for figures/tables is not part of the normal gate; source-page render sampling and app figure checks are covered.
- Some table images are intentionally preserved as images; selected tables can be converted to semantic tables later.
- The public dictionary is scoped to the manual and public sample questions; local private-bank builds add question coverage, while arbitrary imported books still need their own dictionary build step. Remaining fallbacks are usually proper names, OCR artifacts, URL fragments, or unsupported compounds.
- Saved notes currently render as a notes list; exact inline highlight rendering in the reading body is still pending.
