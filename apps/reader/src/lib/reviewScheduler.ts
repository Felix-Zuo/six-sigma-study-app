import {
  FSRSVersion,
  Rating,
  State,
  TypeConvert,
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput
} from "ts-fsrs";

export type ReviewOutcome = "again" | "fuzzy" | "remembered";

export type ReviewCardSnapshot = {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: string;
};

export type ReviewHistoryItem = {
  reviewedAt: string;
  outcome: ReviewOutcome;
  scheduledAt: string;
  intervalMinutes: number;
  retrievability: number;
  stability: number;
  difficulty: number;
};

export type LegacyReviewSnapshot = {
  savedAt: string;
  lastReviewedAt?: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  lapseCount: number;
  correctStreak: number;
};

export type ReviewPreview = {
  due: string;
  intervalMinutes: number;
  intervalLabel: string;
};

export const reviewTargetRetention = 0.9;
export const reviewSchedulerVersion = `fsrs-${FSRSVersion}/ts-fsrs-5.4.1`;

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;
const scheduler = fsrs({
  request_retention: reviewTargetRetention,
  maximum_interval: 3650,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["10m"],
  relearning_steps: ["10m"]
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validDate(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function serializeCard(card: Card): ReviewCardSnapshot {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.toISOString()
  };
}

function legacyCard(legacy: LegacyReviewSnapshot): Card {
  const savedAt = validDate(legacy.savedAt, new Date().toISOString());
  if (legacy.reviewCount <= 0) {
    return createEmptyCard(new Date(savedAt));
  }

  const lastReview = validDate(legacy.lastReviewedAt, savedAt);
  const due = validDate(legacy.nextReviewAt, lastReview);
  const intervalDays = Math.max(0, finiteNumber(legacy.intervalDays));
  const elapsedDays = Math.max(0, Math.round((Date.parse(lastReview) - Date.parse(savedAt)) / dayMs));
  const difficulty = clamp(8.5 - (clamp(finiteNumber(legacy.easeFactor, 2.1), 1.3, 2.8) - 1.3) * 4, 1, 10);

  return TypeConvert.card({
    due,
    stability: Math.max(0.1, intervalDays || Math.max(0.1, legacy.correctStreak * 0.6)),
    difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: intervalDays,
    learning_steps: 0,
    reps: Math.max(1, Math.round(legacy.reviewCount)),
    lapses: Math.max(0, Math.round(legacy.lapseCount)),
    state: State.Review,
    last_review: lastReview
  } satisfies CardInput);
}

function deserializeCard(snapshot: ReviewCardSnapshot): Card {
  return TypeConvert.card({
    due: snapshot.due,
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    elapsed_days: snapshot.elapsedDays,
    scheduled_days: snapshot.scheduledDays,
    learning_steps: snapshot.learningSteps,
    reps: snapshot.reps,
    lapses: snapshot.lapses,
    state: snapshot.state,
    last_review: snapshot.lastReview
  } satisfies CardInput);
}

function cardFor(snapshot: ReviewCardSnapshot | undefined, legacy: LegacyReviewSnapshot): Card {
  if (!snapshot) {
    return legacyCard(legacy);
  }
  try {
    return deserializeCard(snapshot);
  } catch {
    return legacyCard(legacy);
  }
}

function alignCardToReviewClock(card: Card, now: Date): Card {
  if (!card.last_review || card.last_review.getTime() <= now.getTime()) {
    return card;
  }
  // A device clock rollback can leave a persisted review in the future.
  return TypeConvert.card({
    due: card.due.getTime() < now.getTime() ? now : card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: now
  } satisfies CardInput);
}

function schedulableCard(
  snapshot: ReviewCardSnapshot | undefined,
  legacy: LegacyReviewSnapshot,
  now: Date
): Card {
  const candidate = alignCardToReviewClock(cardFor(snapshot, legacy), now);
  try {
    scheduler.repeat(candidate, now);
    return candidate;
  } catch {
    const fallback = alignCardToReviewClock(legacyCard(legacy), now);
    try {
      scheduler.repeat(fallback, now);
      return fallback;
    } catch {
      return createEmptyCard(now);
    }
  }
}

export function formatReviewInterval(intervalMinutes: number): string {
  const minutes = Math.max(1, Math.round(intervalMinutes));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(minutes / (24 * 60));
  if (days < 14) return `${days} 天`;
  if (days < 60) return `${Math.round(days / 7)} 周`;
  if (days < 730) return `${Math.round(days / 30)} 个月`;
  return `${Math.round(days / 365)} 年`;
}

export function normalizeReviewCard(
  value: unknown,
  legacy: LegacyReviewSnapshot
): ReviewCardSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return serializeCard(legacyCard(legacy));
  }
  const item = value as Partial<ReviewCardSnapshot>;
  const fallback = serializeCard(legacyCard(legacy));
  const state = Math.round(finiteNumber(item.state, fallback.state));
  const normalized: ReviewCardSnapshot = {
    due: validDate(item.due, fallback.due),
    stability: Math.max(0, finiteNumber(item.stability, fallback.stability)),
    difficulty: clamp(finiteNumber(item.difficulty, fallback.difficulty), 1, 10),
    elapsedDays: Math.max(0, finiteNumber(item.elapsedDays, fallback.elapsedDays)),
    scheduledDays: Math.max(0, finiteNumber(item.scheduledDays, fallback.scheduledDays)),
    learningSteps: Math.max(0, Math.round(finiteNumber(item.learningSteps, fallback.learningSteps))),
    reps: Math.max(0, Math.round(finiteNumber(item.reps, fallback.reps))),
    lapses: Math.max(0, Math.round(finiteNumber(item.lapses, fallback.lapses))),
    state: state >= State.New && state <= State.Relearning ? state : fallback.state,
    lastReview: typeof item.lastReview === "string" && !Number.isNaN(Date.parse(item.lastReview))
      ? item.lastReview
      : fallback.lastReview
  };
  try {
    deserializeCard(normalized);
    return normalized;
  } catch {
    return fallback;
  }
}

