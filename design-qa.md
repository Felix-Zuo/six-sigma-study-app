# Beta 0.8.8 Design QA

## Target

- Direction: `Quiet Aperture`, selected from the first visual exploration.
- Reference: `docs/assets/showcase/beta-0.8.3-selected-reference.png`.
- Final Android capture: `docs/assets/showcase/target4-home.png`.
- Side-by-side evidence: `docs/assets/showcase/beta-0.8.3-reference-vs-implementation.png`.
- Primary viewport: 390 x 844 CSS pixels, Android WebView DPR 2, captured at 780 x 1688 pixels.

## Design Contract

- Calm matte surfaces at rest, with warm neutral background and deep ink typography.
- One dominant accent plus one restrained secondary accent per product area.
- Spatial depth comes from page occlusion, scale, perspective, and independent easing, not neon, glossy glass, or decorative gradients.
- The home screen behaves as one foreground study page with functional page-edge destinations behind it.
- Navigation, language switching, bottom sheets, and content layers use bounded motion with a reduced-motion fallback.
- Existing reading, vocabulary, question, note, favorite, and settings workflows must remain functional.

## Review Rounds

### Round 1: Baseline

- Captured the old 390 x 844 home and audited existing selector-dependent QA.
- Rejected the old floating capsule navigation, card-heavy dashboard, and uniform green treatment.
- Preserved compatibility selectors such as `.mainNav`, `.metricGrid`, `.bookCard`, `.vocabPlanHero`, and `.questionModeCards`.

### Round 2: Structural Implementation

- Rebuilt the home as a foreground page with independently settling rear layers and four functional page-edge destinations.
- Flattened navigation, library, settings, notes, and reader sections into quieter bands and lists.
- Added native View Transition routing, layered page-entry motion, language morphing, and reduced-motion handling.
- Corrected reader edge padding, real progress-ring data rendering, empty-state styling, and the crowded streak label.

### Round 3: Android Visual And Functional QA

- Installed `0.8.3-beta` on `emulator-5554` and captured real WebView screenshots.
- Added a 1250 ms visual-settle boundary to screenshot helpers after evidence images caught intentional mid-transition frames.
- Re-ran the home, reader EN/ZH, lookup half/full, vocabulary, flashcard, question dashboard, and question lookup captures.
- Confirmed zero horizontal overflow in every checked flow.

### Round 4: Interaction, Theme, And Motion Repair

- Rechecked home, vocabulary, question training, settings, and Reader at 390 x 844, plus breakpoint automation from 759 through 860 pixels.
- Fixed dark page-accent contrast and removed the conflicting generic blue primary action from dark module pages.
- Removed the second layer-settle animation that could start after a native View Transition completed.
- Added predictable page-top navigation, reachable empty states, true disabled styling, fixed question-session navigation, and touch-sized question-bank import.

### Round 5: Independent Reverse Audit And Release

- Ran separate logic and mobile UX reviews against the complete diff, then converted reproducible findings into permanent regression checks.
- Verified the release APK on `emulator-5554` at 1080 x 2148 device pixels, including the private 1006-question local build and spatial home stack.
- Exercised Android back priority through question session, Reader tools, immersive reading, and lookup sheet; every temporary layer closed before its parent page.
- Added one roving keyboard entry point per reading/question surface, arrow-key word traversal, focus restoration after lookup, and Chinese accessible names throughout the primary UI.
- Replayed the maturity suite under Vite development/StrictMode and replaced mount-count persistence guards with state snapshots so initial local data is never rewritten merely because effects are replayed.
- Re-ran content, data isolation, learning, AI context, motion, image, APK, AAB, signing, install, and launch gates after the final edit.

### Round 6: Cinematic Folder Navigation And Alignment

