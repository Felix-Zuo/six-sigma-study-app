export type ReaderPosition = {
  chapterId?: string;
  sectionId?: string;
  language?: "en" | "zh";
  scrollY?: number;
  updatedAt?: string;
};

const storageKey = "six-sigma-study:reader-position:v1";

export function loadReaderPosition(): ReaderPosition {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ReaderPosition;
    return {
      chapterId: typeof parsed.chapterId === "string" ? parsed.chapterId : undefined,
      sectionId: typeof parsed.sectionId === "string" ? parsed.sectionId : undefined,
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
      updatedAt: new Date().toISOString()
    })
  );
}
