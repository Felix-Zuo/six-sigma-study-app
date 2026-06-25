export type ReaderPosition = {
  bookId?: string;
  bookTitle?: string;
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

export type ReaderPositionMap = Record<string, ReaderPosition>;

function normalizePosition(position: ReaderPosition, fallbackBookId = defaultBookId): ReaderPosition {
  return {
    bookId: typeof position.bookId === "string" ? position.bookId : fallbackBookId,
    bookTitle: typeof position.bookTitle === "string" ? position.bookTitle : undefined,
    chapterId: typeof position.chapterId === "string" ? position.chapterId : undefined,
    sectionId: typeof position.sectionId === "string" ? position.sectionId : undefined,
    blockId: typeof position.blockId === "string" ? position.blockId : undefined,
    page: typeof position.page === "number" && Number.isFinite(position.page) ? position.page : undefined,
    language: position.language === "zh" ? "zh" : position.language === "en" ? "en" : undefined,
    scrollY: typeof position.scrollY === "number" && Number.isFinite(position.scrollY) ? position.scrollY : undefined,
    updatedAt: typeof position.updatedAt === "string" ? position.updatedAt : undefined
  };
}

export function loadReaderPositions(): ReaderPositionMap {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ReaderPosition & {
      activeBookId?: string;
      positions?: Record<string, ReaderPosition>;
    };
    if (parsed.positions && typeof parsed.positions === "object") {
      return Object.fromEntries(
        Object.entries(parsed.positions).map(([bookId, position]) => [
          bookId,
          normalizePosition(position, bookId)
        ])
      );
    }
    const legacy = normalizePosition(parsed, parsed.bookId ?? defaultBookId);
    return legacy.bookId ? { [legacy.bookId]: legacy } : {};
  } catch {
    return {};
  }
}

export function loadReaderPosition(bookId?: string): ReaderPosition {
  const positions = loadReaderPositions();
  if (bookId && positions[bookId]) {
    return positions[bookId];
  }
  const values = Object.values(positions);
  return values.sort((a, b) => Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""))[0] ?? {};
}

export function persistReaderPosition(position: ReaderPosition): void {
  const bookId = position.bookId ?? defaultBookId;
  const positions = loadReaderPositions();
  const nextPosition = normalizePosition(
    {
      ...positions[bookId],
      ...position,
      bookId,
      updatedAt: new Date().toISOString()
    },
    bookId
  );
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      activeBookId: bookId,
      positions: {
        ...positions,
        [bookId]: nextPosition
      },
      updatedAt: new Date().toISOString()
    })
  );
}
