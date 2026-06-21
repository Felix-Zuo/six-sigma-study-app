# Roadmap

## Phase 0: Product Setup

Status: in progress

- private GitHub repository
- PRD
- architecture
- research notes
- content schema
- sample reader prototype
- issue backlog

## Phase 1: Chapter 1 MVP

Goal: prove the study loop on real content.

- [x] extract Chapter 1 into structured bilingual JSON
- [x] render Chapter 1 in mobile reader
- [x] English/Chinese toggle keeps position at section level
- [x] app restart restores last language/chapter/section
- [x] word tap opens bottom sheet
- [x] curated Six Sigma terms for Chapter 1
- [x] local vocabulary save
- [x] phone viewport QA
- [x] verify phrase selection source page/section in Android WebView
- [ ] verify phrase selection long-press behavior on a physical Android phone
- [ ] decide whether English table fragments should be rebuilt or stored as images

## Phase 2: Full Manual Content Package

Goal: convert all 449 aligned pages into app content.

- [x] generalize chapter extraction beyond Chapter 1
- [x] generate all chapter JSON files
- [x] validate page/chapter mapping at chapter level
- [x] build table of contents inside app
- [x] preserve figures/tables as optimized assets where semantic extraction is not enough
- [x] refine section/page anchors for Chapters 2-33 where reliable Word headings exist
- [x] add viewport-bound lazy tokenization for long chapters
- [ ] add curated manual section mapping for chapters whose section titles are normal paragraphs

## Phase 3: Learning System

Goal: make vocabulary learning useful.

- phrase lookup
- review queue
- new/learning/known statuses
- spaced repetition scheduling
- export vocabulary CSV

## Phase 4: Native Packaging

Goal: installable Android app first.

- [x] add PWA manifest and service worker base
- [x] wrap with Capacitor
- [x] Android debug APK build
- [x] bundle static reader assets into debug APK
- [x] emulator install/runtime smoke test
- [x] native Android back button closes reader sheets
- [x] debug reinstall preserves local vocabulary data
- [x] offline app asset packaging for APK/AAB
- [x] release APK signing setup
- [x] release AAB build
- [ ] local data migration test

## Phase 5: Polish

Goal: comfortable long-session study.

- [x] dark mode with persisted reader preference
- [x] font size controls with standard, large, and extra-large reading sizes
- [x] long URL/reference wrapping so extra-large text does not create page-level horizontal scroll
- [ ] page/chapter search
- [ ] notes and highlights
- [ ] performance profiling on real phone
- [ ] low-end-device profiling for long image-heavy chapters
