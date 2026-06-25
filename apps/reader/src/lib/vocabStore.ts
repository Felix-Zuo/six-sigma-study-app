export type SavedTerm = {
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

const storageKey = "six-sigma-study:vocab:v1";
const defaultBookId = "six-sigma-black-belt";
const defaultBookTitle = "六西格玛黑带教材";
const dayMs = 24 * 60 * 60 * 1000;
const minEaseFactor = 1.3;
const maxEaseFactor = 2.8;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function toSafeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * dayMs).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSourceType(value: unknown): "manual" | "question" {
  return value === "question" ? "question" : "manual";
}

function scheduleIntervalDays(term: SavedTerm, outcome: "again" | "fuzzy" | "remembered"): number {
  if (outcome === "again") {
    return 1;
  }
  if (outcome === "fuzzy") {
    return Math.max(1, Math.min(3, Math.ceil(Math.max(1, term.intervalDays) * 0.7)));
  }
  if (term.correctStreak <= 0 || term.intervalDays <= 0) {
    return 1;
  }
  if (term.correctStreak === 1) {
    return 3;
  }
  return Math.max(4, Math.round(term.intervalDays * term.easeFactor));
}

function normalizeSavedTerm(item: Partial<SavedTerm>): SavedTerm {
  const savedAt = isIsoDate(item.savedAt) ? item.savedAt : new Date().toISOString();
  const status = item.status === "learning" || item.status === "mastered" ? item.status : "new";
  const correctStreak = toSafeNumber(item.correctStreak, status === "mastered" ? 3 : 0);
  const sourceType = normalizeSourceType(item.sourceType);
  return {
    id: item.id ?? `term-${Date.now()}`,
    bookId: item.bookId || defaultBookId,
    bookTitle: item.bookTitle || defaultBookTitle,
    contentVersion: item.contentVersion,
    term: item.term ?? "",
    translation: item.translation ?? "待完善",
    chapter: item.chapter ?? 1,
    chapterTitle: item.chapterTitle ?? "Chapter 1: What is Six Sigma?",
    page: item.page ?? 1,
    sectionId: item.sectionId ?? "",
    blockId: item.blockId,
    sourceText: item.sourceText ?? "",
    savedAt,
    status,
    familiarity: clamp(toSafeNumber(item.familiarity, status === "mastered" ? 85 : correctStreak * 18), 0, 100),
    reviewCount: toSafeNumber(item.reviewCount),
    lapseCount: toSafeNumber(item.lapseCount),
    correctStreak,
    lastReviewedAt: isIsoDate(item.lastReviewedAt) ? item.lastReviewedAt : undefined,
    nextReviewAt: isIsoDate(item.nextReviewAt) ? item.nextReviewAt : savedAt,
    intervalDays: Math.max(0, toSafeNumber(item.intervalDays)),
    easeFactor: clamp(toSafeNumber(item.easeFactor, 2.1), minEaseFactor, maxEaseFactor),
    masteredAt: isIsoDate(item.masteredAt) ? item.masteredAt : undefined,
    sourceType,
    sourceBookId: item.sourceBookId || (sourceType === "manual" ? item.bookId || defaultBookId : undefined),
    sourceQuestionId: item.sourceQuestionId,
    sourceExamId: item.sourceExamId,
    sourceDomain: item.sourceDomain,
    sourcePage: toSafeNumber(item.sourcePage, item.page)
  };
}

export function loadSavedTerms(): SavedTerm[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeSavedTerm(item));
  } catch {
    return [];
  }
}

export function persistSavedTerms(terms: SavedTerm[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(terms));
  } catch {
    // Study data is local-first; failing to persist should not crash reading.
  }
}

export function isTermDue(term: SavedTerm, now = new Date()): boolean {
  return Date.parse(term.nextReviewAt) <= now.getTime();
}

