# Beta 0.8.3 Design QA

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

## Acceptance

| Area | Result | Evidence |
| --- | --- | --- |
| Reference fidelity | Passed | Same page-stack composition, matte palette, strong foreground page, exposed destination layers, restrained bottom navigation |
| Home hierarchy | Passed | Brand, continue action, progress, and three study metrics fit in one first-viewport page |
| Reader EN/ZH | Passed | Same anchored reader structure, stable chrome, images retained in both languages |
| Bottom sheet | Passed | About 52% half state, about 92% full state, body lock and `overscroll: contain` |
| Learning modules | Passed | Vocabulary recall, contextual answer, question lookup, unknown explanation, correct auto-advance |
| Accessibility | Passed | Keyboard focus states, semantic buttons, reduced-motion fallback, no clipped text or horizontal overflow |
| Screenshot stability | Passed | QA captures wait for the layered transition to finish before recording evidence |

Final result: **passed**.
