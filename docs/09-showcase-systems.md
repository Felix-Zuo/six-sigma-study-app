# Showcase Systems

## Product Architecture

```mermaid
flowchart LR
  A["Book catalog<br/>catalog.json"] --> B["Reader shell<br/>React + Vite"]
  C["Book package<br/>manual.json"] --> B
  D["Dictionary<br/>curated + learner terms"] --> B
  E["Figure assets<br/>safe relative paths"] --> B
  B --> F["Android WebView<br/>Capacitor APK/AAB"]
  B --> G["PWA runtime<br/>service worker cache"]
  B --> H["Local study data<br/>bookId-scoped localStorage"]
```

Why this is not a PDF viewer:

- The reader consumes structured blocks, not full-page screenshots.
- Every block carries `bookId`, `page`, and `blockId` anchors for language switching and return-to-source.
- Vocabulary, notes, and reading position are scoped by textbook.

## Content Pipeline

```mermaid
flowchart TD
  A["Legal source material<br/>PDF/DOCX/structured input"] --> B["Extraction scripts"]
  B --> C["Bilingual sections<br/>stable page/block anchors"]
  C --> D["Figure and table assets<br/>deduplicated runtime PNGs"]
  C --> E["Dictionary builder<br/>curated terms first"]
  D --> F["Book package<br/>content/books/<bookId>/manual.json"]
  E --> F
  F --> G["Catalog update<br/>content/catalog.json"]
  G --> H["Validation gates<br/>lint:content + lint:books + audit:public"]
  H --> I["Android/PWA build"]
```

The Six Sigma profile remains strict for the 33-chapter manual. The Agent import path adds a generic contract so future legal textbooks can be validated without inheriting the Six Sigma constants.

## Agent Import Interface

```mermaid
sequenceDiagram
  participant Agent
  participant Contract as "agent-import request"
  participant Validator as "import_book_agent_contract.py"
  participant Catalog as "catalog.json"
  participant App as "Reader App"
  Agent->>Contract: Provide bookId, sources, rights, review gates
  Contract->>Validator: Validate request and package shape
  Validator->>Validator: Check pages, anchors, assets, lookup keys
  Validator->>Catalog: Verify unique bookId and contentPath
  Catalog->>App: New book appears in library
  App->>App: Notes, vocab, reading position use bookId
```

The current sample is `agent-import-sample`, a fully synthetic two-chapter book used to prove the contract and runtime path.

## Verification Matrix

| Area | Command / Evidence | Coverage |
| --- | --- | --- |
| Six Sigma content package | `npm run lint:content` | 33 chapters, 449 pages, block page anchors, assets, dictionary lookup uniqueness |
| Agent book contract | `npm run lint:books` | request schema, book package shape, catalog uniqueness, sample import |
| Public safety | `npm run audit:public` | denylisted tracked files, runtime JSON local-path scan |
| Source coverage | `npm run qa:source-coverage` | source TOC anchors, image assets, sampled nonblank source renders |
| Reader UX | `npm run qa:multibook-ux` | notice, home, page search, book-scoped vocab, scroll lock, immersive mode |
| Android key chapters | `npm run qa:android-key-chapters` | Chapters 1, 7, 26, 33, lookup, alignment, image checks |
| Release package | `npm run android:release-apk` and `npm run android:aab` | local signed APK/AAB with runtime content bundled |