- Audited every compact framed value at 390 x 844 and corrected centering in home metrics, vocabulary source summaries, question statistics, daily status, and CTA controls. Long-form cards intentionally remain left aligned.
- Assigned stable View Transition names to the folder cover, edge tabs, module surface, Reader page, Reader chrome, page heading, progress, and navigation so each layer can move on its own curve.
- Replaced the generic route fade with five spatial paths: folder extract, folder close, forward/back page turn, book open, and book close. The clicked control supplies the camera origin and travel direction.
- Staged old and new text on non-overlapping intervals after an intermediate-frame review caught both surfaces being readable at once.
- Extended motion QA to traverse all five routes and assert named-layer evidence, source origin, transition settlement, zero overflow, and reduced-motion fallback.
- Captured and inspected the signed Android Release home at 1080 x 2148; folder tabs, metric labels, bottom navigation, and foreground-page bounds remained aligned.

### Round 7: Source-Aware Continuity And Intermediate Frames

- Reproduced the reported path after scrolling the library by 502 CSS pixels and opening its compact book card rather than validating only the first viewport.
- Replaced the oversized Reader-document capture with a viewport-bound paper proxy and restored the destination paragraph before the new snapshot, preventing black capture regions and the late body jump.
- Split compact-card and full-workspace entry choreography. The compact card preserves its title as the visual anchor while card metadata recedes; workspace entry keeps the whole study page as the source plane.
- Tightened old/new content handoff windows in folder extraction and module turns so headings and body copy are never simultaneously readable on competing planes.
- Inspected 90, 240, 430, 680, and 900 ms frames plus the settled state at 390 x 844. Added the same scenario as `qa:motion-continuity` so CI validates the camera layer, named elements, restored scroll position, cleanup, and overflow.
- Installed the signed release on `emulator-5554`, inspected the settled 1080 x 2148 home, and repeated the continuity probe against the live Android WebView rather than relying only on desktop Chrome.

### Round 8: Geometry-Only Real-Time 3D Stage

- Compared the user's failed transition captures with new intermediate frames and confirmed the actual defect: two text-bearing route trees were simultaneously visible while snapshot surfaces were scaled and rotated.
- Removed text-bearing DOM from spatial transforms. A reusable Three.js stage now renders only paper, stacked sheets, edge color, folder tab, and shadow geometry while the live route shell stays at `transform: none`.
- Used an opaque canvas and double-sided materials to eliminate Android transparent-surface black flashes. Source, geometry, and destination are mutually staged instead of layered as readable copies.
- Replaced wall-clock animation jumps with bounded frame integration so WebView stalls produce a slower continuous camera move rather than a sudden teleport.
- Captured departure, arrival, and settled frames for five routes on mobile, desktop, and the installed Android release. Pixel analysis found zero black-frame ratio, and DOM assertions found one live page shell, no stage text, stable heading dimensions, and no horizontal overflow.
- Re-ran the scrolled library-card path, Android back-stack priority, and key-chapter image/lookup checks after the motion rewrite.

## Acceptance

| Area | Result | Evidence |
| --- | --- | --- |
| Reference fidelity | Passed | Same page-stack composition, matte palette, strong foreground page, exposed destination layers, restrained bottom navigation |
| Home hierarchy | Passed | Brand, continue action, progress, and three study metrics fit in one first-viewport page |
| Spatial navigation | Passed | Folder extract/close, module page turn, Reader book open/close, and scrolled-card entry use a geometry-only real-time 3D stage; live text is never transformed |
| Reader EN/ZH | Passed | Same anchored reader structure, stable chrome, images retained in both languages |
| Bottom sheet | Passed | About 52% half state, about 92% full state, body lock and `overscroll: contain` |
| Learning modules | Passed | Vocabulary recall, contextual answer, question lookup, unknown explanation, answer review before explicit next |
| Accessibility | Passed | Keyboard focus states, semantic buttons, reduced-motion fallback, no clipped text or horizontal overflow |
| Screenshot stability | Passed | QA captures intermediate and settled frames, verifies canvas pixels, and asserts stable native-text geometry |

Final result: **passed**.
