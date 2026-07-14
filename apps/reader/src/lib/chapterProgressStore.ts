export type ChapterCompletion = {
  completed: boolean;
  completedAt?: string;
  updatedAt: string;
};

export type ChapterProgressMap = Record<string, Record<string, ChapterCompletion>>;

const storageKey = "six-sigma-study:chapter-progress:v1";

function normalizeCompletion(value: unknown): ChapterCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<ChapterCompletion>;
  if (!candidate.completed) {
    return null;
  }
  const updatedAt = typeof candidate.updatedAt === "string"
    ? candidate.updatedAt
    : typeof candidate.completedAt === "string"
      ? candidate.completedAt
      : new Date(0).toISOString();
  return {
    completed: true,
    completedAt: typeof candidate.completedAt === "string" ? candidate.completedAt : updatedAt,
    updatedAt
  };
}

export function loadChapterProgress(): ChapterProgressMap {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([bookId, chapters]) => {
        if (!chapters || typeof chapters !== "object" || Array.isArray(chapters)) {
          return [];
        }
        const normalized = Object.fromEntries(
          Object.entries(chapters).flatMap(([chapterId, value]) => {
            const completion = normalizeCompletion(value);
            return completion ? [[chapterId, completion] as const] : [];
          })
        );
        return [[bookId, normalized] as const];
      })
    );
  } catch {
    return {};
  }
}

export function persistChapterProgress(progress: ChapterProgressMap): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(progress));
  } catch {
    // Completion is useful metadata and must not block reading.
  }
}

export function setChapterCompleted(
  progress: ChapterProgressMap,
  bookId: string,
  chapterId: string,
  completed: boolean,
  now = new Date()
): ChapterProgressMap {
  const chapters = { ...(progress[bookId] ?? {}) };
  if (!completed) {
    delete chapters[chapterId];
  } else {
    const timestamp = now.toISOString();
    chapters[chapterId] = {
      completed: true,
      completedAt: chapters[chapterId]?.completedAt ?? timestamp,
      updatedAt: timestamp
    };
  }
  return { ...progress, [bookId]: chapters };
}

export function isChapterCompleted(progress: ChapterProgressMap, bookId: string, chapterId: string): boolean {
  return progress[bookId]?.[chapterId]?.completed === true;
}

export const chapterProgressStorageKey = storageKey;
