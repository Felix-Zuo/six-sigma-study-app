import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { App as CapacitorApp } from "@capacitor/app";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  ClipboardCheck,
  Download,
  Eye,
  Home,
  KeyRound,
  Languages,
  ListChecks,
  NotebookPen,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  UserRound,
  Volume2
} from "lucide-react";
import { normalizeLookup, tokenizeEnglish } from "./lib/tokenize";
import {
  resolveContextExplanation,
  type ContextBlockGloss,
  type ContextExplanation
} from "./lib/contextLookup";
import {
  isTermDue,
  loadSavedTerms,
  persistSavedTerms,
  savedTermsToCsv,
  scheduleTermReview,
  type SavedTerm
} from "./lib/vocabStore";
import { loadReaderPosition, loadReaderPositions, persistReaderPosition, type ReaderPositionMap } from "./lib/readerPositionStore";
import { loadSavedNotes, persistSavedNotes, type SavedNote } from "./lib/noteStore";
import { loadSavedFavorites, persistSavedFavorites, type SavedFavorite } from "./lib/favoriteStore";
import { loadDailyStats, normalizeDailyStats, persistDailyStats, recordDailyReviewCompletion, type DailyStudyStats } from "./lib/streakStore";
import {
  loadExamResults,
  loadQuestionProgress,
  loadUserQuestionBank,
  markQuestionSeen,
  normalizeQuestionBank,
  persistExamResults,
  persistQuestionProgress,
  persistUserQuestionBank,
  progressForQuestion,
  recordQuestionAnswer,
  toggleQuestionFavorite,
  type ExamResult,
  type QuestionBankPayload,
  type QuestionDifficulty,
  type QuestionItem,
  type QuestionProgress
} from "./lib/questionBank";
import { publicQuestionBank } from "./data/publicQuestionBank";
import { speakEnglish } from "./lib/nativeTts";
import {
  acceptedCorrectionExport,
  clearContextCorrectionBundle,
  contextFromCorrection,
  createProposedCorrection,
  findAcceptedCorrection,
  findSimilarCorrection,
  loadContextCorrectionBundle,
  persistContextCorrectionBundle,
  setCorrectionStatus,
  upsertCorrection,
  type ContextCorrectionBundle,
  type ContextCorrectionRecord
} from "./lib/contextCorrectionStore";
import {
  analyzeContextWithDeepSeek,
  clearDeepSeekApiKey,
  deepSeekPromptVersion,
  explainQuestionWithDeepSeek,
  explainReadingWithDeepSeek,
  getDeepSeekKeyStatus,
  saveDeepSeekApiKey,
  testDeepSeekConnection,
  type DeepSeekKeyStatus,
  type DeepSeekQuestionInput,
  type DeepSeekReadingInput,
  type QuestionAssistResult,
  type ReadingAssistResult
} from "./lib/deepSeekAssistant";
import {
  chapterProgressStorageKey,
  isChapterCompleted,
  loadChapterProgress,
  persistChapterProgress,
  setChapterCompleted,
  type ChapterProgressMap
} from "./lib/chapterProgressStore";
import {
  aiStudyCacheStorageKey,
  clearAiStudyCache,
  createAiStudyCacheId,
  findAiStudyCache,
  persistAiStudyCache
} from "./lib/aiStudyCache";
type Language = "en" | "zh";
type ThemeMode = "light" | "dark";
type TextScale = "standard" | "large" | "xlarge";
type AppView = "splash" | "home" | "reader" | "vocab" | "questions" | "notes" | "favorites" | "settings";
type LocalizedText = Record<Language, string>;
type QuestionMode = "home" | "browse" | "practice" | "wrong" | "favorite" | "exam";
type QuestionFilter = "all" | string;
type DifficultyFilter = "all" | QuestionDifficulty;

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
  wordRoot?: string;
  wordForms?: string[];
  englishDefinition?: string;
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
  coverImage?: string;
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
  contextGlossesVersion?: string;
  contextGlosses?: Record<string, ContextBlockGloss>;
};

type ActiveLookup = {
  query: string;
  entry: TermEntry;
  page: number;
  sectionId: string;
  blockId?: string;
  sourceText: string;
  sourceTranslation?: string;
  context: ContextExplanation;
  baseContext: ContextExplanation;
  questionSource?: {
    questionId: string;
    examId: string;
    domain: string;
    chapterId: string;
    page: number;
    sourceRef: string;
  };
};

type AiLookupState = {
  lookupId: string;
  status: "idle" | "checking" | "ready" | "accepted" | "error";
  correction?: ContextCorrectionRecord;
  similar?: { correction: ContextCorrectionRecord; similarity: number };
  message?: string;
  usage?: { promptTokens: number; completionTokens: number };
};

type AiAssistBase = {
  cacheId: string;
  sourceLabel: string;
  status: "needs-key" | "loading" | "ready" | "error";
  message?: string;
  model?: string;
  fromCache?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
};

type ActiveAiAssist =
  | (AiAssistBase & {
      kind: "reading";
      input: DeepSeekReadingInput;
      excerpt: string;
      result?: ReadingAssistResult;
    })
  | (AiAssistBase & {
      kind: "question";
      input: DeepSeekQuestionInput;
      questionId: string;
      correctAnswer: string[];
      result?: QuestionAssistResult;
    });

type ReadingAiAssist = Extract<ActiveAiAssist, { kind: "reading" }>;
type QuestionAiAssist = Extract<ActiveAiAssist, { kind: "question" }>;

type SelectedPhrase = {
  text: string;
  page: number;
  sectionId: string;
  blockId?: string;
  canLookup: boolean;
};

type OverlayName = "lookup" | "ai" | "toc" | "vocab" | "notes";
type VocabFilter = "due" | "all";
type BookFilter = "all" | string;
type VocabSort = "recent" | "due" | "page";
type VocabPageMode = "plan" | "library";
type FlashReviewStage = "prompt" | "quiz" | "answer" | "complete";
type NotesSort = "updated" | "page";
type FavoritesSort = "recent" | "page";
type SourceAnchor = {
  bookId: string;
  chapterId?: string;
  page: number;
  sectionId: string;
  blockId?: string;
  language?: Language;
};
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
const productVersionLabel = "Beta 0.8.10";
const productVersionId = "0.8.10-beta";
const githubProfileUrl = "https://github.com/Felix-Zuo";
const catalogPath = "content/catalog.json";
const bundledQuestionBankPath = "content/private/question-bank.private.json";
const bundledQuestionDictionaryPath = "content/private/question-dictionary.private.json";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const readerPreferencesKey = "six-sigma-study:reader-preferences:v1";
const textScaleOrder: TextScale[] = ["standard", "large", "xlarge"];
const appViewKickers: Partial<Record<AppView, string>> = {
  home: "学习空间",
  vocab: "词汇",
  questions: "训练",
  notes: "摘录",
  favorites: "收藏",
  settings: "设置"
};

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
      assetCount: 475,
      source: "The Council for Six Sigma Certification training-materials page lists the Lean Six Sigma Black Belt Certification Training Manual as a free PDF download: https://www.sixsigmacouncil.org/six-sigma-training-material/",
      licenseNotice: {
        zh: "本教材来源于 CSSC 官网训练材料页面列出的免费 PDF。本 App 仅用于个人学习、中文翻译整理和对照阅读，禁止任何商业化使用；本项目不代表 CSSC 官方产品，原版权归原权利方所有。",
        en: "The source manual is listed as a free PDF on the CSSC training-materials page. This app is for personal study, Chinese translation, and bilingual reference only. Commercial use is prohibited. This project is not an official CSSC product; all original rights remain with their respective owner."
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
  try {
    window.localStorage.setItem(readerPreferencesKey, JSON.stringify({ theme, textScale }));
  } catch {
    // Preferences are useful but should not make the app unusable.
  }
}

function loadInitialView(): AppView {
  return "splash";
}

