# Data Model

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
  termId?: string;
  text: string;
  normalized: string;
  translation: string;
  explanation: string;
  source: {
    chapter: number;
    page: number;
    paragraphId: string;
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