export function normalizeReviewHistory(value: unknown): ReviewHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ReviewHistoryItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Partial<ReviewHistoryItem>;
    if (
      (item.outcome !== "again" && item.outcome !== "fuzzy" && item.outcome !== "remembered") ||
      typeof item.reviewedAt !== "string" || Number.isNaN(Date.parse(item.reviewedAt)) ||
      typeof item.scheduledAt !== "string" || Number.isNaN(Date.parse(item.scheduledAt))
    ) return [];
    return [{
      reviewedAt: item.reviewedAt,
      outcome: item.outcome,
      scheduledAt: item.scheduledAt,
      intervalMinutes: Math.max(1, Math.round(finiteNumber(item.intervalMinutes, 1))),
      retrievability: clamp(finiteNumber(item.retrievability), 0, 1),
      stability: Math.max(0, finiteNumber(item.stability)),
      difficulty: clamp(finiteNumber(item.difficulty, 5), 1, 10)
    }];
  }).slice(-100);
}

export function previewReviewSchedule(
  snapshot: ReviewCardSnapshot | undefined,
  legacy: LegacyReviewSnapshot,
  now = new Date()
): Record<ReviewOutcome, ReviewPreview> {
  const card = schedulableCard(snapshot, legacy, now);
  const records = scheduler.repeat(card, now);
  const preview = (outcome: ReviewOutcome): ReviewPreview => {
    const due = outcome === "again"
      ? records[Rating.Again].card.due
      : outcome === "fuzzy"
        ? records[Rating.Hard].card.due
        : records[Rating.Good].card.due;
    const intervalMinutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / minuteMs));
    return { due: due.toISOString(), intervalMinutes, intervalLabel: formatReviewInterval(intervalMinutes) };
  };
  return {
    again: preview("again"),
    fuzzy: preview("fuzzy"),
    remembered: preview("remembered")
  };
}

export function applyReviewSchedule(
  snapshot: ReviewCardSnapshot | undefined,
  legacy: LegacyReviewSnapshot,
  outcome: ReviewOutcome,
  now = new Date()
): { card: ReviewCardSnapshot; history: ReviewHistoryItem } {
  const card = schedulableCard(snapshot, legacy, now);
  let retrievability = 0;
  if (card.state !== State.New) {
    try {
      retrievability = scheduler.get_retrievability(card, now, false);
    } catch {
      retrievability = 0;
    }
  }
  const result = outcome === "again"
    ? scheduler.next(card, now, Rating.Again)
    : outcome === "fuzzy"
      ? scheduler.next(card, now, Rating.Hard)
      : scheduler.next(card, now, Rating.Good);
  const next = serializeCard(result.card);
  const intervalMinutes = Math.max(1, Math.round((result.card.due.getTime() - now.getTime()) / minuteMs));
  return {
    card: next,
    history: {
      reviewedAt: now.toISOString(),
      outcome,
      scheduledAt: next.due,
      intervalMinutes,
      retrievability: clamp(retrievability, 0, 1),
      stability: next.stability,
      difficulty: next.difficulty
    }
  };
}