function loadInitialBookId(positionBookId?: string): string {
  try {
    return positionBookId || window.localStorage.getItem(activeBookKey) || defaultBookId;
  } catch {
    return positionBookId || defaultBookId;
  }
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

function formatExamCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatExamElapsed(minutes: number): string {
  if (minutes < 1) {
    return "少于 1 分钟";
  }
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`;
}

function formatNextReview(term: SavedTerm): string {
  if (isTermDue(term)) {
    return "今天待复习";
  }
  const date = new Date(term.nextReviewAt);
  return `下次 ${date.getMonth() + 1}/${date.getDate()}`;
}

function savedTermStudyMeaning(term: SavedTerm): string {
  return term.contextMeaning && term.contextMeaning !== "暂无可靠语境义"
    ? term.contextMeaning
    : term.translation;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boundedAiText(value: string, maxLength: number): string {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
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
    const key = normalizeLookup(entry.term);
    if (!index.has(key)) {
      index.set(key, entry);
    }
  }
  for (const entry of entries) {
    for (const key of entry.lookupKeys) {
      const normalized = normalizeLookup(key);
      if (!index.has(normalized)) {
        index.set(normalized, entry);
      }
    }
  }
  return index;
}

function lookupFallback(term: string): TermEntry {
  return {
    term,
    translation: "待完善",
    partOfSpeech: "词典暂未收录",
    wordRoot: normalizeLookup(term),
    wordForms: [],
    englishDefinition: "",
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

function readableBlockText(block: ContentBlock | undefined): string {
  if (!block) {
    return "";
  }
  if (block.text) {
    return block.text;
  }
  return block.rows?.flat().join(" ") ?? "";
}

function alignedBlockTranslation(
  section: LessonSection | undefined,
  blockId: string | undefined,
  page: number,
  contextGlosses?: Record<string, ContextBlockGloss>
): string | undefined {
  const verifiedTranslation = blockId ? contextGlosses?.[blockId]?.translation?.trim() : undefined;
  if (verifiedTranslation) {
    return verifiedTranslation;
  }
  if (!section) {
    return undefined;
  }
  const enBlocks = section.content.en.filter((block) => block.kind !== "image" && readableBlockText(block));
  const zhBlocks = section.content.zh.filter((block) => block.kind !== "image" && readableBlockText(block));
  if (zhBlocks.length === 0) {
    return undefined;
  }
  const enIndex = Math.max(0, enBlocks.findIndex((block) => block.id === blockId));
  const proportionalIndex = enBlocks.length > 1
    ? Math.round((enIndex / Math.max(1, enBlocks.length - 1)) * Math.max(0, zhBlocks.length - 1))
    : 0;
  const samePage = zhBlocks.filter((block) => block.page === page);
  return readableBlockText(zhBlocks[proportionalIndex] ?? samePage[0]) || undefined;
}

function focusWordToken(target: HTMLElement) {
  const scope = target.closest(".questionCard, .readerPanel") ?? document;
  scope.querySelectorAll<HTMLElement>('.wordToken[role="button"]').forEach((item) => {
    item.tabIndex = item === target ? 0 : -1;
  });
  target.focus({ preventScroll: true });
}

function handleWordTokenKeyDown(event: KeyboardEvent<HTMLSpanElement>, activate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    activate();
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const scope = event.currentTarget.closest(".questionCard, .readerPanel") ?? document;
  const words = Array.from(scope.querySelectorAll<HTMLElement>('.wordToken[role="button"]'));
  const currentIndex = Math.max(0, words.indexOf(event.currentTarget));
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? words.length - 1
      : event.key === "ArrowLeft"
        ? Math.max(0, currentIndex - 1)
        : Math.min(words.length - 1, currentIndex + 1);
  const next = words[nextIndex];
  if (next) {
    focusWordToken(next);
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function InlineReaderText({
  text,
  page,
  sectionId,
  blockId,
  language,
  keyboardEntry = false,
  onLookup
}: {
  text: string;
  page: number;
  sectionId: string;
  blockId?: string;
  language: Language;
  keyboardEntry?: boolean;
  onLookup: LookupTextHandler;
}) {
  const tokens = useMemo(() => {
    if (language !== "en") {
      return [];
    }
    return tokenizeEnglish(text);
  }, [language, text]);

  if (language !== "en") {
    return <>{text}</>;
  }

  const firstWordIndex = tokens.findIndex((token) => token.kind === "word");

  return (
    <span>
      {tokens.map((token, index) =>
        token.kind === "word" ? (
          <span
            key={token.id}
            className="wordToken"
            role="button"
            tabIndex={keyboardEntry && index === firstWordIndex ? 0 : -1}
            aria-label={`查询 ${token.text} 的释义`}
            onClick={(event) => {
              focusWordToken(event.currentTarget);
              onLookup(token.text, page, sectionId, blockId, sourceContextForTerm(text, token.text));
            }}
            onKeyDown={(event) => handleWordTokenKeyDown(event, () =>
              onLookup(token.text, page, sectionId, blockId, sourceContextForTerm(text, token.text))
            )}
          >
            {token.text}
          </span>
        ) : (
          <span key={token.id}>{token.text}</span>
        )
      )}
    </span>
  );
}

function InlineQuestionText({
  text,
  language,
  keyboardEntry = false,
  onLookup
}: {
  text: string;
  language: Language;
  keyboardEntry?: boolean;
  onLookup: (text: string, sourceText: string) => void;
}) {
  const displayText = text || "";
  const tokens = useMemo(() => (language === "en" ? tokenizeEnglish(displayText) : []), [displayText, language]);

  if (language !== "en") {
    return <>{displayText}</>;
  }

  const firstWordIndex = tokens.findIndex((token) => token.kind === "word");

  return (
    <>
      {tokens.map((token, index) =>
        token.kind === "word" ? (
          <span
            key={token.id}
            className="wordToken questionWordToken"
            role="button"
            tabIndex={keyboardEntry && index === firstWordIndex ? 0 : -1}
            aria-label={`查询 ${token.text} 的释义`}
            onClick={(event) => {
              event.stopPropagation();
              focusWordToken(event.currentTarget);
              onLookup(token.text, sourceContextForTerm(displayText, token.text));
            }}
            onKeyDown={(event) => handleWordTokenKeyDown(event, () =>
              onLookup(token.text, sourceContextForTerm(displayText, token.text))
            )}
          >
            {token.text}
          </span>
        ) : (
          <span key={token.id}>{token.text}</span>
        )
      )}
    </>
  );
}

export function App() {
  const initialPositionRef = useRef(loadReaderPosition());
  const [readerPositions, setReaderPositions] = useState<ReaderPositionMap>(() => loadReaderPositions());
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
  const [aiLookupState, setAiLookupState] = useState<AiLookupState>({ lookupId: "", status: "idle" });
  const [activeAiAssist, setActiveAiAssist] = useState<ActiveAiAssist | null>(null);
  const [deepSeekKeyStatus, setDeepSeekKeyStatus] = useState<DeepSeekKeyStatus>({ configured: false, storage: "session-only" });
  const [deepSeekKeyDraft, setDeepSeekKeyDraft] = useState("");
  const [aiSettingsMessage, setAiSettingsMessage] = useState("");
  const [contextCorrectionBundle, setContextCorrectionBundle] = useState<ContextCorrectionBundle>(() =>
    loadContextCorrectionBundle(defaultBookId, "0.2.0")
  );
  const [selectedPhrase, setSelectedPhrase] = useState<SelectedPhrase | null>(null);
  const [savedTerms, setSavedTerms] = useState<SavedTerm[]>(() => loadSavedTerms());
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>(() => loadSavedNotes());
  const [savedFavorites, setSavedFavorites] = useState<SavedFavorite[]>(() => loadSavedFavorites());
  const [chapterProgressMap, setChapterProgressMap] = useState<ChapterProgressMap>(() => loadChapterProgress());
  const [dailyStats, setDailyStats] = useState<DailyStudyStats>(() => loadDailyStats());
  const [bundledQuestionBank, setBundledQuestionBank] = useState<QuestionBankPayload | null>(null);
  const [bundledQuestionDictionary, setBundledQuestionDictionary] = useState<TermEntry[]>([]);
  const [userQuestionBank, setUserQuestionBank] = useState<QuestionBankPayload | null>(() => loadUserQuestionBank());
  const [questionProgress, setQuestionProgress] = useState<Record<string, QuestionProgress>>(() => loadQuestionProgress());
  const [examResults, setExamResults] = useState<ExamResult[]>(() => loadExamResults());
  const [showToc, setShowToc] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tocQuery, setTocQuery] = useState("");
  const [vocabFilter, setVocabFilter] = useState<VocabFilter>("due");
  const [studyBookFilter, setStudyBookFilter] = useState<BookFilter>("all");
  const [vocabQuery, setVocabQuery] = useState("");
  const [vocabSort, setVocabSort] = useState<VocabSort>("recent");
  const [vocabPageMode, setVocabPageMode] = useState<VocabPageMode>("plan");
  const [notesQuery, setNotesQuery] = useState("");
  const [notesSort, setNotesSort] = useState<NotesSort>("updated");
  const [favoritesQuery, setFavoritesQuery] = useState("");
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSort>("recent");
  const [vocabExportMessage, setVocabExportMessage] = useState("");
  const [flashReviewActive, setFlashReviewActive] = useState(false);
  const [flashReviewIndex, setFlashReviewIndex] = useState(0);
  const [flashReviewStage, setFlashReviewStage] = useState<FlashReviewStage>("prompt");
  const [flashSessionIds, setFlashSessionIds] = useState<string[]>([]);
  const [flashSessionReviewed, setFlashSessionReviewed] = useState(0);
  const [flashSessionGoal, setFlashSessionGoal] = useState(0);
  const [flashQuizSelection, setFlashQuizSelection] = useState("");
  const [pronunciationMessage, setPronunciationMessage] = useState("");
  const [questionMode, setQuestionMode] = useState<QuestionMode>("home");
  const [questionLanguage, setQuestionLanguage] = useState<Language>("zh");
  const [questionDomainFilter, setQuestionDomainFilter] = useState<QuestionFilter>("all");
  const [questionChapterFilter, setQuestionChapterFilter] = useState<QuestionFilter>("all");
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<DifficultyFilter>("all");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionSessionIds, setQuestionSessionIds] = useState<string[]>([]);
  const [questionSessionAnswers, setQuestionSessionAnswers] = useState<Record<string, string[]>>({});
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<string[]>([]);
  const [selectedQuestionAnswers, setSelectedQuestionAnswers] = useState<string[]>([]);
  const [revealedQuestionId, setRevealedQuestionId] = useState<string | null>(null);
  const [questionImportMessage, setQuestionImportMessage] = useState("");
  const [examQuestionCount, setExamQuestionCount] = useState(20);
  const [examMinutes, setExamMinutes] = useState(30);
  const [examQuestionIds, setExamQuestionIds] = useState<string[]>([]);
  const [examStartedAt, setExamStartedAt] = useState("");
  const [examRemainingSeconds, setExamRemainingSeconds] = useState(0);
  const [examAnswers, setExamAnswers] = useState<Record<string, string[]>>({});
  const [examFinishedResult, setExamFinishedResult] = useState<ExamResult | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);
  const [readerMenuOpen, setReaderMenuOpen] = useState(false);
  const [sheetHeightVh, setSheetHeightVh] = useState(52);
  const [currentPage, setCurrentPage] = useState(() => initialPositionRef.current.page ?? 1);
  const [activeBlockId, setActiveBlockId] = useState(initialPositionRef.current.blockId ?? "");
  const [highlightBlockId, setHighlightBlockId] = useState("");
  const [reviewClock, setReviewClock] = useState(() => Date.now());
  const readerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<OverlayName | null>(null);
  const overlayHistoryRef = useRef(false);
  const pendingScrollSectionRef = useRef<string | null>(null);
  const pendingScrollBlockRef = useRef<string | null>(null);
  const pendingLanguageScrollRef = useRef<PendingLanguageScroll | null>(null);
  const savedScrollLockRef = useRef(0);
  const sheetDragRef = useRef<{ startY: number; startHeight: number; currentHeight: number } | null>(null);
  const aiRequestRef = useRef(0);
  const aiStudyRequestRef = useRef(0);
  const examSubmissionRef = useRef(false);
  const transitionOwnerRef = useRef(0);
  const transitionCleanupRef = useRef<(() => void) | null>(null);
  const transitionOriginViewRef = useRef<AppView | null>(null);
  const nativeBackHandlerRef = useRef<(canGoBack: boolean) => void>(() => undefined);
  const readerRestoreFrameRef = useRef(0);
  const overlayPanelRef = useRef<HTMLElement | null>(null);
  const overlayReturnFocusRef = useRef<HTMLElement | null>(null);
  const chapterRailRef = useRef<HTMLElement | null>(null);
  const skipNextCorrectionPersistenceRef = useRef(false);
  const persistenceSnapshotsRef = useRef({
    terms: JSON.stringify(savedTerms),
    notes: JSON.stringify(savedNotes),
    favorites: JSON.stringify(savedFavorites),
    daily: JSON.stringify(dailyStats),
    questionBank: JSON.stringify(userQuestionBank),
    questionProgress: JSON.stringify(questionProgress),
    examResults: JSON.stringify(examResults),
    contextCorrections: JSON.stringify(contextCorrectionBundle),
    chapterProgress: JSON.stringify(chapterProgressMap)
  });

  const activeBook = useMemo(() => {
    const source = catalog ?? fallbackCatalog;
    return source.books.find((book) => book.bookId === activeBookId) ?? source.books[0];
  }, [activeBookId, catalog]);
  const currentBookId = activeBook?.bookId ?? defaultBookId;
  const currentBookTitleZh = getBookTitle(activeBook, "zh");
  const lesson = manual?.chapters.find((chapter) => chapter.id === activeChapterId) ?? manual?.chapters[0];
  const activeSection = lesson?.sections.find((section) => section.id === activeSectionId) ?? lesson?.sections[0];
  const termIndex = useMemo(
    () => buildTermIndex([...(manual?.dictionary ?? []), ...bundledQuestionDictionary]),
    [bundledQuestionDictionary, manual]
  );
  const tocResults = useMemo(() => buildTocSearchResults(manual, tocQuery), [manual, tocQuery]);
  const bookSavedTerms = useMemo(
    () => savedTerms.filter((item) => item.bookId === currentBookId),
    [savedTerms, currentBookId]
  );
  const bookSavedNotes = useMemo(
    () => savedNotes.filter((item) => item.bookId === currentBookId),
    [savedNotes, currentBookId]
  );
  const bookSavedFavorites = useMemo(
    () => savedFavorites.filter((item) => item.bookId === currentBookId),
    [savedFavorites, currentBookId]
  );
  const dueTerms = useMemo(() => {
    const now = new Date(reviewClock);
    return bookSavedTerms.filter((item) => isTermDue(item, now));
  }, [bookSavedTerms, reviewClock]);
  const allDueTerms = useMemo(() => {
    const now = new Date(reviewClock);
    return savedTerms.filter((item) => isTermDue(item, now));
  }, [reviewClock, savedTerms]);
  const visibleSavedTerms = useMemo(() => {
    const source = vocabFilter === "due" ? dueTerms : bookSavedTerms;
    return [...source].sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt));
  }, [bookSavedTerms, dueTerms, vocabFilter]);
  const studyBooks = useMemo(() => (catalog ?? fallbackCatalog).books, [catalog]);
  const studyScopeTerms = useMemo(
    () => savedTerms.filter((item) => studyBookFilter === "all" || item.bookId === studyBookFilter),
    [savedTerms, studyBookFilter]
  );
  const recentStudyTerms = useMemo(
    () => [...studyScopeTerms].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)),
    [studyScopeTerms]
  );
  const filteredStudyTerms = useMemo(() => {
    const query = normalizeLookup(vocabQuery);
    const source = studyScopeTerms;
    const searched = query
      ? source.filter((item) =>
          normalizeLookup(
            `${item.term} ${item.translation} ${item.contextMeaning ?? ""} ${item.contextExplanation ?? ""} ` +
            `${item.sourceText} ${item.sourceTranslation ?? ""} ${item.chapterTitle} ${item.sourceDomain ?? ""}`
          ).includes(query)
        )
      : source;
    return [...searched].sort((a, b) => {
      if (vocabSort === "page") {
        return a.bookId.localeCompare(b.bookId) || a.chapter - b.chapter || a.page - b.page;
      }
      if (vocabSort === "due") {
        return Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt);
      }
      return Date.parse(b.savedAt) - Date.parse(a.savedAt);
    });
  }, [studyScopeTerms, vocabQuery, vocabSort]);
  const filteredStudyNotes = useMemo(() => {
    const query = normalizeLookup(notesQuery);
    const source = savedNotes.filter((item) => studyBookFilter === "all" || item.bookId === studyBookFilter);
    const searched = query
      ? source.filter((item) =>
          normalizeLookup(`${item.text} ${item.note} ${item.chapterTitle} ${item.sectionId}`).includes(query)
        )
      : source;
    return [...searched].sort((a, b) => {
      if (notesSort === "page") {
        return a.bookId.localeCompare(b.bookId) || a.chapter - b.chapter || a.page - b.page;
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [savedNotes, studyBookFilter, notesQuery, notesSort]);
  const filteredFavorites = useMemo(() => {
    const query = normalizeLookup(favoritesQuery);
    const source = savedFavorites.filter((item) => studyBookFilter === "all" || item.bookId === studyBookFilter);
    const searched = query
      ? source.filter((item) =>
          normalizeLookup(`${item.title} ${item.note ?? ""} ${item.chapterTitle} ${item.sectionId}`).includes(query)
        )
      : source;
    return [...searched].sort((a, b) => {
      if (favoritesSort === "page") {
        return a.bookId.localeCompare(b.bookId) || a.chapter - b.chapter || a.page - b.page;
      }
      return Date.parse(b.savedAt) - Date.parse(a.savedAt);
    });
  }, [savedFavorites, studyBookFilter, favoritesQuery, favoritesSort]);
  const learningCount = bookSavedTerms.filter((item) => item.status === "learning").length;
  const masteredCount = bookSavedTerms.filter((item) => item.status === "mastered").length;
  const savedSet = useMemo(
    () => new Set(bookSavedTerms.map((item) => `${item.bookId}:${normalizeLookup(item.term)}`)),
    [bookSavedTerms]
  );
  const allQuestions = useMemo(() => {
    const byId = new Map<string, QuestionItem>();
    for (const question of [
      ...publicQuestionBank.questions,
      ...(bundledQuestionBank?.questions ?? []),
      ...(userQuestionBank?.questions ?? [])
    ]) {
      if (!byId.has(question.questionId)) {
        byId.set(question.questionId, question);
      }
    }
    return [...byId.values()];
  }, [bundledQuestionBank, userQuestionBank]);
  const questionDomains = useMemo(
    () => [...new Set(allQuestions.map((question) => question.domain))].sort((a, b) => a.localeCompare(b)),
    [allQuestions]
  );
  const questionChapters = useMemo(
    () => [...new Set(allQuestions.map((question) => question.chapterId))].sort((a, b) => a.localeCompare(b)),
    [allQuestions]
  );
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(
      (question) =>
        (questionDomainFilter === "all" || question.domain === questionDomainFilter) &&
        (questionChapterFilter === "all" || question.chapterId === questionChapterFilter) &&
        (questionDifficultyFilter === "all" || question.difficulty === questionDifficultyFilter)
    );
  }, [allQuestions, questionChapterFilter, questionDifficultyFilter, questionDomainFilter]);
  const wrongQuestions = useMemo(() => {
    return allQuestions
      .filter((question) => {
        const progress = progressForQuestion(questionProgress, question.questionId);
        return progress.wrongPriority > 0 && !progress.mastered;
      })
      .sort(
        (a, b) =>
          progressForQuestion(questionProgress, b.questionId).wrongPriority -
          progressForQuestion(questionProgress, a.questionId).wrongPriority
      );
  }, [allQuestions, questionProgress]);
  const favoriteQuestions = useMemo(
    () => allQuestions.filter((question) => progressForQuestion(questionProgress, question.questionId).favorite),
    [allQuestions, questionProgress]
  );
  const weakDomains = useMemo(() => {
    const byDomain = new Map<string, { domain: string; wrong: number; total: number }>();
    for (const question of allQuestions) {
      const progress = progressForQuestion(questionProgress, question.questionId);
      const current = byDomain.get(question.domain) ?? { domain: question.domain, wrong: 0, total: 0 };
      current.wrong += progress.wrongCount + progress.unknownCount;
      current.total += progress.correctCount + progress.wrongCount + progress.unknownCount;
      byDomain.set(question.domain, current);
    }
    return [...byDomain.values()]
      .filter((item) => item.total > 0 && item.wrong > 0)
      .sort((a, b) => b.wrong / b.total - a.wrong / a.total)
      .slice(0, 4);
  }, [allQuestions, questionProgress]);
  const questionSummary = useMemo(() => {
    const records = allQuestions.map((question) => progressForQuestion(questionProgress, question.questionId));
    const answered = records.filter((item) => item.correctCount + item.wrongCount + item.unknownCount > 0).length;
    const correct = records.reduce((sum, item) => sum + item.correctCount, 0);
    const attempts = records.reduce((sum, item) => sum + item.correctCount + item.wrongCount + item.unknownCount, 0);
    return {
      answered,
      correct,
      attempts,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0
    };
  }, [allQuestions, questionProgress]);
  const currentQuestionList = useMemo(() => {
    if (questionMode === "home" || questionMode === "exam") {
      return [];
    }
    return questionSessionIds
      .map((questionId) => allQuestions.find((question) => question.questionId === questionId))
      .filter((question): question is QuestionItem => Boolean(question));
  }, [allQuestions, questionMode, questionSessionIds]);
  const currentQuestion =
    currentQuestionList.length > 0 ? currentQuestionList[Math.min(questionIndex, currentQuestionList.length - 1)] : undefined;
  const flashReviewTerms = useMemo(() => {
    const now = new Date(reviewClock);
    return studyScopeTerms
      .filter((item) => isTermDue(item, now))
      .sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt));
  }, [reviewClock, studyScopeTerms]);
  const remainingDailyGoal = Math.max(0, dailyStats.goal - dailyStats.completed);
  const plannedFlashCount = dailyStats.checkedInToday
    ? Math.min(dailyStats.baseGoal, flashReviewTerms.length)
    : Math.min(remainingDailyGoal, flashReviewTerms.length);
  const plannedDailyGoal = plannedFlashCount > 0
    ? Math.min(dailyStats.goal, dailyStats.completed + plannedFlashCount)
    : dailyStats.goal;
  const currentFlashTermId = flashSessionIds[Math.min(flashReviewIndex, Math.max(0, flashSessionIds.length - 1))];
  const currentFlashTerm = savedTerms.find((item) => item.id === currentFlashTermId);
  const currentFlashEntry = currentFlashTerm
    ? lookupCandidates(currentFlashTerm.term).map((key) => termIndex.get(key)).find(Boolean)
    : undefined;
  const flashDictionaryReady = Boolean(
    !manualLoading && manual?.bookId === currentBookId && termIndex.size > 0
  );
  const currentFlashExampleTranslation = useMemo(() => {
    if (!currentFlashTerm || !manual || manual.bookId !== currentFlashTerm.bookId) {
      return currentFlashTerm?.exampleTranslation || currentFlashTerm?.sourceTranslation;
    }
    if (currentFlashTerm.contextCorrectionId) {
      return currentFlashTerm.exampleTranslation || currentFlashTerm.sourceTranslation;
    }
    const section = currentFlashTerm.sourceType === "manual"
      ? manual.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === currentFlashTerm.sectionId)
      : undefined;
    return alignedBlockTranslation(
      section,
      currentFlashTerm.blockId,
      currentFlashTerm.page,
      manual.contextGlosses
    ) || currentFlashTerm.exampleTranslation || currentFlashTerm.sourceTranslation;
  }, [currentFlashTerm, manual]);
  const flashQuizOptions = useMemo(() => {
    if (!currentFlashTerm) {
      return [];
    }
    const answer = savedTermStudyMeaning(currentFlashTerm);
    const pool = [
      answer,
      ...savedTerms.map(savedTermStudyMeaning),
      "流程能力",
      "样本数量",
      "控制要求",
      "客户需求"
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    const distractors = pool.filter((value) => value !== answer).slice(0, 3);
    const options = [answer, ...distractors];
    const offset = [...currentFlashTerm.term].reduce((sum, char) => sum + char.charCodeAt(0), 0) % options.length;
    return [...options.slice(offset), ...options.slice(0, offset)];
  }, [currentFlashTerm, savedTerms]);
  const textScaleIndex = textScaleOrder.indexOf(readerPreferences.textScale);
  const pageGroups = useMemo(() => buildPageGroups(lesson?.sections ?? []), [lesson]);
  const keyboardLookupBlockId = useMemo(() => {
    if (language !== "en" || !lesson) {
      return "";
    }
    for (const section of lesson.sections) {
      const block = section.content.en.find((item) => item.kind !== "image" && Boolean(readableBlockText(item)));
      if (block) {
        return block.id;
      }
    }
    return "";
  }, [language, lesson]);
  const chapterProgress = lesson
    ? Math.round(
        ((Math.max(lesson.pageStart, Math.min(currentPage, lesson.pageEnd)) - lesson.pageStart + 1) /
          Math.max(1, lesson.pageEnd - lesson.pageStart + 1)) *
          100
      )
    : 0;
  const bookProgress = manual ? Math.round((Math.max(1, currentPage) / Math.max(1, manual.pageCount)) * 100) : 0;
  const currentLessonIndex = lesson && manual ? manual.chapters.findIndex((chapter) => chapter.id === lesson.id) : -1;
  const nextLesson = manual && currentLessonIndex >= 0 ? manual.chapters[currentLessonIndex + 1] : undefined;
  const currentChapterCompleted = lesson ? isChapterCompleted(chapterProgressMap, currentBookId, lesson.id) : false;
  const completedChapterCount = manual
    ? manual.chapters.filter((chapter) => isChapterCompleted(chapterProgressMap, currentBookId, chapter.id)).length
    : 0;
  const isOverlayOpen = Boolean(activeLookup || activeAiAssist || showToc || showVocab || showNotes);

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
    let cancelled = false;
    fetch(bundledQuestionBankPath, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`bundled question bank unavailable: ${response.status}`);
        }
        return response.json() as Promise<Partial<QuestionBankPayload>>;
      })
      .then((payload) => {
        if (!cancelled) {
          const bank = normalizeQuestionBank({ ...payload, sourceType: "user-private" }, "bundled-private-bank");
          setBundledQuestionBank(bank);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBundledQuestionBank(null);
        }
      });
    fetch(bundledQuestionDictionaryPath, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`bundled question dictionary unavailable: ${response.status}`);
        }
        return response.json() as Promise<TermEntry[]>;
      })
      .then((entries) => {
        if (!cancelled) {
          setBundledQuestionDictionary(Array.isArray(entries) ? entries : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBundledQuestionDictionary([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manual || manual.bookId !== currentBookId || termIndex.size === 0) {
      return;
    }
    setSavedTerms((items) => {
      let changed = false;
      const next = items.map((item) => {
        if (item.bookId !== currentBookId) {
          return item;
        }
        const entry = lookupCandidates(item.term).map((key) => termIndex.get(key)).find(Boolean);
        if (!entry || entry.translation === "待完善") {
          return item;
        }
        const savedSection = item.sourceType === "manual"
          ? manual.chapters.flatMap((chapter) => chapter.sections).find((section) => section.id === item.sectionId)
          : undefined;
        const alignedTranslation = alignedBlockTranslation(savedSection, item.blockId, item.page, manual.contextGlosses)
          || item.exampleTranslation
          || item.sourceTranslation;
        const context = resolveContextExplanation({
          query: item.term,
          dictionaryTranslation: entry.translation,
          partOfSpeech: entry.partOfSpeech,
          sourceText: item.exampleText || item.sourceText,
          sourceTranslation: alignedTranslation,
          contextGloss: item.blockId ? manual.contextGlosses?.[item.blockId] : undefined
        });
        const shouldReplaceTranslation = !item.translation
          || item.translation === "待完善"
          || item.translation === item.contextMeaning;
        const shouldReplaceContext = !item.contextCorrectionId && (
          item.sourceType === "manual"
          || !item.contextMeaning
          || item.contextMeaning === "待完善"
          || item.contextMeaning === item.translation
        );
        const updated: SavedTerm = {
          ...item,
          translation: shouldReplaceTranslation ? entry.translation : item.translation,
          partOfSpeech: entry.partOfSpeech || item.partOfSpeech,
          phonetic: entry.phonetic || item.phonetic,
          wordRoot: entry.wordRoot || item.wordRoot,
          wordForms: entry.wordForms?.length ? entry.wordForms : item.wordForms,
          englishDefinition: entry.englishDefinition || item.englishDefinition,
          dictionaryExplanation: entry.explanation || item.dictionaryExplanation,
          sourceTranslation: item.contextCorrectionId ? item.sourceTranslation : alignedTranslation || item.sourceTranslation,
          contextMeaning: shouldReplaceContext ? context.meaning : item.contextMeaning,
          contextExplanation: shouldReplaceContext ? context.explanation : item.contextExplanation || context.explanation,
          exampleTranslation: item.contextCorrectionId ? item.exampleTranslation : context.exampleTranslation || item.exampleTranslation
        };
        const fields: (keyof SavedTerm)[] = [
          "translation", "partOfSpeech", "phonetic", "wordRoot", "wordForms", "englishDefinition",
          "dictionaryExplanation", "sourceTranslation", "contextMeaning", "contextExplanation", "exampleTranslation"
        ];
        const differs = fields.some((field) => JSON.stringify(updated[field]) !== JSON.stringify(item[field]));
        if (differs) {
          changed = true;
          return updated;
        }
        return item;
      });
      return changed ? next : items;
    });
  }, [currentBookId, manual, termIndex]);

  useEffect(() => {
    if (!activeBook) {
      return;
    }

    let cancelled = false;
    const requestedBookId = activeBook.bookId;
    setManualLoading(true);
    setLoadError("");
    try {
      window.localStorage.setItem(activeBookKey, activeBook.bookId);
    } catch {
      // Local storage can be unavailable in constrained WebView modes.
    }
    fetch(activeBook.contentPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`manual load failed: ${response.status}`);
        }
        return response.json() as Promise<ManualData>;
      })
      .then((data) => {
        if (cancelled || requestedBookId !== activeBook.bookId) {
          return;
        }
        const enriched = enrichManualData(data, activeBook);
        if (enriched.bookId !== requestedBookId) {
          throw new Error(`manual bookId mismatch: expected ${requestedBookId}, received ${enriched.bookId}`);
        }
        const savedPosition = loadReaderPosition(activeBook.bookId);
        const canRestore = (savedPosition.bookId ?? defaultBookId) === activeBook.bookId;
        const initialChapter =
          canRestore && savedPosition.sectionId
            ? enriched.chapters.find((chapter) =>
                chapter.id === savedPosition.chapterId ||
                chapter.sections.some((section) => section.id === savedPosition.sectionId)
              ) ?? enriched.chapters[0]
            : canRestore
              ? enriched.chapters.find((chapter) => chapter.id === savedPosition.chapterId) ?? enriched.chapters[0]
              : enriched.chapters[0];
        const initialSection =
          (canRestore
            ? initialChapter.sections.find((section) => section.id === savedPosition.sectionId)
            : undefined) ?? initialChapter.sections[0];
        setManual(enriched);
        setActiveChapterId(initialChapter.id);
        setActiveSectionId(initialSection.id);
        if (canRestore && savedPosition.language) {
          setLanguage(savedPosition.language);
        }
        const restoredPage = canRestore ? savedPosition.page ?? initialSection.page : initialSection.page;
        setCurrentPage(Math.min(enriched.pageCount, Math.max(1, restoredPage)));
        setActiveBlockId(canRestore ? savedPosition.blockId ?? "" : "");
        setManualLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setManual(null);
        setManualLoading(false);
        setLoadError(error instanceof Error ? error.message : "manual load failed");
      });
    return () => {
      cancelled = true;
    };
  }, [activeBook]);

  useEffect(() => {
    if (view !== "reader" || !manual || manual.bookId !== currentBookId) {
      return;
    }
    const savedPosition = loadReaderPosition(currentBookId);
    const targetSectionId = savedPosition.sectionId || activeSectionId;
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        if (typeof savedPosition.scrollY === "number" && savedPosition.chapterId === activeChapterId) {
          window.scrollTo({ top: Math.max(0, savedPosition.scrollY) });
          return;
        }
        document.querySelector(`[data-section-id="${targetSectionId}"]`)?.scrollIntoView({ block: "start" });
      });
      readerRestoreFrameRef.current = secondFrame;
    });
    readerRestoreFrameRef.current = firstFrame;
    return () => {
      window.cancelAnimationFrame(readerRestoreFrameRef.current);
    };
  }, [currentBookId, manual?.bookId, view]);

  useEffect(() => {
    const snapshot = JSON.stringify(savedTerms);
    if (snapshot === persistenceSnapshotsRef.current.terms) {
      return;
    }
    persistenceSnapshotsRef.current.terms = snapshot;
    persistSavedTerms(savedTerms);
  }, [savedTerms]);

  useEffect(() => {
    setContextCorrectionBundle(loadContextCorrectionBundle(currentBookId, manual?.version ?? "0.2.0"));
  }, [currentBookId, manual?.version]);

  useEffect(() => {
    const snapshot = JSON.stringify(contextCorrectionBundle);
    if (skipNextCorrectionPersistenceRef.current) {
      skipNextCorrectionPersistenceRef.current = false;
      persistenceSnapshotsRef.current.contextCorrections = snapshot;
      return;
    }
    if (snapshot === persistenceSnapshotsRef.current.contextCorrections) {
      return;
    }
    persistenceSnapshotsRef.current.contextCorrections = snapshot;
    persistContextCorrectionBundle(contextCorrectionBundle);
  }, [contextCorrectionBundle]);

  useEffect(() => {
    getDeepSeekKeyStatus()
      .then(setDeepSeekKeyStatus)
      .catch(() => setDeepSeekKeyStatus({ configured: false, storage: "session-only" }));
  }, []);

  useEffect(() => {
    if (!activeLookup) {
      aiRequestRef.current += 1;
      setAiLookupState({ lookupId: "", status: "idle" });
    }
  }, [activeLookup]);

  useEffect(() => {
    if (!activeAiAssist) {
      aiStudyRequestRef.current += 1;
    }
  }, [activeAiAssist]);

  useEffect(() => {
    const snapshot = JSON.stringify(savedNotes);
    if (snapshot === persistenceSnapshotsRef.current.notes) {
      return;
    }
    persistenceSnapshotsRef.current.notes = snapshot;
    persistSavedNotes(savedNotes);
  }, [savedNotes]);

  useEffect(() => {
    const snapshot = JSON.stringify(savedFavorites);
    if (snapshot === persistenceSnapshotsRef.current.favorites) {
      return;
    }
    persistenceSnapshotsRef.current.favorites = snapshot;
    persistSavedFavorites(savedFavorites);
  }, [savedFavorites]);

  useEffect(() => {
    const snapshot = JSON.stringify(chapterProgressMap);
    if (snapshot === persistenceSnapshotsRef.current.chapterProgress) {
      return;
    }
    persistenceSnapshotsRef.current.chapterProgress = snapshot;
    persistChapterProgress(chapterProgressMap);
  }, [chapterProgressMap]);

  useEffect(() => {
    const snapshot = JSON.stringify(dailyStats);
    if (snapshot === persistenceSnapshotsRef.current.daily) {
      return;
    }
    persistenceSnapshotsRef.current.daily = snapshot;
    persistDailyStats(dailyStats);
  }, [dailyStats]);

  useEffect(() => {
    const snapshot = JSON.stringify(userQuestionBank);
    if (snapshot === persistenceSnapshotsRef.current.questionBank) {
      return;
    }
    persistenceSnapshotsRef.current.questionBank = snapshot;
    persistUserQuestionBank(userQuestionBank);
  }, [userQuestionBank]);

  useEffect(() => {
    const snapshot = JSON.stringify(questionProgress);
    if (snapshot === persistenceSnapshotsRef.current.questionProgress) {
      return;
    }
    persistenceSnapshotsRef.current.questionProgress = snapshot;
    persistQuestionProgress(questionProgress);
  }, [questionProgress]);

  useEffect(() => {
    const snapshot = JSON.stringify(examResults);
    if (snapshot === persistenceSnapshotsRef.current.examResults) {
      return;
    }
    persistenceSnapshotsRef.current.examResults = snapshot;
    persistExamResults(examResults);
  }, [examResults]);

  useEffect(() => {
    persistReaderPreferences(readerPreferences.theme, readerPreferences.textScale);
  }, [readerPreferences]);

  useEffect(() => {
    document.documentElement.dataset.readerTheme = readerPreferences.theme;
  }, [readerPreferences.theme]);

  useEffect(() => {
    if (view !== "splash") {
      return;
    }
    let hasSeenSplash = false;
    try {
      hasSeenSplash = window.localStorage.getItem(noticeAcceptedKey) === "true";
    } catch {
      hasSeenSplash = false;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(noticeAcceptedKey, "true");
      } catch {
        // The opening can still finish when persistence is unavailable.
      }
      setView("home");
    }, reduceMotion ? 80 : hasSeenSplash ? 520 : 2500);
    return () => window.clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    const timer = window.setInterval(() => setReviewClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setDailyStats((stats) => {
      const next = normalizeDailyStats(stats, new Date(reviewClock));
      return next.day === stats.day &&
        next.goal === stats.goal &&
        next.completed === stats.completed &&
        next.checkedInToday === stats.checkedInToday &&
        next.streak === stats.streak &&
        next.missedDays === stats.missedDays
        ? stats
        : next;
    });
  }, [reviewClock]);

  useEffect(() => {
    setQuestionIndex(0);
    setSelectedQuestionAnswers([]);
    setRevealedQuestionId(null);
  }, [questionChapterFilter, questionDifficultyFilter, questionDomainFilter]);

  useEffect(() => {
    if (questionMode !== "exam" || !examStartedAt || examFinishedResult || examQuestionIds.length === 0) {
      return;
    }

    const deadline = Date.parse(examStartedAt) + examMinutes * 60_000;
    function updateCountdown() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setExamRemainingSeconds(remaining);
      if (remaining === 0 && !examSubmissionRef.current) {
        finishExam();
      }
    }

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [allQuestions, examAnswers, examFinishedResult, examMinutes, examQuestionIds, examStartedAt, questionMode]);

  useEffect(() => {
    setFlashReviewIndex(0);
    setFlashReviewStage("prompt");
    setFlashSessionIds([]);
    setFlashSessionReviewed(0);
    setFlashSessionGoal(0);
    setFlashQuizSelection("");
  }, [studyBookFilter]);

  useEffect(() => {
    if (!flashReviewActive) {
      return;
    }
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    return () => window.cancelAnimationFrame(frame);
  }, [flashReviewActive, flashReviewIndex, flashReviewStage]);

  useEffect(() => {
    if (view !== "reader" || !activeChapterId || !activeSectionId || manual?.bookId !== currentBookId) {
      return;
    }
    const nextPosition = {
      bookId: currentBookId,
      bookTitle: currentBookTitleZh,
      chapterId: activeChapterId,
      sectionId: activeSectionId,
      blockId: activeBlockId || undefined,
      page: currentPage,
      language,
      scrollY: window.scrollY
    };
    persistReaderPosition(nextPosition);
    setReaderPositions((positions) => ({
      ...positions,
      [currentBookId]: {
        ...positions[currentBookId],
        ...nextPosition,
        updatedAt: new Date().toISOString()
      }
    }));
  }, [activeBlockId, activeChapterId, activeSectionId, currentBookId, currentPage, language, manual?.bookId]);

  useEffect(() => {
    if (view !== "reader" || !activeChapterId || !activeSectionId || manual?.bookId !== currentBookId) {
      return;
    }
    let timer: number | undefined;

    function saveScrollPosition() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const nextPosition = {
          bookId: currentBookId,
          bookTitle: currentBookTitleZh,
          chapterId: activeChapterId,
          sectionId: activeSectionId,
          blockId: activeBlockId || undefined,
          page: currentPage,
          language,
          scrollY: window.scrollY
        };
        persistReaderPosition(nextPosition);
        setReaderPositions((positions) => ({
          ...positions,
          [currentBookId]: {
            ...positions[currentBookId],
            ...nextPosition,
            updatedAt: new Date().toISOString()
          }
        }));
      }, 180);
    }

    window.addEventListener("scroll", saveScrollPosition, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", saveScrollPosition);
    };
  }, [activeBlockId, activeChapterId, activeSectionId, currentBookId, currentPage, language, manual?.bookId, view]);

  useEffect(() => {
    overlayRef.current = activeLookup
      ? "lookup"
      : activeAiAssist
        ? "ai"
        : showToc
          ? "toc"
          : showVocab
            ? "vocab"
            : showNotes
              ? "notes"
              : null;
  }, [activeAiAssist, activeLookup, showToc, showVocab, showNotes]);

  useEffect(() => {
    if (!isOverlayOpen) {
      return;
    }
    const panel = overlayPanelRef.current;
    if (!panel) {
      return;
    }
    const activePanel = panel;
    overlayReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "textarea:not([disabled])",
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    const focusableItems = () => Array.from(activePanel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((item) => item.getClientRects().length > 0 && item.getAttribute("aria-hidden") !== "true");
    const focusFrame = window.requestAnimationFrame(() => {
      const closeButton = activePanel.querySelector<HTMLElement>(".closeButton");
      (closeButton ?? focusableItems()[0] ?? activePanel).focus({ preventScroll: true });
    });

    function handleOverlayKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeOverlayFromControl();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusableItems();
      if (items.length === 0) {
        event.preventDefault();
        activePanel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activePanel.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !activePanel.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleOverlayKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleOverlayKeyDown, true);
      const returnTarget = overlayReturnFocusRef.current;
      overlayReturnFocusRef.current = null;
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
      }
    };
  }, [isOverlayOpen]);

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

  nativeBackHandlerRef.current = (canGoBack) => {
    const transitionKind = document.documentElement.dataset.transitionKind;
    if (transitionKind) {
      const originView = transitionOriginViewRef.current;
      transitionCleanupRef.current?.();
      if (transitionKind === "navigation" && originView && originView !== view) {
        setView(originView);
      }
      return;
    }

    if (readerMenuOpen) {
      setReaderMenuOpen(false);
      return;
    }

    if (overlayRef.current) {
      closeOverlayFromNativeBack();
      return;
    }

    if (isImmersive) {
      setImmersiveMode(false);
      return;
    }

    if (view === "vocab" && flashReviewActive) {
      setFlashReviewActive(false);
      return;
    }

    if (view === "questions" && questionMode !== "home") {
      returnToQuestionHome();
      return;
    }

    if (view !== "home" && view !== "splash") {
      setView("home");
      return;
    }

    if (canGoBack) {
      window.history.back();
      return;
    }

    void CapacitorApp.exitApp();
  };

  useEffect(() => {
    let removed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      nativeBackHandlerRef.current(canGoBack);
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
    if (!readerMenuOpen) {
      return;
    }
    function closeReaderMenuWithEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setReaderMenuOpen(false);
    }
    document.addEventListener("keydown", closeReaderMenuWithEscape, true);
    return () => document.removeEventListener("keydown", closeReaderMenuWithEscape, true);
  }, [readerMenuOpen]);

  useEffect(() => {
    const root = readerRef.current;
    if (view !== "reader" || !root || !lesson) {
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
  }, [lesson, view]);

  useEffect(() => {
    const root = readerRef.current;
    if (view !== "reader" || !root || !lesson) {
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
  }, [language, lesson, view]);

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
  }, [isImmersive, language]);

  useEffect(() => {
    if (view !== "reader") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const activePage = chapterRailRef.current?.querySelector<HTMLElement>(".sectionPill.active");
      activePage?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, lesson?.id, view]);

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

  function runSpatialTransition(
    kind: "navigation" | "language",
    update: () => void,
    options: {
      prepareDestination?: () => void | Promise<void>;
    } = {}
  ) {
    transitionCleanupRef.current?.();
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const owner = transitionOwnerRef.current + 1;
    transitionOwnerRef.current = owner;
    transitionOriginViewRef.current = kind === "navigation" ? view : null;
    let cleaned = false;

    const commit = () => {
      flushSync(update);
    };

    const prepareDestination = async () => {
      try {
        await options.prepareDestination?.();
      } catch {
        // Navigation must still complete if a destination takes too long to prepare.
      }
    };

    function clearTransitionState() {
      if (cleaned) return;
      cleaned = true;
      if (transitionOwnerRef.current === owner) {
        delete root.dataset.transitionKind;
        transitionOriginViewRef.current = null;
      }
      if (transitionCleanupRef.current === clearTransitionState) {
        transitionCleanupRef.current = null;
      }
    }
    transitionCleanupRef.current = clearTransitionState;

    root.dataset.transitionKind = kind;

    if (prefersReducedMotion) {
      commit();
      void prepareDestination().finally(clearTransitionState);
      return;
    }

    if (kind === "language") {
      let languageCancelled = false;
      let fadeOut: Animation | undefined;
      let fadeIn: Animation | undefined;
      let sourceSurface = document.querySelector<HTMLElement>(".readerPanel");
      let targetSurface: HTMLElement | null = null;
      const cleanupLanguage = () => {
        if (languageCancelled) return;
        languageCancelled = true;
        fadeOut?.cancel();
        fadeIn?.cancel();
        if (transitionOwnerRef.current === owner) {
          sourceSurface?.style.removeProperty("opacity");
          targetSurface?.style.removeProperty("opacity");
        }
        if (transitionCleanupRef.current === cleanupLanguage) {
          transitionCleanupRef.current = null;
        }
        clearTransitionState();
      };
      transitionCleanupRef.current = cleanupLanguage;
      void (async () => {
        fadeOut = sourceSurface?.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
        );
        if (fadeOut) {
          await fadeOut.finished.catch(() => undefined);
        } else {
          await nextTransitionTask(120);
        }
        if (languageCancelled || transitionOwnerRef.current !== owner) return;
        commit();
        await prepareDestination();
        targetSurface = document.querySelector<HTMLElement>(".readerPanel");
        if (targetSurface) targetSurface.style.opacity = "0";
        fadeOut?.cancel();
        if (languageCancelled || transitionOwnerRef.current !== owner) return;
        await nextTransitionTask();
        fadeIn = targetSurface?.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
        );
        if (fadeIn) await fadeIn.finished.catch(() => undefined);
        if (!languageCancelled && transitionOwnerRef.current === owner) {
          targetSurface?.style.removeProperty("opacity");
        }
      })().catch(() => undefined).finally(cleanupLanguage);
      return;
    }

    if (kind === "navigation") {
      let cancelled = false;
      let sourceFade: Animation | undefined;
      let targetFade: Animation | undefined;
      let sourceShell = document.querySelector<HTMLElement>(".appShell");
      let targetShell: HTMLElement | null = null;
      const cleanupNavigation = () => {
        if (cancelled) return;
        cancelled = true;
        sourceFade?.cancel();
        targetFade?.cancel();
        if (transitionOwnerRef.current === owner) {
          sourceShell?.style.removeProperty("opacity");
          sourceShell?.style.removeProperty("transform");
          targetShell?.style.removeProperty("opacity");
          targetShell?.style.removeProperty("transform");
        }
        if (transitionCleanupRef.current === cleanupNavigation) {
          transitionCleanupRef.current = null;
        }
        clearTransitionState();
      };
      transitionCleanupRef.current = cleanupNavigation;
      void (async () => {
        sourceFade = sourceShell?.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 90, easing: "ease-out", fill: "forwards" }
        );
        if (sourceFade) await sourceFade.finished.catch(() => undefined);
        if (cancelled || transitionOwnerRef.current !== owner) return;
        commit();
        targetShell = document.querySelector<HTMLElement>(".appShell");
        if (targetShell) {
          targetShell.style.opacity = "0";
        }
        await prepareDestination();
        sourceFade?.cancel();
        await nextTransitionTask();
        if (cancelled || transitionOwnerRef.current !== owner) return;
        targetFade = targetShell?.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 170, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" }
        );
        if (targetFade) await targetFade.finished.catch(() => undefined);
        if (!cancelled && transitionOwnerRef.current === owner) {
          targetShell?.style.removeProperty("opacity");
          targetShell?.style.removeProperty("transform");
        }
      })().catch(() => undefined).finally(cleanupNavigation);
      return;
    }

    commit();
    void prepareDestination().finally(clearTransitionState);
  }

  function nextTransitionTask(delay = 0): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, delay));
  }

  async function prepareReaderDestination(bookId: string) {
    const deadline = performance.now() + 2000;
    let shell: HTMLElement | null = null;
    while (performance.now() < deadline) {
      shell = document.querySelector<HTMLElement>('[data-app-view="reader"]');
      if (shell?.dataset.bookId === bookId && shell.querySelector(".readerPanel")) {
        break;
      }
      await nextTransitionTask(16);
    }

    // Let React effects settle before restoring the saved reading position.
    await nextTransitionTask();
    void shell?.offsetHeight;
    const savedPosition = loadReaderPosition(bookId);
    if (typeof savedPosition.scrollY === "number") {
      window.scrollTo({ top: Math.max(0, savedPosition.scrollY), left: 0, behavior: "instant" });
    } else if (savedPosition.sectionId) {
      document.querySelector(`[data-section-id="${savedPosition.sectionId}"]`)?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    void document.documentElement.offsetHeight;
    await nextTransitionTask();
  }

  function navigateTo(nextView: AppView, _source?: HTMLElement | null) {
    setReaderMenuOpen(false);
    if (nextView === view) {
      window.scrollTo({ top: 0, left: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    runSpatialTransition("navigation", () => {
      setView(nextView);
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
  }

  function openBook(bookId: string, _source?: HTMLElement | null) {
    runSpatialTransition("navigation", () => {
      setActiveBookId(bookId);
      setView("reader");
    }, {
      prepareDestination: () => prepareReaderDestination(bookId)
    });
    setReaderMenuOpen(false);
  }

  function openSourceAnchor(anchor: SourceAnchor) {
    const targetBookLoaded = anchor.bookId === currentBookId && manual?.bookId === anchor.bookId;
    persistReaderPosition({
      bookId: anchor.bookId,
      chapterId: anchor.chapterId,
      sectionId: anchor.sectionId,
      blockId: anchor.blockId,
      page: anchor.page,
      language: anchor.language ?? language,
      scrollY: 0
    });
    setReaderPositions(loadReaderPositions());
    runSpatialTransition("navigation", () => {
      setActiveBookId(anchor.bookId);
      setView("reader");
    }, {
      prepareDestination: () => prepareReaderDestination(anchor.bookId)
    });
    setReaderMenuOpen(false);
    pendingScrollSectionRef.current = anchor.sectionId;
    pendingScrollBlockRef.current = anchor.blockId ?? null;
    if (targetBookLoaded) {
      selectSource(anchor.sectionId, anchor.blockId, anchor.page);
    }
  }

  function progressForBook(book: BookManifest): { page?: number; percent: number; label: string } {
    const position = readerPositions[book.bookId];
    if (!position?.page) {
      return { percent: 0, label: "尚未开始" };
    }
    const percent = Math.round((Math.max(1, position.page) / Math.max(1, book.pageCount)) * 100);
    return {
      page: position.page,
      percent,
      label: `p. ${position.page} · ${percent}%`
    };
  }

  function recordDailyCompletion(count = 1, sessionGoal?: number) {
    setDailyStats((stats) => recordDailyReviewCompletion(stats, count, new Date(), sessionGoal));
  }

  function questionText(value: LocalizedText | { en: string; zh: string }): string {
    return (questionLanguage === "zh" ? value.zh || value.en : value.en || value.zh) || "";
  }

  function answerKey(values: string[]): string {
    return [...values].map((value) => value.trim().toUpperCase()).filter(Boolean).sort().join("|");
  }

  function isQuestionAnswerCorrect(question: QuestionItem, values: string[]): boolean {
    return answerKey(question.correctAnswer) === answerKey(values);
  }

  function updateQuestionProgress(questionId: string, updater: (progress: QuestionProgress) => QuestionProgress) {
    setQuestionProgress((items) => ({
      ...items,
      [questionId]: updater(progressForQuestion(items, questionId))
    }));
  }

  function markCurrentQuestionSeen(question: QuestionItem) {
    updateQuestionProgress(question.questionId, (progress) => markQuestionSeen(progress));
  }

  function toggleCurrentQuestionFavorite(question: QuestionItem) {
    updateQuestionProgress(question.questionId, (progress) => toggleQuestionFavorite(progress));
  }

  function selectQuestionOption(question: QuestionItem, optionId: string) {
    if (submittedQuestionIds.includes(question.questionId)) {
      return;
    }
    const next = question.questionType === "multiple"
        ? selectedQuestionAnswers.includes(optionId)
          ? selectedQuestionAnswers.filter((item) => item !== optionId)
          : [...selectedQuestionAnswers, optionId]
        : [optionId];
    setQuestionSessionAnswers((items) => ({ ...items, [question.questionId]: next }));
    setSelectedQuestionAnswers(next);
  }

  function moveToQuestion(targetIndex: number, list = currentQuestionList) {
    if (list.length === 0) {
      setQuestionIndex(0);
      setSelectedQuestionAnswers([]);
      setRevealedQuestionId(null);
      return;
    }
    const nextIndex = Math.max(0, Math.min(targetIndex, list.length - 1));
    const nextQuestion = list[nextIndex];
    setQuestionIndex(nextIndex);
    setSelectedQuestionAnswers(questionSessionAnswers[nextQuestion.questionId] ?? []);
    setRevealedQuestionId(submittedQuestionIds.includes(nextQuestion.questionId) ? nextQuestion.questionId : null);
  }

  function moveToNextQuestion(list = currentQuestionList) {
    moveToQuestion(questionIndex + 1, list);
  }

  function submitQuestionAnswer(question: QuestionItem) {
    if (selectedQuestionAnswers.length === 0 || submittedQuestionIds.includes(question.questionId)) {
      return;
    }
    const isCorrect = isQuestionAnswerCorrect(question, selectedQuestionAnswers);
    updateQuestionProgress(question.questionId, (progress) => recordQuestionAnswer(progress, isCorrect ? "correct" : "wrong"));
    setSubmittedQuestionIds((items) => [...items, question.questionId]);
    setRevealedQuestionId(question.questionId);
  }

  function markQuestionUnknown(question: QuestionItem) {
    if (submittedQuestionIds.includes(question.questionId)) {
      return;
    }
    updateQuestionProgress(question.questionId, (progress) => recordQuestionAnswer(progress, "unknown"));
    setQuestionSessionAnswers((items) => ({ ...items, [question.questionId]: [] }));
    setSelectedQuestionAnswers([]);
    setSubmittedQuestionIds((items) => [...items, question.questionId]);
    setRevealedQuestionId(question.questionId);
  }

  function markQuestionCorrectFromBrowse(question: QuestionItem) {
    if (submittedQuestionIds.includes(question.questionId)) {
      return;
    }
    updateQuestionProgress(question.questionId, (progress) => recordQuestionAnswer(progress, "correct"));
    setSubmittedQuestionIds((items) => [...items, question.questionId]);
  }

  function showAiAssist(state: ActiveAiAssist) {
    ensureOverlayHistory();
    setReaderMenuOpen(false);
    setActiveLookup(null);
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(false);
    setSheetHeightVh(78);
    setActiveAiAssist(state);
  }

  async function requestReadingAiAssist(state: ReadingAiAssist) {
    if (!deepSeekKeyStatus.configured) {
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "needs-key", message: "配置个人 DeepSeek API Key 后即可使用。" }
        : current);
      return;
    }
    const requestId = ++aiStudyRequestRef.current;
    setActiveAiAssist((current) => current?.cacheId === state.cacheId
      ? { ...state, status: "loading", message: undefined }
      : current);
    try {
      const analysis = await explainReadingWithDeepSeek(state.input);
      if (requestId !== aiStudyRequestRef.current) return;
      persistAiStudyCache({
        id: state.cacheId,
        kind: "reading",
        model: analysis.model,
        generatedAt: new Date().toISOString(),
        result: analysis.result,
        usage: analysis.usage
      });
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "ready", result: analysis.result, model: analysis.model, usage: analysis.usage, fromCache: false }
        : current);
    } catch (error) {
      if (requestId !== aiStudyRequestRef.current) return;
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "error", message: error instanceof Error ? error.message : "AI 阅读解释暂时不可用" }
        : current);
    }
  }

  async function requestQuestionAiAssist(state: QuestionAiAssist) {
    if (!deepSeekKeyStatus.configured) {
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "needs-key", message: "配置个人 DeepSeek API Key 后即可使用。" }
        : current);
      return;
    }
    const requestId = ++aiStudyRequestRef.current;
    setActiveAiAssist((current) => current?.cacheId === state.cacheId
      ? { ...state, status: "loading", message: undefined }
      : current);
    try {
      const analysis = await explainQuestionWithDeepSeek(state.input);
      if (requestId !== aiStudyRequestRef.current) return;
      persistAiStudyCache({
        id: state.cacheId,
        kind: "question",
        model: analysis.model,
        generatedAt: new Date().toISOString(),
        result: analysis.result,
        usage: analysis.usage
      });
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "ready", result: analysis.result, model: analysis.model, usage: analysis.usage, fromCache: false }
        : current);
    } catch (error) {
      if (requestId !== aiStudyRequestRef.current) return;
      setActiveAiAssist((current) => current?.cacheId === state.cacheId
        ? { ...state, status: "error", message: error instanceof Error ? error.message : "AI 题目精讲暂时不可用" }
        : current);
    }
  }

  function askAiAboutSelection() {
    if (!selectedPhrase || language !== "en" || !lesson) return;
    const section = lesson.sections.find((item) => item.id === selectedPhrase.sectionId);
    const block = section?.content.en.find((item) => item.id === selectedPhrase.blockId);
    const contextEn = boundedAiText(readableBlockText(block) || selectedPhrase.text, 2400);
    const contextZh = boundedAiText(
      alignedBlockTranslation(section, selectedPhrase.blockId, selectedPhrase.page, manual?.contextGlosses) || "",
      2400
    );
    const input: DeepSeekReadingInput = {
      domain: activeBook?.domainLabel || "Six Sigma",
      bookTitle: currentBookTitleZh,
      chapterTitle: lesson.title.en,
      page: selectedPhrase.page,
      selectionEn: boundedAiText(selectedPhrase.text, 1600),
      contextEn,
      contextZh
    };
    const cacheId = createAiStudyCacheId(
      "reading",
      `${currentBookId}:${lesson.id}:${selectedPhrase.blockId || selectedPhrase.sectionId}`,
      JSON.stringify(input)
    );
    const cached = findAiStudyCache(cacheId, "reading");
    const state: ReadingAiAssist = {
      kind: "reading",
      cacheId,
      sourceLabel: `第 ${lesson.chapter} 章 · p. ${selectedPhrase.page}`,
      excerpt: input.selectionEn,
      input,
      status: cached ? "ready" : deepSeekKeyStatus.configured ? "loading" : "needs-key",
      result: cached?.result,
      model: cached?.model,
      usage: cached?.usage,
      fromCache: Boolean(cached),
      message: !cached && !deepSeekKeyStatus.configured ? "配置个人 DeepSeek API Key 后即可使用。" : undefined
    };
    showAiAssist(state);
    setSelectedPhrase(null);
    window.getSelection()?.removeAllRanges();
    if (!cached && deepSeekKeyStatus.configured) {
      void requestReadingAiAssist(state);
    }
  }

  function askAiAboutQuestion(question: QuestionItem, answerSelection: string[]) {
    const input: DeepSeekQuestionInput = {
      questionId: question.questionId,
      domain: question.domain,
      chapterId: question.chapterId,
      stemEn: boundedAiText(question.stem.en, 1800),
      stemZh: boundedAiText(question.stem.zh, 1800),
      options: question.options.map((option) => ({
        id: option.id,
        en: boundedAiText(option.en, 700),
        zh: boundedAiText(option.zh, 700)
      })),
      correctAnswer: [...question.correctAnswer],
      userAnswer: [...answerSelection],
      existingExplanationEn: boundedAiText(question.explanation.en, 1400),
      existingExplanationZh: boundedAiText(question.explanation.zh, 1400)
    };
    const cacheId = createAiStudyCacheId("question", question.questionId, JSON.stringify(input));
    const cached = findAiStudyCache(cacheId, "question");
    const state: QuestionAiAssist = {
      kind: "question",
      cacheId,
      sourceLabel: `${question.domain} · ${question.chapterId}`,
      questionId: question.questionId,
      correctAnswer: [...question.correctAnswer],
      input,
      status: cached ? "ready" : deepSeekKeyStatus.configured ? "loading" : "needs-key",
      result: cached?.result,
      model: cached?.model,
      usage: cached?.usage,
      fromCache: Boolean(cached),
      message: !cached && !deepSeekKeyStatus.configured ? "配置个人 DeepSeek API Key 后即可使用。" : undefined
    };
    showAiAssist(state);
    if (!cached && deepSeekKeyStatus.configured) {
      void requestQuestionAiAssist(state);
    }
  }

  function retryAiAssist() {
    if (!activeAiAssist) return;
    if (activeAiAssist.kind === "reading") {
      void requestReadingAiAssist(activeAiAssist);
    } else {
      void requestQuestionAiAssist(activeAiAssist);
    }
  }

  function activeLookupId(lookup: Pick<ActiveLookup, "query" | "blockId" | "sourceText" | "questionSource">): string {
    return [lookup.questionSource ? "question" : "manual", lookup.blockId ?? "", normalizeLookup(lookup.query), lookup.sourceText].join("|");
  }

  function openLookup(base: Omit<ActiveLookup, "baseContext">) {
    aiRequestRef.current += 1;
    const sourceType = base.questionSource ? "question" : "manual";
    const correctionInput = {
      bookId: currentBookId,
      sourceType,
      blockId: base.blockId,
      surface: base.query,
      partOfSpeech: base.entry.partOfSpeech,
      sourceText: base.context.exampleText
    } as const;
    const accepted = findAcceptedCorrection(contextCorrectionBundle, correctionInput);
    const lookup: ActiveLookup = {
      ...base,
      baseContext: base.context,
      context: accepted ? contextFromCorrection(base.context, accepted) : base.context
    };
    const lookupId = activeLookupId(lookup);
    setActiveLookup(lookup);
    if (accepted) {
      setAiLookupState({ lookupId, status: "accepted", correction: accepted });
      return;
    }
    const similar = findSimilarCorrection(contextCorrectionBundle, correctionInput);
    setAiLookupState({ lookupId, status: "idle", similar });
    if (base.context.needsVerification && deepSeekKeyStatus.configured) {
      window.setTimeout(() => void verifyLookupWithAi(lookup, true), 0);
    }
  }

  function deepSeekContextForLookup(lookup: ActiveLookup) {
    const gloss = lookup.blockId ? manual?.contextGlosses?.[lookup.blockId] : undefined;
    const sentences = gloss?.sentences ?? [];
    const sentenceIndex = sentences.findIndex((item) => item.source === lookup.baseContext.exampleText);
    const previous = sentenceIndex > 0 ? sentences[sentenceIndex - 1] : undefined;
    const next = sentenceIndex >= 0 && sentenceIndex + 1 < sentences.length ? sentences[sentenceIndex + 1] : undefined;
    return {
      sentenceIndex: sentenceIndex >= 0 ? sentenceIndex : undefined,
      input: {
        surface: lookup.query,
        dictionarySensesZh: lookup.entry.translation,
        dictionaryPartOfSpeech: lookup.entry.partOfSpeech || "unknown",
        domain: lookup.questionSource?.domain || activeBook?.domainLabel || "Six Sigma",
        currentSentenceEn: lookup.baseContext.exampleText,
        currentSentenceZh: lookup.baseContext.exampleTranslation || lookup.sourceTranslation || "",
        previousSentenceEn: previous?.source || "",
        previousSentenceZh: previous?.translation || "",
        nextSentenceEn: next?.source || "",
        nextSentenceZh: next?.translation || ""
      }
    };
  }

  async function verifyLookupWithAi(lookup: ActiveLookup, automatic = false) {
    const lookupId = activeLookupId(lookup);
    if (!deepSeekKeyStatus.configured) {
      if (!automatic) {
        setAiLookupState({ lookupId, status: "error", message: "请先在“我的”中配置 DeepSeek API Key。" });
      }
      return;
    }
    const requestId = ++aiRequestRef.current;
    const currentWindow = deepSeekContextForLookup(lookup);
    setAiLookupState((state) => ({ ...state, lookupId, status: "checking", message: undefined }));
    try {
      const analysis = await analyzeContextWithDeepSeek(currentWindow.input);
      const proposed = await createProposedCorrection({
        bookId: currentBookId,
        contentVersion: manual?.version ?? "0.2.0",
        sourceType: lookup.questionSource ? "question" : "manual",
        chapterId: lookup.questionSource?.chapterId || lesson?.id,
        sectionId: lookup.sectionId,
        blockId: lookup.blockId,
        page: lookup.page,
        sentenceIndex: currentWindow.sentenceIndex,
        sourceText: lookup.baseContext.exampleText,
        surface: lookup.query,
        partOfSpeech: lookup.entry.partOfSpeech,
        currentMeaning: lookup.baseContext.meaning,
        currentTranslation: lookup.baseContext.exampleTranslation || lookup.sourceTranslation
      }, analysis.result, {
        provider: "deepseek",
        model: analysis.model,
        promptVersion: deepSeekPromptVersion,
        appVersion: productVersionId,
        responseSha256: analysis.responseSha256
      });
      if (requestId !== aiRequestRef.current) {
        return;
      }
      const similar = findSimilarCorrection(contextCorrectionBundle, {
        bookId: currentBookId,
        sourceType: lookup.questionSource ? "question" : "manual",
        blockId: lookup.blockId,
        surface: proposed.lexical.lemma,
        partOfSpeech: proposed.lexical.partOfSpeech,
        sourceText: proposed.source.sourceText
      }, proposed.id);
      setContextCorrectionBundle((bundle) => upsertCorrection(bundle, proposed));
      setAiLookupState({
        lookupId,
        status: "ready",
        correction: proposed,
        similar,
        usage: analysis.usage
      });
    } catch (error) {
      if (requestId !== aiRequestRef.current) {
        return;
      }
      setAiLookupState({
        lookupId,
        status: "error",
        message: error instanceof Error ? error.message : "DeepSeek 核验失败"
      });
    }
  }

  function acceptAiCorrection(useSimilar = false) {
    if (!activeLookup || !aiLookupState.correction) {
      return;
    }
    const now = new Date().toISOString();
    const source = aiLookupState.correction;
    const accepted: ContextCorrectionRecord = {
      ...source,
      status: "accepted",
      after: useSimilar && aiLookupState.similar ? aiLookupState.similar.correction.after : source.after,
      review: { acceptedBy: "user", acceptedAt: now },
      provenance: useSimilar && aiLookupState.similar ? {
        ...source.provenance,
        provider: "human",
        model: "accepted-similar-correction",
        responseSha256: aiLookupState.similar.correction.provenance.responseSha256
      } : source.provenance
    };
    setContextCorrectionBundle((bundle) => upsertCorrection(bundle, accepted));
    setActiveLookup((lookup) => lookup && activeLookupId(lookup) === aiLookupState.lookupId
      ? { ...lookup, context: contextFromCorrection(lookup.baseContext, accepted) }
      : lookup);
    setSavedTerms((items) => items.map((item) => {
      const sameTerm = normalizeLookup(item.term) === normalizeLookup(activeLookup.query);
      const sameSource = item.exampleText
        ? item.exampleText === activeLookup.baseContext.exampleText
        : item.blockId === activeLookup.blockId;
      return item.bookId === currentBookId && sameTerm && sameSource ? {
        ...item,
        contextMeaning: accepted.after.contextMeaningZh,
        contextExplanation: accepted.after.explanationZh,
        sourceTranslation: accepted.after.sentenceTranslationZh,
        exampleTranslation: accepted.after.sentenceTranslationZh,
        contextCorrectionId: accepted.id
      } : item;
    }));
    setAiLookupState({ lookupId: aiLookupState.lookupId, status: "accepted", correction: accepted });
  }

  function rejectAiCorrection() {
    if (!aiLookupState.correction) {
      return;
    }
    setContextCorrectionBundle((bundle) => setCorrectionStatus(bundle, aiLookupState.correction?.id ?? "", "rejected"));
    setAiLookupState({ lookupId: aiLookupState.lookupId, status: "idle", message: "已保留原释义。" });
  }

  function revokeAcceptedCorrection() {
    if (!activeLookup || !aiLookupState.correction) {
      return;
    }
    setContextCorrectionBundle((bundle) => setCorrectionStatus(bundle, aiLookupState.correction?.id ?? "", "revoked"));
    setActiveLookup({ ...activeLookup, context: activeLookup.baseContext });
    setAiLookupState({ lookupId: aiLookupState.lookupId, status: "idle", message: "已撤销本处修订。" });
  }

  function lookupQuestionText(text: string, question: QuestionItem, sourceText: string, sourceTranslation?: string) {
    const entry = lookupCandidates(text).map((key) => termIndex.get(key)).find(Boolean) ?? lookupFallback(text);
    ensureOverlayHistory();
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(false);
    setSheetHeightVh(52);
    const context = resolveContextExplanation({
      query: text,
      dictionaryTranslation: entry.translation,
      partOfSpeech: entry.partOfSpeech,
      sourceText,
      sourceTranslation
    });
    openLookup({
      query: text,
      entry,
      page: question.page,
      sectionId: "__question__",
      blockId: question.questionId,
      sourceText,
      sourceTranslation,
      context,
      questionSource: {
        questionId: question.questionId,
        examId: question.examId,
        domain: question.domain,
        chapterId: question.chapterId,
        page: question.page,
        sourceRef: question.sourceRef
      }
    });
  }

  function renderQuestionText(text: string, question: QuestionItem, sourceTranslation?: string, keyboardEntry = false) {
    return (
      <InlineQuestionText
        text={text}
        language={questionLanguage}
        keyboardEntry={keyboardEntry}
        onLookup={(token, sourceText) => lookupQuestionText(token, question, sourceText, sourceTranslation)}
      />
    );
  }

  async function importPrivateQuestionBank(file: File | undefined) {
    if (!file) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const bank = normalizeQuestionBank({ ...parsed, sourceType: "user-private" }, "user-private-bank");
      if (bank.questions.length === 0) {
        throw new Error("没有读到题目");
      }
      const reservedIds = new Set([
        ...publicQuestionBank.questions.map((question) => question.questionId),
        ...(bundledQuestionBank?.questions ?? []).map((question) => question.questionId)
      ]);
      const importedIds = new Set<string>();
      const conflicts: string[] = [];
      for (const question of bank.questions) {
        if (reservedIds.has(question.questionId) || importedIds.has(question.questionId)) {
          conflicts.push(question.questionId);
        }
        importedIds.add(question.questionId);
      }
      if (conflicts.length > 0) {
        throw new Error(`题目 ID 冲突：${[...new Set(conflicts)].slice(0, 3).join("、")}`);
      }
      setUserQuestionBank(bank);
      setQuestionImportMessage(`已导入 ${bank.questions.length} 道私有题。`);
    } catch (error) {
      setQuestionImportMessage(error instanceof Error ? `导入失败：${error.message}` : "导入失败。");
    }
  }

  function startPractice(mode: QuestionMode, resume = false) {
    if (mode === "exam") {
      setExamQuestionIds([]);
      setExamStartedAt("");
      setExamRemainingSeconds(0);
      setExamAnswers({});
      setExamFinishedResult(null);
      examSubmissionRef.current = false;
      setQuestionIndex(0);
      setQuestionMode("exam");
      return;
    }
    const list = mode === "wrong" ? wrongQuestions : mode === "favorite" ? favoriteQuestions : filteredQuestions;
    const resumeIndex = resume
      ? list.findIndex((question) => !progressForQuestion(questionProgress, question.questionId).lastAnsweredAt)
      : -1;
    setQuestionSessionIds(list.map((question) => question.questionId));
    setQuestionSessionAnswers({});
    setSubmittedQuestionIds([]);
    setQuestionMode(mode);
    setQuestionIndex(resumeIndex >= 0 ? resumeIndex : 0);
    setSelectedQuestionAnswers([]);
    setRevealedQuestionId(null);
  }

  function returnToQuestionHome() {
    const runningExam = questionMode === "exam" && examQuestionIds.length > 0 && Boolean(examStartedAt) && !examFinishedResult;
    if (runningExam && !window.confirm("模拟考试仍在进行，确定退出本次考试吗？")) {
      return;
    }
    setQuestionMode("home");
  }

  function openQuestionAnchor(questionId?: string) {
    if (activeLookup || activeAiAssist) {
      closeOverlayForJump();
    }
    if (!questionId) {
      setQuestionMode("home");
      navigateTo("questions");
      return;
    }
    const index = allQuestions.findIndex((question) => question.questionId === questionId);
    setQuestionDomainFilter("all");
    setQuestionChapterFilter("all");
    setQuestionDifficultyFilter("all");
    setQuestionSessionIds(allQuestions.map((question) => question.questionId));
    setQuestionSessionAnswers({});
    setSubmittedQuestionIds([]);
    setQuestionMode("browse");
    setQuestionIndex(index >= 0 ? index : 0);
    setRevealedQuestionId(questionId);
    navigateTo("questions");
    window.setTimeout(() => setQuestionIndex(index >= 0 ? index : 0), 0);
  }

  function startExam() {
    const pool = [...filteredQuestions];
    const shuffled = pool
      .map((question) => ({ question, rank: Math.random() }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, Math.min(examQuestionCount, pool.length))
      .map((item) => item.question.questionId);
    setExamQuestionIds(shuffled);
    setExamStartedAt(new Date().toISOString());
    setExamRemainingSeconds(examMinutes * 60);
    setExamAnswers({});
    setExamFinishedResult(null);
    examSubmissionRef.current = false;
    setQuestionIndex(0);
    setQuestionMode("exam");
  }

  function finishExam() {
    if (examSubmissionRef.current) {
      return;
    }
    examSubmissionRef.current = true;
    const questions = examQuestionIds
      .map((questionId) => allQuestions.find((question) => question.questionId === questionId))
      .filter((question): question is QuestionItem => Boolean(question));
    const wrongQuestionIds: string[] = [];
    let correct = 0;
    for (const question of questions) {
      const answers = examAnswers[question.questionId] ?? [];
      const isCorrect = isQuestionAnswerCorrect(question, answers);
      if (isCorrect) {
        correct += 1;
      } else {
        wrongQuestionIds.push(question.questionId);
      }
      updateQuestionProgress(question.questionId, (progress) => recordQuestionAnswer(progress, isCorrect ? "correct" : "wrong"));
    }
    const domainMap = new Map<string, { domain: string; wrong: number; total: number }>();
    for (const question of questions) {
      const current = domainMap.get(question.domain) ?? { domain: question.domain, wrong: 0, total: 0 };
      current.total += 1;
      if (wrongQuestionIds.includes(question.questionId)) {
        current.wrong += 1;
      }
      domainMap.set(question.domain, current);
    }
    const finishedAt = new Date().toISOString();
    const startedAt = examStartedAt || finishedAt;
    const elapsedMinutes = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60) / 1000);
    const result: ExamResult = {
      id: `exam-${Date.now()}`,
      startedAt,
      finishedAt,
      total: questions.length,
      correct,
      accuracy: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0,
      minutes: elapsedMinutes,
      questionIds: questions.map((question) => question.questionId),
      wrongQuestionIds,
      weakDomains: [...domainMap.values()].filter((item) => item.wrong > 0).sort((a, b) => b.wrong - a.wrong),
      answers: Object.fromEntries(questions.map((question) => [question.questionId, [...(examAnswers[question.questionId] ?? [])]]))
    };
    setExamFinishedResult(result);
    setExamRemainingSeconds(0);
    setExamResults((items) => [result, ...items].slice(0, 20));
  }

  function clearLocalLearningData() {
    const storageKeys = [
      "six-sigma-study:vocab:v1",
      "six-sigma-study:notes:v1",
      "six-sigma-study:favorites:v1",
      "six-sigma-study:reader-position:v1",
      "six-sigma-study:daily-streak:v1",
      "six-sigma-study:question-bank:v1",
      "six-sigma-study:question-progress:v1",
      "six-sigma-study:exam-results:v1",
      chapterProgressStorageKey,
      aiStudyCacheStorageKey
    ];
    for (const key of storageKeys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // In-memory state is still reset when WebView storage is unavailable.
      }
    }
    try {
      const correctionKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith("six-sigma-study:context-corrections:v1:")));
      correctionKeys.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      clearContextCorrectionBundle(currentBookId);
    }
    setSavedTerms([]);
    setSavedNotes([]);
    setSavedFavorites([]);
    setChapterProgressMap({});
    setReaderPositions({});
    setQuestionProgress({});
    setExamResults([]);
    setUserQuestionBank(null);
    setQuestionMode("home");
    setQuestionSessionIds([]);
    setQuestionSessionAnswers({});
    setSubmittedQuestionIds([]);
    setExamQuestionIds([]);
    setExamStartedAt("");
    setExamRemainingSeconds(0);
    setExamAnswers({});
    setExamFinishedResult(null);
    examSubmissionRef.current = false;
    setFlashReviewActive(false);
    setFlashSessionIds([]);
    setFlashSessionGoal(0);
    setDailyStats(normalizeDailyStats(undefined));
    setActiveAiAssist(null);
    clearAiStudyCache();
    skipNextCorrectionPersistenceRef.current = true;
    setContextCorrectionBundle(loadContextCorrectionBundle(currentBookId, manual?.version ?? "0.2.0"));
  }

  function renderBookFilter(value: BookFilter, onChange: (bookId: BookFilter) => void) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="按教材筛选">
        <option value="all">全部教材</option>
        {studyBooks.map((book) => (
          <option key={book.bookId} value={book.bookId}>
            {book.title.zh}
          </option>
        ))}
      </select>
    );
  }

  function studyShell(
    title: string,
    subtitle: string,
    body: ReactNode,
    options: { hideNav?: boolean; session?: boolean } = {}
  ) {
    return (
      <main
        className={`appShell appFrame spatialStage page-${view}${activeLookup || activeAiAssist ? " panelOpen" : ""}${options.session ? " studySessionShell" : ""}`}
        data-app-view={view}
        data-book-id={currentBookId}
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <header className="appPageHeader">
          <div>
            <p className="eyebrow">{appViewKickers[view] ?? "学习"}</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>
        <div className="appPageContent">{body}</div>
        {!activeLookup && !activeAiAssist && !options.hideNav && renderMainNav()}
        {(activeLookup || activeAiAssist) && <div className="overlayBackdrop" aria-hidden="true" onClick={closeOverlayFromControl} />}
        {renderLookupSheet()}
        {renderAiAssistSheet()}
      </main>
    );
  }

  function renderLookupSheet() {
    if (!activeLookup) {
      return null;
    }
    const lookupState = aiLookupState.lookupId === activeLookupId(activeLookup)
      ? aiLookupState
      : { lookupId: activeLookupId(activeLookup), status: "idle" as const };
    const style = { "--sheet-height": `${sheetHeightVh}vh` } as CSSProperties;
    return (
      <section
        ref={overlayPanelRef}
        className="bottomSheet draggableSheet"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label="单词释义"
        tabIndex={-1}
      >
        <div className="sheetChrome">
          {sheetHandle()}
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">
                {activeLookup.questionSource ? `Question · ${activeLookup.questionSource.domain}` : `Page ${activeLookup.page}`}
              </p>
              <h2>{activeLookup.query}</h2>
            </div>
            <div className="sheetHeaderActions">
              <button
                className="saveButton compact"
                aria-label={savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.query)}`) ? "已加入词本" : "加入词本"}
                title={savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.query)}`) ? "已加入词本" : "加入词本"}
                onClick={saveActiveTerm}
              >
                {savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.query)}`)
                  ? <BookmarkCheck size={20} />
                  : <BookmarkPlus size={20} />}
              </button>
              <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
            </div>
          </div>
        </div>
        <div className="sheetScrollBody" data-sheet-scroll-body>
          <section className="dictionaryCard" aria-label="词典释义">
          <div className="dictionaryTitleRow">
            <div>
              <span>词典释义</span>
              <div className="dictionaryMetaLine">
                {activeLookup.entry.phonetic && <strong className="phonetic">/{activeLookup.entry.phonetic}/</strong>}
                {activeLookup.entry.partOfSpeech && <span className="partOfSpeech">{activeLookup.entry.partOfSpeech}</span>}
              </div>
            </div>
            <button
              className="iconAction pronounceIconButton"
              aria-label={`播放 ${activeLookup.query} 的英语发音`}
              title="播放英语发音"
              onClick={() => speakTerm(activeLookup.query)}
            >
              <Volume2 size={20} />
            </button>
          </div>
          <p className="dictionaryTranslation">{activeLookup.entry.translation}</p>
          {(activeLookup.entry.wordRoot || activeLookup.entry.wordForms?.length) && (
            <dl className="wordStructure">
              {activeLookup.entry.wordRoot && <><dt>原形 / 词根</dt><dd>{activeLookup.entry.wordRoot}</dd></>}
              {activeLookup.entry.wordForms?.length ? <><dt>常见词形</dt><dd>{activeLookup.entry.wordForms.join("；")}</dd></> : null}
            </dl>
          )}
          {activeLookup.entry.englishDefinition && (
            <details className="englishDefinition">
              <summary>查看英文释义</summary>
              <p lang="en">{activeLookup.entry.englishDefinition}</p>
            </details>
          )}
        </section>
          {pronunciationMessage && <p className="pronunciationMessage" role="status">{pronunciationMessage}</p>}
        <section className="contextMeaningCard">
          <span>本句中的意思</span>
          <strong>{activeLookup.context.meaning}</strong>
          <p>{activeLookup.context.explanation}</p>
        </section>
        {lookupState.status === "accepted" && lookupState.correction && (
          <section className="aiCorrectionCard accepted" aria-label="已采用的语境修订">
            <div className="aiCorrectionHeading">
              <span><ShieldCheck size={17} /> 已确认修订</span>
              <button onClick={revokeAcceptedCorrection}><RotateCcw size={16} />撤销</button>
            </div>
            <strong>{lookupState.correction.lexical.phrase}</strong>
            <p>{lookupState.correction.after.sentenceTranslationZh}</p>
          </section>
        )}
        {lookupState.status === "checking" && (
          <section className="aiCorrectionCard checking" role="status">
            <div className="aiCorrectionHeading"><span><Sparkles size={17} /> DeepSeek 正在核验语境</span></div>
            <p>只分析当前句及前后各一句，原有离线释义保持可用。</p>
          </section>
        )}
        {lookupState.status === "ready" && lookupState.correction && (
          <section className="aiCorrectionCard" aria-label="AI 语境修订建议">
            <div className="aiCorrectionHeading">
              <span><Sparkles size={17} /> AI 核验建议</span>
              <small>{lookupState.correction.provenance.model}</small>
            </div>
            <p className="aiPhrase" lang="en">{lookupState.correction.lexical.phrase}</p>
            <strong>{lookupState.correction.after.contextMeaningZh}</strong>
            <p>{lookupState.correction.after.sentenceTranslationZh}</p>
            <details>
              <summary>为什么这样理解</summary>
              <p>{lookupState.correction.after.explanationZh}</p>
              {lookupState.correction.after.alternativesZh.length > 0 && (
                <p className="aiAlternatives">备选：{lookupState.correction.after.alternativesZh.join("；")}</p>
              )}
            </details>
            {lookupState.similar && (
              <div className="similarCorrection">
                <span>相似已确认语境 · {Math.round(lookupState.similar.similarity * 100)}%</span>
                <strong>{lookupState.similar.correction.after.contextMeaningZh}</strong>
                <button onClick={() => acceptAiCorrection(true)}>采用已有译法</button>
              </div>
            )}
            <div className="aiCorrectionActions">
              <button className="primary" onClick={() => acceptAiCorrection(false)}>采用本次修订</button>
              <button onClick={rejectAiCorrection}>保留原释义</button>
            </div>
            {lookupState.usage && (
              <small className="aiUsage">本次 {lookupState.usage.promptTokens + lookupState.usage.completionTokens} tokens</small>
            )}
          </section>
        )}
        {lookupState.status === "error" && (
          <section className="aiCorrectionCard error" role="alert">
            <p>{lookupState.message}</p>
            <button onClick={() => void verifyLookupWithAi(activeLookup)}>重试核验</button>
          </section>
        )}
        {lookupState.status === "idle" && (
          <div className="aiLookupAction">
            {lookupState.message && <span>{lookupState.message}</span>}
            <button onClick={() => void verifyLookupWithAi(activeLookup)}>
              <Sparkles size={17} />
              {deepSeekKeyStatus.configured ? "AI 核验当前语境" : "配置 DeepSeek 后核验"}
            </button>
          </div>
        )}
        {activeLookup.entry.isSixSigmaTerm && <span className="termBadge">{activeBook?.domainLabel ?? "教材术语"}</span>}
        {activeLookup.questionSource && <span className="termBadge">题目来源 · {activeLookup.questionSource.chapterId}</span>}
        <div className="exampleBox">
          <strong>{activeLookup.questionSource ? "题目例句" : "教材例句"}</strong>
          <p lang="en">{activeLookup.context.exampleText}</p>
          <p className={activeLookup.context.exampleTranslation ? "" : "translationUnavailable"}>
            {activeLookup.context.exampleTranslation || "该私有题源暂未附经审核的中文译文。"}
          </p>
        </div>
          {activeLookup.questionSource ? (
          <button
            className="sourceButton"
            onClick={() => view === "questions" && questionMode !== "home"
              ? closeOverlayFromControl()
              : openQuestionAnchor(activeLookup.questionSource?.questionId)}
          >
            回到题目
          </button>
        ) : (
          <button className="sourceButton" onClick={() => selectSource(activeLookup.sectionId, activeLookup.blockId, activeLookup.page)}>
            回到原文位置
          </button>
          )}
        </div>
      </section>
    );
  }

  function renderAiAssistSheet() {
    if (!activeAiAssist) return null;
    const style = { "--sheet-height": `${sheetHeightVh}vh` } as CSSProperties;
    const title = activeAiAssist.kind === "reading" ? "AI 阅读简释" : "AI 题目精讲";
    return (
      <section
        ref={overlayPanelRef}
        className="bottomSheet draggableSheet aiAssistSheet"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheetChrome">
          {sheetHandle()}
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">{activeAiAssist.sourceLabel}</p>
              <h2>{title}</h2>
            </div>
            <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
          </div>
        </div>
        <div className="sheetScrollBody aiAssistBody" data-sheet-scroll-body>
          {activeAiAssist.kind === "reading" && (
            <blockquote className="aiSourceExcerpt" lang="en">{activeAiAssist.excerpt}</blockquote>
          )}
          <p className="aiPrivacyNote">
            <ShieldCheck size={16} /> 仅在你主动请求时发送当前选文或当前题目；结果只缓存在本机。
          </p>
          {activeAiAssist.status === "loading" && (
            <section className="aiAssistStatus" role="status">
              <Sparkles size={22} />
              <strong>{activeAiAssist.kind === "reading" ? "正在梳理语境与术语" : "正在整理考点与选项"}</strong>
              <span>原文和题库内容保持不变。</span>
            </section>
          )}
          {activeAiAssist.status === "needs-key" && (
            <section className="aiAssistStatus" role="status">
              <KeyRound size={22} />
              <strong>需要个人 DeepSeek API Key</strong>
              <span>{activeAiAssist.message}</span>
              <button className="primary" onClick={() => {
                closeOverlayForJump();
                navigateTo("settings");
              }}>前往“我的”配置</button>
            </section>
          )}
          {activeAiAssist.status === "error" && (
            <section className="aiAssistStatus error" role="alert">
              <strong>本次解释未完成</strong>
              <span>{activeAiAssist.message}</span>
              <button onClick={retryAiAssist}>重试</button>
            </section>
          )}
          {activeAiAssist.status === "ready" && activeAiAssist.kind === "reading" && activeAiAssist.result && (
            <div className="aiAssistResult">
              <section className="aiAnswerLead">
                <span>语境翻译</span>
                <strong>{activeAiAssist.result.translationZh}</strong>
                <p>{activeAiAssist.result.explanationZh}</p>
              </section>
              <section>
                <h3>Simple English</h3>
                <p lang="en">{activeAiAssist.result.plainEnglish}</p>
              </section>
              {activeAiAssist.result.terms.length > 0 && (
                <section>
                  <h3>关键术语</h3>
                  <div className="aiTermList">
                    {activeAiAssist.result.terms.map((term) => (
                      <article key={`${term.term}-${term.meaningZh}`}>
                        <strong lang="en">{term.term}</strong>
                        <span>{term.meaningZh}</span>
                        <p>{term.noteZh}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {activeAiAssist.result.grammarZh !== "无" && (
                <section>
                  <h3>句法提示</h3>
                  <p>{activeAiAssist.result.grammarZh}</p>
                </section>
              )}
            </div>
          )}
          {activeAiAssist.status === "ready" && activeAiAssist.kind === "question" && activeAiAssist.result && (
            <div className="aiAssistResult questionAiResult">
              <section className="aiAnswerLead">
                <span>题库答案</span>
                <strong>{activeAiAssist.correctAnswer.join(", ") || "待复核"}</strong>
                <p><b>{activeAiAssist.result.conceptZh}</b>：{activeAiAssist.result.explanationZh}</p>
              </section>
              <section>
                <h3>选项辨析</h3>
                <div className="aiOptionNotes">
                  {activeAiAssist.result.optionNotes.map((note) => (
                    <article key={`${note.optionId}-${note.verdict}`} data-verdict={note.verdict}>
                      <strong>{note.optionId}</strong>
                      <span>{note.verdict === "correct" ? "正确" : note.verdict === "partial" ? "不完整" : "错误"}</span>
                      <p>{note.noteZh}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section className="aiStudyTips">
                <p><strong>易错点</strong>{activeAiAssist.result.pitfallZh}</p>
                <p><strong>复习提示</strong>{activeAiAssist.result.reviewTipZh}</p>
              </section>
            </div>
          )}
          {activeAiAssist.status === "ready" && (
            <div className="aiAssistFooter">
              <span>
                {activeAiAssist.fromCache ? "本机缓存" : activeAiAssist.model || "DeepSeek"}
                {activeAiAssist.usage
                  ? ` · ${activeAiAssist.usage.promptTokens + activeAiAssist.usage.completionTokens} tokens`
                  : ""}
              </span>
              <button onClick={retryAiAssist} disabled={!deepSeekKeyStatus.configured}>重新生成</button>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderMainNav() {
    const items: { view: AppView; label: string; detail?: string; icon: ReactNode }[] = [
      { view: "home", label: "首页", detail: `${studyBooks.length}`, icon: <Home size={18} strokeWidth={2} /> },
      { view: "vocab", label: "单词", detail: `${allDueTerms.length}`, icon: <BookOpen size={18} strokeWidth={2} /> },
      { view: "questions", label: "刷题", detail: `${allQuestions.length}`, icon: <ClipboardCheck size={18} strokeWidth={2} /> },
      { view: "notes", label: "笔记", detail: `${savedNotes.length}`, icon: <NotebookPen size={18} strokeWidth={2} /> },
      { view: "settings", label: "我的", icon: <UserRound size={18} strokeWidth={2} /> }
    ];
    return (
      <nav className="mainNav" aria-label="主导航">
        {items.map((item) => (
          <button
            key={item.view}
            className={view === item.view ? "mainNavItem active" : "mainNavItem"}
            onClick={(event) => navigateTo(item.view, event.currentTarget)}
            aria-label={item.detail ? `${item.label}，${item.detail}` : item.label}
            aria-current={view === item.view ? "page" : undefined}
          >
            {item.icon}
            <strong>{item.label}</strong>
          </button>
        ))}
      </nav>
    );
  }

  if (view === "splash") {
    return (
      <main
        className="appShell splashShell spatialStage"
        data-app-view="splash"
        data-theme={readerPreferences.theme}
        data-text-scale={readerPreferences.textScale}
      >
        <section className="splashPanel" aria-label="启动画面">
          <div className="appLogo cinematic" aria-hidden="true">6σ</div>
          <div className="splashCopy">
            <p className="eyebrow">Study edition</p>
            <h1>Six Sigma Study</h1>
            <p className="splashLead">仅供学习与翻译研究，禁止商业使用。</p>
            <p className="splashLead" lang="en">For study and translation reference only. Non-commercial use.</p>
          </div>
        </section>
      </main>
    );
  }

  if (view === "home") {
    const books = studyBooks;
    const recentPosition = loadReaderPosition();
    const recentBook = books.find((book) => book.bookId === recentPosition.bookId) ?? books[0];
    const recentProgress = recentBook ? progressForBook(recentBook) : { percent: 0, label: "尚未开始" };
    const recentNotes = savedNotes.slice(0, 2);
    return studyShell(
      "学习工作台",
      "从上次停下的位置继续。",
      <>
        <section className="dashboardHero spatialWorkspace" aria-label="现在阅读">
          <header className="workspaceBrand">
            <p className="eyebrow">Six Sigma Study</p>
            <h1>现在阅读</h1>
          </header>
          <div className="workspacePageStack">
            <article className="workspaceFocus">
              <div className={`bookCover continueCover${recentBook?.coverImage ? " hasImage" : ""}`} aria-hidden="true">
                {recentBook?.coverImage
                  ? <img src={recentBook.coverImage} alt="" />
                  : <span>{recentBook?.cover ?? "6σ"}</span>}
              </div>
              <div className="continueReadingBody">
                <div className="workspaceFocusTop">
                  <p className="eyebrow">继续阅读</p>
                  <h3>{recentBook?.title.zh ?? "六西格玛黑带培训教材"}</h3>
                  <p>{recentBook?.subtitle?.zh ?? "中英对照学习版"}</p>
                </div>
                <div className="workspaceProgressCopy">
                  <strong>{recentProgress.label}</strong>
                  <span>{recentBook?.chapterCount ?? 0} 章</span>
                </div>
                <div className="workspaceProgressPath" aria-label={`教材进度 ${recentProgress.percent}%`}>
                  <span style={{ width: `${recentProgress.percent}%` }} />
                </div>
                <button className="primaryAction workspaceContinue" onClick={(event) => openBook(recentBook?.bookId ?? defaultBookId, event.currentTarget)}>
                  <span>{recentProgress.page ? "继续阅读" : "开始阅读"}</span>
                  <ArrowRight size={20} strokeWidth={1.8} />
                </button>
              </div>
            </article>
          </div>
        </section>
        <section className="homeLearningSection" aria-labelledby="today-learning-title">
          <div className="sectionHeader">
            <h2 id="today-learning-title">今日学习</h2>
          </div>
          <section className="metricGrid" aria-label="学习概览">
            <button onClick={(event) => navigateTo("vocab", event.currentTarget)}>
              <strong>{dailyStats.completed}/{dailyStats.goal}</strong>
              <span>今日目标</span>
            </button>
            <button onClick={(event) => navigateTo("questions", event.currentTarget)}>
              <strong>{allQuestions.length}</strong>
              <span>题库</span>
            </button>
            <button onClick={(event) => navigateTo("notes", event.currentTarget)}>
              <strong>{dailyStats.streak}</strong>
              <span>连续天数</span>
            </button>
          </section>
          <nav className="workspaceEdgeNav" aria-label="学习入口">
            <button onClick={(event) => navigateTo("vocab", event.currentTarget)}>
              <BookOpen size={20} strokeWidth={1.8} />
              <span>单词</span>
            </button>
            <button onClick={(event) => navigateTo("questions", event.currentTarget)}>
              <ClipboardCheck size={20} strokeWidth={1.8} />
              <span>刷题</span>
            </button>
            <button onClick={(event) => navigateTo("notes", event.currentTarget)}>
              <NotebookPen size={20} strokeWidth={1.8} />
              <span>笔记</span>
            </button>
            <button onClick={(event) => navigateTo("favorites", event.currentTarget)}>
              <BookmarkCheck size={20} strokeWidth={1.8} />
              <span>收藏</span>
            </button>
          </nav>
        </section>
        <div className="sectionHeader libraryHeader">
          <h2>教材</h2>
          <span>{books.length} 本</span>
        </div>
        <section className="bookGrid libraryShelf" aria-label="教材库">
          {books.map((book) => {
            const bookTerms = savedTerms.filter((item) => item.bookId === book.bookId);
            const bookNotes = savedNotes.filter((item) => item.bookId === book.bookId);
            const bookFavorites = savedFavorites.filter((item) => item.bookId === book.bookId);
            const progress = progressForBook(book);
            return (
              <article key={book.bookId} className="bookCard studyBookCard">
                <div className={`bookCover${book.coverImage ? " hasImage" : ""}`} aria-hidden="true">
                  {book.coverImage ? <img src={book.coverImage} alt="" /> : <span>{book.cover ?? "6σ"}</span>}
                </div>
                <div className="bookCardBody">
                  <p className="eyebrow">{book.bookId === "agent-import-sample" ? "练习样例" : book.subtitle?.zh ?? "中英对照学习版"}</p>
                  <h2>{book.title.zh}</h2>
                  <p>{book.title.en}</p>
                  <div className="bookProgress">
                    <span style={{ width: `${progress.percent}%` }} />
                  </div>
                  <div className="bookStats">
                    <span>{progress.label}</span>
                    <span>{book.chapterCount} 章</span>
                    <span>{bookTerms.length} 词</span>
                    <span>{bookNotes.length} 笔记</span>
                    <span>{bookFavorites.length} 收藏</span>
                  </div>
                  <button className="primaryAction" onClick={(event) => openBook(book.bookId, event.currentTarget)}>
                    {progress.page ? "继续阅读" : "开始学习"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        <section className="recentPanel" aria-label="最近笔记">
          <div className="sectionHeader">
            <h2>最近笔记</h2>
            <button onClick={(event) => navigateTo("notes", event.currentTarget)}>全部</button>
          </div>
          {recentNotes.length === 0 ? (
            <p className="emptyState compact">还没有笔记。阅读时选中文本即可摘录。</p>
          ) : (
            recentNotes.map((note) => (
              <button
                key={note.id}
                className="compactStudyItem"
                onClick={() => openSourceAnchor(note)}
              >
                <strong>{note.text}</strong>
                <span>{note.bookTitle} · p. {note.page}</span>
              </button>
            ))
          )}
        </section>
        {loadError && <p className="loadWarning">教材预载失败：{loadError}</p>}
        <p className="homeWatermark">Felix-Zuo · non-commercial study edition</p>
      </>
    );
  }

  if (view === "vocab") {
    if (flashReviewActive) {
      return studyShell(
        "单词学习",
        "根据回忆与语境选择自动安排复习。",
        <section className="flashReviewPanel" aria-label="单词复习">
          {flashReviewStage === "complete" ? (
            <section className="flashCompleteState">
              <p className="eyebrow">Session complete</p>
              <h2>本轮完成</h2>
              <strong>{flashSessionReviewed} 个词</strong>
              <p>今日进度 {dailyStats.completed}/{dailyStats.goal}</p>
              <button className="primaryAction" onClick={() => setFlashReviewActive(false)}>返回单词主页</button>
            </section>
          ) : !currentFlashTerm ? (
            <div className="emptyState">
              <strong>当前没有可复习词条</strong>
              <span>阅读或刷题时加入单词后，会进入这里复习。</span>
              <button className="readerControlButton" onClick={() => setFlashReviewActive(false)}>返回单词本</button>
            </div>
          ) : (
            <>
              <div className="studySessionBar">
                <button className="closeButton" onClick={() => setFlashReviewActive(false)}>退出</button>
                <div className="sessionProgressTrack" aria-label="复习进度">
                  <span style={{ width: `${Math.round((flashSessionReviewed / Math.max(1, flashSessionIds.length)) * 100)}%` }} />
                </div>
                <strong>{flashSessionReviewed + 1}/{flashSessionIds.length}</strong>
              </div>
              <article className="flashCard">
                <p className="eyebrow">
                  {currentFlashTerm.sourceType === "question" ? "题目来源单词" : currentFlashTerm.bookTitle}
                </p>
                <h2>{currentFlashTerm.term}</h2>
                <div className="flashTermMeta">
                  {(currentFlashEntry?.phonetic || currentFlashTerm.phonetic) && (
                    <span className="phonetic">/{currentFlashEntry?.phonetic || currentFlashTerm.phonetic}/</span>
                  )}
                  {(currentFlashEntry?.partOfSpeech || currentFlashTerm.partOfSpeech) && (
                    <span>{currentFlashEntry?.partOfSpeech || currentFlashTerm.partOfSpeech}</span>
                  )}
                  <button
                    className="iconAction pronounceIconButton"
                    aria-label={`播放 ${currentFlashTerm.term} 的英语发音`}
                    title="播放英语发音"
                    onClick={() => speakTerm(currentFlashTerm.term)}
                  >
                    <Volume2 size={20} />
                  </button>
                </div>
                {pronunciationMessage && <p className="pronunciationMessage" role="status">{pronunciationMessage}</p>}
                {flashReviewStage === "prompt" && (
                  <div className="flashPromptActions">
                    <p className="flashHint">先回忆它在原文里的意思。</p>
                    <button className="primaryAction" onClick={() => setFlashReviewStage("quiz")}>想起来了</button>
                    <button onClick={() => {
                      setFlashQuizSelection("__unknown__");
                      setFlashReviewStage("answer");
                    }}>暂时想不起来</button>
                  </div>
                )}
                {flashReviewStage === "quiz" && (
                  <div className="flashQuiz">
                    <p>它在当前语境中的意思是：</p>
                    {flashQuizOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setFlashQuizSelection(option);
                          setFlashReviewStage("answer");
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
                {flashReviewStage === "answer" && (
                  <div className="flashAnswer">
                    {flashQuizSelection !== "__unknown__" && (
                      <p className={flashQuizSelection === savedTermStudyMeaning(currentFlashTerm) ? "answerFeedback correct" : "answerFeedback wrong"}>
                        {flashQuizSelection === savedTermStudyMeaning(currentFlashTerm)
                          ? "选择正确。请按真实记忆程度安排下次复习。"
                          : "选择不符。看完语境后再评估本次记忆。"}
                      </p>
                    )}
                    <section className="flashDictionarySummary">
                      <span>常用释义</span>
                      <p className="dictionaryTranslation">{currentFlashEntry?.translation || currentFlashTerm.translation}</p>
                      {(currentFlashEntry?.wordRoot || currentFlashTerm.wordRoot) && (
                        <p className="wordRootLine">原形 / 词根：{currentFlashEntry?.wordRoot || currentFlashTerm.wordRoot}</p>
                      )}
                      {(currentFlashEntry?.wordForms?.length || currentFlashTerm.wordForms?.length) ? (
                        <p className="wordRootLine">词形：{(currentFlashEntry?.wordForms || currentFlashTerm.wordForms)?.join("；")}</p>
                      ) : null}
                    </section>
                    <section className="contextMeaningCard compact">
                      <span>本句中的意思</span>
                      <p className="translation">{savedTermStudyMeaning(currentFlashTerm)}</p>
                      <p>{currentFlashTerm.contextExplanation || "结合下面的原句理解并重新记忆。"}</p>
                    </section>
                    <div className="flashExample">
                      <strong>例句</strong>
                      <p lang="en">{currentFlashTerm.exampleText || currentFlashTerm.sourceText}</p>
                      <p className={(currentFlashTerm.exampleTranslation || currentFlashTerm.sourceTranslation) ? "" : "translationUnavailable"}>
                        {currentFlashExampleTranslation || "该私有题源暂未附经审核的中文译文。"}
                      </p>
                    </div>
                    <div className="sourceLine">
                      {currentFlashTerm.sourceType === "question" ? "题目" : currentFlashTerm.chapterTitle} · p. {currentFlashTerm.sourcePage ?? currentFlashTerm.page}
                    </div>
                    <div className="flashRatingActions" aria-label="本次记忆程度">
                      <button onClick={() => reviewSavedTerm(currentFlashTerm.id, "again")}>不认识</button>
                      <button onClick={() => reviewSavedTerm(currentFlashTerm.id, "fuzzy")}>模糊</button>
                      <button className="primaryAction" onClick={() => reviewSavedTerm(currentFlashTerm.id, "remembered")}>认识</button>
                    </div>
                  </div>
                )}
              </article>
            </>
          )}
        </section>,
        { hideNav: true, session: true }
      );
    }

    return studyShell(
      "单词本",
      "今日计划与语境词库",
      <>
        <div className="vocabModeTabs" role="tablist" aria-label="单词页面">
          <button className={vocabPageMode === "plan" ? "active" : ""} onClick={() => setVocabPageMode("plan")}>学习</button>
          <button className={vocabPageMode === "library" ? "active" : ""} onClick={() => setVocabPageMode("library")}>词库</button>
        </div>
        {vocabPageMode === "plan" ? (
          <>
            <section className="vocabPlanHero" aria-label="今日学习状态">
              <div>
                <p className="eyebrow">Today</p>
                <h2>{plannedFlashCount} 个待学</h2>
                <p>{dailyStats.checkedInToday ? "今日已完成" : `连续学习 ${dailyStats.streak} 天`}</p>
                {dailyStats.missedDays > 0 && <small>今日计划已包含补学内容，并设有数量上限。</small>}
              </div>
              <div className="planProgressRing" style={{ "--progress": `${Math.min(100, Math.round((dailyStats.completed / Math.max(1, plannedDailyGoal)) * 100))}%` } as CSSProperties}>
                <strong>{dailyStats.completed}/{plannedDailyGoal}</strong>
              </div>
            </section>
            <button
              className="primaryAction vocabStartButton"
              onClick={startFlashReview}
              disabled={plannedFlashCount === 0 || !flashDictionaryReady}
              aria-busy={!flashDictionaryReady && plannedFlashCount > 0}
            >
              {plannedFlashCount === 0
                ? "暂无到期复习"
                : !flashDictionaryReady
                  ? "正在准备词典"
                  : dailyStats.checkedInToday
                    ? "继续巩固"
                    : "开始今日学习"}
            </button>
            <section className="vocabSourceSummary">
              <div><strong>{savedTerms.filter((item) => item.sourceType === "manual").length}</strong><span>教材词语</span></div>
              <div><strong>{savedTerms.filter((item) => item.sourceType === "question").length}</strong><span>题目词语</span></div>
              <div><strong>{savedTerms.filter((item) => item.status === "mastered").length}</strong><span>已掌握</span></div>
            </section>
            <section className="recentTerms">
              <div className="sectionHeaderRow"><h2>最近加入</h2><button onClick={() => setVocabPageMode("library")}>查看全部</button></div>
              {recentStudyTerms.length === 0 ? (
                <p className="emptyState compact">还没有加入单词。</p>
              ) : (
                recentStudyTerms.slice(0, 4).map((item) => (
                  <article key={item.id}>
                    <div><strong>{item.term}</strong><span>{savedTermStudyMeaning(item)}</span></div>
                    <small>{item.sourceType === "question" ? "题目" : item.chapterTitle}</small>
                  </article>
                ))
              )}
            </section>
          </>
        ) : (
          <>
            <section className="studyToolbar">
              {renderBookFilter(studyBookFilter, setStudyBookFilter)}
              <input
                type="search"
                value={vocabQuery}
                onChange={(event) => setVocabQuery(event.target.value)}
                placeholder="搜索单词、语境义或原句"
              />
              <select value={vocabSort} onChange={(event) => setVocabSort(event.target.value as VocabSort)}>
                <option value="recent">最近保存</option>
                <option value="due">复习时间</option>
                <option value="page">教材页码</option>
              </select>
            </section>
            <section className="studyList vocabLibraryList">
              {filteredStudyTerms.length === 0 ? (
                <div className="emptyState">
                  <strong>还没有可复习的词条</strong>
                  <span>英文阅读或刷题时点击词语即可加入。</span>
                  <button className="readerControlButton" onClick={() => openBook(studyBookFilter === "all" ? defaultBookId : studyBookFilter)}>去阅读</button>
                </div>
              ) : filteredStudyTerms.map((item) => (
                <article key={item.id} className="studyItem vocabLibraryItem">
                  <div>
                    <p className="eyebrow">{item.sourceType === "question" ? `题目 · ${item.sourceDomain ?? "综合"}` : `${item.bookTitle} · p. ${item.page}`}</p>
                    <h2>{item.term}</h2>
                    <p>{savedTermStudyMeaning(item)}</p>
                    <details>
                      <summary>查看语境</summary>
                      <p>{item.contextExplanation}</p>
                      <blockquote lang="en">{item.exampleText || item.sourceText}</blockquote>
                      {(item.exampleTranslation || item.sourceTranslation) && <blockquote>{item.exampleTranslation || item.sourceTranslation}</blockquote>}
                    </details>
                  </div>
                  <div className="studyItemActions">
                    <button onClick={() => item.sourceType === "question" ? openQuestionAnchor(item.sourceQuestionId) : openSourceAnchor(item)}>
                      {item.sourceType === "question" ? "回到题目" : "回到原文"}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </>
    );
  }

  if (view === "questions") {
    const renderedQuestion = currentQuestion;
    const examQuestions = examQuestionIds
      .map((questionId) => allQuestions.find((question) => question.questionId === questionId))
      .filter((question): question is QuestionItem => Boolean(question));
    const currentExamQuestion = examQuestions[Math.min(questionIndex, Math.max(0, examQuestions.length - 1))];

    function renderQuestionFilters() {
      return (
        <section className="questionFilters" aria-label="题目筛选">
          <select value={questionDomainFilter} onChange={(event) => setQuestionDomainFilter(event.target.value)}>
            <option value="all">全部知识域</option>
            {questionDomains.map((domain) => (
              <option key={domain} value={domain}>{domain}</option>
            ))}
          </select>
          <select value={questionChapterFilter} onChange={(event) => setQuestionChapterFilter(event.target.value)}>
            <option value="all">全部章节</option>
            {questionChapters.map((chapter) => (
              <option key={chapter} value={chapter}>{chapter}</option>
            ))}
          </select>
          <select value={questionDifficultyFilter} onChange={(event) => setQuestionDifficultyFilter(event.target.value as DifficultyFilter)}>
            <option value="all">全部难度</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </section>
      );
    }

    function renderQuestionCard(
      question: QuestionItem,
      variant: "browse" | "practice" | "exam-result",
      answerSelection = selectedQuestionAnswers
    ) {
      const progress = progressForQuestion(questionProgress, question.questionId);
      const submitted = submittedQuestionIds.includes(question.questionId);
      const showAnswer = variant === "browse" || variant === "exam-result" || revealedQuestionId === question.questionId;
      return (
        <article className="questionCard" data-question-id={question.questionId}>
          <div className="questionMeta">
            <span>{question.domain}</span>
            <span>{question.chapterId}</span>
            <span>{question.difficulty}</span>
            <span>{question.sourceType === "user-private" ? "私有" : "样例"}</span>
          </div>
          <h2>{renderQuestionText(questionText(question.stem), question, question.stem.zh, true)}</h2>
          <div className="questionOptions">
            {question.options.map((option) => {
              const selected = answerSelection.includes(option.id);
              const correct = question.correctAnswer.includes(option.id);
              const className = [
                "questionOption",
                selected ? "selected" : "",
                showAnswer && correct ? "correct" : "",
                showAnswer && selected && !correct ? "wrong" : ""
              ].filter(Boolean).join(" ");
              return (
                <div
                  key={option.id}
                  className={className}
                  role="button"
                  tabIndex={variant === "browse" || variant === "exam-result" || submitted ? -1 : 0}
                  aria-disabled={variant === "browse" || variant === "exam-result" || submitted}
                  onClick={() => {
                    if (variant !== "browse" && variant !== "exam-result" && !submitted) {
                      selectQuestionOption(question, option.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (variant !== "browse" && variant !== "exam-result" && !submitted && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      selectQuestionOption(question, option.id);
                    }
                  }}
                >
                  <strong>{option.id}</strong>
                  <span>{renderQuestionText(questionLanguage === "zh" ? option.zh || option.en : option.en || option.zh, question, option.zh)}</span>
                </div>
              );
            })}
          </div>
          {variant !== "exam-result" && (
            <div className="questionActions">
              <button onClick={() => toggleCurrentQuestionFavorite(question)}>
                {progress.favorite ? "已收藏" : "收藏"}
              </button>
              <button className="aiHelpButton" onClick={() => askAiAboutQuestion(question, answerSelection)}>
                <Sparkles size={17} /> AI 精讲
              </button>
              {variant === "browse" ? (
                <>
                  <button onClick={() => markCurrentQuestionSeen(question)}>标记已看</button>
                  <button className="primary" disabled={submitted} onClick={() => markQuestionCorrectFromBrowse(question)}>
                    {submitted ? "已记录" : "确认答对"}
                  </button>
                </>
              ) : (
                <>
                  <button disabled={submitted} onClick={() => markQuestionUnknown(question)}>不会</button>
                  <button className="primary" disabled={answerSelection.length === 0 || submitted} onClick={() => submitQuestionAnswer(question)}>
                    {submitted ? "已提交" : "提交"}
                  </button>
                </>
              )}
            </div>
          )}
          {showAnswer && (
            <section className="answerPanel">
              {variant !== "browse" && (
                <p><strong>你的答案：</strong>{answerSelection.join(", ") || "未作答"}</p>
              )}
              <p><strong>答案：</strong>{question.correctAnswer.join(", ") || "待复核"}</p>
              <p>{renderQuestionText(questionText(question.explanation) || "待补充精讲", question, question.explanation.zh)}</p>
              <small>{question.sourceRef}</small>
            </section>
          )}
        </article>
      );
    }

    function renderQuestionRunner() {
      const listLabel = questionMode === "wrong"
        ? `${currentQuestionList.length} 道错题`
        : questionMode === "favorite"
          ? `${currentQuestionList.length} 道收藏题`
          : `${currentQuestionList.length} 道题`;
      if (!renderedQuestion) {
        return (
          <div className="emptyState">
            <strong>当前没有匹配题目</strong>
            <span>调整筛选条件，或导入本机私有题库 JSON。</span>
          </div>
        );
      }
      return (
        <>
          <div className="questionProgressLine">
            <span>{listLabel}</span>
            <span>{Math.min(questionIndex + 1, currentQuestionList.length)} / {currentQuestionList.length}</span>
          </div>
          {renderQuestionCard(renderedQuestion, questionMode === "browse" ? "browse" : "practice")}
          <div className="questionPager">
            <button onClick={() => moveToQuestion(questionIndex - 1)} disabled={questionIndex <= 0}>上一题</button>
            {questionIndex >= currentQuestionList.length - 1 ? (
              <button className="primary" onClick={() => setQuestionMode("home")}>完成本轮</button>
            ) : (
              <button onClick={() => moveToNextQuestion()}>下一题</button>
            )}
          </div>
        </>
      );
    }

    function renderExamMode() {
      if (examFinishedResult) {
        return (
          <section className="examResult">
            <div className="scoreBlock">
              <strong>{examFinishedResult.accuracy}%</strong>
              <span>{examFinishedResult.correct}/{examFinishedResult.total} 正确</span>
              <small>用时 {formatExamElapsed(examFinishedResult.minutes)}</small>
            </div>
            <div className="weakDomainList">
              {examFinishedResult.weakDomains.length === 0 ? (
                <span>本次没有明显薄弱知识域。</span>
              ) : (
                examFinishedResult.weakDomains.map((item) => (
                  <span key={item.domain}>{item.domain}: {item.wrong}/{item.total}</span>
                ))
              )}
            </div>
            <div className="questionStack">
              {examQuestions.map((question) =>
                renderQuestionCard(question, "exam-result", examFinishedResult.answers?.[question.questionId] ?? [])
              )}
            </div>
            <div className="examResultActions">
              <button className="primary" onClick={() => startPractice("exam")}>再考一次</button>
              <button onClick={() => setQuestionMode("home")}>返回题库</button>
            </div>
          </section>
        );
      }

      if (examQuestionIds.length === 0) {
        return (
          <section className="examSetup">
            <label>
              题量
              <input
                type="number"
                min={1}
                max={Math.max(1, filteredQuestions.length)}
                value={examQuestionCount}
                onChange={(event) => setExamQuestionCount(Number(event.target.value))}
              />
            </label>
            <label>
              时间（分钟）
              <input
                type="number"
                min={5}
                max={240}
                value={examMinutes}
                onChange={(event) => setExamMinutes(Number(event.target.value))}
              />
            </label>
            <button className="primaryAction" onClick={startExam} disabled={filteredQuestions.length === 0}>开始模拟考试</button>
          </section>
        );
      }

      if (!currentExamQuestion) {
        return <p className="emptyState">本次考试题目为空。</p>;
      }

      const currentAnswer = examAnswers[currentExamQuestion.questionId] ?? [];
      return (
        <section className="examSession">
          <div className="questionProgressLine">
            <span className={examRemainingSeconds <= 60 ? "examCountdown urgent" : "examCountdown"} aria-live="polite">
              剩余 {formatExamCountdown(examRemainingSeconds)}
            </span>
            <span>{questionIndex + 1} / {examQuestions.length}</span>
          </div>
          <article className="questionCard" data-question-id={currentExamQuestion.questionId}>
            <div className="questionMeta">
              <span>{currentExamQuestion.domain}</span>
              <span>{currentExamQuestion.difficulty}</span>
              <span>{questionLanguage === "zh" ? "中文" : "EN"}</span>
            </div>
            <h2>{renderQuestionText(questionText(currentExamQuestion.stem), currentExamQuestion, currentExamQuestion.stem.zh, true)}</h2>
            <div className="questionOptions">
              {currentExamQuestion.options.map((option) => {
                const selected = currentAnswer.includes(option.id);
                return (
                  <div
                    key={option.id}
                    className={selected ? "questionOption selected" : "questionOption"}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setExamAnswers((answers) => {
                        const existing = answers[currentExamQuestion.questionId] ?? [];
                        const next =
                          currentExamQuestion.questionType === "multiple"
                            ? existing.includes(option.id)
                              ? existing.filter((item) => item !== option.id)
                              : [...existing, option.id]
                            : [option.id];
                        return { ...answers, [currentExamQuestion.questionId]: next };
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExamAnswers((answers) => {
                          const existing = answers[currentExamQuestion.questionId] ?? [];
                          const next = currentExamQuestion.questionType === "multiple"
                            ? existing.includes(option.id)
                              ? existing.filter((item) => item !== option.id)
                              : [...existing, option.id]
                            : [option.id];
                          return { ...answers, [currentExamQuestion.questionId]: next };
                        });
                      }
                    }}
                  >
                    <strong>{option.id}</strong>
                    <span>{renderQuestionText(questionLanguage === "zh" ? option.zh || option.en : option.en || option.zh, currentExamQuestion, option.zh)}</span>
                  </div>
                );
              })}
            </div>
          </article>
          <div className="questionPager">
            <button onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))} disabled={questionIndex <= 0}>上一题</button>
            {questionIndex >= examQuestions.length - 1 ? (
              <button className="primary" onClick={finishExam}>交卷</button>
            ) : (
              <button onClick={() => setQuestionIndex((index) => index + 1)}>下一题</button>
            )}
          </div>
        </section>
      );
    }

    if (questionMode === "home") {
      return studyShell(
        "题库训练",
        "按进度练习、复盘错题和模拟考试",
        <>
          <section className="questionDashboardHero">
            <div>
              <p className="eyebrow">Question training</p>
              <h2>{questionSummary.answered}/{allQuestions.length}</h2>
              <p>已练题目 · 正确率 {questionSummary.accuracy}%</p>
            </div>
            <div className="questionProgressRing" style={{ "--progress": `${Math.round((questionSummary.answered / Math.max(1, allQuestions.length)) * 100)}%` } as CSSProperties}>
              <Target size={24} />
            </div>
          </section>

          <button className="primaryAction questionContinueButton" onClick={() => startPractice("practice", true)}>
            <Play size={19} fill="currentColor" />
            {questionSummary.answered > 0 ? "继续练习" : "开始练习"}
          </button>

          <section className="questionModeCards" aria-label="刷题模式">
            <button onClick={() => startPractice("browse")}>
              <Eye size={22} /><span><strong>看题</strong><small>答案与精讲</small></span>
            </button>
            <button onClick={() => startPractice("practice")}>
              <ListChecks size={22} /><span><strong>顺序练习</strong><small>{filteredQuestions.length} 道</small></span>
            </button>
            <button onClick={() => startPractice("wrong")}>
              <RotateCcw size={22} /><span><strong>错题复习</strong><small>{wrongQuestions.length} 道</small></span>
            </button>
            <button onClick={() => startPractice("favorite")}>
              <BookmarkCheck size={22} /><span><strong>收藏题</strong><small>{favoriteQuestions.length} 道</small></span>
            </button>
            <button onClick={() => startPractice("exam")}>
              <Timer size={22} /><span><strong>模拟考试</strong><small>{examResults.length} 次记录</small></span>
            </button>
          </section>

          <section className="questionSpecialPanel">
            <div className="sectionHeaderRow"><h2>专项练习</h2><span>{filteredQuestions.length} 道</span></div>
            {renderQuestionFilters()}
          </section>

          <section className="weakPanel">
            <h2>薄弱知识点</h2>
            {weakDomains.length === 0 ? <p>完成练习后会显示需要加强的知识域。</p> : (
              weakDomains.map((item) => <span key={item.domain}>{item.domain} · {item.wrong}/{item.total}</span>)
            )}
          </section>

          <details className="questionBankManager">
            <summary>本机题库管理</summary>
            <p>
              {bundledQuestionBank
                ? `本机内置 ${bundledQuestionBank.questions.length} 道题`
                : userQuestionBank
                  ? `已导入私有题库 ${userQuestionBank.questions.length} 道`
                  : `当前可用 ${allQuestions.length} 道题`}
            </p>
            <label>
              导入本机 JSON
              <input type="file" accept="application/json,.json" onChange={(event) => void importPrivateQuestionBank(event.currentTarget.files?.[0])} />
            </label>
            {questionImportMessage && <small>{questionImportMessage}</small>}
          </details>
        </>
      );
    }

    const sessionTitle = questionMode === "browse"
      ? "看题"
      : questionMode === "wrong"
        ? "错题复习"
        : questionMode === "favorite"
          ? "收藏题"
          : questionMode === "exam"
            ? "模拟考试"
            : "顺序练习";
    return studyShell(
      sessionTitle,
      "",
      <section className="questionSession">
        <div className="questionSessionTopbar">
          <button aria-label="返回题库主页" onClick={returnToQuestionHome}><ArrowLeft size={21} /></button>
          <strong>{sessionTitle}</strong>
          <button
            aria-label="切换题目语言"
            onClick={() => runSpatialTransition("language", () => setQuestionLanguage(questionLanguage === "zh" ? "en" : "zh"))}
          >
            <Languages size={20} /><span>{questionLanguage === "zh" ? "EN" : "中"}</span>
          </button>
        </div>
        {questionMode === "exam" ? renderExamMode() : renderQuestionRunner()}
      </section>,
      { hideNav: true, session: true }
    );
  }

  if (view === "notes") {
    return studyShell(
      "笔记",
      "整理摘录、复习疑问，并回到对应段落。",
      <>
        <section className="studyToolbar">
          {renderBookFilter(studyBookFilter, setStudyBookFilter)}
          <input
            type="search"
            value={notesQuery}
            onChange={(event) => setNotesQuery(event.target.value)}
            placeholder="搜索摘录、笔记、章节"
          />
          <select value={notesSort} onChange={(event) => setNotesSort(event.target.value as NotesSort)}>
            <option value="updated">最近更新</option>
            <option value="page">教材页码</option>
          </select>
        </section>
        <section className="studyList">
          {filteredStudyNotes.length === 0 ? (
            <div className="emptyState">
              <strong>还没有笔记</strong>
              <span>阅读时选中文本并点击摘录，可以把疑问和理解保存到这里。</span>
              <button className="readerControlButton" onClick={() => openBook(studyBookFilter === "all" ? defaultBookId : studyBookFilter)}>
                去阅读
              </button>
            </div>
          ) : (
            filteredStudyNotes.map((item) => (
              <article key={item.id} className="studyItem noteStudyItem">
                <div>
                  <p className="eyebrow">{item.bookTitle} · p. {item.page}</p>
                  <blockquote>{item.text}</blockquote>
                  <textarea
                    value={item.note}
                    onChange={(event) => updateSavedNote(item.id, event.target.value)}
                    placeholder="写下理解、疑问或复习提示"
                  />
                </div>
                <div className="studyItemActions">
                  <button onClick={() => openSourceAnchor(item)}>原文</button>
                  <button onClick={() => deleteSavedNote(item.id)}>删除</button>
                </div>
              </article>
            ))
          )}
        </section>
      </>
    );
  }

  if (view === "favorites") {
    return studyShell(
      "收藏",
      "保存重点页、段落和图表，复习时直接回到原文。",
      <>
        <section className="studyToolbar">
          {renderBookFilter(studyBookFilter, setStudyBookFilter)}
          <input
            type="search"
            value={favoritesQuery}
            onChange={(event) => setFavoritesQuery(event.target.value)}
            placeholder="搜索收藏标题、章节、备注"
          />
          <select value={favoritesSort} onChange={(event) => setFavoritesSort(event.target.value as FavoritesSort)}>
            <option value="recent">最近收藏</option>
            <option value="page">教材页码</option>
          </select>
        </section>
        <section className="studyList">
          {filteredFavorites.length === 0 ? (
            <div className="emptyState">
              <strong>还没有收藏</strong>
              <span>阅读器顶部的收藏按钮可以保存重点段落、页面或图表。</span>
              <button className="readerControlButton" onClick={() => openBook(studyBookFilter === "all" ? defaultBookId : studyBookFilter)}>
                去阅读
              </button>
            </div>
          ) : (
            filteredFavorites.map((item) => (
              <article key={item.id} className="studyItem">
                <div>
                  <p className="eyebrow">{item.bookTitle} · p. {item.page}</p>
                  <h2>{item.title}</h2>
                  <p>{item.chapterTitle}</p>
                </div>
                <div className="studyItemActions">
                  <button onClick={() => openSourceAnchor(item)}>原文</button>
                  <button onClick={() => deleteFavorite(item.id)}>取消</button>
                </div>
              </article>
            ))
          )}
        </section>
      </>
    );
  }

  if (view === "settings") {
    return studyShell(
      "我的",
      "显示偏好、来源说明和本地学习数据管理。",
      <>
        <section className="settingsPanel">
          <h2>显示</h2>
          <div className="settingsRow">
            <span>主题</span>
            <button onClick={toggleTheme}>{readerPreferences.theme === "dark" ? "亮色" : "深色"}</button>
          </div>
          <div className="settingsRow">
            <span>字号</span>
            <div className="inlineActions">
              <button onClick={() => updateTextScale(-1)} disabled={textScaleIndex === 0}>A-</button>
              <button onClick={() => updateTextScale(1)} disabled={textScaleIndex === textScaleOrder.length - 1}>A+</button>
            </div>
          </div>
        </section>
        <section className="settingsPanel aiSettingsPanel">
          <div className="settingsTitleRow">
            <div>
              <h2>AI 学习助教</h2>
              <span>{deepSeekKeyStatus.configured ? "已配置" : "未配置"}</span>
            </div>
            <KeyRound size={20} />
          </div>
          <p>用于查词核验、选文简释和题目精讲。只有主动点击时，才会发送当前学习片段。</p>
          <label className="apiKeyField">
            <span>DeepSeek API Key</span>
            <input
              type="password"
              value={deepSeekKeyDraft}
              onChange={(event) => setDeepSeekKeyDraft(event.target.value)}
              placeholder={deepSeekKeyStatus.configured ? "输入新 Key 可替换" : "sk-…"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="inlineActions aiSettingsActions">
            <button onClick={() => void saveDeepSeekKeyFromSettings()} disabled={!deepSeekKeyDraft.trim()}>安全保存</button>
            <button onClick={() => void testDeepSeekFromSettings()} disabled={!deepSeekKeyStatus.configured}>测试连接</button>
            <button onClick={() => void clearDeepSeekFromSettings()} disabled={!deepSeekKeyStatus.configured}>清除</button>
          </div>
          <p className="securityNote">
            <ShieldCheck size={15} />
            {deepSeekKeyStatus.storage === "android-keystore" ? "Android Keystore 加密存储" : "浏览器仅保留本次会话"}
          </p>
          <div className="settingsRow correctionExportRow">
            <span>已确认修订 {contextCorrectionBundle.corrections.filter((item) => item.status === "accepted").length}</span>
            <button onClick={() => void exportAcceptedCorrections()}>
              <Download size={16} />导出 JSON
            </button>
          </div>
          {aiSettingsMessage && <p className="settingsMessage" role="status">{aiSettingsMessage}</p>}
        </section>
        <section className="settingsPanel">
          <h2>来源与边界</h2>
          <p>版本 {productVersionLabel}</p>
          <p>{activeBook?.licenseNotice.zh ?? fallbackCatalog.books[0].licenseNotice.zh}</p>
          <p lang="en">{activeBook?.licenseNotice.en ?? fallbackCatalog.books[0].licenseNotice.en}</p>
          <a href={githubProfileUrl} target="_blank" rel="noreferrer">GitHub: Felix-Zuo</a>
        </section>
        <section className="settingsPanel">
          <h2>本地数据</h2>
          <p>词本、笔记、收藏、章节进度、AI 结果缓存和阅读位置保存在本机。当前没有云同步。</p>
          <button
            className="dangerButton"
            onClick={() => {
              if (!window.confirm("清除本机词本、笔记、收藏、章节进度、AI 缓存和阅读位置？")) {
                return;
              }
              clearLocalLearningData();
            }}
          >
            清除本地学习数据
          </button>
        </section>
      </>
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
  const sheetStyle = { "--sheet-height": `${sheetHeightVh}vh` } as CSSProperties;

  function snapSheetHeight(value: number) {
    const snapPoints = [46, 72, 92];
    const nearest = snapPoints.reduce((best, point) =>
      Math.abs(point - value) < Math.abs(best - value) ? point : best
    );
    setSheetHeightVh(nearest);
  }

  function beginSheetDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic CDP PointerEvents do not always have an active pointer capture target.
    }
    sheetDragRef.current = {
      startY: event.clientY,
      startHeight: sheetHeightVh,
      currentHeight: sheetHeightVh
    };
  }

  function moveSheetDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = sheetDragRef.current;
    if (!drag) {
      return;
    }
    event.preventDefault();
    const deltaVh = ((drag.startY - event.clientY) / Math.max(1, window.innerHeight)) * 100;
    const nextHeight = clamp(drag.startHeight + deltaVh, 34, 94);
    sheetDragRef.current = { ...drag, currentHeight: nextHeight };
    setSheetHeightVh(nextHeight);
  }

  function endSheetDrag() {
    const drag = sheetDragRef.current;
    if (!drag) {
      return;
    }
    sheetDragRef.current = null;
    if (drag.currentHeight < 38) {
      closeOverlayFromControl();
      return;
    }
    snapSheetHeight(drag.currentHeight);
  }

  function handleSheetHandleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const snapPoints = [46, 72, 92];
    let nextHeight: number | undefined;
    if (event.key === "Home") {
      nextHeight = snapPoints[0];
    } else if (event.key === "End") {
      nextHeight = snapPoints[snapPoints.length - 1];
    } else if (event.key === "ArrowUp") {
      nextHeight = snapPoints.find((point) => point > sheetHeightVh) ?? snapPoints[snapPoints.length - 1];
    } else if (event.key === "ArrowDown") {
      nextHeight = [...snapPoints].reverse().find((point) => point < sheetHeightVh) ?? snapPoints[0];
    }
    if (nextHeight === undefined) {
      return;
    }
    event.preventDefault();
    setSheetHeightVh(nextHeight);
  }

  function sheetHandle() {
    return (
      <div
        className="sheetHandle"
        role="separator"
        tabIndex={0}
        aria-label="调整面板高度"
        aria-orientation="horizontal"
        aria-valuemin={46}
        aria-valuemax={92}
        aria-valuenow={Math.round(sheetHeightVh)}
        aria-valuetext={`面板高度 ${Math.round(sheetHeightVh)}%`}
        onPointerDown={beginSheetDrag}
        onPointerMove={moveSheetDrag}
        onPointerUp={endSheetDrag}
        onPointerCancel={endSheetDrag}
        onKeyDown={handleSheetHandleKeyDown}
      />
    );
  }

  function closeOverlay() {
    setActiveLookup(null);
    setActiveAiAssist(null);
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
    closeOverlay();
    if (overlayHistoryRef.current) {
      overlayHistoryRef.current = false;
      window.history.back();
    }
  }

  function openToc() {
    setReaderMenuOpen(false);
    ensureOverlayHistory();
    setActiveLookup(null);
    setActiveAiAssist(null);
    setShowVocab(false);
    setShowNotes(false);
    setSheetHeightVh(78);
    setShowToc(true);
  }

  function openVocab() {
    setReaderMenuOpen(false);
    ensureOverlayHistory();
    setActiveLookup(null);
    setActiveAiAssist(null);
    setShowToc(false);
    setShowNotes(false);
    setSheetHeightVh(72);
    setShowVocab(true);
  }

  function openNotes() {
    setReaderMenuOpen(false);
    ensureOverlayHistory();
    setActiveLookup(null);
    setActiveAiAssist(null);
    setShowToc(false);
    setShowVocab(false);
    setSheetHeightVh(72);
    setShowNotes(true);
  }

  function selectChapter(chapterId: string) {
    const nextLesson = currentManual.chapters.find((chapter) => chapter.id === chapterId);
    if (!nextLesson) {
      return;
    }
    selectChapterSection(nextLesson.id, nextLesson.sections[0].id);
  }

  function toggleCurrentChapterCompleted() {
    if (!lesson) return;
    setChapterProgressMap((progress) => setChapterCompleted(
      progress,
      currentBookId,
      lesson.id,
      !isChapterCompleted(progress, currentBookId, lesson.id)
    ));
  }

  function continueAfterChapter() {
    if (nextLesson) {
      selectChapter(nextLesson.id);
      return;
    }
    navigateTo("home");
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
    runSpatialTransition("language", () => setLanguage(language === "en" ? "zh" : "en"));
  }

  function setImmersiveMode(next: boolean) {
    if (next === isImmersive) {
      return;
    }
    pendingLanguageScrollRef.current = captureLanguageScrollPosition();
    setReaderMenuOpen(false);
    setIsImmersive(next);
  }

  function lookupText(text: string, page: number, sectionId: string, blockId: string | undefined, sourceText: string) {
    const entry = lookupCandidates(text).map((key) => termIndex.get(key)).find(Boolean) ?? lookupFallback(text);
    const section = lesson?.sections.find((item) => item.id === sectionId);
    const contextGloss = blockId ? manual?.contextGlosses?.[blockId] : undefined;
    const sourceTranslation = alignedBlockTranslation(section, blockId, page, manual?.contextGlosses);
    ensureOverlayHistory();
    setShowToc(false);
    setShowVocab(false);
    setShowNotes(false);
    setActiveAiAssist(null);
    setSheetHeightVh(52);
    const context = resolveContextExplanation({
      query: text,
      dictionaryTranslation: entry.translation,
      partOfSpeech: entry.partOfSpeech,
      sourceText,
      sourceTranslation,
      contextGloss
    });
    openLookup({
      query: text,
      entry,
      page,
      sectionId,
      blockId,
      sourceText,
      sourceTranslation,
      context
    });
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
    setStudyBookFilter(currentBookId);
    navigateTo("notes");
  }

  function saveActiveTerm() {
    if (!activeLookup || savedSet.has(`${currentBookId}:${normalizeLookup(activeLookup.query)}`)) {
      return;
    }
    const now = new Date();
    const question = activeLookup.questionSource
      ? allQuestions.find((item) => item.questionId === activeLookup.questionSource?.questionId)
      : undefined;
    const questionChapter = question ? Number(question.chapterId.replace(/\D+/g, "")) : Number.NaN;
    const saved: SavedTerm = {
      id: `${normalizeLookup(activeLookup.query)}-${now.getTime()}`,
      bookId: currentBookId,
      bookTitle: currentBookTitleZh,
      contentVersion: manual?.version,
      term: activeLookup.query,
      translation: activeLookup.entry.translation,
      partOfSpeech: activeLookup.entry.partOfSpeech,
      phonetic: activeLookup.entry.phonetic,
      wordRoot: activeLookup.entry.wordRoot,
      wordForms: activeLookup.entry.wordForms,
      englishDefinition: activeLookup.entry.englishDefinition,
      dictionaryExplanation: activeLookup.entry.explanation,
      chapter: question && Number.isFinite(questionChapter) ? questionChapter : lesson?.chapter ?? 1,
      chapterTitle: question ? `${question.domain} · ${question.chapterId}` : lesson?.title.en ?? currentBookTitleZh,
      page: activeLookup.page,
      sectionId: activeLookup.sectionId,
      blockId: activeLookup.blockId,
      sourceText: activeLookup.sourceText,
      sourceTranslation: activeLookup.sourceTranslation,
      contextMeaning: activeLookup.context.meaning,
      contextExplanation: activeLookup.context.explanation,
      contextCorrectionId: aiLookupState.status === "accepted" ? aiLookupState.correction?.id : undefined,
      exampleText: activeLookup.context.exampleText,
      exampleTranslation: activeLookup.context.exampleTranslation,
      savedAt: now.toISOString(),
      status: "new",
      familiarity: 0,
      reviewCount: 0,
      lapseCount: 0,
      correctStreak: 0,
      nextReviewAt: now.toISOString(),
      intervalDays: 0,
      easeFactor: 2.1,
      sourceType: activeLookup.questionSource ? "question" : "manual",
      sourceBookId: activeLookup.questionSource ? undefined : currentBookId,
      sourceQuestionId: activeLookup.questionSource?.questionId,
      sourceExamId: activeLookup.questionSource?.examId,
      sourceDomain: activeLookup.questionSource?.domain,
      sourcePage: activeLookup.questionSource?.page ?? activeLookup.page
    };
    setSavedTerms((items) => [saved, ...items]);
  }

  function reviewSavedTerm(id: string, outcome: "again" | "fuzzy" | "remembered") {
    setSavedTerms((items) => items.map((item) => (item.id === id ? scheduleTermReview(item, outcome) : item)));
    recordDailyCompletion(1, flashSessionGoal || undefined);
    const reviewed = flashSessionReviewed + 1;
    setFlashSessionReviewed(reviewed);
    setFlashQuizSelection("");
    if (reviewed >= flashSessionIds.length) {
      setFlashReviewStage("complete");
      return;
    }
    setFlashReviewIndex((index) => index + 1);
    setFlashReviewStage("prompt");
  }

  function startFlashReview() {
    if (!flashDictionaryReady) {
      return;
    }
    const ids = flashReviewTerms.slice(0, plannedFlashCount).map((item) => item.id);
    const sessionGoal = Math.min(dailyStats.goal, dailyStats.completed + ids.length);
    setFlashSessionIds(ids);
    setFlashSessionGoal(sessionGoal);
    setFlashReviewIndex(0);
    setFlashSessionReviewed(0);
    setFlashQuizSelection("");
    setFlashReviewStage(ids.length > 0 ? "prompt" : "complete");
    setFlashReviewActive(true);
  }

  async function speakTerm(term: string) {
    setPronunciationMessage("正在播放英语发音…");
    try {
      await speakEnglish(term);
      setPronunciationMessage("");
    } catch (error) {
      setPronunciationMessage(error instanceof Error ? error.message : "英语发音播放失败");
    }
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

  function currentFavoriteId(): string | undefined {
    return savedFavorites.find(
      (item) =>
        item.bookId === currentBookId &&
        item.sectionId === currentSection.id &&
        (activeBlockId ? item.blockId === activeBlockId : true)
    )?.id;
  }

  function toggleCurrentFavorite() {
    const existingId = currentFavoriteId();
    if (existingId) {
      deleteFavorite(existingId);
      return;
    }

    const now = new Date().toISOString();
    const favorite: SavedFavorite = {
      id: `favorite-${Date.now()}`,
      bookId: currentBookId,
      bookTitle: currentBookTitleZh,
      chapter: currentLesson.chapter,
      chapterTitle: currentLesson.title.en,
      page: currentPage,
      sectionId: currentSection.id,
      blockId: activeBlockId || undefined,
      title: currentSection.title.zh || currentSection.title.en,
      savedAt: now,
      updatedAt: now
    };
    setSavedFavorites((items) => [favorite, ...items]);
  }

  function deleteFavorite(id: string) {
    setSavedFavorites((items) => items.filter((item) => item.id !== id));
  }

  async function saveDeepSeekKeyFromSettings() {
    setAiSettingsMessage("正在安全保存…");
    try {
      const status = await saveDeepSeekApiKey(deepSeekKeyDraft);
      setDeepSeekKeyStatus(status);
      setDeepSeekKeyDraft("");
      setAiSettingsMessage(status.storage === "android-keystore"
        ? "API Key 已加密保存到 Android Keystore。"
        : "API Key 仅在本次浏览器会话中使用，关闭页面后失效。");
    } catch (error) {
      setAiSettingsMessage(error instanceof Error ? error.message : "API Key 保存失败");
    }
  }

  async function testDeepSeekFromSettings() {
    setAiSettingsMessage("正在测试 DeepSeek 连接…");
    try {
      await testDeepSeekConnection();
      setAiSettingsMessage("连接正常，可以使用查词核验、选文简释和题目精讲。");
    } catch (error) {
      setAiSettingsMessage(error instanceof Error ? error.message : "连接测试失败");
    }
  }

  async function clearDeepSeekFromSettings() {
    try {
      const status = await clearDeepSeekApiKey();
      setDeepSeekKeyStatus(status);
      setDeepSeekKeyDraft("");
      setAiSettingsMessage("API Key 已清除。");
    } catch (error) {
      setAiSettingsMessage(error instanceof Error ? error.message : "API Key 清除失败");
    }
  }

  async function exportAcceptedCorrections() {
    const bundle = acceptedCorrectionExport(contextCorrectionBundle);
    if (bundle.corrections.length === 0) {
      setAiSettingsMessage("还没有已确认的修订可导出。");
      return;
    }
    const fileName = `${currentBookId}-context-corrections-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([`${JSON.stringify(bundle, null, 2)}\n`], fileName, { type: "application/json;charset=utf-8" });
    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: "语境修订包" });
        setAiSettingsMessage("已打开修订包分享/保存菜单。");
        return;
      }
      const blobUrl = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      setAiSettingsMessage("已导出统一格式的修订包。");
    } catch {
      setAiSettingsMessage("修订包导出未完成，请稍后重试。");
    }
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

  function renderText(text: string, page: number, sectionId: string, blockId?: string, keyboardEntry = false) {
    return (
      <InlineReaderText
        text={text}
        page={page}
        sectionId={sectionId}
        blockId={blockId}
        language={language}
        keyboardEntry={keyboardEntry}
        onLookup={lookupText}
      />
    );
  }

  function blocksForLanguage(section: LessonSection): ContentBlock[] {
    const languageBlocks = section.content[language] ?? [];
    if (language !== "zh") {
      return languageBlocks;
    }

    const enImages = (section.content.en ?? []).filter((block) => block.kind === "image");
    const zhImages = languageBlocks.filter((block) => block.kind === "image");
    if (zhImages.length >= enImages.length) {
      return languageBlocks;
    }

    const zhAssetIds = new Set(languageBlocks.filter((block) => block.kind === "image").map((block) => block.assetId ?? block.src));
    const missingImages = (section.content.en ?? [])
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.kind === "image" && !zhAssetIds.has(block.assetId ?? block.src));

    if (missingImages.length === 0) {
      return languageBlocks;
    }

    const merged = [...languageBlocks];
    const enLength = Math.max(1, section.content.en.length);
    for (const { block, index } of missingImages) {
      const insertAt = Math.min(merged.length, Math.max(0, Math.round((index / enLength) * Math.max(1, merged.length))));
      merged.splice(insertAt, 0, block);
    }
    return merged;
  }

  function renderBlock(block: ContentBlock, section: LessonSection) {
    const blockPage = block.page ?? section.page;
    const blockClassName = [
      block.id === highlightBlockId ? "sourceHighlight" : "",
      savedNotes.some((note) => note.bookId === currentBookId && note.blockId === block.id) ? "hasNoteMarker" : "",
      savedFavorites.some((favorite) => favorite.bookId === currentBookId && favorite.blockId === block.id) ? "hasFavoriteMarker" : ""
    ].filter(Boolean).join(" ");
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
                  {row.length > 1 && row.every((cell) => cell === row[0]) ? (
                    <td colSpan={row.length}>{renderText(row[0], blockPage, section.id, block.id, block.id === keyboardLookupBlockId && rowIndex === 0)}</td>
                  ) : (
                    row.map((cell, cellIndex) => (
                      <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`}>
                        {renderText(cell, blockPage, section.id, block.id, block.id === keyboardLookupBlockId && rowIndex === 0 && cellIndex === 0)}
                      </td>
                    ))
                  )}
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
          {renderText(block.text ?? "", blockPage, section.id, block.id, block.id === keyboardLookupBlockId)}
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
          {renderText(block.text ?? "", blockPage, section.id, block.id, block.id === keyboardLookupBlockId)}
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
        {renderText(block.text ?? "", blockPage, section.id, block.id, block.id === keyboardLookupBlockId)}
      </p>
    );
  }

  return (
    <main
      className={[
        "appShell",
        "spatialStage",
        "page-reader",
        isImmersive ? "immersiveMode" : "",
        showToc || showVocab || showNotes || activeLookup || activeAiAssist ? "panelOpen" : ""
      ].filter(Boolean).join(" ")}
      data-app-view="reader"
      data-book-id={currentBookId}
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
            <button className="readerControlButton" onClick={(event) => navigateTo("home", event.currentTarget)} aria-label="返回书库">书库</button>
            <button className="tocButton" onClick={openToc} aria-label="打开目录">
              目录
            </button>
            <button
              className="modeButton"
              onClick={switchReadingLanguage}
              aria-label="切换阅读语言"
            >
              {language === "en" ? "中文" : "EN"}
            </button>
            <button
              className="readerControlButton"
              onClick={toggleCurrentFavorite}
              aria-label="收藏当前内容"
              title="收藏当前位置"
            >
              {currentFavoriteId() ? "已藏" : "收藏"}
            </button>
            <button
              className="readerControlButton"
              onClick={() => setImmersiveMode(true)}
              aria-label="进入沉浸阅读"
              title="沉浸阅读"
            >
              沉浸
            </button>
            <button
              className="readerControlButton"
              onClick={() => setReaderMenuOpen((open) => !open)}
              aria-label="打开阅读工具"
            >
              更多
            </button>
            {readerMenuOpen && (
              <div className="readerMenu" role="group" aria-label="阅读工具">
                <button onClick={() => updateTextScale(-1)} disabled={textScaleIndex === 0}>A-</button>
                <button onClick={() => updateTextScale(1)} disabled={textScaleIndex === textScaleOrder.length - 1}>A+</button>
                <button onClick={toggleTheme}>{readerPreferences.theme === "dark" ? "亮色" : "深色"}</button>
                <button onClick={() => {
                  setStudyBookFilter(currentBookId);
                  navigateTo("vocab");
                }}>单词本</button>
                <button onClick={() => {
                  setStudyBookFilter(currentBookId);
                  navigateTo("notes");
                }}>笔记</button>
                <button onClick={() => {
                  setStudyBookFilter(currentBookId);
                  navigateTo("favorites");
                }}>收藏页</button>
              </div>
            )}
          </div>
        </header>

        <div className="progressSummary" aria-label="阅读进度">
          <div>
            <strong>p. {currentPage}</strong>
            <span>本章 {currentLesson.pageStart}-{currentLesson.pageEnd} 页 · 章节 {chapterProgress}%</span>
          </div>
          <div className="progressTrack" aria-hidden="true">
            <span style={{ width: `${chapterProgress}%` }} />
          </div>
        </div>

        <nav ref={chapterRailRef} className="chapterRail" aria-label="章节页码">
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
        <button className="immersiveExit" onClick={() => setImmersiveMode(false)} aria-label="退出沉浸阅读">
          退出沉浸 · p. {currentPage}
        </button>
      )}

      <section ref={readerRef} className="readerPanel" aria-label="教材阅读器">
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
              {blocksForLanguage(section).map((block) => renderBlock(block, section))}
            </div>
          </article>
        ))}
        <footer className="chapterCompletion" data-chapter-completed={currentChapterCompleted ? "true" : "false"}>
          <div>
            <p className="eyebrow">Chapter {currentLesson.chapter} complete</p>
            <h2>{currentChapterCompleted ? "本章已读完" : "完成本章"}</h2>
            <p>{completedChapterCount} / {currentManual.chapters.length} 章已完成</p>
          </div>
          <div className="chapterCompletionActions">
            <button
              className={currentChapterCompleted ? "chapterReadButton completed" : "chapterReadButton"}
              aria-pressed={currentChapterCompleted}
              onClick={toggleCurrentChapterCompleted}
            >
              <BookmarkCheck size={19} />
              {currentChapterCompleted ? "取消已读" : "标记已读完"}
            </button>
            <button className="nextChapterButton" onClick={continueAfterChapter}>
              <span>
                <small>{nextLesson ? `第 ${nextLesson.chapter} 章` : "学习进度"}</small>
                <strong>{nextLesson ? nextLesson.title[language] : "返回书库"}</strong>
              </span>
              <ArrowRight size={22} />
            </button>
          </div>
        </footer>
      </section>

      <p className="readerWatermark">Felix-Zuo · non-commercial study edition</p>

      {selectedPhrase && (
        <div className="selectionActions">
          {language === "en" && (
            <button className="aiSelectionAction" onClick={askAiAboutSelection}>
              <Sparkles size={16} /> AI 简释
            </button>
          )}
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
        <section
          ref={overlayPanelRef}
          className="tocPanel draggableSheet"
          style={sheetStyle}
          role="dialog"
          aria-modal="true"
          aria-label="目录"
          tabIndex={-1}
        >
          <div className="sheetChrome">
            {sheetHandle()}
            <div className="sheetHeader">
              <div>
                <p className="eyebrow">manual contents</p>
                <h2>目录</h2>
              </div>
              <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
            </div>
          </div>
          <div className="sheetScrollBody tocList" data-sheet-scroll-body>
            <div className="tocSearch">
              <input
                type="search"
                value={tocQuery}
                onChange={(event) => setTocQuery(event.target.value)}
                placeholder="搜索章节、标题、页码"
                aria-label="搜索章节和页码"
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

      {isOverlayOpen && <div className="overlayBackdrop" aria-hidden="true" onClick={closeOverlayFromControl} />}

      {showVocab && (
        <section
          ref={overlayPanelRef}
          className="vocabPanel draggableSheet"
          style={sheetStyle}
          role="dialog"
          aria-modal="true"
          aria-label="单词本"
          tabIndex={-1}
        >
          <div className="sheetChrome">
            {sheetHandle()}
            <div className="sheetHeader">
              <div>
                <p className="eyebrow">local vocabulary</p>
                <h2>词本</h2>
                <small className="bookScope">{currentBookTitleZh}</small>
              </div>
              <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
            </div>
          </div>
          <div className="sheetScrollBody" data-sheet-scroll-body>
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
            <div className="vocabFilters" role="tablist" aria-label="单词筛选">
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
                    <button onClick={() => item.sourceType === "question" ? openQuestionAnchor(item.sourceQuestionId) : selectSource(item.sectionId, item.blockId, item.page)}>
                      {item.sourceType === "question" ? "题目" : "原文"}
                    </button>
                    <button className="primary" onClick={() => {
                      closeOverlayForJump();
                      setVocabPageMode("plan");
                      navigateTo("vocab");
                    }}>去学习</button>
                  </div>
                </article>
              ))}
            </div>
            )}
          </div>
        </section>
      )}

      {showNotes && (
        <section
          ref={overlayPanelRef}
          className="notesPanel draggableSheet"
          style={sheetStyle}
          role="dialog"
          aria-modal="true"
          aria-label="学习笔记"
          tabIndex={-1}
        >
          <div className="sheetChrome">
            {sheetHandle()}
            <div className="sheetHeader">
              <div>
                <p className="eyebrow">study notes</p>
                <h2>笔记</h2>
                <small className="bookScope">{currentBookTitleZh}</small>
              </div>
              <button className="closeButton" onClick={closeOverlayFromControl}>关闭</button>
            </div>
          </div>
          <div className="sheetScrollBody" data-sheet-scroll-body>
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
          </div>
        </section>
      )}

      {renderLookupSheet()}
      {renderAiAssistSheet()}
    </main>
  );
}
