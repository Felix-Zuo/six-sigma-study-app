export type QuestionSourceType = "public-sample" | "original-practice" | "user-private";
export type QuestionType = "single" | "multiple" | "true_false" | "case";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type LocalizedText = {
  en: string;
  zh: string;
};

export type QuestionOption = {
  id: string;
  en: string;
  zh: string;
};

export type QuestionReviewStats = {
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  unknownCount: number;
  lastSeenAt?: string;
  lastAnsweredAt?: string;
};

export type QuestionItem = {
  questionId: string;
  examId: string;
  sourceType: QuestionSourceType;
  domain: string;
  chapterId: string;
  page: number;
  difficulty: QuestionDifficulty;
  questionType: QuestionType;
  stem: LocalizedText;
  options: QuestionOption[];
  correctAnswer: string[];
  explanation: LocalizedText;
  tags: string[];
  sourceRef: string;
  reviewStats: QuestionReviewStats;
  needsReview?: boolean;
};

export type QuestionBankPayload = {
  schemaVersion: "1.0.0";
  bankId: string;
  title: LocalizedText;
  sourceType: QuestionSourceType;
  importedAt?: string;
  questions: QuestionItem[];
};

export type QuestionProgress = {
  questionId: string;
  seen: boolean;
  favorite: boolean;
  correctCount: number;
  wrongCount: number;
  unknownCount: number;
  correctStreak: number;
  wrongPriority: number;
  mastered: boolean;
  lastSeenAt?: string;
  lastAnsweredAt?: string;
};

export type ExamResult = {
  id: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  correct: number;
  accuracy: number;
  minutes: number;
  questionIds: string[];
  wrongQuestionIds: string[];
  weakDomains: { domain: string; wrong: number; total: number }[];
  answers?: Record<string, string[]>;
};

const questionBankStorageKey = "six-sigma-study:question-bank:v1";
const questionProgressStorageKey = "six-sigma-study:question-progress:v1";
const examResultsStorageKey = "six-sigma-study:exam-results:v1";

