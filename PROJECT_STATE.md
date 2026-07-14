# Six Sigma Study App Project State

Last updated: 2026-07-14 Asia/Shanghai

## Objective

Build `six-sigma-study-app` into a complete, usable Android-first study app for the CSSC Six Sigma Black Belt manual.

The final product must support full-manual offline reading, position-preserving English/Chinese switching, tap-to-lookup word explanations, phrase lookup, Six Sigma terminology explanations, and a persistent vocabulary book. PWA is acceptable as an intermediate delivery shape, but final acceptance requires a buildable Android APK or AAB.

## Authoritative Paths

- App repository: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app`
- Public GitHub repository: `https://github.com/Felix-Zuo/six-sigma-study-app`
- Local processing source folder: `D:\0A OpenClaw\projects\6sigma\sources`
- Original download workspace: `D:\0A OpenClaw\projects\6sigma\original-materials\desktop-manual-pack`
- Chinese aligned manual used by scripts: `D:\0A OpenClaw\projects\6sigma\sources\manual_zh_aligned.docx`
- English aligned manual used by scripts: `D:\0A OpenClaw\projects\6sigma\sources\manual_en_aligned.docx`
- Source PDF used by coverage QA: `D:\0A OpenClaw\projects\6sigma\sources\source_manual.pdf`

## Current Evidence

- Product version: `Beta 0.8.10` (`0.8.10-beta.0` in npm, Android `versionCode 810` / `versionName 0.8.10-beta`). During the current beta line, each user-facing update increments the patch version.
- Branch: `main`
- Latest workspace migration validation pass: 2026-06-26 00:33 Asia/Shanghai
- Local workspace root: `D:\0A OpenClaw\projects\6sigma`
- Local worktree: Beta 0.8.10 study assistance and chapter-flow release locally verified; release commit and CI pending
- Latest confirmed GitHub Actions state before Beta 0.8.10: CI run `29305493571` passed for Beta 0.8.9 commit `ba6d94d`
- Release APK after migration: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`
- Release AAB after migration: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`
- Current product state: React/Vite reader reading all 33 chapters from runtime `manual.json`, with a simple Now Reading / Today's Study / Library / Recent Notes home hierarchy, a real source cover, one live route shell, opacity-only navigation, reduced-motion fallback, source-TOC-guided section anchors, block-level page anchors, block-aware position-preserving language toggle, book-isolated persisted reading positions and chapter-completion state, local table-of-contents search, persisted dark mode and three-step reader font sizing, always-clickable English word tokenization, occurrence-level bilingual context glosses, fixed-chrome draggable lookup sheets, 3980-entry public offline learner dictionary plus an ignored 3550-entry local private-question supplement, bounded DeepSeek selected-text explanations and question coaching, local AI result reuse, due-only vocabulary review scheduling and CSV export, selected-text study notes, timed mock exams, extracted DOCX figure/table image assets, PWA manifest/service-worker offline caching with network-first content JSON updates, native Android service-worker cleanup to avoid stale app caches, and locally signed release APK/AAB builds.

## 2026-07-14 Fixed Sheets, Chapter Completion, and AI Study Assistance Beta 0.8.10

- Split every bottom sheet into a non-scrolling `.sheetChrome` and an independently scrolling `.sheetScrollBody`. The lookup title, word, save control, and close action remain fixed while dictionary content scrolls; the outer sheet stays at `scrollTop = 0`, preserves drag resizing, and retains overscroll containment.
- Added explicit per-book/per-chapter completion under `six-sigma-study:chapter-progress:v1`. Every chapter ends with a read/unread toggle, completed chapter count, and direct next-chapter action; the final chapter returns to the library.
- Added bounded reading assistance for an explicitly selected English word, phrase, sentence, or paragraph. Strict validated output contains concise Chinese translation, Chinese explanation, plain-English restatement, relevant terms, and one grammar cue.
- Added bounded question coaching from Browse, Practice, Wrong Questions, and Favorites. The response identifies the answer and concept, explains every option, calls out the likely trap, and supplies one review cue without requesting hidden reasoning.
- Kept the original offline dictionary and authored question explanations as the default source of truth. AI is user-triggered, sends only the current bounded learning fragment, and uses the existing personal `deepseek-v4-flash` connection.
- Added a deterministic local AI result cache (`six-sigma-study:ai-study-cache:v1`, maximum 80 records). Reopening the same selection reuses the result without another request; records contain validated output, model, time, and token counts but no API key or raw request payload.
- Renamed Settings to `AI 学习助教`, documented the three actions and explicit-send boundary, and included chapter progress plus AI cache in local-data clearing.
- Browser/mobile QA passed typecheck, production build, strict DeepSeek contracts, the 13-case maturity suite, Target 4, learning UI, lexical UI, private isolation, source coverage, reviewed content fidelity, and Chapters 1/7/26/33 with EN/ZH image counts 2/14/50/25 and zero broken images.
- The installed Android release passed `versionCode 810` / `versionName 0.8.10-beta`, Android back-stack priority, Keystore save/reload/clear, and the dedicated native study-assistance smoke test. Native evidence includes fixed lookup chrome after a 260 px body scroll, a 561-character reading selection, chapter completion plus Chapter 2 navigation, both AI entry points, and zero horizontal overflow.
- Known QA infrastructure limit: the legacy native multi-chapter harness can stall while repeatedly reloading and capturing the emulator WebView. Three bounded attempts were stopped; a 30-second CDP call guard was added. The equivalent browser visual suite and the dedicated installed-APK interaction suite passed, and Android logs contained no App crash or ANR.
- Final local release artifacts:
  - APK: 41,258,735 bytes; SHA-256 `C67D4AAC71FA93682A947F11C94FA2EB12F3D4779A3C7154893028A40C48AFF9`; APK Signature Scheme v2 verified with one signer.
  - AAB: 39,009,939 bytes; SHA-256 `C8116B550F282B7B64E41F22BAB915EE0F22CAD4751AA063B0FCC9E7B4317130`; JAR signature verification passed with expected local self-signed/no-timestamp warnings.

## 2026-07-14 Quiet Reading Hierarchy Beta 0.8.9

- Removed the folder stack, page-edge tabs, Three.js dependency, WebGL canvas, and camera choreography from the runtime. Route transitions now keep exactly one live shell and use a short opacity handoff; text geometry remains unchanged throughout.
- Rebuilt Home around a familiar reading-product order: Now Reading, Today's Study, Library, and Recent Notes. Vocabulary, Practice, Notes, Settings, and the Reader retain their existing routes and data contracts.
- Added the actual Six Sigma manual cover as a dedicated runtime asset and kept the home layout single-column at mobile and desktop widths so study priority does not change across breakpoints.
- Replaced cinematic resilience checks with transition resilience checks against the real route shell and Reader language panel. Mobile and desktop visual QA confirms no side-folder overlap, stretched copy, duplicate headings, black frame, or horizontal overflow.
- Preserved all learning behavior, book-scoped local data, private-question isolation, Android back priority, reader image fidelity, lookup sheets, and reduced-motion support.
- Repaired the native back-button edge case discovered during release QA: pressing Back while a navigation fade is active now cancels the handoff and restores its source view. The Android back-stack suite passed for active navigation, question sessions, Reader tools, immersive mode, and lookup sheets.
- Updated Android chapter QA to seed the current `bookId`-partitioned reader-position envelope. The installed release passed native Chapters 1/7/26/33 checks with EN/ZH image counts 2/14/50/25, zero broken images, working lookup, and zero horizontal overflow.
- Final local release artifacts:
  - APK: 41,253,039 bytes; SHA-256 `A9A3CDB2110261DDEEE4E128D3635F3FF5834E8FF01BF98CFF90981E96C83FD2`; APK Signature Scheme v2 verified with one signer; installed and launched as `versionCode 809` / `versionName 0.8.9-beta`.
  - AAB: 39,004,222 bytes; SHA-256 `90A6524FB85D24C6E81FAA94156EF9741EDC4327D25814EC6F61816117825BFE`; JAR signature verification passed with expected local self-signed/no-timestamp warnings.

## 2026-07-13 Geometry-Only Real-Time 3D Motion Beta 0.8.8

- Reproduced the reported transition frames with duplicated navigation, compressed headings, stretched body text, and competing old/new hierarchy. The root cause was whole DOM snapshots being geometrically transformed while both route trees remained visible.
- Replaced route-level View Transition geometry with one reusable Three.js stage containing only text-free paper, back-page, accent-edge, folder-tab, and shadow meshes. Source and target text remain native DOM with `transform: none` for the entire handoff.
- Made the WebGL stage opaque and double-sided, then cross-faded the source before route commit and withheld the target until the geometry settled. This prevents transparent-compositor black flashes and old/new text overlap.
- Changed animation timing from absolute wall-clock progress to bounded frame integration with a wall-clock completion cap. Android UI-thread stalls now extend the motion smoothly instead of teleporting the camera to a later frame, while backgrounded or throttled transitions cannot remain active indefinitely.
- Rebuilt `qa:motion-ui` and `qa:motion-continuity` around intermediate PNG analysis and DOM geometry invariants. Five routes pass at 390 x 844 and 1366 x 900, including folder extract/close, module page turn, Reader open/close, and reduced-motion fallback. Native WebView checks capture the WebGL canvas in the same animation frame, avoiding delayed external screenshot sampling.
- Installed the signed release on `emulator-5554` and ran the same five-route contract against native `https://localhost/`. Every route retained one live shell, empty stage text, unchanged heading geometry, `transform: none`, zero horizontal overflow, zero black-frame ratio, and clean settlement.
- Added interruption and WebGL-context-loss resilience checks. A newer transition retains ownership when an older transition finishes, context loss falls back to direct navigation, context restoration recreates exactly one stage, and language switching uses a native opacity fade with zero View Transition snapshots.
- Native scrolled-card continuity, Android back-stack priority, and Chapters 1/7/26/33 image/lookup checks passed. The Android back listener is registered once and delegates through a live state ref, eliminating the state-update window in which a hardware-back event could be missed. English/Chinese image counts remained 2/14/50/25 with zero broken images.
- Full regression passed: typecheck, build, content/book validation, source coverage, public/private isolation, 13 maturity scenarios, Target 4, learning UI, lexical UI, AI context UI, and release packaging.
- Final local release artifacts:
  - APK: 40,862,369 bytes; SHA-256 `176F534339BE2EFB53C663825060C2A516275BA075F2C79C83621A3238FB48B4`; APK Signature Scheme v2 verified with one signer; installed and launched as `versionCode 808` / `versionName 0.8.8-beta`.
  - AAB: 38,614,679 bytes; SHA-256 `E52B1927399BF2EDFF7DA01B7585AAFEE75669B0E1761DD2893A44A7230F3D20`; JAR signature verified with expected self-signed/no-timestamp warnings.

