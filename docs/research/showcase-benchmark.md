# Showcase Benchmark

Research date: 2026-06-24

## Sources Reviewed

| Product / Project | Type | Source | Useful Pattern |
| --- | --- | --- | --- |
| Anki | spaced repetition learning | https://apps.ankiweb.net/ | Opens with a plain value proposition and immediately explains the memory benefit. Borrow: make the study loop obvious before implementation detail. |
| Readwise Reader | power-reader / read-it-later | https://readwise.io/read | Positions around workflow, not only reading. Borrow: show capture, read, highlight, review as one continuous product story. |
| Language Reactor | bilingual media language learning | https://www.languagereactor.com/ | Frames itself as a toolbox for discovering, understanding, and learning from native material. Borrow: present bilingual switching and lookup as a study environment, not a PDF feature. |
| Readlang | click-to-translate reader and vocabulary | https://readlang.com/ | The homepage ties click-to-translate directly to flashcards. Borrow: explain tap-to-lookup -> save word -> review in one sentence. |
| LingQ | content-based language learning | https://www.lingq.com/en/ | Emphasizes real content and vocabulary learned in context. Borrow: show source-context snippets and book-scoped vocab as the differentiator. |
| KOReader | open-source document reader | https://koreader.rocks/ and https://github.com/koreader/koreader | Strong platform and format support, plus direct links to guide/download/wiki/developer docs. Borrow: make Android/PWA/runtime support and docs routes easy to scan. |
| Immich | open-source product README/showcase | https://github.com/immich-app/immich and https://immich.app/ | Uses screenshots, feature tables, status badges, and an explicit product promise. Borrow: lead with product proof, then architecture and verification. |

## What To Apply Here

1. Lead with the learning workflow: choose book, switch EN/ZH, tap words, save vocabulary, take notes, return to source.
2. Use screenshots as proof, not decoration. The README should show home, reader, lookup sheet, notes/vocab, and image preservation.
3. Keep non-commercial/legal boundaries visible but not louder than the product value.
4. Show the system as a reusable platform: catalog, book packages, Agent import contract, validation gates, Android packaging.
5. Make QA evidence scannable: matrix first, logs and long release notes second.
6. Keep public project trust high: security policy, contributing guide, public-readiness audit, no local paths in runtime JSON, no source PDFs/DOCXs or signing files.

## Positioning Decision

This project should present as:

> A local-first Android/PWA bilingual textbook study platform that turns legally usable technical manuals into aligned reading, lookup, vocabulary, and notes experiences.

It should not present as:

- a static PDF translation
- a one-off Six Sigma demo
- a generic flashcard app
- an official CSSC app

## README Structure To Use

1. Product snapshot and screenshots
2. Learning workflow
3. Feature matrix
4. Architecture and content pipeline diagrams
5. Agent textbook import interface
6. Public rights boundary
7. Validation matrix
8. Android install/build
9. Roadmap and known limits
