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

- `chapters/ch01.json`
- `chapters/ch02.json`
- figure assets under `assets/figures/`
- term dictionary under `dictionary/six-sigma-terms.json`
- manifest with page count and checksums

## Processing Steps

1. Extract headings, paragraphs, tables, and images from English and Chinese DOCX.
2. Normalize paragraphs and remove footer/header noise.
3. Align paragraph pairs by chapter, page, and local order.
4. Preserve complex figures/tables as images.
5. Attach figure assets to nearby paragraph/page IDs.
6. Generate stable IDs:
   - `ch01-p0001`
   - `ch01-fig0001`
   - `term-dmaic`
7. Validate JSON against schema.
8. Render spot-check pages in the app.

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