## 2026-07-13 Source-Aware Motion Continuity Beta 0.8.7

- Reproduced the reported failure from a library page scrolled 502 CSS pixels: the compact book card, destination title, Reader chrome, and restored body had previously entered on unrelated timelines and produced visible hierarchy conflicts.
- Reworked route transitions around shared source/destination elements. Folder extraction and close now pair their workspace surface and heading; module turns use one coherent content layer; Reader open/close uses a fixed viewport paper proxy instead of capturing the multi-thousand-pixel Reader document.
- Prepared the destination Reader before the new View Transition snapshot and restored its saved scroll anchor atomically, eliminating the post-transition page jump. Reused DOM nodes are explicitly released before the matching destination transition name is assigned.
- Staged the small-card path separately from the full-workspace path: the card details recede first, the shared title survives as the orientation cue, and Reader chrome/body reveal only after the paper surface has established itself.
- Added `qa:motion-continuity`, which captures 90/240/430/680/900 ms frames at 390 x 844 and asserts scrolled-source visibility, shared paper/title continuity, destination preparation, nested-layer suppression, final scroll stability, cleanup, and zero horizontal overflow.
- Replayed the five-route motion contract and visually inspected intermediate screenshots for folder extract, module page turn, folder close, Reader open, Reader close, and the scrolled-card Reader path.
- Installed the signed APK on `emulator-5554`, launched the native app, inspected the settled 1080 x 2148 home, then forwarded the live Android WebView CDP endpoint. The scrolled-card continuity contract and all five spatial routes plus reduced-motion fallback passed against native `https://localhost/`, with zero running animations after settlement and zero horizontal overflow.
- Prevented a fast-entry vocabulary race found during full regression: review now waits for the active book dictionary, and legacy example translations resolve from the aligned block before the answer appears.
- Hardened asynchronous maturity checks so the cloud runner waits for dictionary readiness and the active chapter pill's final visible geometry rather than treating loading or smooth-scroll frames as failures. GitHub Actions run `29228751503` passed all jobs.
- Final local release artifacts:
  - APK: 40,729,625 bytes; SHA-256 `5D3DBF691734B7AEBA719B98650C6810C68BDE9F40DA47B3A02DB0BDAC4AA453`; APK Signature Scheme v2 verified with one signer; installed and launched as `versionCode 807` / `versionName 0.8.7-beta`.
  - AAB: 38,481,937 bytes; SHA-256 `166BB31968F0A7560E112DA57ADC38ABA2F64F1C9E10DA78D9C1867440F82C14`; JAR signature verified with expected self-signed/no-timestamp warnings.

## 2026-07-13 Cinematic Folder Motion Beta 0.8.6

- Promoted the home page stack from a visual metaphor to a navigation model: tapping a folder-edge destination now uses the touched tab as the camera origin, releases the cover and tabs on separate easing curves, and extracts the selected module after the cover clears.
- Added dedicated spatial transitions for module-to-module page turns, returning content into the home folder, opening Reader content like a book, and closing Reader back into the workspace. Old and new text are temporally staged so they never overlap during the transition.
- Centered values and labels in compact home metrics, vocabulary source summaries, question statistics, daily status, and tightly framed action controls while preserving left alignment for readable content cards.
- Extended `qa:motion-ui` into a five-route motion contract. It verifies transition style/direction, source coordinates, named independent layers, 600+ ms bounded cinematic motion, final state cleanup, zero overflow, and the no-animation reduced-motion fallback.
- Re-ran all 13 maturity regressions, Target 4 flow, learning/lexical/AI UI, key chapter image fidelity, content/import/source coverage, learning modules, public audit, and documentation links. All passed.
- Android `0.8.6-beta` was installed and launched on `emulator-5554`; the release home was visually inspected at 1080 x 2148 device pixels with centered metrics and intact folder tabs.
- Final release artifacts:
  - APK: 40,727,537 bytes; SHA-256 `6932FBB9A92497C334FBDB4ABEB78754D1CD0CDC3203E568841289A15FB63E0D`; APK Signature Scheme v2 verified with one signer; installed and launched as `versionCode 806` / `versionName 0.8.6-beta`.
  - AAB: 38,479,855 bytes; SHA-256 `BD26F1586E1CB3A127B73576685CFE16F66C67037CAA3202C617055B7DE1E47F`; JAR signature verification passed with expected local self-signed/no-timestamp warnings.
  - APK/AAB retain the local 1000-question bank and 3550-entry private-question dictionary supplement; the ordinary web `dist` remains free of private paths and content.

## 2026-07-13 Five-Round Product Maturity Pass Beta 0.8.5

- Round 1 hardened data and state integrity: malformed list items are salvaged, snapshot-difference persistence keeps unreadable storage intact even under StrictMode hydration, reader-position recovery retains the last valid in-memory map, cross-book dictionary enrichment is guarded by `manual.bookId`, question priority is reload-idempotent, imported question-ID collisions are rejected, and local reset clears every book's context corrections.
- Round 2 hardened the reader and bottom sheets: English words remain directly clickable while a roving Tab stop and arrow-key navigation avoid thousands of sequential stops; modal sheets now trap/restore focus, expose Chinese dialog semantics, keep the drag handle and close control visible, preserve reader position through immersive mode, reveal remote active page pills, and give Reader tools the first Android-back priority.
- Round 3 rebuilt learning state machines: daily goals shrink to the available due queue and can still check in; quiz selection always reveals the answer before self-rating; practice, wrong, and favorite queues are fixed for the session; duplicate submission is locked; answer explanations remain until explicit navigation; mock results retain user answers and support restart; question lookups return to the active session.
- Round 4 corrected product polish: page navigation resets predictably, dark per-module accents now meet the intended contrast hierarchy, collapsed question-bank controls have no hidden hit targets, file import is touch-sized, disabled controls read as disabled, repeated post-transition layer animation is removed, and subsequent startup is reduced to about 520 ms.
- Round 5 independently re-audited logic and mobile UX, added 13 isolated maturity regressions plus a native Android back-stack test, and reran content, private-artifact, learning, motion, image-fidelity, AI-context, Keystore, APK, and AAB gates.
- GitHub Actions run `29208394857` passed all build, browser QA, and Android Debug jobs after replay-safe persistence and post-load navigation-request audit fixes.
- Final release artifacts:
  - APK: 40,725,849 bytes; SHA-256 `58B690342B0BABBD0751A16D5F29785BFC77B731DDDB95F6643CB1E98CADA5C9`; APK Signature Scheme v2 verified with one signer; installed and launched as `versionCode 805` / `versionName 0.8.5-beta`.
  - AAB: 38,478,174 bytes; SHA-256 `E0F721314E7119CBBBCF3DF6DF5BBCB79FF32C168373CD10EB504A6C2042C487`; JAR signature verification passed with expected local self-signed/no-timestamp warnings.
  - APK/AAB contain 1000 local questions and the 3550-entry private-question dictionary supplement; normal web `dist` contains zero private paths.

## 2026-07-13 Product Maturity And Regression Hardening Beta 0.8.4

- Corrected cross-book reader-position persistence and clamped restored pages to each book's valid page range.
- Changed vocabulary planning to a due-only queue, capped the displayed plan by actual due items, and restored explicit `认识 / 模糊 / 不认识` scheduling after answer reveal.
- Added first-unanswered practice resume and a background-safe absolute mock-exam countdown with timeout submission and actual elapsed time.
- Removed affix aliases from ordinary dictionary lookup. The builder audited 1,991 affix rows and 1,016 affix/base collisions; `scope` now resolves to the ordinary word entry rather than `-scope`.
- Isolated the private 1000-question bank from normal web artifacts. Android sync stages it only into the transient dist, copies it into native assets, and always cleans the web artifact afterward.
- Fixed local-data reset ordering, concurrent View Transition ownership, 760-859px sheet clipping, touch target sizes, dark answer-state contrast, safe-area coverage, reduced-motion splash delay, keyboard sheet resizing, home heading structure, and navigation `aria-current`.
- Added public-artifact, dictionary-boundary, motion-path, favorites screenshot, Android platform, and maturity regression gates. GitHub Actions now runs static/content gates, headless-browser interaction QA, and an Android debug compile as separate jobs.
- Final release artifacts:
  - APK: 40,722,541 bytes; SHA-256 `FA2AF476A967D4AFD10A88FE34EB3404B05ACBC840BF3384B55E0BFA43F52F53`; APK Signature Scheme v2 verified, one signer; installed and launched as `versionCode 804` / `versionName 0.8.4-beta`.
  - AAB: 38,474,876 bytes; SHA-256 `A9922942D0D274E2E2B1FA6E3BC72D3254053108E0A2E53AEFB494B4EAF2CF37`; JAR signature verification passed with expected self-signed/no-timestamp warnings.
  - APK/AAB contain 1000 local questions, 3550 private-question dictionary entries, 3980 public dictionary entries, and the full manual; ordinary web `dist` contains zero private paths.

