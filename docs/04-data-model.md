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
  id: string;
  term: string;
  normalized: string;
  kind: "word" | "phrase" | "acronym";
  translation: string;
  partOfSpeech?: string;
  explanation: string;
  examples: string[];
  isSixSigmaTerm: boolean;
};
```

## Vocabulary Record

```ts
type VocabRecord = {
  id: string;
  bookId: string;
  bookTitle: string;
  contentVersion?: string;
  termId?: string;
  text: string;
  normalized: string;
  translation: string;
  explanation: string;
  source: {
    chapter: number;
    page: number;
    sectionId: string;
    blockId?: string;
    sentence: string;
  };
  status: "new" | "learning" | "mastered";
  reviewCount: number;
  correctStreak: number;
  nextReviewAt: string;
  lastReviewedAt?: string;
  masteredAt?: string;
  createdAt: string;
  reviewedAt?: string;
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

## Reader Position

```ts
type ReaderPosition = {
  bookId?: string;
  chapterId?: string;
  sectionId?: string;
  blockId?: string;
  page?: number;
  language?: "en" | "zh";
  scrollY?: number;
  updatedAt?: string;
};
```

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
