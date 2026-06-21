# Data Model

## Lesson

```ts
type Lesson = {
  id: string;
  chapter: number;
  title: { en: string; zh: string };
  paragraphs: ParagraphPair[];
  assets?: Asset[];
};
```

## Paragraph Pair

```ts
type ParagraphPair = {
  id: string;
  page: number;
  en: string;
  zh: string;
  assetIds?: string[];
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
  status: "new" | "learning" | "known";
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