## 2026-07-12 Quiet Aperture Frontend Beta 0.8.3

- Rebuilt the frontend from the selected first design direction: warm neutral matte pages, deep ink type, muted ultramarine and coral accents, a full-height home work page, and functional page-edge destinations for vocabulary, practice, notes, and favorites.
- Replaced the floating capsule navigation and card-heavy dashboard with a stable bottom band, flat information sections, compact repeated-item cards, restrained per-module accents, and quieter reader chrome.
- Added native View Transition routing for main navigation and language switching. Foreground pages, rear layers, headings, progress, and navigation settle on independent easing curves; `prefers-reduced-motion` collapses all transition durations.
- Preserved the full product contract: multi-book library, reader position, EN/ZH block alignment, Chinese images, draggable half/full lookup, immersive mode, vocabulary review, streaks, notes, favorites, questions, DeepSeek review, and Android Keystore storage.
- Updated screenshot QA to wait 1250 ms for the bounded layered transition before capture. Three visual review rounds covered home, reader EN/ZH, lookup half/full, vocabulary, flashcard, question dashboard, and question lookup at 390 x 844.
- Android WebView gates passed: Target 3, Target 4, sheet gestures, notes, learning UI, lexical UI, AI context correction, Android Keystore, and key-chapter image fidelity. Desktop CDP motion QA confirmed native View Transitions, 920 ms normal layered motion, 0.001 ms reduced-motion timing, and zero horizontal overflow. Chapters 1/7/26/33 retained 2/14/50/25 images in both languages with zero broken images and zero horizontal overflow.
- Design evidence: `design-qa.md`, `docs/assets/showcase/beta-0.8.3-selected-reference.png`, and `docs/assets/showcase/beta-0.8.3-reference-vs-implementation.png`.
- Final release artifacts:
  - APK: 40,716,973 bytes; SHA-256 `DC5945FB7045898304869E4E244D660BA78363C5DB35A8C21DAC2B394DD9D830`; APK Signature Scheme v2 verified, one signer; installed and launched as `versionCode 803` / `versionName 0.8.3-beta`.
  - AAB: 38,469,282 bytes; SHA-256 `C736593D129235C448A184CB3EEAC8BE5012EAD4F7E1924CAFAD2AD56E503051`; JAR signature verification passed.

## 2026-07-12 DeepSeek Context Correction Beta 0.8.2

- Added an optional, user-owned `deepseek-v4-flash` context verifier inside the existing lookup sheet. Offline dictionary/context results render first; medium/unavailable evidence can auto-check only when a key is configured, and every result can also be requested manually.
- DeepSeek receives only the clicked surface, dictionary candidates, current sentence, one adjacent sentence on each side, aligned Chinese, and the current domain. Thinking is disabled for this bounded task.
- The request uses the official Beta strict tool-calling endpoint with all fields required and `additionalProperties: false`. App validation additionally requires the detected phrase to exist verbatim in the source sentence and requires Chinese meaning, sentence translation, and explanation.
- Added `Context Correction Bundle v1`, exact field validation, deterministic SHA-256 IDs/source hashes, proposed/accepted/rejected/revoked states, exact-only automatic reuse, suggestion-only similar matching, accepted-only export, and a reversible vocabulary snapshot link via `contextCorrectionId`.
- Added Android AES-GCM API-key encryption backed by Android Keystore. The key never enters WebView storage, correction JSON, logs, or source control; browser/PWA mode retains a key in memory only for the current session.
- Added repository import/apply scripts. Accepted records are checked against `bookId`, source hash, phrase, block, and sentence before merging into runtime `contextGlosses`; generated `manual.json` is never edited directly by the model.
- Fixed the reported offline regression `revert to old ways`: `revert` now means returning to a previous state or practice, not “进行”.
- Verification completed: TypeScript, production build, all learning modules, content/book validation, reviewed content fidelity, source coverage, public audit, documentation links, existing lexical/learning UI, strict correction QA, and the 390x844 mocked DeepSeek proposal/accept/reopen/export flow passed. Android emulator Keystore save/restart/clear/restart checks passed; SharedPreferences contained ciphertext and IV with no test-key plaintext.
- Final `Beta 0.8.2` release artifacts:
  - APK: 40,712,065 bytes; SHA-256 `BC41B21A46D211BCE4BC4AAB32D8F421B4163E9DD4D1F11AEACF0E9A2D261A26`; `versionCode 802`, `versionName 0.8.2-beta`; APK Signature Scheme v2 verified, one signer.
  - AAB: 38,464,391 bytes; SHA-256 `4ECB1E4D6A2C3F2F23FC307B959897CFA54B6E2EA3FD6F2EBB50B3BC080C1DCD`; JAR signature verified with the expected local self-signed/no-timestamp warnings.
  - APK DEX contains `NativeDeepSeekAssistantPlugin`; APK/AAB contain the full runtime manual, local private question bank, and final web assets. The Release APK installed and launched on `SixSigmaQA`, reporting version `0.8.2-beta` / code `802`.

## 2026-07-12 Occurrence-Level Context And Page 9 Click Repair

- Removed the dictionary-first context fallback that produced confident errors such as `prospects = 景色`. A missing or low-confidence alignment now displays `暂无可靠语境义` instead of inventing a sentence meaning.
- Added an offline multilingual alignment build at `scripts/build_context_glosses.py`. The shipped glossary covers 3875 English text blocks, 8591 sentences, and 105048 occurrence-level meanings; 383 low-confidence sentences retain bilingual examples but do not assert a word meaning.
- Verified the reported Chapter 1 page 8 regression: `prospects` maps to `潜在客户`, and its example is the marketing sentence about letters to customers or prospects rather than the unrelated Yield term note.
- Removed lazy viewport-dependent word tokenization. Every rendered English paragraph, heading, list item, semantic-table cell, and term note uses the clickable word renderer immediately.
- Repaired six cross-block sentences whose English source was split at a page boundary. Chapter 1 page 9 now restores the complete sentence ending `organization should improve first.`; `provide = 让` and the continuation `should = 应该` both open correctly.
- Stopped treating sentence-final punctuation as part of the lookup word, so the query, pronunciation request, and example extraction use `prospects` instead of `prospects.`.
- Existing manual vocabulary records are re-enriched from the new occurrence glossary while their scheduling history is preserved. Unavailable context does not replace the broad dictionary answer used by flash review.
- Bumped the PWA cache to `six-sigma-study-v0.8.2` and made `/content/*.json` network-first with offline cache fallback, preventing an installed PWA from retaining an old erroneous `manual.json` after an update.
- Three bounded validation rounds completed:
  - content/runtime gates: lint, source coverage, typecheck, production build, and all learning-module QA passed;
  - 412x915 mobile interaction: page 8 `prospects`, page 9 first block, and page 9 continuation were clicked and returned the expected meanings and bilingual sentences;
  - Android release packaging: APK/AAB built, signed package checks passed, and APK inspection confirmed glossary version 1.1.0 plus the two reported regression values.
- Release artifacts:
  - APK: 40,700,409 bytes; SHA-256 `679CFB4548DA13C77711F1135E7E37235058BED2D742EB3390FE7687EB985B97`
  - AAB: 38,452,752 bytes; SHA-256 `52F31EAEE9DAD4E9BB2BF9B594C9FC4D5F22B2A524ECBFD031611AB2DE06FB4F`
- Physical-device installation was not run in this pass because `adb devices -l` returned no connected device. Mobile browser interaction and release-package inspection passed.

## 2026-07-12 Rich Vocabulary And Native Pronunciation Upgrade

- Rebuilt lookup and flashcard answers around a stable information order: full dictionary senses, phonetics and part of speech first; lemma/word forms and English definition next; current-sentence meaning and bilingual example last.
- Normalized ECDICT translations to semicolon-separated senses and added structured `wordRoot`, `wordForms`, and `englishDefinition` fields. Public runtime dictionary count is now 3981.
- Added local private-question dictionary generation during `stage:private-question-bank`; the current 1000-question bank contributes 3552 ignored offline entries without committing the private questions or generated word list.
- Corrected the reported regressions: `distinguish` is “区分；辨别”, adjectival `constant` is “持续不变的；恒定的”, and formula-context `equation` is “方程式；计算公式”.
- Replaced same-page-first translation lookup with aligned block selection and context-aware Chinese sentence selection. Existing vocabulary records are enriched from the new dictionary/alignment while preserving review history.
- Added a Capacitor Android native `TextToSpeech` bridge using the system English voice, with initialization/language errors surfaced in the UI and Web Speech retained as a browser fallback.
- Added `qa:lexical-learning` and mobile `qa:lexical-ui` gates. Browser and Android WebView runs passed all three reported words, bilingual examples, pronunciation control, and zero horizontal overflow.
- Android emulator `SixSigmaQA` exposed Google TTS, accepted the native `distinguish` playback request, and returned no pronunciation error.
- Final release artifacts after this upgrade:
  - APK: 38,885,997 bytes, SHA-256 `91ED3D3CA444FDACCDA093CAEFE4FC2F7D77175A55ED04B24676F858306C7A3A`
  - AAB: 36,638,342 bytes, SHA-256 `E0C0A7FFA79950BF6FB8AC6FED7E58408D5B5CDC89914C6C83C90A89D91E7D72`
  - package contents: 926 APK entries / 934 AAB entries; the ignored private question bank and private question dictionary are bundled only in local artifacts
  - APK signature: v2 verified, one signer; AAB JAR verification passed

## 2026-07-11 Product And Content Upgrade

- Added sentence-context vocabulary explanations and examples for reader and
  question-bank lookup, with question-source metadata preserved in the word
  book.
- Rebuilt the independent vocabulary area around a daily plan and a separate
  searchable library instead of exposing all answer content before recall.
