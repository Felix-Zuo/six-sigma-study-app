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

type Language = "en" | "zh";
type ThemeMode = "light" | "dark";
type TextScale = "standard" | "large" | "xlarge";

type ContentBlock = {
  id: string;
  kind: "paragraph" | "listItem" | "table" | "termNote" | "heading" | "image";
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
  title: Record<Language, string>;
  content: Record<Language, ContentBlock[]>;
};

type Lesson = {
  id: string;
  chapter: number;
  pageStart: number;
  pageEnd: number;
  title: Record<Language, string>;
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
  explanation: string;
  lookupKeys: string[];
  isSixSigmaTerm?: boolean;
};

type ManualData = {
  manual: string;
  version: string;
  pageCount: number;
  chapters: Lesson[];
  dictionary: TermEntry[];
};

type ActiveLookup = {
  entry: TermEntry;
  page: number;
  sectionId: string;
  sourceText: string;
};

type SelectedPhrase = {
  text: string;
  page: number;
  sectionId: string;
};

type OverlayName = "lookup" | "toc" | "vocab";
type VocabFilter = "due" | "all";
type LookupTextHandler = (text: string, page: number, sectionId: string, sourceText: string) => void;
type TocSearchResult =
  | { kind: "chapter"; chapter: Lesson }
  | { kind: "section"; chapter: Lesson; section: LessonSection };
type PendingLanguageScroll = {
  sectionId: string;
  blockIndex: number;
  blockOffsetRatio: number;
  sectionOffsetRatio: number;
};
const readerPreferencesKey = "six-sigma-study:reader-preferences:v1";
const textScaleOrder: TextScale[] = ["standard", "large", "xlarge"];

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

