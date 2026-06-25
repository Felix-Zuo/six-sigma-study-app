# Data Model

## Catalog

The runtime starts from `apps/reader/public/content/catalog.json`, not a hard-coded manual path.

```ts
type CatalogData = {
  version: string;
  defaultBookId: string;
  books: BookManifest[];
};

type BookManifest = {
  bookId: string;
  title: { en: string; zh: string };
  subtitle?: { en: string; zh: string };
  languagePair: ("en" | "zh")[];
  cover?: string;
  domainLabel?: string;
  contentPath: string;
  pageCount: number;
  chapterCount: number;
  assetCount: number;
  source: string;
  licenseNotice: { en: string; zh: string };
};
```

The first shipped book uses `bookId = "six-sigma-black-belt"`. Future books should add a catalog entry and a separate content package without changing the reader core.

The committed `agent-import-sample` book is a synthetic second catalog entry used to validate the generic import path.

## Manual Package

```ts
type ManualPackage = {
  bookId?: string;
  manual: string;
  version: string;
  pageCount: number;
  title?: { en: string; zh: string };
  subtitle?: { en: string; zh: string };
  domainLabel?: string;
  source?: string;
  licenseNotice?: { en: string; zh: string };
  chapters: Lesson[];
  dictionary: TermEntry[];
};
```

Generic Agent-imported books use the same package shape. The formal runtime package schema is `content/schemas/book-package.schema.json`.

## Agent Import Request

```ts
type AgentImportRequest = {
  schemaVersion: "1.0.0";
  book: {
    bookId: string;
    title: { en: string; zh: string };
    subtitle?: { en: string; zh: string };
    languagePair: ("en" | "zh")[];
    source: string;
    sourceUrl?: string;
    rightsStatus: "confirmed-public" | "original-author-owned" | "user-provided-approved" | "blocked-unknown";
    licenseNotice: { en: string; zh: string };
    intendedUse: "non-commercial-study" | "internal-review-only";
  };
  sources: {
    type: "pdf" | "docx" | "bilingual-doc" | "image-folder" | "structured-json" | "dictionary";
    path: string;
    language?: "en" | "zh" | "mixed" | "not-applicable";
    rightsStatus: string;
  }[];
  conversionPlan: {
    outputContentPath: `content/books/${string}/manual.json`;
    runtimeContentPath: `content/books/${string}/manual.json`;
    alignmentLevel: "chapter" | "section" | "block" | "sentence";
    assetPolicy: "preserve-original-images" | "structured-tables-first" | "no-images";
    glossaryPolicy: "curated-only" | "curated-plus-local-dictionary" | "none";
    allowCommercialUse: false;
  };
  reviewGates: Record<string, { required: boolean; status: "pending" | "passed" | "blocked"; notes?: string }>;
};
```

Formal schema: `content/schemas/agent-import-request.schema.json`.

## Lesson

```ts
type Lesson = {
  id: string;
  chapter: number;
  pageStart: number;
  pageEnd: number;
  title: { en: string; zh: string };
  sections: LessonSection[];
  assets?: Asset[];
};
```

Dictionary lookup keys are validated per book package. Duplicate normalized lookup keys are rejected because they produce ambiguous tap-to-lookup results.

## Lesson Section

```ts
type LessonSection = {
  id: string;
  page: number;
  level: 1 | 2 | 3;
  title: { en: string; zh: string };
  content: {
    en: ContentBlock[];
    zh: ContentBlock[];
  };
};
```

## Content Block

```ts
type ContentBlock = {
  id: string;
  kind: "paragraph" | "listItem" | "table" | "termNote" | "heading" | "image";
  page?: number;
  text?: string;
  rows?: string[][];
  assetId?: string;
  src?: string;
  width?: number;
  height?: number;
  alt?: string;
};
```

Every rendered block is emitted with `data-block-id` and `data-page`. These anchors drive page display, language switching, notes, vocabulary source links, and page-number search.

## Term Entry

```ts
type TermEntry = {
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  explanation: string;
  lookupKeys: string[];
  isSixSigmaTerm?: boolean;
  source?: string;
};
```

## Vocabulary Record

```ts
type SavedTerm = {
  id: string;
  bookId: string;
  bookTitle: string;
  contentVersion?: string;
  term: string;
  translation: string;
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  blockId?: string;
  sourceText: string;
  savedAt: string;
  status: "new" | "learning" | "mastered";
  reviewCount: number;
  correctStreak: number;
  lastReviewedAt?: string;
  nextReviewAt: string;
  masteredAt?: string;
};
```

Legacy vocabulary records without `bookId` are normalized to `six-sigma-black-belt` at load time.

## Note Record

```ts
type SavedNote = {
  id: string;
  bookId: string;
  bookTitle: string;
  text: string;
  note: string;
  language: "en" | "zh";
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  blockId?: string;
  savedAt: string;
  updatedAt: string;
};
```

Notes and selected paragraph captures are scoped by `bookId`. The current UI filters to the active book and provides a return-to-source action.

## Favorite Record

```ts
type SavedFavorite = {
  id: string;
  bookId: string;
  bookTitle: string;
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  blockId?: string;
  title: string;
  note?: string;
  savedAt: string;
  updatedAt: string;
};
```

Favorites/bookmarks are scoped by `bookId` and use the same source-anchor fields as vocabulary and notes. The Favorites page can filter by book, search titles/chapters/notes, sort by recent or page order, and return to the original source block.

## Reader Position

```ts
type ReaderPosition = {
  bookId?: string;
  bookTitle?: string;
  chapterId?: string;
  sectionId?: string;
  blockId?: string;
  page?: number;
  language?: "en" | "zh";
  scrollY?: number;
  updatedAt?: string;
};

type ReaderPositionMap = Record<string, ReaderPosition>;
```

Runtime storage uses a map-shaped payload so each book keeps its own last-read position:

```ts
type ReaderPositionStorage = {
  activeBookId: string;
  positions: ReaderPositionMap;
  updatedAt: string;
};
```

Legacy single-position records are migrated at load time into the map shape under their `bookId`, or `six-sigma-black-belt` when the older record has no `bookId`.

## Asset

```ts
type Asset = {
  id: string;
  type: "figure" | "table-image" | "formula-image";
  path: string;
  page: number;
  width?: number;
  height?: number;
  caption?: { en?: string; zh?: string };
};
```

## Lookup Resolution

```ts
type LookupResult = {
  query: string;
  normalized: string;
  source: "six-sigma-term" | "local-dictionary" | "fallback" | "ai";
  entry: TermEntry;
};
```
