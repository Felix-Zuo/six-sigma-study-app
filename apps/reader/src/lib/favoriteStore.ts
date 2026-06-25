export type SavedFavorite = {
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

const storageKey = "six-sigma-study:favorites:v1";
const defaultBookId = "six-sigma-black-belt";
const defaultBookTitle = "六西格玛黑带教材";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeFavorite(item: Partial<SavedFavorite>): SavedFavorite {
  const savedAt = isIsoDate(item.savedAt) ? item.savedAt : new Date().toISOString();
  return {
    id: item.id ?? `favorite-${Date.now()}`,
    bookId: item.bookId || defaultBookId,
    bookTitle: item.bookTitle || defaultBookTitle,
    chapter: item.chapter ?? 1,
    chapterTitle: item.chapterTitle ?? "Chapter 1: What is Six Sigma?",
    page: item.page ?? 1,
    sectionId: item.sectionId ?? "",
    blockId: item.blockId,
    title: item.title || item.chapterTitle || "收藏位置",
    note: item.note,
    savedAt,
    updatedAt: isIsoDate(item.updatedAt) ? item.updatedAt : savedAt
  };
}

export function loadSavedFavorites(): SavedFavorite[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeFavorite(item));
  } catch {
    return [];
  }
}

export function persistSavedFavorites(favorites: SavedFavorite[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(favorites));
  } catch {
    // Bookmarks should fail softly in privacy-restricted WebView contexts.
  }
}
