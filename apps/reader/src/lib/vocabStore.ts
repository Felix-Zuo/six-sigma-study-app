export type SavedTerm = {
  id: string;
  term: string;
  translation: string;
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  sourceText: string;
  savedAt: string;
  status: "new" | "learning" | "mastered";
};

const storageKey = "six-sigma-study:vocab:v1";

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
    return parsed.map((item) => ({
      ...item,
      chapter: item.chapter ?? 1,
      chapterTitle: item.chapterTitle ?? "Chapter 1: What is Six Sigma?",
      status: item.status ?? "new"
    }));
  } catch {
    return [];
  }
}

export function persistSavedTerms(terms: SavedTerm[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(terms));
}