function localized(value: Partial<LocalizedText> | undefined, fallback = ""): LocalizedText {
  const en = value?.en || value?.zh || fallback;
  const zh = value?.zh || value?.en || fallback;
  return { en, zh };
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeAnswer(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQuestionType(value: unknown): QuestionType {
  return value === "multiple" || value === "true_false" || value === "case" ? value : "single";
}

function normalizeDifficulty(value: unknown): QuestionDifficulty {
  return value === "easy" || value === "hard" ? value : "medium";
}

function normalizeSourceType(value: unknown): QuestionSourceType {
  if (value === "user-private" || value === "original-practice") {
    return value;
  }
  return "public-sample";
}

export function normalizeQuestion(item: Partial<QuestionItem>, index = 0): QuestionItem {
  const sourceType = normalizeSourceType(item.sourceType);
  const correctAnswer = normalizeAnswer(item.correctAnswer);
  const explanation = localized(item.explanation, "待补充精讲");
  const needsReview = Boolean(item.needsReview || correctAnswer.length === 0 || !explanation.en || explanation.en === "待补充精讲");
  return {
    questionId: item.questionId || `question-${index + 1}`,
    examId: item.examId || "practice",
    sourceType,
    domain: item.domain || "General",
    chapterId: item.chapterId || "unmapped",
    page: safeNumber(item.page),
    difficulty: normalizeDifficulty(item.difficulty),
    questionType: normalizeQuestionType(item.questionType),
    stem: localized(item.stem, "Untitled question"),
    options: Array.isArray(item.options)
      ? item.options.map((option, optionIndex) => ({
          id: option.id || String.fromCharCode(65 + optionIndex),
          en: option.en || option.zh || "",
          zh: option.zh || option.en || ""
        }))
      : [],
    correctAnswer,
    explanation,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    sourceRef: item.sourceRef || (sourceType === "user-private" ? "user private import" : "public sample"),
    reviewStats: {
      seenCount: safeNumber(item.reviewStats?.seenCount),
      correctCount: safeNumber(item.reviewStats?.correctCount),
      wrongCount: safeNumber(item.reviewStats?.wrongCount),
      unknownCount: safeNumber(item.reviewStats?.unknownCount),
      lastSeenAt: item.reviewStats?.lastSeenAt,
      lastAnsweredAt: item.reviewStats?.lastAnsweredAt
    },
    needsReview
  };
}

export function normalizeQuestionBank(payload: Partial<QuestionBankPayload>, fallbackId = "imported-bank"): QuestionBankPayload {
  const sourceType = normalizeSourceType(payload.sourceType);
  const questions = Array.isArray(payload.questions)
    ? payload.questions.map((item, index) => normalizeQuestion({ ...item, sourceType: item.sourceType ?? sourceType }, index))
    : [];
  return {
    schemaVersion: "1.0.0",
    bankId: payload.bankId || fallbackId,
    title: localized(payload.title, "Question Bank"),
    sourceType,
    importedAt: payload.importedAt,
    questions
  };
}

export function loadUserQuestionBank(): QuestionBankPayload | null {
  try {
    const raw = window.localStorage.getItem(questionBankStorageKey);
    if (!raw) {
      return null;
    }
    return normalizeQuestionBank(JSON.parse(raw), "user-private-bank");
  } catch {
    return null;
  }
}

export function persistUserQuestionBank(bank: QuestionBankPayload | null): void {
  try {
    if (!bank) {
      window.localStorage.removeItem(questionBankStorageKey);
      return;
    }
    window.localStorage.setItem(questionBankStorageKey, JSON.stringify(bank));
  } catch {
    // Importing a private bank is optional; storage failure should not break public samples.
  }
}

function normalizeProgress(item: Partial<QuestionProgress>, questionId: string): QuestionProgress {
  const correctCount = safeNumber(item.correctCount);
  const wrongCount = safeNumber(item.wrongCount);
  const unknownCount = safeNumber(item.unknownCount);
  const correctStreak = safeNumber(item.correctStreak);
  const fallbackWrongPriority = Math.max(0, wrongCount + unknownCount * 2 - correctStreak);
  const wrongPriority = typeof item.wrongPriority === "number" && Number.isFinite(item.wrongPriority) && item.wrongPriority >= 0
    ? item.wrongPriority
    : fallbackWrongPriority;
  return {
    questionId,
    seen: Boolean(item.seen),
    favorite: Boolean(item.favorite),
    correctCount,
    wrongCount,
    unknownCount,
    correctStreak,
    wrongPriority,
    mastered: Boolean(item.mastered || correctStreak >= 3),
    lastSeenAt: item.lastSeenAt,
    lastAnsweredAt: item.lastAnsweredAt
  };
}

export function loadQuestionProgress(): Record<string, QuestionProgress> {
  try {
    const raw = window.localStorage.getItem(questionProgressStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([questionId, item]) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? [[questionId, normalizeProgress(item as Partial<QuestionProgress>, questionId)] as const]
          : []
      )
    );
  } catch {
    return {};
  }
}

export function persistQuestionProgress(progress: Record<string, QuestionProgress>): void {
  try {
    window.localStorage.setItem(questionProgressStorageKey, JSON.stringify(progress));
  } catch {
    // Local-only progress can fail softly.
  }
}

export function progressForQuestion(progress: Record<string, QuestionProgress>, questionId: string): QuestionProgress {
  return normalizeProgress(progress[questionId] ?? {}, questionId);
}

export function markQuestionSeen(progress: QuestionProgress, now = new Date()): QuestionProgress {
  return {
    ...progress,
    seen: true,
    lastSeenAt: now.toISOString()
  };
}

export function recordQuestionAnswer(progress: QuestionProgress, outcome: "correct" | "wrong" | "unknown", now = new Date()): QuestionProgress {
  if (outcome === "correct") {
    const correctStreak = progress.correctStreak + 1;
    return {
      ...progress,
      seen: true,
      correctCount: progress.correctCount + 1,
      correctStreak,
      wrongPriority: Math.max(0, progress.wrongPriority - 1),
      mastered: correctStreak >= 3,
      lastAnsweredAt: now.toISOString()
    };
  }

  const isUnknown = outcome === "unknown";
  return {
    ...progress,
    seen: true,
    wrongCount: progress.wrongCount + (isUnknown ? 0 : 1),
    unknownCount: progress.unknownCount + (isUnknown ? 1 : 0),
    correctStreak: 0,
    wrongPriority: progress.wrongPriority + (isUnknown ? 2 : 1),
    mastered: false,
    lastAnsweredAt: now.toISOString()
  };
}

export function toggleQuestionFavorite(progress: QuestionProgress): QuestionProgress {
  return {
    ...progress,
    favorite: !progress.favorite
  };
}

export function loadExamResults(): ExamResult[] {
  try {
    const raw = window.localStorage.getItem(examResultsStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item): ExamResult[] => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const result = item as Partial<ExamResult>;
      if (!result.id || !Array.isArray(result.questionIds) || !Array.isArray(result.wrongQuestionIds)) {
        return [];
      }
      const answers = result.answers && typeof result.answers === "object" && !Array.isArray(result.answers)
        ? Object.fromEntries(
            Object.entries(result.answers).map(([questionId, answer]) => [questionId, normalizeAnswer(answer)])
          )
        : undefined;
      return [{
        id: result.id,
        startedAt: result.startedAt || "",
        finishedAt: result.finishedAt || "",
        total: safeNumber(result.total),
        correct: safeNumber(result.correct),
        accuracy: safeNumber(result.accuracy),
        minutes: safeNumber(result.minutes),
        questionIds: result.questionIds.map(String),
        wrongQuestionIds: result.wrongQuestionIds.map(String),
        weakDomains: Array.isArray(result.weakDomains)
          ? result.weakDomains.flatMap((domain): ExamResult["weakDomains"] =>
              domain && typeof domain === "object" && typeof domain.domain === "string"
                ? [{ domain: domain.domain, wrong: safeNumber(domain.wrong), total: safeNumber(domain.total) }]
                : []
            )
          : [],
        answers
      }];
    });
  } catch {
    return [];
  }
}

export function persistExamResults(results: ExamResult[]): void {
  try {
    window.localStorage.setItem(examResultsStorageKey, JSON.stringify(results));
  } catch {
    // Exam history is local convenience data.
  }
}

export const questionBankKeys = {
  questionBankStorageKey,
  questionProgressStorageKey,
  examResultsStorageKey
};