- Rebuilt the question area as a dedicated training workbench and session UI;
  local Android builds stage the private 1000-question bank without tracking it.
- Added repeatable source-reviewed content overrides and a content-fidelity
  audit. Current package: P0=0, P1=0, flattened-table candidates=0, semantic
  tables EN/ZH=31/31, image blocks EN/ZH=476/476.
- Restored semantic tables and original visual reports/charts in Chapters 1,
  5, 12, 14-17, 21, 23, 26-30; corrected selected source references, formulas,
  and hypothesis notation.
- Added mobile content visual QA for Chapters 5, 16, 23, 29, and 30. The latest
  run passed both languages with decoded images, valid tables, zero body
  overflow, and zero unintended horizontal scroll.
- Bumped the PWA cache to `six-sigma-study-v0.7.0` so repaired content replaces
  stale browser assets after upgrade.
- Added the reviewed-fidelity CI gate (`P0=0`, `P1=0`) and Android-native CDP
  coverage for the contextual vocabulary session and question-training flow.
- Release APK installed and launched on Android 16 emulator `SixSigmaQA`.
  Native WebView QA passed contextual word review, question lookup, `不会`
  explanation, correct auto-next, and Chapters 1/7/26/33 image/alignment checks.
- Native content visual QA passed Chapters 5/16/23/29/30 in EN and ZH with
  valid semantic tables/decoded report images and zero body overflow.
- Current release artifacts:
  - APK: 38,885,997 bytes, SHA-256 `91ED3D3CA444FDACCDA093CAEFE4FC2F7D77175A55ED04B24676F858306C7A3A`
  - AAB: 36,638,342 bytes, SHA-256 `E0C0A7FFA79950BF6FB8AC6FED7E58408D5B5CDC89914C6C83C90A89D91E7D72`
  - package contents: 926 APK entries / 934 AAB entries, 475 figure PNGs,
    catalog/manual packages, and the ignored local private question-bank asset
  - APK signature: v2 verified, one signer; AAB JAR verification passed with
    the expected local self-signed certificate warning
- Known release boundaries: the private UCOURSE bank has no reviewed Chinese
  fields and therefore falls back to English on language switch; 31 P2
  content-fidelity advisories remain for formatting/URL/formula-heavy text,
  while all P0/P1 candidates are closed.

## 2026-06-26 Flashcards, Streaks, And Question Practice Update

- Added vocabulary flashcard review on the independent vocabulary page:
  - one term per card, self-test first, reveal with Chinese translation/explanation/source, then `认识` / `模糊` / `不认识`.
  - extended `SavedTerm` with `familiarity`, `lapseCount`, `intervalDays`, `easeFactor`, and question-source metadata.
  - kept legacy localStorage migration defaults for older vocabulary records.
- Added local daily streak tracking:
  - default goal 8 reviews/day.
  - completed reviews auto-check-in when the goal is reached.
  - missed days add capped catch-up load without negative copy.
- Added a standalone `刷题` bottom-nav module:
  - modes: `看题`, `刷题`, `错题`, `模拟考试`.
  - supports filters by domain, chapter, and difficulty.
  - wrong/unknown answers feed the wrong-question queue; repeated correct answers reduce priority and eventually mark mastery.
  - mock exam hides answers until submission, then reports score, weak domains, wrong questions, and explanations.
  - question text in English mode supports tap-to-lookup; saved terms carry `sourceType: "question"` plus `questionId`, `examId`, and `domain`.
- Added public-safe question-bank artifacts:
  - schema: `content/schemas/question-bank.schema.json`
  - safe sample: `samples/question-bank/public-sample.questions.json`
  - runtime sample data: `apps/reader/src/data/publicQuestionBank.ts`
  - local importer: `scripts/import_ucourse_question_bank.py`
- Processed the user-provided UCOURSE CSSBB PDF as private local study data only:
  - private JSON: `D:\0A OpenClaw\projects\6sigma\private-question-bank\ucourse-cssbb-1000.private.json`
  - report: `D:\0A OpenClaw\projects\6sigma\private-question-bank\IMPORT_REPORT.md`
  - parsed questions: 1000
  - missing answers: 0
  - missing explanations: 0
  - `needsReview`: 0
- Added workspace and repo ignore protections for `private-question-bank/` and `*.private.json`.
- Added QA:
  - `npm run qa:vocab-flashcards`
  - `npm run qa:streak`
  - `npm run qa:question-schema`
  - `npm run qa:question-modes`
  - `npm run qa:private-isolation`
  - `npm run qa:learning-modules`

## Workspace Migration Status

- Consolidated app repository, source files, signing keystore, Android SDK, Poppler, LibreOffice folders, legacy translation work, and original desktop materials under `D:\0A OpenClaw\projects\6sigma`.
- Moved the old C-drive and desktop Six Sigma project paths into the D-drive workspace.
- Updated Android local configuration to use `D:\0A OpenClaw\projects\6sigma\tools\android-sdk` and `D:\0A OpenClaw\projects\6sigma\secrets\sixsigma-release.jks`.
- Updated local content/QA scripts to resolve `sources/` and `tools/findjob_sixsigma_tools/` from the workspace root instead of hard-coding the old C-drive locations.
- Root migration map is stored outside the Git repository at `D:\0A OpenClaw\projects\6sigma\MIGRATION_NOTES.md`.

## Target Four Audit Status

Target four is a bounded three-round product验收 loop for the current multi-book Android-first learning product.

### Round 1 - Full Product Smoke Trial

- Used four audit roles from the active subagent set before this state update:
  - Product manager: identified missing target-four evidence for Settings/About, second book, source return exactness, and screenshot coverage.
  - Learner: identified source-anchor exactness, old QA selector drift, settings coverage, and physical touch limitations.
  - UI/motion designer: identified reader floating-dock occlusion, header density, sample-book demo wording, and old README screenshot priority.
  - Code engineer: identified stale manual fetch risk, localStorage write exceptions, overlay history edge cases, and data-model drift.
- Created bounded GitHub issues #41-#48 for target-four evidence, multi-book sample polish, source-return behavior, localStorage tolerance, sheet gestures, image fidelity, independent study pages, and release/CI closure.
- Implemented fixes:
  - Added `scripts/qa-target4-flow-cdp.mjs` and `npm run qa:target4-flow`.
  - Hardened manual loading against stale fetches and bookId mismatches.
  - Added block-level pending scroll and source-return highlighting.
  - Added Android back fallback from non-home app views.
  - Wrapped localStorage writes for active book, splash notice, preferences, vocabulary, notes, favorites, and reader positions.
  - Updated the sample workbook runtime copy from visible "Agent Import Sample" wording to "Import Practice Workbook" product wording.
  - Updated `docs/04-data-model.md` to match runtime `TermEntry`, `SavedTerm`, `SavedNote`, `SavedFavorite`, and reader-position storage.
  - Removed reader floating study docks after screenshots proved they could cover Chinese text; independent study pages remain available through bottom navigation and the reader menu.
- Round 1 verification:
  - `npm run typecheck`: passed.
  - `npm run build`: passed.
  - `npm run lint:content`: passed.
  - `npm run lint:books`: passed.
  - `npm run qa:book-import`: passed.
  - `npm run qa:target4-flow`: passed.
  - Key target-four screenshots saved under `qa/target4-audit/screenshots/round1-01-opening.png` through `round1-13-vocab.png`.

### Round 2 - Deep Interaction And Data Consistency

- Fixed legacy `qa-multibook-ux-cdp.mjs` drift after the reader floating vocab dock was removed; the script now uses the real product path: back to library, bottom-nav Vocabulary, then source return.
- Re-ran each CDP QA in an isolated clean Chrome profile to avoid browser-state interference.
- Round 2 verification:
  - `npm run qa:source-coverage`: passed with 557 source PDF pages, 449 manual pages, 9542 content blocks, 940 image blocks, 470 assets, 142 source TOC sections, 127 matched sections, and nonblank sampled source renders.
  - `npm run qa:target3-product`: passed with current navigation path, opening, home, reader EN/ZH, lookup half/full, saved term/favorite, independent vocabulary/notes/favorites, and source-return controls.
  - `npm run qa:notes`: passed with two scoped notes, sample-book note hidden from Six Sigma filter, Chinese selected text saved/edited, and 0 horizontal overflow.
  - `npm run qa:image-fidelity`: passed for Chapters 1, 7, 26, and 33 with matching EN/ZH image counts and 0 broken images.
  - `npm run qa:sheet-gestures`: passed with half/full sheet states, body scroll lock, and scroll containment.
  - `npm run qa:android-key-chapters`: passed for Chapters 1, 7, 26, and 33 with EN -> ZH -> EN restoration, lookup, image loading, and 0 horizontal overflow.

### Round 3 - Release-Level Acceptance

- Status: local release-level validation complete; final GitHub push, CI confirmation, issue closure, and clean-worktree check remain before target four is marked complete.
- Round 3 verification:
  - `npm run audit:public`: passed.
  - `npm run docs:links`: passed.
  - `npm run lint:content`: passed.
  - `npm run lint:books`: passed.
  - `npm run qa:book-import`: passed.
  - `npm run typecheck`: passed.
  - `npm run build`: passed.
  - `npm run qa:target4-flow`: passed.
  - `npm run android:release-apk`: passed; APK at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`.
  - `npm run android:aab`: passed; AAB at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`.
  - APK package inspection: 919 entries, `content/catalog.json`, Six Sigma `content/manual.json`, Import Practice Workbook `content/books/agent-import-sample/manual.json`, and 470 figure PNG assets present.
  - AAB package inspection: 927 entries, same runtime content and 470 figure PNG assets present.
  - APK signature verification: `apksigner verify --verbose --print-certs` exit code 0, v2 signature verified, one signer.
  - AAB signature verification: `jarsigner -verify` exit code 0 with expected local self-signed certificate warning.
