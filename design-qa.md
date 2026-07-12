# Beta 0.8.5 Design QA

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
- Re-ran content, data isolation, learning, AI context, motion, image, APK, AAB, signing, install, and launch gates after the final edit.

## Acceptance

| Area | Result | Evidence |
| --- | --- | --- |
| Reference fidelity | Passed | Same page-stack composition, matte palette, strong foreground page, exposed destination layers, restrained bottom navigation |
| Home hierarchy | Passed | Brand, continue action, progress, and three study metrics fit in one first-viewport page |
| Reader EN/ZH | Passed | Same anchored reader structure, stable chrome, images retained in both languages |
| Bottom sheet | Passed | About 52% half state, about 92% full state, body lock and `overscroll: contain` |
| Learning modules | Passed | Vocabulary recall, contextual answer, question lookup, unknown explanation, answer review before explicit next |
| Accessibility | Passed | Keyboard focus states, semantic buttons, reduced-motion fallback, no clipped text or horizontal overflow |
| Screenshot stability | Passed | QA captures wait for the layered transition to finish before recording evidence |

Final result: **passed**.
