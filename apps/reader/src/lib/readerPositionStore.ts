export type ReaderPosition = {
  bookId?: string;
  chapterId?: string;
  sectionId?: string;
  blockId?: string;
  page?: number;
  language?: "en" | "zh";
  scrollY?: number;
  updatedAt?: string;
};

const storageKey = "six-sigma-study:reader-position:v1";
const defaultBookId = "six-sigma-black-belt";

export function loadReaderPosition(): ReaderPosition {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ReaderPosition;
    return {
      bookId: typeof parsed.bookId === "string" ? parsed.bookId : defaultBookId,
      chapterId: typeof parsed.chapterId === "string" ? parsed.chapterId : undefined,
      sectionId: typeof parsed.sectionId === "string" ? parsed.sectionId : undefined,
      blockId: typeof parsed.blockId === "string" ? parsed.blockId : undefined,
      page: typeof parsed.page === "number" && Number.isFinite(parsed.page) ? parsed.page : undefined,
      language: parsed.language === "zh" ? "zh" : parsed.language === "en" ? "en" : undefined,
      scrollY: typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY) ? parsed.scrollY : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined
    };
  } catch {
    return {};
  }
}

export function persistReaderPosition(position: ReaderPosition): void {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      ...position,
      bookId: position.bookId ?? defaultBookId,
      updatedAt: new Date().toISOString()
    })
  );
}