function titleMatches(title: Record<Language, string>, query: string): boolean {
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

function InlineReaderText({
  text,
  page,
  sectionId,
  language,
  onLookup
}: {
  text: string;
  page: number;
  sectionId: string;
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
            onClick={() => onLookup(token.text, page, sectionId, text)}
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
  const [manual, setManual] = useState<ManualData | null>(null);
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
  const [showToc, setShowToc] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [tocQuery, setTocQuery] = useState("");
  const [vocabFilter, setVocabFilter] = useState<VocabFilter>("due");
  const [vocabExportMessage, setVocabExportMessage] = useState("");
  const readerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<OverlayName | null>(null);
  const overlayHistoryRef = useRef(false);
  const pendingScrollSectionRef = useRef<string | null>(null);
  const pendingLanguageScrollRef = useRef<PendingLanguageScroll | null>(null);

  const lesson = manual?.chapters.find((chapter) => chapter.id === activeChapterId) ?? manual?.chapters[0];
  const activeSection = lesson?.sections.find((section) => section.id === activeSectionId) ?? lesson?.sections[0];
  const termIndex = useMemo(() => buildTermIndex(manual?.dictionary ?? []), [manual]);
  const tocResults = useMemo(() => buildTocSearchResults(manual, tocQuery), [manual, tocQuery]);
  const dueTerms = useMemo(() => savedTerms.filter((item) => isTermDue(item)), [savedTerms]);
  const visibleSavedTerms = useMemo(() => {
    const source = vocabFilter === "due" ? dueTerms : savedTerms;
    return [...source].sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt));
  }, [dueTerms, savedTerms, vocabFilter]);
  const learningCount = savedTerms.filter((item) => item.status === "learning").length;
  const masteredCount = savedTerms.filter((item) => item.status === "mastered").length;
  const savedSet = useMemo(
    () => new Set(savedTerms.map((item) => normalizeLookup(item.term))),
    [savedTerms]
  );
  const textScaleIndex = textScaleOrder.indexOf(readerPreferences.textScale);

  useEffect(() => {
    fetch("content/manual.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`manual load failed: ${response.status}`);
        }
        return response.json() as Promise<ManualData>;
      })
      .then((data) => {
        const savedPosition = initialPositionRef.current;
        const initialChapter =
          data.chapters.find((chapter) => chapter.id === savedPosition.chapterId) ?? data.chapters[0];
        const initialSection =
          initialChapter.sections.find((section) => section.id === savedPosition.sectionId) ??
          initialChapter.sections[0];
        setManual(data);
        setActiveChapterId(initialChapter.id);
        setActiveSectionId(initialSection.id);
        window.requestAnimationFrame(() => {
          if (
            typeof savedPosition.scrollY === "number" &&
            savedPosition.chapterId === initialChapter.id
          ) {
            window.scrollTo({ top: savedPosition.scrollY });
            return;
          }
          document.querySelector(`[data-section-id="${initialSection.id}"]`)?.scrollIntoView({ block: "start" });
        });
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "manual load failed");
      });
  }, []);

  useEffect(() => {
    persistSavedTerms(savedTerms);
  }, [savedTerms]);

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
      chapterId: activeChapterId,
      sectionId: activeSectionId,
      language,
      scrollY: window.scrollY
    });
  }, [activeChapterId, activeSectionId, language]);

  useEffect(() => {
    if (!activeChapterId || !activeSectionId) {
      return;
    }
    let timer: number | undefined;

    function saveScrollPosition() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        persistReaderPosition({
          chapterId: activeChapterId,
          sectionId: activeSectionId,
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
  }, [activeChapterId, activeSectionId, language]);

  useEffect(() => {
    overlayRef.current = activeLookup ? "lookup" : showToc ? "toc" : showVocab ? "vocab" : null;
  }, [activeLookup, showToc, showVocab]);

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
  }, []);

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
    const pending = pendingLanguageScrollRef.current;
    if (!pending) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const sectionNode = document.querySelector<HTMLElement>(`[data-section-id="${pending.sectionId}"]`);
        if (!sectionNode) {
          pendingLanguageScrollRef.current = null;
          return;
        }

        const sectionTop = window.scrollY + sectionNode.getBoundingClientRect().top;
        const sectionFallbackTop =
          sectionTop + sectionNode.scrollHeight * pending.sectionOffsetRatio - readerAnchorOffset();
        const bodyNode = sectionNode.querySelector<HTMLElement>(".sectionBody");
        const targetBlock = bodyNode?.children[pending.blockIndex] as HTMLElement | undefined;
        if (!targetBlock) {
          window.scrollTo({ top: Math.max(0, sectionFallbackTop) });
          pendingLanguageScrollRef.current = null;
          return;
        }

        const blockTop = window.scrollY + targetBlock.getBoundingClientRect().top;
        const targetTop =
          blockTop + targetBlock.scrollHeight * pending.blockOffsetRatio - readerAnchorOffset();
        window.scrollTo({ top: Math.max(0, targetTop) });
        pendingLanguageScrollRef.current = null;
      });
    });
    return () => window.cancelAnimationFrame(handle);
  }, [language]);

  useEffect(() => {
    const sectionId = pendingScrollSectionRef.current;
    if (!sectionId || !lesson) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      const node = document.querySelector(`[data-section-id="${sectionId}"]`);
      if (node) {
        node.scrollIntoView({ block: "start" });
        pendingScrollSectionRef.current = null;
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
      if (!normalized.includes(" ")) {
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

      setSelectedPhrase({ text, page: section.page, sectionId: section.id });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [lesson]);

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

  if (!manual || !lesson || !activeSection) {
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

  function openToc() {
    ensureOverlayHistory();
    setActiveLookup(null);
    setShowVocab(false);
    setShowToc(true);
  }

  function openVocab() {
    ensureOverlayHistory();
    setActiveLookup(null);
    setShowToc(false);
    setShowVocab(true);
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
    setActiveChapterId(nextLesson.id);
    setActiveSectionId(nextSection.id);
    closeOverlayFromControl();
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
    if (!activeSectionId) {
      return null;
    }

    const sectionNode = document.querySelector<HTMLElement>(`[data-section-id="${activeSectionId}"]`);
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
        sectionId: activeSectionId,
        blockIndex: 0,
        blockOffsetRatio: 0,
        sectionOffsetRatio
      };
    }

    const block = blocks[blockIndex];
    const blockTop = window.scrollY + block.getBoundingClientRect().top;
    const blockOffsetRatio = clamp((anchorY - blockTop) / Math.max(1, block.scrollHeight), 0, 1);
    return {
      sectionId: activeSectionId,
      blockIndex,
      blockOffsetRatio,
      sectionOffsetRatio
    };
  }

  function switchReadingLanguage() {
    pendingLanguageScrollRef.current = captureLanguageScrollPosition();
    setLanguage(language === "en" ? "zh" : "en");
  }

  function lookupText(text: string, page: number, sectionId: string, sourceText: string) {
    const key = normalizeLookup(text);
    const entry = termIndex.get(key) ?? lookupFallback(text);
    ensureOverlayHistory();
    setShowToc(false);
    setShowVocab(false);
    setActiveLookup({ entry, page, sectionId, sourceText });
  }

  function lookupSelectedPhrase() {
    if (!selectedPhrase) {
      return;
    }
    lookupText(selectedPhrase.text, selectedPhrase.page, selectedPhrase.sectionId, selectedPhrase.text);
    setSelectedPhrase(null);
    window.getSelection()?.removeAllRanges();
  }

  function saveActiveTerm() {
    if (!activeLookup || savedSet.has(normalizeLookup(activeLookup.entry.term))) {
      return;
    }
    const now = new Date();
    const saved: SavedTerm = {
      id: `${normalizeLookup(activeLookup.entry.term)}-${now.getTime()}`,
      term: activeLookup.entry.term,
      translation: activeLookup.entry.translation,
      chapter: currentLesson.chapter,
      chapterTitle: currentLesson.title.en,
      page: activeLookup.page,
      sectionId: activeLookup.sectionId,
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

  async function exportSavedTermsCsv() {
    if (savedTerms.length === 0) {
      setVocabExportMessage("词本为空，暂无可导出的内容。");
      return;
    }

    const csv = savedTermsToCsv(savedTerms);
    const fileName = `six-sigma-vocab-${new Date().toISOString().slice(0, 10)}.csv`;
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

  function renderText(text: string, page: number, sectionId: string) {
    return (
      <InlineReaderText
        text={text}
        page={page}
        sectionId={sectionId}
        language={language}
        onLookup={lookupText}
      />
    );
  }

  function renderBlock(block: ContentBlock, section: LessonSection) {
    if (block.kind === "image") {
      const imageSrc = block.src ? `content/${block.src}` : "";
      const imageAlt = block.alt || `${currentLesson.title.en} page ${section.page} figure`;
      return (
        <figure key={block.id} className="figureBlock">
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
        <div key={block.id} className="tableScroller">
          <table className="contentTable">
            <tbody>
              {(block.rows ?? []).map((row, rowIndex) => (
                <tr key={`${block.id}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`}>
                      {renderText(cell, section.page, section.id)}
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
        <aside key={block.id} className="termNote">
          {block.text}
        </aside>
      );
    }

    if (block.kind === "heading") {
      return (
        <h3 key={block.id} className="inlineHeading">
          {renderText(block.text ?? "", section.page, section.id)}
        </h3>
      );
    }

    const className = block.kind === "listItem" ? "readerListItem" : "readerText";
    return (
      <p key={block.id} className={className}>
        {renderText(block.text ?? "", section.page, section.id)}
      </p>
    );
  }

  return (
    <main
      className="appShell"
      data-theme={readerPreferences.theme}
      data-text-scale={readerPreferences.textScale}
    >
      <div className="readerChrome">
        <header className="topBar">
          <div>
            <p className="eyebrow">Page {currentSection.page} / {currentManual.pageCount}</p>
            <h1>{currentLesson.title[language]}</h1>
          </div>
          <div className="headerActions">
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
              className="modeButton"
              onClick={switchReadingLanguage}
              aria-label="switch reading language"
            >
              {language === "en" ? "中文" : "EN"}
            </button>
          </div>
        </header>

        <nav className="chapterRail" aria-label="chapter sections">
          {currentLesson.sections.map((section) => (
            <button
              key={section.id}
              className={section.id === activeSectionId ? "sectionPill active" : "sectionPill"}
              onClick={() => {
                setActiveSectionId(section.id);
                document.querySelector(`[data-section-id="${section.id}"]`)?.scrollIntoView({ block: "start" });
              }}
            >
              {section.page}
            </button>
          ))}
        </nav>
      </div>

      <section ref={readerRef} className="readerPanel" aria-label="manual reader">
        {currentLesson.sections.map((section) => (
          <article
            key={section.id}
            data-section-id={section.id}
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

      {language === "en" && selectedPhrase && (
        <button
          className="phraseLookup"
          onClick={lookupSelectedPhrase}
        >
          查询选中短语
        </button>
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
                const resultSection = isSection ? result.section : undefined;
                const isActive = isSection
                  ? result.chapter.id === currentLesson.id && resultSection?.id === currentSection.id
                  : result.chapter.id === currentLesson.id;
                return (
                  <button
                    key={isSection ? `${result.chapter.id}-${result.section.id}` : result.chapter.id}
                    className={isActive ? "tocItem active" : "tocItem"}
                    onClick={() =>
                      isSection
                        ? selectChapterSection(result.chapter.id, result.section.id)
                        : selectChapter(result.chapter.id)
                    }
                  >
                    <span>{isSection ? `p. ${result.section.page}` : `第 ${result.chapter.chapter} 章`}</span>
                    <strong>{isSection ? result.section.title[language] : result.chapter.title[language]}</strong>
                    <small>
                      {isSection
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

      <button className="vocabDock" aria-label="saved vocabulary" onClick={openVocab}>
        <strong>词本</strong>
        <span>{dueTerms.length > 0 ? `待 ${dueTerms.length}` : `${savedTerms.length} 个`}</span>
      </button>

      {showVocab && (
        <section className="vocabPanel" aria-label="vocabulary book">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">local vocabulary</p>
              <h2>词本</h2>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
          <div className="vocabSummary">
            <span><strong>{dueTerms.length}</strong> 待复习</span>
            <span><strong>{learningCount}</strong> 学习中</span>
            <span><strong>{masteredCount}</strong> 已掌握</span>
          </div>
          <div className="vocabTools">
            <button onClick={exportSavedTermsCsv} disabled={savedTerms.length === 0}>
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
          {savedTerms.length === 0 ? (
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
          {activeLookup.entry.partOfSpeech && <p className="partOfSpeech">{activeLookup.entry.partOfSpeech}</p>}
          {activeLookup.entry.isSixSigmaTerm && <span className="termBadge">六西格玛术语</span>}
          <p className="explanation">{activeLookup.entry.explanation}</p>
          <div className="exampleBox">
            <strong>来源原句</strong>
            <p>{activeLookup.sourceText}</p>
          </div>
          <button className="saveButton" onClick={saveActiveTerm}>
            {savedSet.has(normalizeLookup(activeLookup.entry.term)) ? "已加入词本" : "加入词本"}
          </button>
        </section>
      )}
    </main>
  );
}
