export type SavedTerm = {
  id: string;
  term: string;
  translation: string;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedTerms(terms: SavedTerm[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(terms));
}