- Remaining gates before marking target four complete:
  - Commit and push target-four changes.
  - Confirm GitHub Actions CI for the pushed commit.
  - Close issues #41-#48.
  - Confirm final clean worktree and stop local QA browser/preview processes.

### Known Limitations After Round 2

- Physical long-press QA on an actual phone is still separate from WebView/CDP automation.
- Sentence-level semantic alignment is still not separately modeled; section/block-level restoration is the accepted runtime contract.

## Completed In Current Stage

- Copied local aligned DOCX inputs to pure-English local processing paths:
  - `D:\0A OpenClaw\projects\6sigma\sources\manual_en_aligned.docx`
  - `D:\0A OpenClaw\projects\6sigma\sources\manual_zh_aligned.docx`
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
- Installed Android command-line tools to `D:\0A OpenClaw\projects\6sigma\tools\android-sdk`.
- Installed Android SDK platform-tools, Android 36 platform, and build-tools 36.0.0.
- Added Capacitor 8 Android project with app id `com.findjob.sixsigmastudy`.
- Built debug APK at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\debug\app-debug.apk`.
- Confirmed the debug APK bundles `content/manual.json`, `manifest.webmanifest`, and `sw.js`.
- Installed Android Emulator 36.6.11 and Android 36 Google APIs x86_64 system image.
- Created local AVD `SixSigmaQA` and installed the debug APK on `emulator-5554`.
- Added native Android back-button handling through `@capacitor/app` so open sheets close before the app exits.
- Reworked the sticky reader header so long chapter titles no longer clip the page rail.
- Added ignored Android release signing configuration via `android\keystore.properties`.
- Added `npm run android:release-apk` and `npm run android:aab`.
- Generated local signing keystore at `D:\0A OpenClaw\projects\6sigma\secrets\sixsigma-release.jks`.
- Built release APK at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`.
- Built release AAB at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`.
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
- Added viewport-bound English tokenization in the earlier performance pass. This was superseded on 2026-07-12 after it caused visible page 9 text to remain non-clickable; current chapters render every English word button immediately.
- Added `scripts/extract_source_toc.py` to derive source table-of-contents section metadata from the local source PDF.
- Added `content/source/source_toc_sections.json` with 33 source chapters and 142 source TOC sections.
- Updated full-manual extraction so Chapters 2-33 use source-TOC-guided section anchors where matching Word headings exist.
- Regenerated app content with 174 total sections across 33 chapters; Chapter 28 intentionally remains one section because its TOC-like titles are normal paragraphs rather than reliable Word headings.
- Updated phrase selection so selected phrases retain the actual source section and page from the DOM selection anchor instead of using the current active section as a proxy.
- Phrase lookup now clears the text selection after opening the lookup bottom sheet, avoiding stale floating phrase-query controls.
- Added `docs/08-release-verification.md` as the current APK/AAB, content, Android QA, CI, and known-gap evidence matrix.
- Added persisted reader preferences under `six-sigma-study:reader-preferences:v1`.
- Added dark mode across reader chrome, content cards, tables, figures, term notes, lookup sheets, table of contents, and vocabulary panels.
- Added standard, large, and extra-large reader font controls from the sticky header.
- Added long URL/reference wrapping so Chapter 1 source citations do not create page-level horizontal scroll at extra-large text size.
- Updated Phase 5 roadmap tracking for long-session study comfort.
- Added table-of-contents search by English/Chinese chapter title, English/Chinese section title, chapter number, and page number.
- Added direct navigation from search results to either whole chapters or specific section anchors.
- Extended local vocabulary records with `reviewCount`, `correctStreak`, `lastReviewedAt`, `nextReviewAt`, and `masteredAt`.
- Added backward-compatible vocabulary migration for older localStorage records.
- Added due/all vocabulary filters, due-count display, review summary counts, and `再记` / `认识` review actions.
- Added simple spaced repetition intervals for remembered terms and next-day rescheduling for terms that need more review.
- Replaced section-start language switching with block-aware scroll capture/restoration using the current visible content block and proportional block offset.
- Added `scripts/qa-language-toggle-cdp.mjs` to run Android WebView CDP QA for Chapter 26 EN/ZH block-position preservation, horizontal overflow, and tap-to-lookup.
- Expanded the generated offline dictionary from 16 to 69 entries covering high-frequency Six Sigma, statistics, Minitab/chart, lean, software-command, and basic study words.
- Updated the Android WebView language-position QA script so tap-to-lookup fails if it falls back to the generic "not in dictionary" explanation.
- Added vocabulary CSV export with Web Share, clipboard, and download fallbacks.
- Added `scripts/qa-vocab-export-cdp.mjs` to seed Android WebView vocabulary data, verify CSV escaping, and check the export panel layout.
- Added selected-text study notes under `six-sigma-study:notes:v1`, including source language, chapter, page, section, editable note text, and delete actions.
- Added a notes dock and notes bottom sheet, plus `scripts/qa-notes-cdp.mjs` for Android WebView selection/save/edit layout QA.
- Strengthened `scripts/validate_content.py` with full-manual gates for 33 chapters, 449 pages, continuous chapter ranges, manifest paths, global duplicate section/block IDs, image block/asset metadata consistency, unsafe asset paths, asset page bounds, and reader-style dictionary lookup key uniqueness.
- Improved the browser PWA service worker to pre-cache the production app shell from `index.html`, including Vite hashed JS/CSS assets, before caching the full figure asset manifest.
- Added `scripts/qa-pwa-offline-cdp.mjs` to verify service-worker control, cache contents, offline reload behavior, and mobile horizontal overflow through Chrome CDP.
- Added `scripts/build_manual_dictionary.py` to build a manual-scoped offline English-Chinese learner dictionary from local `D:\0A OpenClaw\projects\6sigma\sources\ecdict.csv` while preserving curated Six Sigma terms as the highest-priority layer.
- Expanded curated course terminology with DMADV, DMADOV, COPQ, COQ, CTC, EWMA, 5S, poka-yoke, jidoka, RTY, FTY, OFAT, RACI, Anderson-Darling, and related chart/lean terms.
- Generated 3954 committed dictionary entries: 94 curated course terms and 3860 ECDICT-derived learner entries.
- Added ECDICT MIT license attribution in `THIRD_PARTY_NOTICES.md`.
- Added browser CDP dictionary QA in `scripts/qa-dictionary-cdp.mjs` and lookup-sheet phonetic rendering for ECDICT entries.
- Strengthened content validation so the production dictionary must contain at least 3000 entries and include ECDICT-derived learner entries.
- Added `scripts/qa-language-toggle-sweep-cdp.mjs` to sample one comparable section/block in every chapter and verify EN -> ZH -> EN position restoration across the full manual.
- Added block-level page anchors to generated English/Chinese content blocks and updated the reader to use `block.page ?? section.page` for lookup and vocabulary source metadata.
- Strengthened `scripts/validate_content.py` so every generated content block must have an in-range page anchor and English/Chinese content streams must cover every page from 6 through 449.
- Copied Poppler to the pure-English local path `D:\0A OpenClaw\projects\6sigma\tools\findjob_sixsigma_tools\poppler` for source PDF QA, avoiding Unicode path problems in the bundled Poppler wrapper.
- Added `scripts/qa_source_coverage.py` and `npm run qa:source-coverage` to validate the 557-page source PDF, source TOC anchors, block-level page coverage, asset manifest consistency, and nonblank source-page render samples.
- Added `scripts/qa-android-key-chapters-cdp.mjs` and `npm run qa:android-key-chapters` for release APK WebView QA across Chapters 1, 7, 26, and 33.
- Refined language-toggle scroll restoration so chapters with near-identical EN/ZH block counts use block anchors, while highly divergent sections such as Chapter 1 real-world tables use proportional section anchors.
- Added curated `left` and `left-to-right` dictionary entries so Chapter 33 value-stream-map directions do not fall through to the ECDICT `leave` entry.

## Verification In Current Stage

- `npm run lint:content`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `node --check scripts\qa-android-key-chapters-cdp.mjs`: passed
- `npm run build:dictionary`: passed with 94 curated entries, 3860 ECDICT entries, and 3954 total entries
- `npm run qa:android-key-chapters`: passed on release APK with Chapters 1, 7, 26, and 33, including image loading checks and `left-to-right` phrase lookup
- `node scripts\qa-language-toggle-cdp.mjs`: passed on release APK for Chapter 26 EN/ZH/EN block restoration and tap-to-lookup
- `node scripts\qa-vocab-export-cdp.mjs`: passed on release APK
- `node scripts\qa-notes-cdp.mjs`: passed on release APK
- `npm run qa:source-coverage`: passed after the final dictionary and scroll-restoration changes
- Final package inspection: APK 37,822,807 bytes, AAB 35,605,948 bytes, 33 chapters, 449 pages, 3954 dictionary entries, and 470 figure PNGs in both release packages
- `apksigner verify --print-certs android\app\build\outputs\apk\release\app-release.apk`: passed with SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
- `jarsigner -verify -certs android\app\build\outputs\bundle\release\app-release.aab`: verified with expected self-signed certificate/no timestamp warnings
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
- `adb version`: passed from `D:\0A OpenClaw\projects\6sigma\tools\android-sdk\platform-tools\adb.exe`
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
  - QA screenshots are local under `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots` and are not committed because PNG files are ignored.
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
  - Android screenshots are local under `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots` and are ignored by Git.
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
- Phrase selection verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Android WebView Selection API QA on Chapter 7:
    - selecting `inputs, outputs` inside `ch07-s02-major-process-components` displayed the phrase lookup button
    - phrase lookup opened a bottom sheet titled `inputs, outputs` with `PAGE 61`
    - text selection was cleared after lookup
    - save-to-vocabulary persisted the phrase with `chapter: 7`, `page: 61`, and `sectionId: ch07-s02-major-process-components`
    - no horizontal overflow
  - `npm run android:aab`: passed
  - APK size: 37,317,735 bytes
  - AAB size: 35,100,886 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
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
- Reader comfort verification:
  - `npm run lint:content`: passed
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - Android WebView preference QA:
    - app relaunch restored dark mode, extra-large text, and 22px reader text from `six-sigma-study:reader-preferences:v1`
    - standard, large, and extra-large controls produced 18px, 20px, and 22px reader text
    - dark mode changed app and body background to `rgb(17, 23, 29)` with no horizontal overflow
  - Android WebView chapter QA in dark mode and extra-large text:
    - Chapter 1: 23 sections, 2 images, 0 visible broken images across sampled scroll positions, 0 horizontal overflow after long-reference wrapping fix
    - Chapter 7: 6 sections, 14 images, 0 visible broken images across sampled scroll positions, 0 horizontal overflow
    - Chapter 26: 4 sections, 50 images, 0 visible broken images across sampled scroll positions, 0 horizontal overflow
    - Chapter 33: 5 sections, 25 images, 0 visible broken images across sampled scroll positions, 0 horizontal overflow
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\reader-dark-xlarge-ch33.png` and ignored by Git.
  - `npm run android:aab`: passed
  - APK size: 37,318,723 bytes
  - AAB size: 35,101,868 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `9230257`: passed in run `27917919176`
