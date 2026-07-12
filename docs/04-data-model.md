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
  contextGlossesVersion?: string;
  contextGlosses?: Record<string, ContextBlockGloss>;
};
```

Generic Agent-imported books use the same package shape. The formal runtime package schema is `content/schemas/book-package.schema.json`.

### Occurrence-Level Context Glosses

```ts
type ContextBlockGloss = {
  targetBlockId: string;
  translation: string;
  similarity: number;
  sentences: {
    source: string;
    translation: string;
    confidence: "high" | "medium" | "low";
    similarity: number;
    meanings: Record<string, string>;
    evidence?: Record<string, "high" | "medium">;
  }[];
};
```

`scripts/build_context_glosses.py` aligns the existing English and Chinese manual offline at block, sentence, and word level. The runtime resolves a clicked surface form inside its exact `blockId` and sentence; it does not infer the current meaning from the first dictionary sense. Low-confidence sentences keep their bilingual example but expose no asserted word meaning. Adjacent source blocks that split one sentence at a page boundary are repaired when both map to the same Chinese block.

The model environment and Hugging Face cache live outside Git. Only the generated glossary inside `manual.json` is shipped to the app. CI validates the committed output with `npm run qa:context-glosses` and does not download or execute the models.

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
  wordRoot?: string;
  wordForms?: string[];
  englishDefinition?: string;
  explanation: string;
  lookupKeys: string[];
  isSixSigmaTerm?: boolean;
  source?: string;
  contextMeanings?: {
    meaning: string;
    explanation: string;
    when?: string;
  }[];
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
  partOfSpeech?: string;
  phonetic?: string;
  wordRoot?: string;
  wordForms?: string[];
  englishDefinition?: string;
  dictionaryExplanation?: string;
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  blockId?: string;
  sourceText: string;
  sourceTranslation?: string;
  contextMeaning?: string;
  contextExplanation?: string;
  exampleText?: string;
  exampleTranslation?: string;
  savedAt: string;
  status: "new" | "learning" | "mastered";
  familiarity: number;
  reviewCount: number;
  lapseCount: number;
  correctStreak: number;
  lastReviewedAt?: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  masteredAt?: string;
  sourceType: "manual" | "question";
  sourceBookId?: string;
  sourceQuestionId?: string;
  sourceExamId?: string;
  sourceDomain?: string;
  sourcePage?: number;
};
```

Legacy vocabulary records without `bookId` are normalized to `six-sigma-black-belt` at load time.

Lookup stores the full dictionary profile separately from the context snapshot. The dictionary profile keeps broad senses, phonetics, part of speech, lemma/word forms, and an English definition; the context snapshot keeps the occurrence-level meaning in the current manual/question sentence, a concise usage explanation, and a bilingual example. Older manual records are re-enriched from the current offline dictionary and occurrence glossary without deleting review history, replacing context text produced by the retired dictionary-first fallback.

Vocabulary review now uses a lightweight local spaced-repetition model inspired by SM-2, Anki, and FSRS. Review outcomes are `remembered`, `fuzzy`, and `again`; the scheduler updates `familiarity`, `lapseCount`, `correctStreak`, `intervalDays`, `easeFactor`, `lastReviewedAt`, and `nextReviewAt`. Question-sourced terms keep `sourceType = "question"` plus `sourceQuestionId`, `sourceExamId`, and `sourceDomain`.

## Daily Streak

```ts
type DailyStudyStats = {
  day: string;
  baseGoal: number;
  goal: number;
  completed: number;
  streak: number;
  missedDays: number;
  checkedInToday: boolean;
  lastCheckInDate?: string;
  updatedAt: string;
};
```

Runtime storage key: `six-sigma-study:daily-streak:v1`. The default target is 8 completed vocabulary reviews. Missed days add catch-up reviews with a capped extra load; completing the day's target automatically checks in without negative or shaming copy.

## Question Bank

Formal schema: `content/schemas/question-bank.schema.json`.

```ts
type QuestionItem = {
  questionId: string;
  examId: string;
  sourceType: "public-sample" | "original-practice" | "user-private";
  domain: string;
  chapterId: string;
  page: number;
  difficulty: "easy" | "medium" | "hard";
  questionType: "single" | "multiple" | "true_false" | "case";
  stem: { en: string; zh: string };
  options: { id: string; en: string; zh: string }[];
  correctAnswer: string[];
  explanation: { en: string; zh: string };
  tags: string[];
  sourceRef: string;
  reviewStats: {
    seenCount: number;
    correctCount: number;
    wrongCount: number;
    unknownCount: number;
    lastSeenAt?: string;
    lastAnsweredAt?: string;
  };
  needsReview?: boolean;
};
```

Committed runtime samples are original public samples. User-private banks are imported through the local file picker and persisted under `six-sigma-study:question-bank:v1`; question progress uses `six-sigma-study:question-progress:v1`; mock exam history uses `six-sigma-study:exam-results:v1`.

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