export function scheduleTermReview(
  term: SavedTerm,
  outcome: "again" | "fuzzy" | "remembered",
  now = new Date()
): SavedTerm {
  const intervalDays = scheduleIntervalDays(term, outcome);

  if (outcome === "again") {
    return {
      ...term,
      status: "learning",
      familiarity: clamp(term.familiarity - 18, 0, 100),
      reviewCount: term.reviewCount + 1,
      lapseCount: term.lapseCount + 1,
      correctStreak: 0,
      lastReviewedAt: now.toISOString(),
      intervalDays,
      easeFactor: clamp(term.easeFactor - 0.18, minEaseFactor, maxEaseFactor),
      nextReviewAt: addDays(now, intervalDays)
    };
  }

  if (outcome === "fuzzy") {
    return {
      ...term,
      status: "learning",
      familiarity: clamp(term.familiarity + 8, 0, 100),
      reviewCount: term.reviewCount + 1,
      correctStreak: Math.max(0, term.correctStreak),
      lastReviewedAt: now.toISOString(),
      intervalDays,
      easeFactor: clamp(term.easeFactor - 0.06, minEaseFactor, maxEaseFactor),
      nextReviewAt: addDays(now, intervalDays)
    };
  }

  const correctStreak = term.correctStreak + 1;
  const status = correctStreak >= 3 ? "mastered" : "learning";
  return {
    ...term,
    status,
    familiarity: clamp(term.familiarity + (correctStreak >= 3 ? 16 : 14), 0, 100),
    reviewCount: term.reviewCount + 1,
    correctStreak,
    lastReviewedAt: now.toISOString(),
    intervalDays,
    easeFactor: clamp(term.easeFactor + 0.05, minEaseFactor, maxEaseFactor),
    nextReviewAt: addDays(now, intervalDays),
    masteredAt: status === "mastered" ? term.masteredAt ?? now.toISOString() : term.masteredAt
  };
}

export function setTermStatus(term: SavedTerm, status: SavedTerm["status"], now = new Date()): SavedTerm {
  if (status === "mastered") {
    return {
      ...term,
      status,
      familiarity: Math.max(term.familiarity, 90),
      correctStreak: Math.max(term.correctStreak, 3),
      intervalDays: 30,
      nextReviewAt: addDays(now, 30),
      masteredAt: term.masteredAt ?? now.toISOString()
    };
  }

  return {
    ...term,
    status,
    familiarity: status === "new" ? Math.min(term.familiarity, 20) : term.familiarity,
    correctStreak: status === "new" ? 0 : term.correctStreak,
    intervalDays: status === "new" ? 0 : term.intervalDays,
    nextReviewAt: now.toISOString(),
    masteredAt: status === "new" ? undefined : term.masteredAt
  };
}

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function savedTermsToCsv(terms: SavedTerm[]): string {
  const headers = [
    "term",
    "bookId",
    "bookTitle",
    "contentVersion",
    "translation",
    "status",
    "familiarity",
    "reviewCount",
    "lapseCount",
    "correctStreak",
    "intervalDays",
    "easeFactor",
    "nextReviewAt",
    "lastReviewedAt",
    "savedAt",
    "sourceType",
    "sourceBookId",
    "sourceQuestionId",
    "sourceExamId",
    "sourceDomain",
    "sourcePage",
    "chapter",
    "chapterTitle",
    "page",
    "sectionId",
    "blockId",
    "sourceText"
  ];
  const rows = terms.map((term) => [
    term.term,
    term.bookId,
    term.bookTitle,
    term.contentVersion,
    term.translation,
    term.status,
    term.familiarity,
    term.reviewCount,
    term.lapseCount,
    term.correctStreak,
    term.intervalDays,
    term.easeFactor,
    term.nextReviewAt,
    term.lastReviewedAt,
    term.savedAt,
    term.sourceType,
    term.sourceBookId,
    term.sourceQuestionId,
    term.sourceExamId,
    term.sourceDomain,
    term.sourcePage,
    term.chapter,
    term.chapterTitle,
    term.page,
    term.sectionId,
    term.blockId,
    term.sourceText
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
