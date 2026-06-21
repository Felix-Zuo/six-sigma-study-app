import { useEffect, useMemo, useRef, useState } from "react";
import ch01Data from "./generated/ch01.json";
import termsData from "./generated/six-sigma-terms.json";
import { normalizeLookup, tokenizeEnglish } from "./lib/tokenize";
import { loadSavedTerms, persistSavedTerms, type SavedTerm } from "./lib/vocabStore";

type Language = "en" | "zh";

type ContentBlock = {
  id: string;
  kind: "paragraph" | "listItem" | "table" | "termNote" | "heading";
  text?: string;
  rows?: string[][];
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
};

type TermEntry = {
  term: string;
  translation: string;
  partOfSpeech?: string;
  explanation: string;
  lookupKeys: string[];
  isSixSigmaTerm?: boolean;
};

type ActiveLookup = {
  entry: TermEntry;
  page: number;
  sectionId: string;
  sourceText: string;
};

const lesson = ch01Data as Lesson;
const terms = termsData as TermEntry[];

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

export function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [activeLookup, setActiveLookup] = useState<ActiveLookup | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(lesson.sections[0].id);
  const [selectedPhrase, setSelectedPhrase] = useState("");
  const [savedTerms, setSavedTerms] = useState<SavedTerm[]>(() => loadSavedTerms());
  const [showVocab, setShowVocab] = useState(false);
  const readerRef = useRef<HTMLElement | null>(null);

  const termIndex = useMemo(() => buildTermIndex(terms), []);
  const activeSection = lesson.sections.find((section) => section.id === activeSectionId) ?? lesson.sections[0];
  const savedSet = useMemo(
    () => new Set(savedTerms.map((item) => normalizeLookup(item.term))),
    [savedTerms]
  );

  useEffect(() => {
    persistSavedTerms(savedTerms);
  }, [savedTerms]);

  useEffect(() => {
    const root = readerRef.current;
    if (!root) {
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
  }, []);

  useEffect(() => {
    const node = document.querySelector(`[data-section-id="${activeSectionId}"]`);
    if (node) {
      window.requestAnimationFrame(() => node.scrollIntoView({ block: "start" }));
    }
  }, [language]);

  useEffect(() => {
    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      const anchorNode = selection?.anchorNode;
      if (!text || !anchorNode || !readerRef.current?.contains(anchorNode)) {
        setSelectedPhrase("");
        return;
      }
      const normalized = normalizeLookup(text);
      setSelectedPhrase(normalized.includes(" ") ? text : "");
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  function lookupText(text: string, page: number, sectionId: string, sourceText: string) {
    const key = normalizeLookup(text);
    const entry = termIndex.get(key) ?? lookupFallback(text);
    setActiveLookup({ entry, page, sectionId, sourceText });
  }

  function saveActiveTerm() {
    if (!activeLookup || savedSet.has(normalizeLookup(activeLookup.entry.term))) {
      return;
    }
    const saved: SavedTerm = {
      id: `${normalizeLookup(activeLookup.entry.term)}-${Date.now()}`,
      term: activeLookup.entry.term,
      translation: activeLookup.entry.translation,
      page: activeLookup.page,
      sectionId: activeLookup.sectionId,
      sourceText: activeLookup.sourceText,
      savedAt: new Date().toISOString(),
      status: "new"
    };
    setSavedTerms((items) => [saved, ...items]);
  }

  function updateSavedStatus(id: string, status: SavedTerm["status"]) {
    setSavedTerms((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  function renderEnglishText(text: string, page: number, sectionId: string) {
    return tokenizeEnglish(text).map((token) =>
      token.kind === "word" ? (
        <button
          key={token.id}
          className="wordToken"
          onClick={() => lookupText(token.text, page, sectionId, text)}
        >
          {token.text}
        </button>
      ) : (
        <span key={token.id}>{token.text}</span>
      )
    );
  }

  function renderText(text: string, page: number, sectionId: string) {
    if (language === "en") {
      return renderEnglishText(text, page, sectionId);
    }
    return text;
  }

  function renderBlock(block: ContentBlock, section: LessonSection) {
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
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Page {activeSection.page} / 449</p>
          <h1>{lesson.title[language]}</h1>
        </div>
        <button
          className="modeButton"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          aria-label="switch reading language"
        >
          {language === "en" ? "中文" : "EN"}
        </button>
      </header>

      <nav className="chapterRail" aria-label="chapter sections">
        {lesson.sections.map((section) => (
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

      <section ref={readerRef} className="readerPanel" aria-label="manual reader">
        {lesson.sections.map((section) => (
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
          onClick={() => lookupText(selectedPhrase, activeSection.page, activeSection.id, selectedPhrase)}
        >
          查询选中短语
        </button>
      )}

      <button className="vocabDock" aria-label="saved vocabulary" onClick={() => setShowVocab(true)}>
        <strong>词本</strong>
        <span>{savedTerms.length} 个</span>
      </button>

      {showVocab && (
        <section className="vocabPanel" aria-label="vocabulary book">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">local vocabulary</p>
              <h2>词本</h2>
            </div>
            <button className="closeButton" onClick={() => setShowVocab(false)}>关闭</button>
          </div>
          {savedTerms.length === 0 ? (
            <p className="emptyState">暂无词条。英文模式下点击单词或查询短语后可加入词本。</p>
          ) : (
            <div className="vocabList">
              {savedTerms.map((item) => (
                <article key={item.id} className="vocabItem">
                  <div>
                    <strong>{item.term}</strong>
                    <span>{item.translation}</span>
                    <small>p. {item.page}</small>
                  </div>
                  <select
                    value={item.status}
                    onChange={(event) => updateSavedStatus(item.id, event.target.value as SavedTerm["status"])}
                  >
                    <option value="new">新词</option>
                    <option value="learning">学习中</option>
                    <option value="mastered">已掌握</option>
                  </select>
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
            <button className="closeButton" onClick={() => setActiveLookup(null)}>关闭</button>
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
