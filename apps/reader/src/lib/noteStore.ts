export type SavedNote = {
  id: string;
  text: string;
  note: string;
  language: "en" | "zh";
  chapter: number;
  chapterTitle: string;
  page: number;
  sectionId: string;
  savedAt: string;
  updatedAt: string;
};

const storageKey = "six-sigma-study:notes:v1";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeSavedNote(item: Partial<SavedNote>): SavedNote {
  const savedAt = isIsoDate(item.savedAt) ? item.savedAt : new Date().toISOString();
  return {
    id: item.id ?? `note-${Date.now()}`,
    text: item.text ?? "",
    note: item.note ?? "",
    language: item.language === "zh" ? "zh" : "en",
    chapter: item.chapter ?? 1,
    chapterTitle: item.chapterTitle ?? "Chapter 1: What is Six Sigma?",
    page: item.page ?? 1,
    sectionId: item.sectionId ?? "",
    savedAt,
    updatedAt: isIsoDate(item.updatedAt) ? item.updatedAt : savedAt
  };
}

export function loadSavedNotes(): SavedNote[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeSavedNote(item));
  } catch {
    return [];
  }
}

export function persistSavedNotes(notes: SavedNote[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(notes));
}