- Table-of-contents search verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run lint:content`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - Android WebView TOC search QA:
    - `Minitab` returned 10 chapter/section results and jumping from the Chapter 26 result opened `Chapter 26: Graphs and Quality Tools in Minitab`
    - `439` returned the Chapter 33 page-range result plus page 439 section results and jumping opened `Chapter 33: Value Stream Maps`
    - `价值流图` matched Chinese title metadata while displaying English UI and jumping opened `Chapter 33: Value Stream Maps`
    - no-match query showed `没有匹配的章节或页码。`
    - each verified jump closed the TOC panel and left page-level horizontal overflow at 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\toc-search-ch33.png` and ignored by Git.
  - `npm run android:aab`: passed
  - APK size: 37,319,327 bytes
  - AAB size: 35,102,470 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `6e0335b`: passed in run `27918135264`
- Vocabulary review scheduling verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run lint:content`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - Android WebView vocabulary QA:
    - legacy localStorage vocabulary record without review fields migrated with `reviewCount`, `correctStreak`, and `nextReviewAt`
    - tapping `Six Sigma` opened the lookup sheet and saved a new vocabulary record
    - vocabulary dock showed due count after saving terms
    - vocabulary panel summary showed 2 due terms before review
    - `认识` changed one due term to `learning`, incremented `reviewCount`, set `correctStreak: 1`, and scheduled `nextReviewAt` in the future
    - `再记` changed the other due term to `learning`, incremented `reviewCount`, reset `correctStreak: 0`, and scheduled `nextReviewAt` in the future
    - after both actions, due queue showed the empty-state message and the all filter showed both stored terms
    - vocabulary panel horizontal overflow remained 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\vocab-review-schedule.png` and ignored by Git.
  - `npm run android:aab`: passed
  - APK size: 37,320,403 bytes
  - AAB size: 35,103,544 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `3d3aeda`: passed in run `27918381489`
- Language toggle block-position verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - `node scripts\qa-language-toggle-cdp.mjs`: passed against WebView CDP forwarded from `webview_devtools_remote_10329`
  - Android WebView QA on Chapter 26 page 325:
    - starting English block index: 120
    - after switching to Chinese: same section, block index 120, horizontal overflow 0
    - after switching back to English: same section, block index 119, horizontal overflow 0
    - tap-to-lookup still opened the bottom sheet after language round trip
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\language-toggle-block-qa.png` and ignored by Git.
  - `npm run lint:content`: passed
  - `npm run android:aab`: passed
  - APK size: 37,320,771 bytes
  - AAB size: 35,103,911 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `0200752`: passed in run `27918692602`
- Offline dictionary expansion verification:
  - `npm run extract:manual`: passed with 33 chapters, 4640 English blocks, and 4902 Chinese blocks
  - Generated dictionary count: 69 terms and 164 normalized lookup entries with no duplicate lookup keys
  - Runtime dictionaries in `content/processed/manual.json`, `apps/reader/public/content/manual.json`, `content/processed/dictionary/six-sigma-terms.json`, and `apps/reader/src/generated/six-sigma-terms.json` all include `Minitab` and `to`
  - `npm run lint:content`: passed with 69 dictionary terms
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - `node scripts\qa-language-toggle-cdp.mjs`: passed and verified clicked word `to` shows translation `到；为了；对；不定式标记` with `usedFallback: false`
  - `npm run android:aab`: passed
  - APK size: 37,324,727 bytes
  - AAB size: 35,107,864 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `8f5e22a`: passed in run `27918946391`
- Vocabulary CSV export verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - `node scripts\qa-vocab-export-cdp.mjs`: passed
  - Android WebView QA seeded two vocabulary terms and verified:
    - generated CSV has 3 rows including the header
    - header starts with `term,translation,status`
    - `Six Sigma` learning row is present
    - quoted text with commas is escaped correctly
    - export fallback copied CSV and showed the expected status message
    - vocabulary panel horizontal overflow remained 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\vocab-export-qa.png` and ignored by Git.
  - `npm run lint:content`: passed
  - `npm run android:aab`: passed
  - APK size: 37,325,443 bytes
  - AAB size: 35,108,584 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `c59e364`: passed in run `27919147810`
- Study notes verification:
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - Release APK install and relaunch on `emulator-5554`: passed
  - `node scripts\qa-notes-cdp.mjs`: passed
  - Android WebView QA selected Chinese text in Chapter 1 page 6, saved it as a note, verified `language: zh`, `page: 6`, and `sectionId: data-driven-processes`, edited the note text, and confirmed horizontal overflow 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\notes-panel-qa.png` and ignored by Git.
  - `npm run lint:content`: passed
  - `npm run android:aab`: passed
  - APK size: 37,326,123 bytes
  - AAB size: 35,109,276 bytes
  - APK/AAB package checks: 470 figure PNG files, `manual.json`, and `asset-manifest.json` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `f86d093`: passed in run `27919359517`
- Full-manual validator verification:
  - `npm run lint:content`: passed with strengthened checks for chapter count, page count, page continuity, manifest paths, duplicate IDs, missing bilingual titles/text, image asset consistency, and dictionary lookup uniqueness
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - GitHub issue #6 updated with the new validator evidence
  - GitHub Actions CI for `48f63e2`: passed in run `27919503459`
- PWA offline installation verification:
  - `npm run build`: passed
  - Vite preview served the production app at `http://127.0.0.1:4175/`
  - Clean headless Chrome CDP ran on `http://127.0.0.1:9333/json`
  - `node scripts\qa-pwa-offline-cdp.mjs`: passed
  - Service worker cache: `six-sigma-study-v0.4.0`
  - Online cache contents: 479 entries with `/`, `/index.html`, hashed JS/CSS shell assets, `content/manual.json`, `manifest.webmanifest`, and 470 figure assets
  - Offline reload state: `Chapter 1: What is Six Sigma?`, 23 rendered sections, service-worker controller present, and horizontal overflow 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\pwa-offline-qa.png` and ignored by Git.
  - `npm run lint:content`: passed
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - `npm run android:aab`: passed
  - APK size: 37,326,351 bytes
  - AAB size: 35,109,500 bytes
  - APK/AAB package checks: 479 public runtime entries covering reader shell assets, PWA manifest/service worker, `manual.json`, `asset-manifest.json`, and 470 figure PNG files
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `7f5d2ec`: passed in run `27919872550`
- Manual-scoped offline learner dictionary verification:
  - ECDICT source CSV kept outside Git at `D:\0A OpenClaw\projects\6sigma\sources\ecdict.csv` (65,933,428 bytes)
  - `npm run build:dictionary`: passed
  - Dictionary generation stats: 6137 manual lookup candidates, 5848 covered candidates, 5673 single-word forms, 5582 covered single-word forms
  - Runtime dictionary count: 3952 entries, including 3860 ECDICT-derived entries and 92 curated course-term entries
  - Key curated hits verified: `COPQ`, `DMADV`, `DMADOV`, `poka-yoke`, `5S`, `Anderson-Darling`, `EWMA`, `CTC`, `CSSC`, `change management`
  - `node scripts\qa-dictionary-cdp.mjs`: passed against Vite preview and clean Chrome CDP
  - Browser QA clicked `both` in the reader and verified Chinese translation, phonetic text, explanation text, and horizontal overflow 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\dictionary-lookup-qa.png` and ignored by Git.
  - `npm run lint:content`: passed with 3952 dictionary terms
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `npm run android:release-apk`: passed
  - `npm run android:aab`: passed
  - APK size: 37,796,343 bytes
  - AAB size: 35,579,485 bytes
  - APK/AAB package checks: 479 public runtime entries covering reader shell assets, PWA manifest/service worker, `manual.json`, `asset-manifest.json`, and 470 figure PNG files
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings
  - GitHub Actions CI for `cca06d3`: passed in run `27920406057`
- Full-manual language toggle sweep verification:
  - `node --check scripts\qa-language-toggle-sweep-cdp.mjs`: passed
  - `npm run lint:content`: passed
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `node scripts\qa-language-toggle-sweep-cdp.mjs`: passed against Vite preview and clean Chrome CDP
  - Sweep sample count: 33 chapters
  - Result: 0 failures; every sample stayed in the same section through EN -> ZH -> EN, block index remained within tolerance, and horizontal overflow stayed 0
  - Local QA screenshot captured at `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\qa\screenshots\language-toggle-sweep-qa.png` and ignored by Git.
  - GitHub Actions CI for `365fe1a`: passed in run `27920637568`
