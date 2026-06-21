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
- [x] word tap opens bottom sheet
- [x] curated Six Sigma terms for Chapter 1
- [x] local vocabulary save
- [x] phone viewport QA
- [ ] refine phrase selection QA on real mobile touch behavior
- [ ] decide whether English table fragments should be rebuilt or stored as images

## Phase 2: Full Manual Content Package

Goal: convert all 449 aligned pages into app content.

- [x] generalize chapter extraction beyond Chapter 1
- [x] generate all chapter JSON files
- [x] validate page/chapter mapping at chapter level
- [x] build table of contents inside app
- [ ] preserve figures/tables as optimized assets where semantic extraction is not enough
- [ ] refine section/page anchors for Chapters 2-33
- [ ] add reader virtualization or lazy tokenization for long chapters

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
- offline asset packaging
- local data migration test
- release signing setup

## Phase 5: Polish

Goal: comfortable long-session study.

- dark mode
- font size controls
- page/chapter search
- notes and highlights
- performance profiling on real phone
