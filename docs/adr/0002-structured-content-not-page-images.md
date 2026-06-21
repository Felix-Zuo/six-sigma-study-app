# ADR 0002: Structured Text Instead Of Full Page Images

## Status

Accepted

## Context

Full-page images preserve layout, but they make word tapping, phrase lookup, text resizing, and vocabulary extraction difficult. They also create a large app package.

## Decision

Use structured bilingual text for body content. Preserve figures, complex tables, charts, and formulas as optimized images.

## Consequences

- Word and phrase lookup are practical.
- App package is smaller than image-only rendering.
- More extraction work is required.
- Figure placement needs explicit QA.