- Source coverage and block-page-anchor verification:
  - `npm run extract:manual`: passed with 33 chapters, 4640 English blocks, and 4902 Chinese blocks
  - `npm run lint:content`: passed with block page anchors required for generated section lessons and complete EN/ZH page coverage from 6 through 449
  - `npm run qa:source-coverage`: passed
  - Source PDF page count: 557
  - Manual page count: 449
  - Generated content blocks checked by source coverage QA: 9542
  - Image blocks checked by source coverage QA: 940
  - Asset manifest/package assets checked by source coverage QA: 470
  - Source TOC sections: 142, with 127 matched generated section anchors and 15 explicitly allowed normal-paragraph source headings
  - Nonblank Poppler source render samples: pages 9, 73, 396, 544, and 555
  - `node --check scripts\qa-dictionary-cdp.mjs`: passed after making the script reset to Chapter 1 English before lookup
  - `node --check scripts\qa-language-toggle-sweep-cdp.mjs`: passed after making the script wait for the final language-switch layout restoration pass
  - `npm run typecheck`: passed
  - `npm run build`: passed
  - `node scripts\qa-dictionary-cdp.mjs`: passed with 3952 dictionary entries, 3860 ECDICT entries, real lookup for `both`, phonetic rendering, and horizontal overflow 0
  - `node scripts\qa-language-toggle-sweep-cdp.mjs`: passed with 33 samples, 0 failures, exact same-block restoration for every sampled chapter, and horizontal overflow 0
  - `npm run android:release-apk`: passed
  - `npm run android:aab`: passed
  - APK size: 37,822,535 bytes
  - AAB size: 35,605,671 bytes
  - APK/AAB package checks: 481 public runtime entries, 470 figure PNG files, `manual.json`, `asset-manifest.json`, `manifest.webmanifest`, and `sw.js` are present
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`
  - AAB `jarsigner -verify`: verified with expected self-signed certificate warnings

## 2026-06-23 Multi-Book Product Core Update

- GitHub issue planning:
  - Created bounded issues #9 through #18 for multi-book catalog, book-scoped storage, opening notice, GitHub/watermark, scroll containment, page/progress UI, immersive mode, alignment anchors, dictionary scoping, and QA gates.
- Product/runtime implementation:
  - Added runtime catalog at `apps/reader/public/content/catalog.json` with first book `six-sigma-black-belt`.
  - Added bilingual opening notice: public study material, personal study/translation use, no commercial use, not an official CSSC product, original rights retained by the rights holder.
  - Added home/library view with one Six Sigma book card and a natural GitHub profile link to `https://github.com/Felix-Zuo`.
  - Added subtle author/non-commercial watermark on home and reader screens.
  - Added `bookId`, `bookTitle`, optional `contentVersion`, and `blockId` to vocabulary and note records; old records normalize to `six-sigma-black-belt`.
  - Added `bookId`, `page`, and `blockId` to reader position persistence.
  - Added rendered `data-block-id` and `data-page` anchors for all block types.
  - Reworked page UI to show current page, full-book progress, chapter page range, chapter progress, and deduplicated page rail.
  - Added page-level TOC search; verified page 340 inside long Chapter 26 section jumps to the matching block.
  - Added bottom-sheet/body scroll lock with `overscroll-behavior: contain`.
  - Added immersive reading mode with Android/back-button-aware exit path and hidden chrome/docks.
  - Added return-to-source actions from lookup sheet, vocabulary entries, and notes.
  - Shortened lookup source context to sentence/near-sentence snippets instead of saving full long paragraphs.
- Validation completed in this stage:
  - `npm run typecheck`: passed.
  - `npm run build`: passed.
  - `npm run lint:content`: passed after adding catalog validation.
  - `npm run qa:source-coverage`: passed; sourcePdfPages=557, manualPages=449, chapters=33, contentBlocks=9542, imageBlocks=940, assets=470.
  - `npm run qa:multibook-ux`: passed against Vite dev server `http://127.0.0.1:4177/` and Chrome CDP `http://127.0.0.1:9333/json`.
  - `node scripts\qa-vocab-export-cdp.mjs`: passed; verified legacy vocab migration to `bookId`, CSV escaping, current-book export, and no horizontal overflow.
  - `node scripts\qa-notes-cdp.mjs`: passed; verified note `bookId`, Chinese selection save/edit, and no horizontal overflow.
  - `node scripts\qa-android-key-chapters-cdp.mjs`: passed against Chrome CDP as WebView-equivalent check for Chapters 1, 7, 26, and 33; verified lookup, EN/ZH block restoration, image counts, no broken images, and no horizontal overflow.
  - `npm run android:release-apk`: passed.
  - `npm run android:aab`: passed.
  - Release APK: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`, 37,823,763 bytes.
  - Release AAB: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`, 35,607,003 bytes.
  - APK/AAB package contents: 473 checked runtime content entries, covering `catalog.json`, `manual.json`, `asset-manifest.json`, and 470 figure PNG files.
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`.
  - AAB `jarsigner -verify`: verified with expected self-signed certificate path warnings.
- Current screenshots:
  - `qa/screenshots/multibook-ux-qa.png`
  - `qa/screenshots/vocab-export-qa.png`
  - `qa/screenshots/notes-panel-qa.png`
  - `qa/screenshots/android-key-ch01-zh.png`, `android-key-ch07-zh.png`, `android-key-ch26-zh.png`, `android-key-ch33-zh.png`, plus lookup/image screenshots.
- Next required validation before completing the goal:
  - None for this multi-book product core pass.

## 2026-06-24 Public Showcase And Agent Import Update

- GitHub issue planning:
  - Created bounded target-two issues #19 through #28 for public compliance, runtime local-path cleanup, Agent import contract, sample book, README/showcase, screenshots/systems docs, benchmark research, GitHub surface, and final verification.
- Public compliance and repository surface:
  - Confirmed repository visibility is `PUBLIC`.
  - Updated GitHub description to `Local-first Android bilingual textbook study app with Agent import pipeline`.
  - Added topics: `android`, `pwa`, `bilingual-learning`, `six-sigma`, `textbook-reader`, `local-first`, `vocabulary`, and `content-pipeline`.
  - Added `LICENSE`, `NOTICE.md`, `ATTRIBUTION.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `PUBLIC_READINESS.md`.
  - Updated `THIRD_PARTY_NOTICES.md` with CSSC training-materials source and non-commercial/no-official-endorsement boundary.
  - Added `scripts/audit_public_ready.py` and `npm run audit:public`; CI now runs the public audit.
  - Removed local source paths from runtime JSON and source metadata, replacing `enDocx`, `zhDocx`, and `sourcePdf` with public-safe provenance fields.
  - Set Android `android:allowBackup="false"` so local WebView/localStorage study data is not included in system backup by default.
- Agent textbook import interface:
  - Added `docs/agent-import.md`.
  - Added `content/schemas/agent-import-request.schema.json` and `content/schemas/book-package.schema.json`.
  - Added `scripts/import_book_agent_contract.py`, `npm run lint:books`, and `npm run qa:book-import`.
  - Added safe synthetic sample request at `samples/agent-import/sample-book-request.json`.
  - Added safe synthetic sample book package at `content/books/agent-import-sample/manual.json` and public runtime copy at `apps/reader/public/content/books/agent-import-sample/manual.json`.
  - Updated both runtime catalogs to include `six-sigma-black-belt` and `agent-import-sample`.
  - Updated the service worker so install-time precache reads catalog book `contentPath` values.
- Showcase and documentation:
  - Rebuilt `README.md` as a public portfolio entry with product snapshot, screenshots, learning workflow, features, diagrams, Agent import docs, validation matrix, Android build notes, limits, and roadmap.
  - Added public showcase screenshots under `docs/assets/showcase/`.
  - Added `docs/09-showcase-systems.md` with architecture, content pipeline, Agent interface, and verification matrix diagrams.
  - Added competitor/showcase research at `docs/research/showcase-benchmark.md`.
  - Added `scripts/check_docs_links.py`, `npm run docs:links`, and CI link checking.
- Validation completed in this stage:
  - `npm run lint:content`: passed with 2 catalog books and the existing 33-chapter Six Sigma manual profile.
  - `npm run lint:books`: passed; validated Agent request, generic book packages, catalog uniqueness, page continuity, safe assets, dictionary lookup uniqueness, and sample-book presence.
  - `npm run qa:book-import`: passed for `agent-import-sample`.
  - `npm run audit:public`: passed; tracked-file denylist and runtime JSON local-path scan passed.
  - `npm run docs:links`: passed across 18 Markdown files.
  - `npm run typecheck`: passed.
  - `npm run build`: passed.
  - `npm run qa:source-coverage`: passed; sourcePdfPages=557, manualPages=449, chapters=33, contentBlocks=9542, imageBlocks=940, assets=470, sourceTocSections=142, sourceTocMatchedSections=127, allowedUnmatchedSourceSections=15.
  - `npm run qa:multibook-ux`: passed against Vite preview and Chrome CDP; verified 2-book home, sample book load, sample `bookId` vocabulary save, Six Sigma page 340 jump, bottom-sheet scroll containment, Six Sigma `bookId` vocabulary save, and immersive mode.
  - `node scripts\qa-notes-cdp.mjs`: passed; verified a pre-existing sample-book note stays hidden while Six Sigma is active, and new Six Sigma notes persist with `bookId`.
  - `npm run android:release-apk`: passed.
  - `npm run android:aab`: passed.
  - Release APK: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`, 37,831,752 bytes.
  - Release AAB: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`, 35,615,154 bytes.
  - APK/AAB package contents: `catalog.json`, Six Sigma `manual.json`, `books/agent-import-sample/manual.json`, `asset-manifest.json`, and 470 figure PNGs are present.
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`.
  - AAB `jarsigner -verify -certs`: verified with expected self-signed/no-timestamp certificate warnings.
  - Release merged manifest confirms `android:allowBackup="false"`.

## 2026-06-25 Target Two Finalization

- Final public showcase / Agent import commit: `277bd4b6e5098cd97ace8774b94e86d95249167a`.
- Public repository URL verified with HTTP 200: `https://github.com/Felix-Zuo/six-sigma-study-app`.
- GitHub Actions CI run `28132353539` passed on `main` for the final commit.
- Closed target-two GitHub issues #19 through #28 with evidence comments.
- Final local worktree was verified clean after commit and push.

