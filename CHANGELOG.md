# Changelog

All notable user-facing changes to Fly View (飞阅) are recorded here. The project follows patch-by-patch beta releases; detailed verification evidence remains in `PROJECT_STATE.md` and `docs/08-release-verification.md`.

## [0.8.14-beta.0] - 2026-07-17

### Fixed

- Prevented the vocabulary “今日学习” action from blanking the app when an older FSRS card contains a future `lastReview` timestamp after a device-clock rollback or legacy migration.
- Preserved the affected term and its learning history by aligning only the scheduler clock at review time; completing the card writes back a valid current schedule.
- Extended browser and installed-Android vocabulary QA with the exact future-review fixture, direct-recall card, interval previews, successful rating, persisted schedule repair, and zero-overflow checks.

## [0.8.13-beta.0] - 2026-07-16

### Added

- Clickable vocabulary collections for textbook terms, question terms, mastered terms, and the complete library, with category counts and book-aware filtering.
- Expandable vocabulary rows that keep dictionary meaning concise and reveal context, bilingual examples, optional AI supplements, and an exact source-return action on demand.
- The Fly View / 飞阅 product identity across the opening, home, PWA metadata, Android label, launcher icons, and native splash assets.
- Dedicated mobile CDP coverage for the opening brand, semantic collection controls, 44 px touch targets, category isolation, expanded rows, source actions, and overflow.

### Changed

- Recent vocabulary entries now open the corresponding expanded library record instead of acting as static text.
- Vocabulary category changes return to the top after React commits, preventing a previous scroll-position race.
- Motion remains limited to short opacity/translation feedback; text geometry is never scaled or stretched.

### Fixed

- Replaced the stale Capacitor launcher artwork that was still visible in Android builds.
- Updated Target 4 QA to validate the real image-based opening mark and the new progressive vocabulary disclosure.

## [0.8.12-beta.0] - 2026-07-16

### Added

- FSRS-based vocabulary scheduling with a 90% target retention, per-card stability/difficulty state, review history, and visible next-interval previews.
- Same-session reinforcement: words marked forgotten or fuzzy return at the end of the current session without inflating daily completion counts.
- Session summary for remembered, fuzzy, and forgotten outcomes.
- A maintained `CHANGELOG.md` and a screenshot-backed vocabulary review audit.

### Changed

- Vocabulary review now opens directly on a concise dictionary-meaning retrieval quiz; the old extra reveal step was removed.
- Distractors prefer the same word/phrase kind and part-of-speech family, strip answer-revealing grammar prefixes, and remain bounded in length.
- Answer cards keep the dictionary meaning and short bilingual example visible while moving context, morphology, and optional AI help into progressive disclosure.
- Examples are shortened around the saved source occurrence, and every new card resets its internal scroll position.

### Fixed

- Invalid legacy source offsets are cleared instead of highlighting unrelated text.
- Reinforcement attempts no longer count as extra daily reviews or reschedule the same card multiple times.
- Legacy vocabulary records migrate to FSRS state without losing book, source, context, AI, or streak data.
- A fallback review card now upgrades in place when the asynchronous dictionary finishes loading, avoiding stale or incomplete answer choices.
- Android 16 Back handling now uses one deduplicated hierarchy across Capacitor and document bridge events; a temporary predictive-back compatibility opt-out keeps the existing sheet, immersive, session, and route priority reliable.

## [0.8.11-beta.0] - 2026-07-16

- Made flashcard answers dictionary-first and kept contextual/AI meanings as supporting evidence.
- Added longest-match phrase saving, exact source offsets, short underlined bilingual examples, and a fixed bottom rating dock.
- Added phrase-aware browser and installed-Android vocabulary QA.

## [0.8.10-beta.0] - 2026-07-14

- Stabilized draggable sheets with fixed chrome and contained scrolling.
- Added chapter completion/next-chapter controls and bounded DeepSeek reading/question assistance.
- Stored Android API keys with Android Keystore-backed AES-GCM.

## [0.8.9-beta.0] - 2026-07-14

- Replaced experimental folder/3D navigation with a quiet reading-product hierarchy and stable opacity-only route transitions.
- Reworked Home, Vocabulary, Practice, Notes, and Settings around one live route shell.

## [0.8.8-beta.0] - 2026-07-13

- Limited experimental motion to geometry-only layers and added transition resilience checks.

## [0.8.7-beta.0] - 2026-07-13

- Added source-aware motion continuity and interrupted-navigation cleanup.

## [0.8.6-beta.0] - 2026-07-13

- Introduced the folder-style learning workspace and cinematic transition prototype later retired in 0.8.9.

## [0.8.5-beta.0] - 2026-07-13

- Completed a five-round product maturity pass across reading, vocabulary, practice, notes, and Android behavior.

## [0.8.4-beta.0] - 2026-07-13

- Hardened product state, content loading, interaction regressions, and Android release verification.

## [0.8.3-beta.0] - 2026-07-12

- Added the quiet aperture frontend, richer lexical cards, and expanded browser QA.

## [0.8.2-beta.0] - 2026-07-12

- Added validated DeepSeek context-correction proposals, acceptance, reuse, and export boundaries.
