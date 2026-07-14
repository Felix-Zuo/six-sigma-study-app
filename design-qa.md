# Beta 0.8.9 Design QA

## Direction

Beta 0.8.9 deliberately replaces the custom folder/camera metaphor with a familiar reading-product hierarchy. The implementation borrows interaction principles, not branding or proprietary visual assets:

- [Apple Books](https://www.apple.com/apple-books/): a clear Now Reading entry, visible progress, and a separate library.
- [Apple Books redesign overview](https://www.apple.com/newsroom/2018/06/apple-books-all-new-for-iphone-and-ipad-celebrates-reading/): reading continuity is primary; collections and progress support it.
- [Readwise Reader FAQ](https://docs.readwise.io/reader/docs/faqs): stable views, restrained reader controls, and content-first navigation.

The result is intentionally quiet: neutral surfaces, one green accent, a real source cover, flat lists, and short opacity-only transitions.

## Source And Prototype Comparison

- User-reported failure: `D:/微信/聊天存储/xwechat_files/wxid_0fvzsp339p7i22_e545/temp/RWTemp/2026-07/9e20f478899dc29eb19741386f9343c8/5e305c51aca9c09f58575addae0ab002.jpg`.
- Previous release evidence: `docs/assets/showcase/beta-0.8.8-release-home.png` and historical screenshots under `tmp/qa`.
- Current mobile home: `docs/assets/showcase/beta-0.8.9-release-home.png`.
- Current vocabulary: `docs/assets/showcase/beta-0.8.9-vocabulary.png`.
- Current practice: `docs/assets/showcase/beta-0.8.9-question-training.png`.
- Combined before/after review: `tmp/qa/reference-vs-beta089-vocab.png`.

The combined comparison confirms that the old exposed folder tabs, translucent competing layers, stretched labels, and overlapping source/destination copy are absent in the current build.

## Design Contract

- Home order is fixed: Now Reading, Today's Study, Library, Recent Notes.
- The bottom navigation always contains Home, Vocabulary, Practice, Notes, and Settings in the same order.
- Every route owns one readable DOM surface. No heading, paragraph, button label, or navigation label is transformed in 3D.
- Route changes use a short source fade, synchronous route commit, and destination fade. Language switching fades only the real Reader panel.
- Reduced motion removes the fade and commits directly.
- Book covers and content figures use real runtime assets; no decorative fake-book artwork is generated.
- Reader, lookup sheet, vocabulary review, question practice, notes, and settings retain their established behavior and accessible names.

## Review Rounds

### Round 1: Hierarchy

- Removed the home folder stack and page-edge destinations.
- Reordered the first screen around reading continuity and flattened study metrics, quick links, library rows, and notes.
- Kept a single-column hierarchy at desktop widths to prevent a marketing-style split screen.

### Round 2: Transition Safety

- Removed Three.js, the WebGL transition stage, camera state, shared-element geometry, and cinematic cleanup code.
- Replaced route animation with opacity only and rewrote motion QA around one-shell ownership, stable text rectangles, interruption cleanup, and Reader-panel language fades.
- Verified reduced-motion fallback and Android back-stack behavior remain independent of animation timing.

### Round 3: Visual And Regression QA

- Inspected Home, Vocabulary, Practice, and Reader at 390 x 844 and Home at 1366 x 900.
- Checked the old screenshot and new implementation in one side-by-side image rather than judging screenshots separately.
- Confirmed the real manual cover is sharp and proportionally cropped, all five navigation items remain visible, compact labels are centered, and no horizontal overflow is introduced.
- Replayed content, multi-book, learning, lexical, AI context, maturity, motion, transition-resilience, and release-build gates.

## Acceptance

| Area | Result | Evidence |
| --- | --- | --- |
| Home hierarchy | Passed | Continue reading leads; study status, library, and recent notes follow in a predictable order |
| Text stability | Passed | One live shell; text rectangles are unchanged; no text-bearing transform or 3D stage |
| Navigation | Passed | Fixed five-item bottom navigation, stable labels, short opacity handoff |
| Reader EN/ZH | Passed | Same anchored Reader structure, position-preserving switch, images retained |
| Learning modules | Passed | Vocabulary, practice, notes, and settings keep their existing data and workflows |
| Accessibility | Passed | Semantic controls, visible focus, reduced-motion direct fallback, no clipped copy |
| Mobile and desktop | Passed | 390 x 844 and 1366 x 900 captures retain one clear hierarchy and zero overflow |

Final result: **passed**.
