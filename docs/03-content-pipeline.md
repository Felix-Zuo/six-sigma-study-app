# Content Pipeline

## Inputs

Local-only files:

- Chinese print DOCX: 449 pages
- English reference DOCX: 449 pages
- rendered PNG/PDF outputs for QA
- source PDF for figure recropping when needed

These files are not committed to Git.

## Outputs

Generated app package:

- `chapters/ch01.json` through `chapters/ch33.json`
- `manual.json` full-manual runtime package
- figure assets under `assets/figures/`
- term dictionary under `dictionary/six-sigma-terms.json` (implemented as Chapter 1 seed)
- manifest with page count and content paths

## Processing Steps

1. Extract headings, paragraphs, tables, and term notes from English and Chinese DOCX.
2. Normalize paragraphs and remove footer/header noise.
3. Align bilingual content by chapter section, page, and local order.
4. Preserve complex figures/tables as images.
5. Attach figure assets to nearby paragraph/page IDs.
6. Generate stable IDs:
   - `ch01-overview-en-001`
   - `ch01-fig0001`
   - `term-dmaic`
7. Validate JSON against schema.
8. Render spot-check pages in the app.

## Current Chapter 1 Implementation

Run:

```powershell
npm run extract:manual
npm run lint:content
```

The manual extractor reads the aligned English and Chinese DOCX files from `C:\findjob_sixsigma_sources`, builds all 33 chapters for pages 6-449, preserves Chinese semantic tables, keeps Chinese term-note sidebars, and seeds 16 local terms for tap lookup.

Chapter 1 has detailed section-level alignment. Chapters 2-33 are currently chapter-level content sections. This is intentional for the second product slice because it gets the full manual into the app while leaving page/section refinement as a controlled follow-up.

## Quality Gates

- chapter page starts match the 449-page print edition
- no empty English or Chinese paragraph pair
- no duplicated paragraph IDs
- image assets exist and are under target size
- curated term references resolve
- sample chapter opens on phone viewport without horizontal overflow

## Open Extraction Problems

- DOCX paragraph order around images must be verified against rendered pages.
- Some tables should stay as images; some may become semantic tables.
- Phrase detection needs a curated phrase list before generic NLP.
- English table recovery needs special handling because some Word tables are represented as heading/paragraph fragments.
- Long chapters render thousands of clickable word tokens; reader virtualization or lazy tokenization is needed before final mobile polish.
