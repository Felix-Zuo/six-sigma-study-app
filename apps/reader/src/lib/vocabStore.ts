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
  reviewCount: number;
  correctStreak: number;
  lastReviewedAt?: string;
  nextReviewAt: string;
  masteredAt?: string;
};

const storageKey = "six-sigma-study:vocab:v1";
const defaultBookId = "six-sigma-black-belt";
const defaultBookTitle = "六西格玛黑带教材";
const dayMs = 24 * 60 * 60 * 1000;
const reviewIntervalsByStreak = [1, 3, 7, 14, 30, 60];

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function toSafeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * dayMs).toISOString();
}

function intervalDaysForStreak(streak: number): number {
  const index = Math.max(0, Math.min(reviewIntervalsByStreak.length - 1, streak - 1));
  return reviewIntervalsByStreak[index];
}

function normalizeSavedTerm(item: Partial<SavedTerm>): SavedTerm {
  const savedAt = isIsoDate(item.savedAt) ? item.savedAt : new Date().toISOString();
  const status = item.status === "learning" || item.status === "mastered" ? item.status : "new";
  const correctStreak = toSafeNumber(item.correctStreak, status === "mastered" ? 3 : 0);
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
    reviewCount: toSafeNumber(item.reviewCount),
    correctStreak,
    lastReviewedAt: isIsoDate(item.lastReviewedAt) ? item.lastReviewedAt : undefined,
    nextReviewAt: isIsoDate(item.nextReviewAt) ? item.nextReviewAt : savedAt,
    masteredAt: isIsoDate(item.masteredAt) ? item.masteredAt : undefined
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
  outcome: "again" | "remembered",
  now = new Date()
): SavedTerm {
  if (outcome === "again") {
    return {
      ...term,
      status: "learning",
      reviewCount: term.reviewCount + 1,
      correctStreak: 0,
      lastReviewedAt: now.toISOString(),
      nextReviewAt: addDays(now, 1)
    };
  }

  const correctStreak = term.correctStreak + 1;
  const status = correctStreak >= 3 ? "mastered" : "learning";
  return {
    ...term,
    status,
    reviewCount: term.reviewCount + 1,
    correctStreak,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: addDays(now, intervalDaysForStreak(correctStreak)),
    masteredAt: status === "mastered" ? term.masteredAt ?? now.toISOString() : term.masteredAt
  };
}

export function setTermStatus(term: SavedTerm, status: SavedTerm["status"], now = new Date()): SavedTerm {
  if (status === "mastered") {
    return {
      ...term,
      status,
      correctStreak: Math.max(term.correctStreak, 3),
      nextReviewAt: addDays(now, 30),
      masteredAt: term.masteredAt ?? now.toISOString()
    };
  }

  return {
    ...term,
    status,
    correctStreak: status === "new" ? 0 : term.correctStreak,
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
    "reviewCount",
    "correctStreak",
    "nextReviewAt",
    "lastReviewedAt",
    "savedAt",
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
    term.reviewCount,
    term.correctStreak,
    term.nextReviewAt,
    term.lastReviewedAt,
    term.savedAt,
    term.chapter,
    term.chapterTitle,
    term.page,
    term.sectionId,
    term.blockId,
    term.sourceText
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