## 2026-06-25 Target Three Product Experience Update

- Target-three issue planning:
  - Created bounded issues #29 through #40 for the automatic opening, study workbench/home navigation, per-book reading progress, independent vocabulary/notes/favorites pages, Chinese image fidelity, draggable bottom sheet, reader GUI, settings/about/data management, motion/safe-area polish, and final QA/Android/CI closure.
  - Four-role review completed through product manager, learner, UI/motion designer, and code engineer perspectives; duplicated findings were consolidated into the #29-#40 issue set.
- Product/runtime implementation:
  - Replaced the click-to-accept opening with an automatic logo animation and short bilingual non-commercial sentence.
  - Moved the full copyright/source/non-commercial notice to the settings/about area.
  - Rebuilt the home view as a study workbench with continue-learning, study metrics, book progress, recent notes, and bottom navigation.
  - Added top-level pages for Library, Vocabulary, Notes, Favorites, and Settings.
  - Added `favoriteStore.ts` and `bookId`-scoped favorites with source anchors and source-return actions.
  - Upgraded reader positions to a `bookId -> position` map while preserving legacy single-position migration.
  - Added independent vocabulary, notes, and favorites workflows with book filtering, search, sorting, and source return.
  - Preserved reader-side quick lookup, save-to-vocabulary, selected-text note saving, favorite current source, immersive reading, TOC, progress rail, and EN/ZH switching.
  - Fixed Chinese-mode figure loss by injecting missing English image blocks into Chinese sections only where the Chinese stream has fewer image blocks.
  - Rebuilt the bottom sheet interaction with pointer/touch dragging, half/full snap heights, stronger handle affordance, scroll containment, and body scroll lock.
  - Hid floating reader docks while a bottom sheet is open and removed opacity-based sheet entry so the panel remains readable during animation.
  - Added note/favorite source markers in the reading body.
  - Refined mobile GUI: bottom navigation, restrained surfaces, safer spacing, safe-area padding, reduced long explanatory copy, and `prefers-reduced-motion` support.
- Validation completed in this stage:
  - `npm run lint:content`: passed.
  - `npm run lint:books`: passed.
  - `npm run qa:book-import`: passed for `agent-import-sample`.
  - `npm run audit:public`: passed tracked-file denylist and runtime local-path scan.
  - `npm run docs:links`: passed across 18 Markdown files.
  - `npm run typecheck`: passed.
  - `npm run build`: passed; current Vite output includes `assets/index-CF1ldPoX.css` and `assets/index-BOa1HJ7L.js`.
  - `npm run qa:source-coverage`: passed; sourcePdfPages=557, manualPages=449, contentBlocks=9542, imageBlocks=940, assets=470.
  - `npm run qa:target3-product`: passed; verified automatic opening, short bilingual copy, bottom navigation, two-book home, English reader, Chinese reader with images, draggable half/full lookup sheet, scroll lock, saved term/favorite `bookId`, and independent vocabulary/notes/favorites pages.
  - `npm run qa:notes`: passed; verified Chinese selection note save/edit, book filter isolation, and 0 horizontal overflow.
  - `npm run qa:image-fidelity`: passed for Chapters 1, 7, 26, and 33 with EN/ZH image counts 2/2, 14/14, 50/50, and 25/25, no broken images, lookup success, and 0 horizontal overflow.
  - `npm run qa:sheet-gestures`: passed with the same draggable half/full sheet and scroll-containment checks.
  - `npm run android:release-apk`: passed.
  - `npm run android:aab`: passed.
  - Release APK: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\apk\release\app-release.apk`, 37,836,140 bytes.
  - Release AAB: `D:\0A OpenClaw\projects\6sigma\six-sigma-study-app\android\app\build\outputs\bundle\release\app-release.aab`, 35,619,526 bytes.
  - APK/AAB package contents: APK 919 entries, AAB 927 entries; both contain `catalog.json`, Six Sigma `manual.json`, Agent sample `manual.json`, and 470 figure PNG assets.
  - APK `apksigner verify --print-certs`: passed with certificate SHA-256 `126c115cba42287dfbe62a8b49b40884a508d92257570ebd478bf1edd79418ba`.
  - AAB `jarsigner -verify -certs`: verified with expected local self-signed/no-timestamp certificate warnings.
  - Target-three screenshots saved under `qa/screenshots/target3-01-splash.png` through `target3-09-favorites.png`; public-safe copies are committed under `docs/assets/showcase/target3-*.png`.
- Known limitations after this stage:
  - Physical-device long-press and drag QA remains separate from CDP/WebView-equivalent checks.
  - Sentence-level semantic alignment is still not separately modeled; accepted alignment remains section/block based.
  - Inline note highlighting is implemented as source-block markers, not exact selected-text range highlights.
  - Agent import remains a validated contract/sample path rather than a complete one-command converter for arbitrary PDF/DOCX input.

## Known Limitations

- The release signing key is a local self-signed key for this project; store upload key policy and distribution channel are not finalized.
- Chapters 2-33 now use source-TOC-guided section anchors where reliable Word headings exist; the source coverage validator tracks 15 allowed unmatched source headings whose titles are normal paragraphs and need curated manual mapping before further splitting.
- Language position preservation remains block-aware and has Android WebView/browser-sweep coverage; clicked-word meanings and lookup examples now use a separate sentence/occurrence alignment index.
- Phrase lookup works through WebView text selection and stores the selected phrase's source section/page; physical long-press QA on a real phone is still pending.
- English tables in Chapter 1 are partly represented as Word paragraph fragments; Chinese tables render as semantic tables.
- Long chapters now keep all visible English text immediately clickable and retain reader comfort controls; deeper low-end-device profiling is still pending.
- Detailed sentence-level scroll anchors can still be added later; current accepted language-switch behavior is section/block-level restoration, independent from the sentence-level lookup glossary.
- Figure assets now preserve DOCX-embedded originals, and source coverage QA samples nonblank Poppler renders from the source PDF; exhaustive 557-page pixel comparison is intentionally not part of the normal gate.
- Some extracted table images are intentionally rendered as images; later passes can convert selected tables to semantic tables where fidelity allows.
- The offline dictionary is manual-scoped, not a full arbitrary English dictionary; remaining fallback tokens are mostly proper names, OCR/formatting artifacts, URLs, and unusual compounds.

## Open GitHub Work Items

- None

## Closed GitHub Work Items

- #9 建立多教材 Catalog 和主页入口
- #10 学习数据按教材隔离并兼容迁移旧数据
- #11 添加 Logo 开幕和中英文非商业说明
- #12 主页和关于入口加入 GitHub 链接与克制水印
- #13 修复底部半屏面板滚动穿透
- #14 重做页码和阅读进度 UI
- #15 添加沉浸阅读模式并处理 Android 返回键
- #16 提高中英文切换后的段落/块级对齐
- #17 改造词典和术语层以支持多教材
- #18 补齐多教材和关键阅读体验 QA
- #19 建立公开合规内容边界与 public-readiness 记录
- #20 清理 runtime JSON 本机路径并加入公开审计门禁
- #21 定义 Agent 教材导入输入契约和输出 book schema
- #22 实现 Agent 导入 contract validator 与 sample book
- #23 用第二本安全样例证明多教材 runtime
- #24 将 README 重做为作品集级展示入口
- #25 提交展示截图和系统展示文档
- #26 完成竞品和优秀展示页调研
- #27 完善 GitHub public surface 和社区健康项
- #28 完成目标二最终验证、Android 构建、CI 和 issue closure
- #29 Target 3 automatic opening animation and short non-commercial copy
- #30 Target 3 bottom navigation and study workbench home
- #31 Target 3 per-book reading progress
- #32 Target 3 independent vocabulary page with filters/search/sort/source return
- #33 Target 3 independent notes page and source markers
- #34 Target 3 book-scoped favorites/bookmarks page
- #35 Target 3 Chinese-mode image fidelity
- #36 Target 3 draggable bottom sheet interaction
- #37 Target 3 reader chrome and core reading GUI polish
- #38 Target 3 settings/about/data management page
- #39 Target 3 restrained motion system and mobile safe-area polish
- #40 Target 3 QA, screenshots, Android builds, CI, and issue closure
- #1 Build Chapter 1 content extraction pipeline
- #3 Implement tap-to-lookup bottom sheet
- #4 Seed curated Six Sigma terminology dictionary
- #5 Persist vocabulary book locally
- #7 Add PWA offline installation support
- #8 Expand offline English learner dictionary coverage
- #2 Implement reader position-preserving language toggle
- #6 Design full-manual conversion validator

## Resume Protocol

After context compression or a new session, do this before making changes:

1. Read this file.
2. Run `git status --short` and `git log --oneline --decorate -5`.
3. Read `README.md`, `docs/03-content-pipeline.md`, `docs/04-data-model.md`, and the active GitHub issues.
4. Continue from the next action below instead of restarting the project from scratch.

## Next Action

Future product polish: improve curated manual section mapping for the 15 normal-paragraph source headings, run physical-phone long-press QA, add inline highlight rendering for saved notes, review remaining dictionary fallback tokens, and perform low-end-device performance profiling.

## Constraints

- Do not commit raw PDF, DOCX, or full-page rendered PNG assets unless explicitly approved.
- Keep processed app content structured and small enough for GitHub.
- Update this state file after each major implementation or verification stage.
- If the same blocker repeats three times, record the failed attempts and the exact user action needed.
