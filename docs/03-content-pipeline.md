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
- `catalog.json` / `apps/reader/public/content/catalog.json` runtime book registry
- generic Agent-imported packages under `content/books/<bookId>/manual.json`
- runtime copies under `apps/reader/public/content/books/<bookId>/manual.json`
- `content/source/source_toc_sections.json` source table-of-contents metadata for section anchors
- deduplicated figure assets under `apps/reader/public/content/assets/figures/`
- `apps/reader/public/content/assets/asset-manifest.json`
- term and learner dictionary under `dictionary/six-sigma-terms.json`
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
7. Estimate a page anchor for every generated content block inside the chapter/section page range.
8. Generate or update the book catalog with `bookId`, source notice, language pair, and runtime content path.
9. Validate JSON against schema, catalog, and source coverage gates.
10. Render spot-check pages in the app.

## Agent Import Path

Future textbooks should enter through the Agent contract documented in `docs/agent-import.md`.

The minimal committed path is:

1. Write an Agent request that follows `content/schemas/agent-import-request.schema.json`.
2. Generate or provide a book package that follows `content/schemas/book-package.schema.json`.
3. Store the source-controlled package under `content/books/<bookId>/manual.json`.
4. Copy the runtime package to `apps/reader/public/content/books/<bookId>/manual.json`.
5. Add a catalog entry to both `content/processed/catalog.json` and `apps/reader/public/content/catalog.json`.
6. Run `npm run lint:books` and `npm run qa:book-import`.

The current safe sample is `agent-import-sample`. It is fully synthetic and proves that new books can enter the home library without changing the reader core.

## Current Chapter 1 Implementation

Run:

```powershell
npm run extract:manual
npm run lint:content
npm run qa:source-coverage
```

The manual extractor reads the aligned English and Chinese DOCX files from `D:\0A OpenClaw\projects\6sigma\sources`, builds all 33 chapters for pages 6-449, uses source table-of-contents metadata to split generic chapters into stable section anchors where Word headings exist, preserves Chinese semantic tables, keeps Chinese term-note sidebars, extracts DOCX-embedded figures/tables in body order, deduplicates them by content hash, and builds the offline learner dictionary when `D:\0A OpenClaw\projects\6sigma\sources\ecdict.csv` exists.

Current generated content includes:

- 33 chapters
- 449 page manifest
- 9542 generated content blocks with per-block page anchors
- 470 deduplicated PNG figure assets, about 31.7 MB total
- 940 image blocks across English and Chinese content streams
- 3952 offline dictionary entries: curated Six Sigma/course terms plus a manual-scoped ECDICT learner subset
- `asset-manifest.json` for PWA figure pre-cache
- `catalog.json` with `six-sigma-black-belt` as the first book and bilingual non-commercial source notice

The Android runtime bundles these assets inside the APK/AAB. Native Android does not register the PWA service worker, so app upgrades are not blocked by stale browser caches.

Chapter 1 has hand-defined detailed section alignment. Chapters 2-33 now use source-TOC-guided sectionization where matching Word headings exist, falling back to chapter-level sections only when the body lacks reliable headings, such as Chapter 28.

The source TOC metadata is generated from the local source PDF with:

```powershell
python scripts/extract_source_toc.py
```

The source PDF is copied locally to `D:\0A OpenClaw\projects\6sigma\sources\source_manual.pdf` and is not committed.

`npm run qa:source-coverage` expects Poppler under the pure-English local tool path `D:\0A OpenClaw\projects\6sigma\tools\findjob_sixsigma_tools\poppler\Library\bin` when available. It falls back to the bundled Codex Poppler path or `PATH` binaries.

## Quality Gates

- full manual has 33 chapters, `pageCount` 449, first study page 6, and continuous chapter page ranges
- manifest chapter paths resolve to generated chapter JSON files
- every generated content block has a page anchor inside the chapter range
- English and Chinese block page anchors cover every page from 6 through 449
- no empty English or Chinese paragraph pair
- no duplicated section IDs or block IDs inside chapters or across `manual.json`
- image blocks have valid asset IDs, dimensions, safe relative paths, existing files, and matching chapter asset metadata
- chapter assets are referenced by image blocks and stay inside the chapter page range
- dictionary lookup keys are normalized with the reader-style lookup shape and cannot collide across entries
- production dictionary has at least 3000 entries and includes ECDICT-derived learner entries
- APK/AAB package checks confirm all 470 figure assets are bundled
- curated term references resolve
- source coverage QA confirms the 557-page source PDF, 142 source TOC sections, 127 matched source section anchors, 15 explicitly allowed normal-paragraph source headings, 470 app assets, and nonblank Poppler renders for sampled source pages 9, 73, 396, 544, and 555
- sample chapter opens on phone viewport without horizontal overflow
- catalog validation confirms every book has `bookId`, bilingual title, language pair, source notice, and a resolvable runtime `contentPath`
- Agent book validation confirms safe `content/books/<bookId>` runtime paths, continuous page ranges, block page anchors, unique book IDs, unique dictionary lookup keys, safe asset paths, and sample-book presence
- public-readiness audit rejects tracked raw source files, signing files, build packages, and runtime JSON containing local source paths
- browser/CDP multi-book UX QA confirms the opening notice, home library, GitHub link, page 340 search, book-scoped vocabulary save, bottom-sheet scroll lock, immersive mode, and subtle watermark

## Open Extraction Problems

- DOCX paragraph order around images is extracted and source-page render sampling passes, but exhaustive 557-page pixel comparison is intentionally not part of the normal gate.
- Some tables stay as images; some may become semantic tables in a later refinement pass.
- Phrase detection needs a curated phrase list before generic NLP.
- English table recovery needs special handling because some Word tables are represented as heading/paragraph fragments.
- Some chapters, such as Chapter 28, contain section-like titles as normal paragraphs rather than Word headings; the source coverage validator tracks the current 15 allowed unmatched source headings until curated manual mapping is added.
