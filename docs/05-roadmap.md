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

- generalize chapter extraction beyond Chapter 1
- preserve figures/tables as optimized assets
- generate all chapter JSON files
- validate page/chapter mapping
- build table of contents inside app

## Phase 3: Learning System

Goal: make vocabulary learning useful.

- phrase lookup
- review queue
- new/learning/known statuses
- spaced repetition scheduling
- export vocabulary CSV

## Phase 4: Native Packaging

Goal: installable Android app first.

- add PWA manifest and service worker
- wrap with Capacitor
- Android build
- offline asset packaging
- local data migration test

## Phase 5: Polish

Goal: comfortable long-session study.

- dark mode
- font size controls
- page/chapter search
- notes and highlights
- performance profiling on real phone
