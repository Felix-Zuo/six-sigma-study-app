import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { normalizeLookup, tokenizeEnglish } from "./lib/tokenize";
import {
  isTermDue,
  loadSavedTerms,
  persistSavedTerms,
  savedTermsToCsv,
  scheduleTermReview,
  setTermStatus,
  type SavedTerm
} from "./lib/vocabStore";
import { loadReaderPosition, persistReaderPosition } from "./lib/readerPositionStore";
import { loadSavedNotes, persistSavedNotes, type SavedNote } from "./lib/noteStore";

type Language = "en" | "zh";
type ThemeMode = "light" | "dark";
type TextScale = "standard" | "large" | "xlarge";
type AppView = "splash" | "home" | "reader";
type LocalizedText = Record<Language, string>;

type ContentBlock = {
  id: string;
  kind: "paragraph" | "listItem" | "table" | "termNote" | "heading" | "image";
  page?: number;
  text?: string;
  rows?: string[][];
  assetId?: string;
  src?: string;
  width?: number;
  height?: number;
  alt?: string;
};

type LessonSection = {
  id: string;
  level: number;
  page: number;
  title: LocalizedText;
  content: Record<Language, ContentBlock[]>;
};

type Lesson = {
  id: string;
  chapter: number;
  pageStart: number;
  pageEnd: number;
  title: LocalizedText;
  sections: LessonSection[];
  assets?: {
    id: string;
    type: "figure" | "table-image" | "formula-image";
    path: string;
    page: number;
    width?: number;
    height?: number;
  }[];
};

type TermEntry = {
  term: string;
  translation: string;
  partOfSpeech?: string;
  phonetic?: string;
  explanation: string;
  lookupKeys: string[];
  isSixSigmaTerm?: boolean;
};

type BookManifest = {
  bookId: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  languagePair: Language[];
  cover?: string;
  domainLabel?: string;
  contentPath: string;
  pageCount: number;
  chapterCount: number;
  assetCount: number;
  source: string;
  licenseNotice: LocalizedText;
};

type CatalogData = {
  version: string;
  defaultBookId: string;
  books: BookManifest[];
};

type ManualData = {
  manual: string;
  bookId?: string;
  title?: LocalizedText;
  subtitle?: LocalizedText;
  domainLabel?: string;
  source?: string;
  licenseNotice?: LocalizedText;
  version: string;
  pageCount: number;
  chapters: Lesson[];
  dictionary: TermEntry[];
};

type ActiveLookup = {
  entry: TermEntry;
  page: number;
  sectionId: string;
  blockId?: string;
  sourceText: string;
};

type SelectedPhrase = {
  text: string;
  page: number;
  sectionId: string;
  blockId?: string;
  canLookup: boolean;
};

type OverlayName = "lookup" | "toc" | "vocab" | "notes";
type VocabFilter = "due" | "all";
type LookupTextHandler = (
  text: string,
  page: number,
  sectionId: string,
  blockId: string | undefined,
  sourceText: string
) => void;
type TocSearchResult =
  | { kind: "chapter"; chapter: Lesson }
  | { kind: "section"; chapter: Lesson; section: LessonSection }
  | { kind: "page"; chapter: Lesson; section: LessonSection; page: number; blockId: string };
type PendingLanguageScroll = {
  sectionId: string;
  blockId?: string;
  page?: number;
  blockIndex: number;
  sourceBlockCount: number;
  blockOffsetRatio: number;
  sectionOffsetRatio: number;
};
type PageGroup = {
  page: number;
  sectionId: string;
  blockId?: string;
  count: number;
};

const defaultBookId = "six-sigma-black-belt";
const defaultBookTitle = "六西格玛黑带教材";
const githubProfileUrl = "https://github.com/Felix-Zuo";
const catalogPath = "content/catalog.json";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const readerPreferencesKey = "six-sigma-study:reader-preferences:v1";
const textScaleOrder: TextScale[] = ["standard", "large", "xlarge"];

const fallbackCatalog: CatalogData = {
  version: "0.2.0",
  defaultBookId,
  books: [
    {
      bookId: defaultBookId,
      title: {
        en: "Six Sigma Black Belt Training Manual",
        zh: "六西格玛黑带培训教材"
      },
      subtitle: {
        en: "Bilingual study edition",
        zh: "中英对照学习版"
      },
      languagePair: ["en", "zh"],
      domainLabel: "六西格玛术语",
      contentPath: "content/manual.json",
      pageCount: 449,
      chapterCount: 33,
      assetCount: 470,
      source: "The Council for Six Sigma Certification public training manual",
      licenseNotice: {
        zh: "本教材据用户说明为官网下载公开学习资料，允许下载并转赠。本 App 仅用于个人学习、中文翻译整理和对照阅读，禁止任何商业化使用；本项目不代表 CSSC 官方产品，原版权归原权利方所有。",
        en: "The source manual is described by the user as a publicly downloadable study resource that may be shared. This app is for personal study, Chinese translation, and bilingual reference only. Commercial use is prohibited. This project is not an official CSSC product; all original rights remain with their respective owner."
      }
    }
  ]
};

function loadReaderPreferences(): { theme: ThemeMode; textScale: TextScale } {
  try {
    const raw = window.localStorage.getItem(readerPreferencesKey);
    if (!raw) {
      return { theme: "light", textScale: "standard" };
    }
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme === "dark" ? "dark" : "light",
      textScale: textScaleOrder.includes(parsed.textScale) ? parsed.textScale : "standard"
    };
  } catch {
    return { theme: "light", textScale: "standard" };
  }
}

function persistReaderPreferences(theme: ThemeMode, textScale: TextScale): void {
  window.localStorage.setItem(readerPreferencesKey, JSON.stringify({ theme, textScale }));
}

function loadInitialView(): AppView {
  return window.localStorage.getItem(noticeAcceptedKey) === "true" ? "home" : "splash";
}

function loadInitialBookId(positionBookId?: string): string {
  return positionBookId || window.localStorage.getItem(activeBookKey) || defaultBookId;
}

function getBookTitle(book?: BookManifest | null, language: Language = "zh"): string {
  return book?.title?.[language] || book?.title?.zh || defaultBookTitle;
}

function enrichManualData(data: ManualData, book: BookManifest): ManualData {
  return {
    ...data,
    bookId: data.bookId ?? book.bookId,
    title: data.title ?? book.title,
    subtitle: data.subtitle ?? book.subtitle,
    domainLabel: data.domainLabel ?? book.domainLabel,
    source: data.source ?? book.source,
    licenseNotice: data.licenseNotice ?? book.licenseNotice,
    pageCount: data.pageCount || book.pageCount
  };
}

function blockPage(block: ContentBlock, section: LessonSection): number {
  return block.page ?? section.page;
}

function buildPageGroups(sections: LessonSection[]): PageGroup[] {
  const groups: PageGroup[] = [];
  const seen = new Map<number, PageGroup>();
  for (const section of sections) {
    for (const block of section.content.en) {
      const page = blockPage(block, section);
      const existing = seen.get(page);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const group: PageGroup = {
        page,
        sectionId: section.id,
        blockId: block.id,
        count: 1
      };
      seen.set(page, group);
      groups.push(group);
    }
  }
  return groups.sort((a, b) => a.page - b.page);
}

