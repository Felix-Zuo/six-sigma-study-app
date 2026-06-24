# Agent Textbook Import Interface

The Agent import interface lets a future Codex/Agent workflow convert a legally usable textbook into the same multi-book runtime format used by the Six Sigma study app.

This interface is intentionally local-first. It does not require a remote model API. The first implementation is a contract validator plus a safe synthetic sample book.

## Files

| Purpose | Path |
| --- | --- |
| Agent input schema | `content/schemas/agent-import-request.schema.json` |
| Runtime book package schema | `content/schemas/book-package.schema.json` |
| Sample Agent request | `samples/agent-import/sample-book-request.json` |
| Sample source package | `content/books/agent-import-sample/manual.json` |
| Sample runtime package | `apps/reader/public/content/books/agent-import-sample/manual.json` |
| Validator / CLI entry | `scripts/import_book_agent_contract.py` |

## Agent Input Contract

An Agent request must include:

- `book.bookId`: stable lowercase identifier used for catalog, notes, vocabulary, and reading position.
- bilingual `title`, optional `subtitle`, `languagePair`, `domainLabel`.
- `source`, optional `sourceUrl`, `accessedAt`, `rightsStatus`, and bilingual `licenseNotice`.
- `sources[]`: PDF, DOCX, bilingual document, image folder, structured JSON, or dictionary source descriptors.
- `conversionPlan`: output path, runtime path, alignment level, asset policy, glossary policy, and non-commercial flag.
- `reviewGates`: copyright, table of contents, image quality, terminology, and bilingual alignment.

Unknown or blocked rights must stop the import before public runtime files are generated.

## Runtime Output Contract

The Agent output is a book package compatible with the existing reader:

```text
content/books/<bookId>/manual.json
apps/reader/public/content/books/<bookId>/manual.json
apps/reader/public/content/catalog.json
content/processed/catalog.json
```

The package must contain:

- chapters with continuous page ranges
- sections with stable IDs and bilingual titles
- English and Chinese content blocks with page anchors
- image assets with safe relative paths when images are used
- dictionary entries with unique normalized lookup keys
- source and non-commercial license notices

The reader discovers new books only through `catalog.json`; no `App.tsx` change should be required for a normal new book.

## Review Gates

| Gate | Required Evidence |
| --- | --- |
| Copyright | source URL/path, rights status, non-commercial statement, reviewer note |
| Table of contents | chapter count, page ranges, section anchors |
| Image quality | image count, safe paths, nonblank spot checks if images exist |
| Terminology | curated glossary terms and duplicate lookup-key check |
| Bilingual alignment | sampled EN/ZH block order, page anchors, switch target |

## Commands

```powershell
npm run lint:books
npm run qa:book-import
npm run audit:public
```

`lint:books` validates the committed schemas, Agent request, public catalog, processed catalog, and every referenced book package.

`qa:book-import` specifically requires the safe `agent-import-sample` book to be present and valid.

`audit:public` rejects tracked raw source files, signing files, build packages, and runtime JSON containing local source paths such as `C:\...`, `enDocx`, `zhDocx`, or `sourcePdf`.

## Current Sample

The committed sample book is fully synthetic. It proves:

- second book appears on the home/library screen
- generic book package validation does not depend on the Six Sigma 33-chapter profile
- `bookId` can scope vocabulary, notes, and reading position
- future Agent imports have a concrete fixture to imitate

## Non-Goals

- It does not yet perform OCR, PDF layout reconstruction, or automatic translation.
- It does not call a remote LLM.
- It does not bypass human rights review.

Future work can add a converter that accepts `--input-manifest`, emits `--report-json`, and produces the same validated package shape.