function sourceContextForTerm(text: string, term: string): string {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedTerm = term.toLocaleLowerCase();
  const index = normalizedText.indexOf(normalizedTerm);
  if (index < 0) {
    return text.length > 260 ? `${text.slice(0, 240).trim()}...` : text;
  }

  const before = text.slice(0, index);
  const after = text.slice(index + term.length);
  const leftBoundary = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("?"),
    before.lastIndexOf("!"),
    before.lastIndexOf(";"),
    before.lastIndexOf("\n")
  );
  const rightCandidates = [after.indexOf("."), after.indexOf("?"), after.indexOf("!"), after.indexOf(";")]
    .filter((value) => value >= 0)
    .map((value) => index + term.length + value + 1);
  const rightBoundary = rightCandidates.length > 0 ? Math.min(...rightCandidates) : text.length;
  const start = leftBoundary >= 0 ? leftBoundary + 1 : Math.max(0, index - 120);
  const end = rightBoundary > index ? rightBoundary : Math.min(text.length, index + term.length + 160);
  const context = text.slice(start, end).trim();
  return context.length > 320 ? `${context.slice(0, 300).trim()}...` : context;
}

function formatNextReview(term: SavedTerm): string {
  if (isTermDue(term)) {
    return "今天待复习";
  }
  const date = new Date(term.nextReviewAt);
  return `下次 ${date.getMonth() + 1}/${date.getDate()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readerAnchorOffset(): number {
  const chromeHeight = document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120;
  return chromeHeight + 10;
}

function normalizeTocQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function titleMatches(title: LocalizedText, query: string): boolean {
  return (
    title.en.toLocaleLowerCase().includes(query) ||
    title.zh.toLocaleLowerCase().includes(query)
  );
}

function buildTocSearchResults(manual: ManualData | null, queryText: string): TocSearchResult[] {
  if (!manual) {
    return [];
  }

  const query = normalizeTocQuery(queryText);
  if (!query) {
    return manual.chapters.map((chapter) => ({ kind: "chapter", chapter }));
  }

  const numericQuery = /^\d+$/.test(query) ? Number(query) : null;
  const results: TocSearchResult[] = [];
  for (const chapter of manual.chapters) {
    const chapterMatches =
      titleMatches(chapter.title, query) ||
      numericQuery === chapter.chapter ||
      (numericQuery !== null && numericQuery >= chapter.pageStart && numericQuery <= chapter.pageEnd);

    if (chapterMatches) {
      results.push({ kind: "chapter", chapter });
    }

    for (const section of chapter.sections) {
      const sectionMatches =
        titleMatches(section.title, query) ||
        (numericQuery !== null && numericQuery === section.page);

      if (sectionMatches) {
        results.push({ kind: "section", chapter, section });
      }

      if (numericQuery !== null) {
        const pageBlocks = section.content.en.filter((block) => blockPage(block, section) === numericQuery);
        if (pageBlocks.length > 0) {
          results.push({
            kind: "page",
            chapter,
            section,
            page: numericQuery,
            blockId: pageBlocks[0].id
          });
        }
      }
    }
  }

  return results.slice(0, 80);
}

function buildTermIndex(entries: TermEntry[]) {
  const index = new Map<string, TermEntry>();
  for (const entry of entries) {
    index.set(normalizeLookup(entry.term), entry);
    for (const key of entry.lookupKeys) {
      index.set(normalizeLookup(key), entry);
    }
  }
  return index;
}

function lookupFallback(term: string): TermEntry {
  return {
    term,
    translation: "待完善",
    partOfSpeech: "unknown",
    lookupKeys: [term],
    explanation: "该词或短语还没有进入本地词库。后续会接入更完整的离线词典和六西格玛术语库。"
  };
}

function lookupCandidates(text: string): string[] {
  const normalized = normalizeLookup(text);
  const keys = normalized ? [normalized] : [];
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length > 1) {
    keys.push(...parts);
  }
  return [...new Set(keys)];
}

function InlineReaderText({
  text,
  page,
  sectionId,
  blockId,
  language,
  onLookup
}: {
  text: string;
  page: number;
  sectionId: string;
  blockId?: string;
  language: Language;
  onLookup: LookupTextHandler;
}) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const shouldLazyTokenize = language === "en" && text.trim().length > 0;
  const [isNearViewport, setIsNearViewport] = useState(!shouldLazyTokenize);

  useEffect(() => {
    if (language !== "en") {
      setIsNearViewport(false);
      return;
    }
    if (!shouldLazyTokenize || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    setIsNearViewport(false);
    const marker = markerRef.current;
    if (!marker) {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsNearViewport(entry.isIntersecting);
        }
      },
      { rootMargin: "900px 0px" }
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [language, shouldLazyTokenize, text]);

  const tokens = useMemo(() => {
    if (language !== "en" || !isNearViewport) {
      return [];
    }
    return tokenizeEnglish(text);
  }, [language, text, isNearViewport]);

  if (language !== "en") {
    return <>{text}</>;
  }

  if (!isNearViewport) {
    return <span ref={markerRef}>{text}</span>;
  }

  return (
    <span ref={markerRef}>
      {tokens.map((token) =>
        token.kind === "word" ? (
          <button
            key={token.id}
            className="wordToken"
            onClick={() => onLookup(token.text, page, sectionId, blockId, sourceContextForTerm(text, token.text))}
          >
            {token.text}
          </button>
        ) : (
          <span key={token.id}>{token.text}</span>
        )
      )}
    </span>
  );
}

export function App() {
  const initialPositionRef = useRef(loadReaderPosition());
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [activeBookId, setActiveBookId] = useState(() => loadInitialBookId(initialPositionRef.current.bookId));
  const [view, setView] = useState<AppView>(() => loadInitialView());
  const [manual, setManual] = useState<ManualData | null>(null);
  const [manualLoading, setManualLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [language, setLanguage] = useState<Language>(() =>
    initialPositionRef.current.language === "zh" ? "zh" : "en"
  );
  const [readerPreferences, setReaderPreferences] = useState(() => loadReaderPreferences());
  const [activeChapterId, setActiveChapterId] = useState("");
  const [activeSectionId, setActiveSectionId] = useState("");
  const [activeLookup, setActiveLookup] = useState<ActiveLookup | null>(null);
  const [selectedPhrase, setSelectedPhrase] = useState<SelectedPhrase | null>(null);
  const [savedTerms, setSavedTerms] = useState<SavedTerm[]>(() => loadSavedTerms());
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>(() => loadSavedNotes());
  const [showToc, setShowToc] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tocQuery, setTocQuery] = useState("");
  const [vocabFilter, setVocabFilter] = useState<VocabFilter>("due");
  const [vocabExportMessage, setVocabExportMessage] = useState("");
  const [isImmersive, setIsImmersive] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => initialPositionRef.current.page ?? 1);
  const [activeBlockId, setActiveBlockId] = useState(initialPositionRef.current.blockId ?? "");
  const [highlightBlockId, setHighlightBlockId] = useState("");
  const readerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<OverlayName | null>(null);
  const overlayHistoryRef = useRef(false);
  const pendingScrollSectionRef = useRef<string | null>(null);
  const pendingScrollBlockRef = useRef<string | null>(null);
  const pendingLanguageScrollRef = useRef<PendingLanguageScroll | null>(null);
  const savedScrollLockRef = useRef(0);

  const activeBook = useMemo(() => {
    const source = catalog ?? fallbackCatalog;
    return source.books.find((book) => book.bookId === activeBookId) ?? source.books[0];
  }, [activeBookId, catalog]);
  const currentBookId = activeBook?.bookId ?? defaultBookId;
  const currentBookTitleZh = getBookTitle(activeBook, "zh");
  const lesson = manual?.chapters.find((chapter) => chapter.id === activeChapterId) ?? manual?.chapters[0];
  const activeSection = lesson?.sections.find((section) => section.id === activeSectionId) ?? lesson?.sections[0];
  const termIndex = useMemo(() => buildTermIndex(manual?.dictionary ?? []), [manual]);
  const tocResults = useMemo(() => buildTocSearchResults(manual, tocQuery), [manual, tocQuery]);
  const bookSavedTerms = useMemo(
    () => savedTerms.filter((item) => item.bookId === currentBookId),
    [savedTerms, currentBookId]
  );
  const bookSavedNotes = useMemo(
    () => savedNotes.filter((item) => item.bookId === currentBookId),
    [savedNotes, currentBookId]
  );
  const dueTerms = useMemo(() => bookSavedTerms.filter((item) => isTermDue(item)), [bookSavedTerms]);
  const visibleSavedTerms = useMemo(() => {
    const source = vocabFilter === "due" ? dueTerms : bookSavedTerms;
    return [...source].sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt));
  }, [bookSavedTerms, dueTerms, vocabFilter]);
  const learningCount = bookSavedTerms.filter((item) => item.status === "learning").length;
  const masteredCount = bookSavedTerms.filter((item) => item.status === "mastered").length;
  const savedSet = useMemo(
    () => new Set(bookSavedTerms.map((item) => `${item.bookId}:${normalizeLookup(item.term)}`)),
    [bookSavedTerms]
  );
  const textScaleIndex = textScaleOrder.indexOf(readerPreferences.textScale);
  const pageGroups = useMemo(() => buildPageGroups(lesson?.sections ?? []), [lesson]);
  const chapterProgress = lesson
    ? Math.round(
        ((Math.max(lesson.pageStart, Math.min(currentPage, lesson.pageEnd)) - lesson.pageStart + 1) /
          Math.max(1, lesson.pageEnd - lesson.pageStart + 1)) *
          100
      )
    : 0;
  const bookProgress = manual ? Math.round((Math.max(1, currentPage) / Math.max(1, manual.pageCount)) * 100) : 0;
  const isOverlayOpen = Boolean(activeLookup || showToc || showVocab || showNotes);

  useEffect(() => {
    fetch(catalogPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`catalog load failed: ${response.status}`);
        }
        return response.json() as Promise<CatalogData>;
      })
      .then((data) => {
        setCatalog(data);
        const savedBookId = loadInitialBookId(initialPositionRef.current.bookId);
        const nextBook = data.books.find((book) => book.bookId === savedBookId) ?? data.books[0];
        setActiveBookId(nextBook.bookId);
      })
      .catch(() => {
        setCatalog(fallbackCatalog);
        setActiveBookId(fallbackCatalog.defaultBookId);
      });
  }, []);

  useEffect(() => {
    if (!activeBook) {
      return;
    }

    setManualLoading(true);
    setLoadError("");
    window.localStorage.setItem(activeBookKey, activeBook.bookId);
    fetch(activeBook.contentPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`manual load failed: ${response.status}`);
        }
        return response.json() as Promise<ManualData>;
      })
      .then((data) => {
        const enriched = enrichManualData(data, activeBook);
        const savedPosition = initialPositionRef.current;
        const canRestore = (savedPosition.bookId ?? defaultBookId) === activeBook.bookId;
        const initialChapter =
          canRestore
            ? enriched.chapters.find((chapter) => chapter.id === savedPosition.chapterId) ?? enriched.chapters[0]
            : enriched.chapters[0];
        const initialSection =
          (canRestore
            ? initialChapter.sections.find((section) => section.id === savedPosition.sectionId)
            : undefined) ?? initialChapter.sections[0];
        setManual(enriched);
        setActiveChapterId(initialChapter.id);
        setActiveSectionId(initialSection.id);
        setCurrentPage(canRestore ? savedPosition.page ?? initialSection.page : initialSection.page);
        setActiveBlockId(canRestore ? savedPosition.blockId ?? "" : "");
        setManualLoading(false);
        if (view === "reader") {
          window.requestAnimationFrame(() => {
            if (
              canRestore &&
              typeof savedPosition.scrollY === "number" &&
              savedPosition.chapterId === initialChapter.id
            ) {
              window.scrollTo({ top: savedPosition.scrollY });
              return;
            }
            document.querySelector(`[data-section-id="${initialSection.id}"]`)?.scrollIntoView({ block: "start" });
          });
        }
      })
      .catch((error: unknown) => {
        setManual(null);
        setManualLoading(false);
        setLoadError(error instanceof Error ? error.message : "manual load failed");
      });
  }, [activeBook, view]);

  useEffect(() => {
    persistSavedTerms(savedTerms);
  }, [savedTerms]);

  useEffect(() => {
    persistSavedNotes(savedNotes);
  }, [savedNotes]);

  useEffect(() => {
    persistReaderPreferences(readerPreferences.theme, readerPreferences.textScale);
  }, [readerPreferences]);

  useEffect(() => {
    document.documentElement.dataset.readerTheme = readerPreferences.theme;
  }, [readerPreferences.theme]);

  useEffect(() => {
    if (!activeChapterId || !activeSectionId) {
      return;
    }
    persistReaderPosition({
      bookId: currentBookId,
      chapterId: activeChapterId,
      sectionId: activeSectionId,
      blockId: activeBlockId || undefined,
      page: currentPage,
      language,
      scrollY: window.scrollY
    });
  }, [activeBlockId, activeChapterId, activeSectionId, currentBookId, currentPage, language]);

  useEffect(() => {
    if (!activeChapterId || !activeSectionId) {
      return;
    }
    let timer: number | undefined;

    function saveScrollPosition() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        persistReaderPosition({
          bookId: currentBookId,
          chapterId: activeChapterId,
          sectionId: activeSectionId,
          blockId: activeBlockId || undefined,
          page: currentPage,
          language,
          scrollY: window.scrollY
        });
      }, 180);
    }

    window.addEventListener("scroll", saveScrollPosition, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", saveScrollPosition);
    };
  }, [activeBlockId, activeChapterId, activeSectionId, currentBookId, currentPage, language]);

  useEffect(() => {
    overlayRef.current = activeLookup ? "lookup" : showToc ? "toc" : showVocab ? "vocab" : showNotes ? "notes" : null;
  }, [activeLookup, showToc, showVocab, showNotes]);

  useEffect(() => {
    if (!isOverlayOpen) {
      const lockedY = savedScrollLockRef.current;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      if (lockedY > 0) {
        window.scrollTo({ top: lockedY });
      }
      savedScrollLockRef.current = 0;
      return;
    }

    savedScrollLockRef.current = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollLockRef.current}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      const lockedY = savedScrollLockRef.current;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      if (lockedY > 0) {
        window.scrollTo({ top: lockedY });
      }
      savedScrollLockRef.current = 0;
    };
  }, [isOverlayOpen]);

  useEffect(() => {
    function handlePopState() {
      if (!overlayHistoryRef.current && !overlayRef.current) {
        return;
      }
      overlayHistoryRef.current = false;
      closeOverlay();
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let removed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (overlayRef.current) {
        closeOverlayFromNativeBack();
        return;
      }

      if (isImmersive) {
        setIsImmersive(false);
        return;
      }

      if (canGoBack) {
        window.history.back();
        return;
      }

      void CapacitorApp.exitApp();
    }).then((handle) => {
      if (removed) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      removed = true;
      void listener?.remove();
    };
  }, [isImmersive]);

  useEffect(() => {
    const root = readerRef.current;
    if (!root || !lesson) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-section-id");
        if (sectionId) {
          setActiveSectionId(sectionId);
        }
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: [0.2, 0.6] }
    );
    root.querySelectorAll("[data-section-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [lesson]);

  useEffect(() => {
    const root = readerRef.current;
    if (!root || !lesson) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const aDistance = Math.abs(a.boundingClientRect.top - readerAnchorOffset());
            const bDistance = Math.abs(b.boundingClientRect.top - readerAnchorOffset());
            return aDistance - bDistance;
          })[0];
        if (!visible) {
          return;
        }
        const blockNode = visible.target as HTMLElement;
        const page = Number(blockNode.dataset.page);
        const blockId = blockNode.dataset.blockId ?? "";
        const sectionId = blockNode.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
        if (Number.isFinite(page)) {
          setCurrentPage(page);
        }
        if (blockId) {
          setActiveBlockId(blockId);
        }
        if (sectionId) {
          setActiveSectionId(sectionId);
        }
      },
      { rootMargin: "-110px 0px -65% 0px", threshold: [0.01, 0.25, 0.6] }
    );
    root.querySelectorAll("[data-block-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [lesson, language]);

  useEffect(() => {
    const pending = pendingLanguageScrollRef.current;
    if (!pending) {
      return;
    }
    const pendingScroll = pending;

    function restorePendingScroll(finalAttempt = false) {
      const sectionNode = document.querySelector<HTMLElement>(`[data-section-id="${pendingScroll.sectionId}"]`);
      if (!sectionNode) {
        if (finalAttempt) {
          pendingLanguageScrollRef.current = null;
        }
        return;
      }

      const sectionTop = window.scrollY + sectionNode.getBoundingClientRect().top;
      const sectionFallbackTop =
        sectionTop + sectionNode.scrollHeight * pendingScroll.sectionOffsetRatio - readerAnchorOffset();
      const bodyNode = sectionNode.querySelector<HTMLElement>(".sectionBody");
      const stableTargetBlock = pendingScroll.blockId
        ? bodyNode?.querySelector<HTMLElement>(`[data-block-id="${pendingScroll.blockId}"]`)
        : undefined;
      if (stableTargetBlock) {
        const blockTop = window.scrollY + stableTargetBlock.getBoundingClientRect().top;
        const targetTop =
          blockTop + stableTargetBlock.scrollHeight * pendingScroll.blockOffsetRatio - readerAnchorOffset();
        window.scrollTo({ top: Math.max(0, targetTop) });
        if (finalAttempt) {
          pendingLanguageScrollRef.current = null;
        }
        return;
      }
      const targetBlockCount = bodyNode?.children.length ?? 0;
      const blockCountDifference = Math.abs(pendingScroll.sourceBlockCount - targetBlockCount);
      const blockCountDifferenceRatio =
        blockCountDifference / Math.max(1, pendingScroll.sourceBlockCount, targetBlockCount);
      const shouldUseSectionRatio =
        targetBlockCount <= pendingScroll.blockIndex || blockCountDifferenceRatio > 0.2;
      if (shouldUseSectionRatio) {
        window.scrollTo({ top: Math.max(0, sectionFallbackTop) });
        if (finalAttempt) {
          pendingLanguageScrollRef.current = null;
        }
        return;
      }
      const targetBlock = bodyNode?.children[pendingScroll.blockIndex] as HTMLElement | undefined;
      if (!targetBlock) {
        window.scrollTo({ top: Math.max(0, sectionFallbackTop) });
        if (finalAttempt) {
          pendingLanguageScrollRef.current = null;
        }
        return;
      }

      const blockTop = window.scrollY + targetBlock.getBoundingClientRect().top;
      const targetTop =
        blockTop + targetBlock.scrollHeight * pendingScroll.blockOffsetRatio - readerAnchorOffset();
      window.scrollTo({ top: Math.max(0, targetTop) });
      if (finalAttempt) {
        pendingLanguageScrollRef.current = null;
      }
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => restorePendingScroll(false));
    });
    const timers = [80, 180, 300, 700].map((delay, index, values) =>
      window.setTimeout(() => restorePendingScroll(index === values.length - 1), delay)
    );
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [language]);

  useEffect(() => {
    const sectionId = pendingScrollSectionRef.current;
    if (!sectionId || !lesson) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      const blockId = pendingScrollBlockRef.current;
      const node =
        blockId
          ? document.querySelector(`[data-section-id="${sectionId}"] [data-block-id="${blockId}"]`)
          : document.querySelector(`[data-section-id="${sectionId}"]`);
      if (node) {
        const top = window.scrollY + node.getBoundingClientRect().top - readerAnchorOffset() + 28;
        window.scrollTo({ top: Math.max(0, top) });
        if (blockId) {
          setHighlightBlockId(blockId);
          window.setTimeout(() => setHighlightBlockId(""), 2600);
        }
        pendingScrollSectionRef.current = null;
        pendingScrollBlockRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, [lesson, activeSectionId]);

  useEffect(() => {
    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const anchorNode = selection?.anchorNode;
      if (!text || !anchorNode || !readerRef.current?.contains(anchorNode)) {
        setSelectedPhrase(null);
        return;
      }
      const normalized = normalizeLookup(text);
      const hasSelection = language === "zh" ? text.length >= 2 : normalized.length >= 2;
      if (!hasSelection) {
        setSelectedPhrase(null);
        return;
      }

      const anchorElement =
        anchorNode.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as Element)
          : anchorNode.parentElement;
      const sectionNode = anchorElement?.closest<HTMLElement>("[data-section-id]");
      const sectionId = sectionNode?.dataset.sectionId;
      const section = lesson?.sections.find((candidate) => candidate.id === sectionId);
      if (!section) {
        setSelectedPhrase(null);
        return;
      }
      const blockNode = anchorElement?.closest<HTMLElement>("[data-block-id]");
      const blockPage = Number(blockNode?.dataset.page);

      setSelectedPhrase({
        text,
        page: Number.isFinite(blockPage) ? blockPage : section.page,
        sectionId: section.id,
        blockId: blockNode?.dataset.blockId,
        canLookup: language === "en" && normalized.includes(" ")
      });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [language, lesson]);

  if (view === "splash") {
    const noticeBook = activeBook ?? fallbackCatalog.books[0];
    return (
      <main
        className="appShell productShell"
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <section className="splashPanel" aria-label="non-commercial notice">
          <div className="appLogo" aria-hidden="true">6σ</div>
          <p className="eyebrow">Study edition</p>
          <h1>Six Sigma Study</h1>
          <p className="splashLead">公开教材的中英对照学习工具</p>
          <div className="noticeBox">
            <p>{noticeBook.licenseNotice.zh}</p>
            <p lang="en">{noticeBook.licenseNotice.en}</p>
          </div>
          <button
            className="primaryAction"
            onClick={() => {
              window.localStorage.setItem(noticeAcceptedKey, "true");
              setView("home");
            }}
          >
            我已了解，进入教材库
          </button>
        </section>
      </main>
    );
  }

  if (view === "home") {
    const books = (catalog ?? fallbackCatalog).books;
    return (
      <main
        className="appShell productShell"
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <header className="homeHeader">
          <div className="appLogo small" aria-hidden="true">6σ</div>
          <div>
            <p className="eyebrow">教材库</p>
            <h1>Six Sigma Study</h1>
          </div>
        </header>
        <section className="libraryIntro">
          <p>当前已收录 1 本教材。后续新教材会作为独立 book 接入，词本、笔记、收藏按教材隔离。</p>
          <a href={githubProfileUrl} target="_blank" rel="noreferrer">GitHub: Felix-Zuo</a>
        </section>
        <section className="bookGrid" aria-label="book library">
          {books.map((book) => {
            const bookTerms = savedTerms.filter((item) => item.bookId === book.bookId);
            const bookNotes = savedNotes.filter((item) => item.bookId === book.bookId);
            return (
              <article key={book.bookId} className="bookCard">
                <div className="bookCover" aria-hidden="true">6σ</div>
                <div className="bookCardBody">
                  <p className="eyebrow">{book.subtitle?.zh ?? "中英对照学习版"}</p>
                  <h2>{book.title.zh}</h2>
                  <p>{book.title.en}</p>
                  <div className="bookStats">
                    <span>{book.chapterCount} 章</span>
                    <span>{book.pageCount} 页</span>
                    <span>{bookTerms.length} 词</span>
                    <span>{bookNotes.length} 笔记</span>
                  </div>
                  <button
                    className="primaryAction"
                    onClick={() => {
                      setActiveBookId(book.bookId);
                      setView("reader");
                    }}
                  >
                    {book.bookId === initialPositionRef.current.bookId ? "继续阅读" : "开始学习"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        <section className="noticeBox compact">
          <p>{activeBook?.licenseNotice.zh ?? fallbackCatalog.books[0].licenseNotice.zh}</p>
          <p lang="en">{activeBook?.licenseNotice.en ?? fallbackCatalog.books[0].licenseNotice.en}</p>
        </section>
        {loadError && <p className="loadWarning">教材预载失败：{loadError}</p>}
        <p className="homeWatermark">Felix-Zuo · non-commercial study edition</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        className="appShell"
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <section className="sectionBlock">
          <h1>教材加载失败</h1>
          <p className="readerText">{loadError}</p>
        </section>
      </main>
    );
  }

  if (manualLoading || !manual || !lesson || !activeSection) {
    return (
      <main
        className="appShell"
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <section className="sectionBlock">
          <h1>Six Sigma Study</h1>
          <p className="readerText">正在加载教材...</p>
        </section>
      </main>
    );
  }

  const currentManual = manual;
  const currentLesson = lesson;
  const currentSection = activeSection;

  function closeOverlay() {
    setActiveLookup(null);
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(false);
    setSelectedPhrase(null);
  }

  function ensureOverlayHistory() {
    if (!overlayHistoryRef.current && !overlayRef.current) {
      window.history.pushState({ sixSigmaOverlay: true }, "", window.location.href);
      overlayHistoryRef.current = true;
    }
  }

  function closeOverlayFromControl() {
    if (overlayHistoryRef.current) {
      window.history.back();
      return;
    }
    closeOverlay();
  }

  function closeOverlayFromNativeBack() {
    closeOverlay();
    if (overlayHistoryRef.current) {
      overlayHistoryRef.current = false;
      window.history.back();
    }
  }

  function closeOverlayForJump() {
    overlayHistoryRef.current = false;
    closeOverlay();
  }

  function openToc() {
    ensureOverlayHistory();
    setActiveLookup(null);
    setShowVocab(false);
    setShowNotes(false);
    setShowToc(true);
  }

  function openVocab() {
    ensureOverlayHistory();
    setActiveLookup(null);
    setShowToc(false);
    setShowNotes(false);
    setShowVocab(true);
  }

  function openNotes() {
    ensureOverlayHistory();
    setActiveLookup(null);
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(true);
  }

  function selectChapter(chapterId: string) {
    const nextLesson = currentManual.chapters.find((chapter) => chapter.id === chapterId);
    if (!nextLesson) {
      return;
    }
    selectChapterSection(nextLesson.id, nextLesson.sections[0].id);
  }

  function selectChapterSection(chapterId: string, sectionId: string) {
    const nextLesson = currentManual.chapters.find((chapter) => chapter.id === chapterId);
    const nextSection = nextLesson?.sections.find((section) => section.id === sectionId);
    if (!nextLesson || !nextSection) {
      return;
    }
    pendingScrollSectionRef.current = nextSection.id;
    pendingScrollBlockRef.current = null;
    setActiveChapterId(nextLesson.id);
    setActiveSectionId(nextSection.id);
    setCurrentPage(nextSection.page);
    closeOverlayForJump();
    scrollToBlock(nextSection.id);
  }

  function scrollToBlock(sectionId: string, blockId?: string) {
    function attemptScroll() {
      const selector = blockId
        ? `[data-section-id="${sectionId}"] [data-block-id="${blockId}"]`
        : `[data-section-id="${sectionId}"]`;
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        return;
      }
      const top = window.scrollY + node.getBoundingClientRect().top - readerAnchorOffset() + 28;
      window.scrollTo({ top: Math.max(0, top) });
      if (blockId) {
        setHighlightBlockId(blockId);
        window.setTimeout(() => setHighlightBlockId(""), 2600);
      }
    }
    [80, 260, 620].forEach((delay) => window.setTimeout(attemptScroll, delay));
  }

  function selectSource(sectionId: string, blockId?: string, page?: number) {
    const nextLesson = currentManual.chapters.find((chapter) =>
      chapter.sections.some((section) => section.id === sectionId)
    );
    const nextSection = nextLesson?.sections.find((section) => section.id === sectionId);
    if (!nextLesson || !nextSection) {
      return;
    }
    pendingScrollSectionRef.current = sectionId;
    pendingScrollBlockRef.current = blockId ?? null;
    setActiveChapterId(nextLesson.id);
    setActiveSectionId(sectionId);
    setCurrentPage(page ?? nextSection.page);
    closeOverlayForJump();
    scrollToBlock(sectionId, blockId);
  }

  function updateTextScale(direction: -1 | 1) {
    setReaderPreferences((current) => {
      const nextIndex = Math.max(
        0,
        Math.min(textScaleOrder.length - 1, textScaleOrder.indexOf(current.textScale) + direction)
      );
      return { ...current, textScale: textScaleOrder[nextIndex] };
    });
  }

  function toggleTheme() {
    setReaderPreferences((current) => ({
      ...current,
      theme: current.theme === "dark" ? "light" : "dark"
    }));
  }

  function captureLanguageScrollPosition(): PendingLanguageScroll | null {
    const anchor = readerAnchorOffset();
    const visibleSection = Array.from(document.querySelectorAll<HTMLElement>("[data-section-id]")).find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= anchor + 20 && rect.bottom >= anchor;
    });
    const sectionId = visibleSection?.dataset.sectionId ?? activeSectionId;
    if (!sectionId) {
      return null;
    }

    const sectionNode = visibleSection ?? document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
    if (!sectionNode) {
      return null;
    }

    const anchorY = window.scrollY + readerAnchorOffset();
    const sectionTop = window.scrollY + sectionNode.getBoundingClientRect().top;
    const sectionOffsetRatio = clamp((anchorY - sectionTop) / Math.max(1, sectionNode.scrollHeight), 0, 1);
    const bodyNode = sectionNode.querySelector<HTMLElement>(".sectionBody");
    const blocks = Array.from(bodyNode?.children ?? []) as HTMLElement[];
    const blockIndex = blocks.findIndex((block) => {
      const rect = block.getBoundingClientRect();
      return rect.bottom >= readerAnchorOffset();
    });

    if (blockIndex < 0) {
      return {
        sectionId,
        blockIndex: 0,
        sourceBlockCount: blocks.length,
        blockOffsetRatio: 0,
        sectionOffsetRatio
      };
    }

    const block = blocks[blockIndex];
    const blockTop = window.scrollY + block.getBoundingClientRect().top;
    const blockOffsetRatio = clamp((anchorY - blockTop) / Math.max(1, block.scrollHeight), 0, 1);
    const page = Number(block.dataset.page);
    return {
      sectionId,
      blockId: block.dataset.blockId,
      page: Number.isFinite(page) ? page : undefined,
      blockIndex,
      sourceBlockCount: blocks.length,
      blockOffsetRatio,
      sectionOffsetRatio
    };
  }

  function switchReadingLanguage() {
    pendingLanguageScrollRef.current = captureLanguageScrollPosition();
    setLanguage(language === "en" ? "zh" : "en");
  }

  function lookupText(text: string, page: number, sectionId: string, blockId: string | undefined, sourceText: string) {
    const entry = lookupCandidates(text).map((key) => termIndex.get(key)).find(Boolean) ?? lookupFallback(text);
    ensureOverlayHistory();
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(false);
    setActiveLookup({ entry, page, sectionId, blockId, sourceText });
  }

  function lookupSelectedPhrase() {
    if (!selectedPhrase) {
      return;
    }
    lookupText(
      selectedPhrase.text,
      selectedPhrase.page,
      selectedPhrase.sectionId,
      selectedPhrase.blockId,
      sourceContextForTerm(selectedPhrase.text, selectedPhrase.text)
    );
    setSelectedPhrase(null);
    window.getSelection()?.removeAllRanges();
  }

  function saveSelectedNote() {
    if (!selectedPhrase) {
      return;
    }

    const now = new Date().toISOString();
    const note: SavedNote = {
      id: `note-${Date.now()}`,
      bookId: currentBookId,
      bookTitle: currentBookTitleZh,
      text: selectedPhrase.text,
      note: "",
      language,
      chapter: currentLesson.chapter,
      chapterTitle: currentLesson.title.en,
      page: selectedPhrase.page,
      sectionId: selectedPhrase.sectionId,
      blockId: selectedPhrase.blockId,
      savedAt: now,
      updatedAt: now
    };
    setSavedNotes((items) => [note, ...items]);
    setSelectedPhrase(null);
    window.getSelection()?.removeAllRanges();
    openNotes();
  }

  function saveActiveTerm() {
    if (!activeLookup || savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.entry.term)}`)) {
      return;
    }
    const now = new Date();
    const saved: SavedTerm = {
      id: `${normalizeLookup(activeLookup.entry.term)}-${now.getTime()}`,
      bookId: currentBookId,
      bookTitle: currentBookTitleZh,
      contentVersion: currentManual.version,
      term: activeLookup.entry.term,
      translation: activeLookup.entry.translation,
      chapter: currentLesson.chapter,
      chapterTitle: currentLesson.title.en,
      page: activeLookup.page,
      sectionId: activeLookup.sectionId,
      blockId: activeLookup.blockId,
      sourceText: activeLookup.sourceText,
      savedAt: now.toISOString(),
      status: "new",
      reviewCount: 0,
      correctStreak: 0,
      nextReviewAt: now.toISOString()
    };
    setSavedTerms((items) => [saved, ...items]);
  }

  function updateSavedStatus(id: string, status: SavedTerm["status"]) {
    setSavedTerms((items) => items.map((item) => (item.id === id ? setTermStatus(item, status) : item)));
  }

  function reviewSavedTerm(id: string, outcome: "again" | "remembered") {
    setSavedTerms((items) => items.map((item) => (item.id === id ? scheduleTermReview(item, outcome) : item)));
  }

  function updateSavedNote(id: string, noteText: string) {
    setSavedNotes((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              note: noteText,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  }

  function deleteSavedNote(id: string) {
    setSavedNotes((items) => items.filter((item) => item.id !== id));
  }

  async function exportSavedTermsCsv() {
    if (bookSavedTerms.length === 0) {
      setVocabExportMessage("词本为空，暂无可导出的内容。");
      return;
    }

    const csv = savedTermsToCsv(bookSavedTerms);
    const fileName = `${currentBookId}-vocab-${new Date().toISOString().slice(0, 10)}.csv`;
    const file = new File([csv], fileName, { type: "text/csv;charset=utf-8" });

    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: "Six Sigma Vocabulary",
          text: "Six Sigma Study vocabulary export"
        });
        setVocabExportMessage("已打开分享/保存菜单。");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
        setVocabExportMessage("已复制 CSV，可粘贴到表格或笔记。");
        return;
      }

      const blobUrl = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      setVocabExportMessage("已生成 CSV 下载。");
    } catch {
      setVocabExportMessage("导出未完成，请稍后重试。");
    }
  }

  function renderText(text: string, page: number, sectionId: string, blockId?: string) {
    return (
      <InlineReaderText
        text={text}
        page={page}
        sectionId={sectionId}
        blockId={blockId}
        language={language}
        onLookup={lookupText}
      />
    );
  }

  function renderBlock(block: ContentBlock, section: LessonSection) {
    const blockPage = block.page ?? section.page;
    const blockClassName = block.id === highlightBlockId ? "sourceHighlight" : undefined;
    if (block.kind === "image") {
      const imageSrc = block.src ? `content/${block.src}` : "";
      const imageAlt = block.alt || `${currentLesson.title.en} page ${blockPage} figure`;
      return (
        <figure
          key={block.id}
          className={blockClassName ? `figureBlock ${blockClassName}` : "figureBlock"}
          data-block-id={block.id}
          data-page={blockPage}
        >
          <img
            src={imageSrc}
            alt={imageAlt}
            loading="lazy"
            decoding="async"
            width={block.width}
            height={block.height}
          />
        </figure>
      );
    }

    if (block.kind === "table") {
      return (
        <div
          key={block.id}
          className={blockClassName ? `tableScroller ${blockClassName}` : "tableScroller"}
          data-block-id={block.id}
          data-page={blockPage}
        >
          <table className="contentTable">
            <tbody>
              {(block.rows ?? []).map((row, rowIndex) => (
                <tr key={`${block.id}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`}>
                      {renderText(cell, blockPage, section.id, block.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (block.kind === "termNote") {
      return (
        <aside
          key={block.id}
          className={blockClassName ? `termNote ${blockClassName}` : "termNote"}
          data-block-id={block.id}
          data-page={blockPage}
        >
          {block.text}
        </aside>
      );
    }

    if (block.kind === "heading") {
      return (
        <h3
          key={block.id}
          className={blockClassName ? `inlineHeading ${blockClassName}` : "inlineHeading"}
          data-block-id={block.id}
          data-page={blockPage}
        >
          {renderText(block.text ?? "", blockPage, section.id, block.id)}
        </h3>
      );
    }

    const className = block.kind === "listItem" ? "readerListItem" : "readerText";
    return (
      <p
        key={block.id}
        className={blockClassName ? `${className} ${blockClassName}` : className}
        data-block-id={block.id}
        data-page={blockPage}
      >
        {renderText(block.text ?? "", blockPage, section.id, block.id)}
      </p>
    );
  }

  return (
    <main
      className={isImmersive ? "appShell immersiveMode" : "appShell"}
      data-theme={readerPreferences.theme}
      data-text-scale={readerPreferences.textScale}
    >
      <div className="readerChrome">
        <header className="topBar">
          <div>
            <p className="eyebrow">
              Page {currentPage} / {currentManual.pageCount} · Ch. {currentLesson.chapter} · {bookProgress}%
            </p>
            <h1>{currentLesson.title[language]}</h1>
          </div>
          <div className="headerActions">
            <button className="readerControlButton" onClick={() => setView("home")} aria-label="back to library">
              书库
            </button>
            <button className="tocButton" onClick={openToc} aria-label="open table of contents">
              目录
            </button>
            <button
              className="readerControlButton"
              onClick={() => updateTextScale(-1)}
              aria-label="decrease text size"
              title="减小字号"
              disabled={textScaleIndex === 0}
            >
              A-
            </button>
            <button
              className="readerControlButton"
              onClick={() => updateTextScale(1)}
              aria-label="increase text size"
              title="增大字号"
              disabled={textScaleIndex === textScaleOrder.length - 1}
            >
              A+
            </button>
            <button
              className="readerControlButton"
              onClick={toggleTheme}
              aria-label="toggle dark mode"
              title={readerPreferences.theme === "dark" ? "切换亮色" : "切换暗色"}
            >
              {readerPreferences.theme === "dark" ? "亮" : "暗"}
            </button>
            <button
              className="readerControlButton"
              onClick={() => setIsImmersive(true)}
              aria-label="enter immersive reading"
              title="沉浸阅读"
            >
              沉浸
            </button>
            <button
              className="modeButton"
              onClick={switchReadingLanguage}
              aria-label="switch reading language"
            >
              {language === "en" ? "中文" : "EN"}
            </button>
          </div>
        </header>

        <div className="progressSummary" aria-label="reading progress">
          <div>
            <strong>p. {currentPage}</strong>
            <span>本章 {currentLesson.pageStart}-{currentLesson.pageEnd} 页 · 章节 {chapterProgress}%</span>
          </div>
          <div className="progressTrack" aria-hidden="true">
            <span style={{ width: `${chapterProgress}%` }} />
          </div>
        </div>

        <nav className="chapterRail" aria-label="chapter sections">
          {pageGroups.map((group) => (
            <button
              key={`${group.sectionId}-${group.page}`}
              className={group.page === currentPage ? "sectionPill active" : "sectionPill"}
              onClick={() => selectSource(group.sectionId, group.blockId, group.page)}
              title={group.count > 1 ? `p. ${group.page}, ${group.count} blocks` : `p. ${group.page}`}
            >
              {group.page}
            </button>
          ))}
        </nav>
      </div>

      {isImmersive && (
        <button className="immersiveExit" onClick={() => setIsImmersive(false)} aria-label="exit immersive reading">
          退出沉浸 · p. {currentPage}
        </button>
      )}

      <section ref={readerRef} className="readerPanel" aria-label="manual reader">
        {currentLesson.sections.map((section) => (
          <article
            key={section.id}
            data-section-id={section.id}
            data-chapter-id={currentLesson.id}
            className={`sectionBlock level${section.level}`}
          >
            <div className="sectionMeta">p. {section.page}</div>
            <h2 className="sectionTitle">{section.title[language]}</h2>
            <div className={language === "zh" ? "sectionBody zhText" : "sectionBody"}>
              {section.content[language].map((block) => renderBlock(block, section))}
            </div>
          </article>
        ))}
      </section>

      <p className="readerWatermark">Felix-Zuo · non-commercial study edition</p>

      {selectedPhrase && (
        <div className="selectionActions">
          {language === "en" && selectedPhrase.canLookup && (
            <button onClick={lookupSelectedPhrase}>
              查短语
            </button>
          )}
          <button onClick={saveSelectedNote}>
            摘录
          </button>
        </div>
      )}

      {showToc && (
        <section className="tocPanel" aria-label="table of contents">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">manual contents</p>
              <h2>目录</h2>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
          <div className="tocList">
            <div className="tocSearch">
              <input
                type="search"
                value={tocQuery}
                onChange={(event) => setTocQuery(event.target.value)}
                placeholder="搜索章节、标题、页码"
                aria-label="search chapters and pages"
              />
              {tocQuery && (
                <button type="button" onClick={() => setTocQuery("")}>
                  清除
                </button>
              )}
            </div>
            {tocResults.length === 0 ? (
              <p className="tocEmpty">没有匹配的章节或页码。</p>
            ) : (
              tocResults.map((result) => {
                const isSection = result.kind === "section";
                const isPage = result.kind === "page";
                const resultSection = isSection || isPage ? result.section : undefined;
                const isActive = isPage
                  ? result.page === currentPage
                  : isSection
                    ? result.chapter.id === currentLesson.id && resultSection?.id === currentSection.id
                    : result.chapter.id === currentLesson.id;
                return (
                  <button
                    key={
                      isPage
                        ? `${result.chapter.id}-${result.section.id}-p${result.page}`
                        : isSection
                          ? `${result.chapter.id}-${result.section.id}`
                          : result.chapter.id
                    }
                    className={isActive ? "tocItem active" : "tocItem"}
                    onClick={() => {
                      if (isPage) {
                        selectSource(result.section.id, result.blockId, result.page);
                        return;
                      }
                      if (isSection) {
                        selectChapterSection(result.chapter.id, result.section.id);
                        return;
                      }
                      selectChapter(result.chapter.id);
                    }}
                  >
                    <span>
                      {isPage
                        ? `p. ${result.page}`
                        : isSection
                          ? `p. ${result.section.page}`
                          : `第 ${result.chapter.chapter} 章`}
                    </span>
                    <strong>
                      {isPage || isSection ? result.section.title[language] : result.chapter.title[language]}
                    </strong>
                    <small>
                      {isPage
                        ? `Ch. ${result.chapter.chapter}`
                        : isSection
                          ? `Ch. ${result.chapter.chapter}`
                          : `p. ${result.chapter.pageStart}-${result.chapter.pageEnd}`}
                    </small>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}

      {!isImmersive && <button className="vocabDock" aria-label="saved vocabulary" onClick={openVocab}>
        <strong>词本</strong>
        <span>{dueTerms.length > 0 ? `待 ${dueTerms.length}` : `${bookSavedTerms.length} 个`}</span>
      </button>}

      {!isImmersive && <button className="notesDock" aria-label="saved notes" onClick={openNotes}>
        <strong>笔记</strong>
        <span>{bookSavedNotes.length} 条</span>
      </button>}

      {isOverlayOpen && <div className="overlayBackdrop" aria-hidden="true" onClick={closeOverlayFromControl} />}

      {showVocab && (
        <section className="vocabPanel" aria-label="vocabulary book">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">local vocabulary</p>
              <h2>词本</h2>
              <small className="bookScope">{currentBookTitleZh}</small>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
          <div className="vocabSummary">
            <span><strong>{dueTerms.length}</strong> 待复习</span>
            <span><strong>{learningCount}</strong> 学习中</span>
            <span><strong>{masteredCount}</strong> 已掌握</span>
          </div>
          <div className="vocabTools">
            <button onClick={exportSavedTermsCsv} disabled={bookSavedTerms.length === 0}>
              导出 CSV
            </button>
            {vocabExportMessage && <small>{vocabExportMessage}</small>}
          </div>
          <div className="vocabFilters" role="tablist" aria-label="vocabulary filters">
            <button
              className={vocabFilter === "due" ? "active" : ""}
              onClick={() => setVocabFilter("due")}
            >
              待复习
            </button>
            <button
              className={vocabFilter === "all" ? "active" : ""}
              onClick={() => setVocabFilter("all")}
            >
              全部
            </button>
          </div>
          {bookSavedTerms.length === 0 ? (
            <p className="emptyState">暂无词条。英文模式下点击单词或查询短语后可加入词本。</p>
          ) : visibleSavedTerms.length === 0 ? (
            <p className="emptyState">当前没有到期词条。切换到“全部”可以查看完整词本。</p>
          ) : (
            <div className="vocabList">
              {visibleSavedTerms.map((item) => (
                <article key={item.id} className="vocabItem">
                  <div>
                    <strong>{item.term}</strong>
                    <span>{item.translation}</span>
                    <small>Ch. {item.chapter} · p. {item.page} · 复习 {item.reviewCount} 次</small>
                    <small>{formatNextReview(item)}</small>
                  </div>
                  <div className="vocabItemActions">
                    <button onClick={() => selectSource(item.sectionId, item.blockId, item.page)}>原文</button>
                    <button onClick={() => reviewSavedTerm(item.id, "again")}>再记</button>
                    <button className="primary" onClick={() => reviewSavedTerm(item.id, "remembered")}>认识</button>
                    <select
                      value={item.status}
                      onChange={(event) => updateSavedStatus(item.id, event.target.value as SavedTerm["status"])}
                    >
                      <option value="new">新词</option>
                      <option value="learning">学习中</option>
                      <option value="mastered">已掌握</option>
                    </select>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {showNotes && (
        <section className="notesPanel" aria-label="study notes">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">study notes</p>
              <h2>笔记</h2>
              <small className="bookScope">{currentBookTitleZh}</small>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
          {bookSavedNotes.length === 0 ? (
            <p className="emptyState">暂无笔记。选中正文后点击“摘录”即可保存。</p>
          ) : (
            <div className="notesList">
              {bookSavedNotes.map((item) => (
                <article key={item.id} className="noteItem">
                  <div className="noteMeta">
                    <span>Ch. {item.chapter} · p. {item.page}</span>
                    <span>{item.language === "zh" ? "中文" : "EN"}</span>
                  </div>
                  <blockquote>{item.text}</blockquote>
                  <textarea
                    value={item.note}
                    onChange={(event) => updateSavedNote(item.id, event.target.value)}
                    placeholder="写下理解、疑问或复习提示"
                    aria-label={`note for ${item.text.slice(0, 24)}`}
                  />
                  <div className="noteActions">
                    <small>{item.sectionId}</small>
                    <button onClick={() => selectSource(item.sectionId, item.blockId, item.page)}>回原文</button>
                    <button onClick={() => deleteSavedNote(item.id)}>删除</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeLookup && (
        <section className="bottomSheet" aria-label="word explanation">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">Page {activeLookup.page}</p>
              <h2>{activeLookup.entry.term}</h2>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
          <p className="translation">{activeLookup.entry.translation}</p>
          {activeLookup.entry.phonetic && <p className="phonetic">/{activeLookup.entry.phonetic}/</p>}
          {activeLookup.entry.partOfSpeech && <p className="partOfSpeech">{activeLookup.entry.partOfSpeech}</p>}
          {activeLookup.entry.isSixSigmaTerm && <span className="termBadge">{activeBook?.domainLabel ?? "教材术语"}</span>}
          <p className="explanation">{activeLookup.entry.explanation}</p>
          <div className="exampleBox">
            <strong>来源原句</strong>
            <p>{activeLookup.sourceText}</p>
          </div>
          <button className="sourceButton" onClick={() => selectSource(activeLookup.sectionId, activeLookup.blockId, activeLookup.page)}>
            回到原文位置
          </button>
          <button className="saveButton" onClick={saveActiveTerm}>
            {savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.entry.term)}`) ? "已加入词本" : "加入词本"}
          </button>
        </section>
      )}
    </main>
  );
}
