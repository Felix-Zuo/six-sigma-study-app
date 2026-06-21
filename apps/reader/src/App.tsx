import { useMemo, useState } from "react";
import { normalizeLookup, tokenizeEnglish } from "./lib/tokenize";
import { sampleLesson, type TermEntry } from "./data/sampleLesson";

type Language = "en" | "zh";

type SavedTerm = {
  term: string;
  translation: string;
  page: number;
};

export function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [activeTerm, setActiveTerm] = useState<TermEntry | null>(null);
  const [activePage, setActivePage] = useState<number>(6);
  const [savedTerms, setSavedTerms] = useState<SavedTerm[]>([]);

  const savedSet = useMemo(
    () => new Set(savedTerms.map((item) => item.term.toLowerCase())),
    [savedTerms]
  );

  function lookupWord(word: string, page: number) {
    const key = normalizeLookup(word);
    const direct = sampleLesson.terms[key];
    const fallback: TermEntry = {
      term: word,
      translation: "待完善",
      partOfSpeech: "unknown",
      explanation: "该词暂未进入本地术语库。MVP 阶段会先返回本地词库解释，后续接入离线词典和上下文 AI 解释。",
      examples: [`Source page: ${page}`]
    };
    setActivePage(page);
    setActiveTerm(direct ?? fallback);
  }

  function saveActiveTerm() {
    if (!activeTerm || savedSet.has(activeTerm.term.toLowerCase())) {
      return;
    }
    setSavedTerms((items) => [
      ...items,
      {
        term: activeTerm.term,
        translation: activeTerm.translation,
        page: activePage
      }
    ]);
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Page 6 / 449</p>
          <h1>{sampleLesson.title[language]}</h1>
        </div>
        <button className="modeButton" onClick={() => setLanguage(language === "en" ? "zh" : "en")}>
          {language === "en" ? "中文" : "EN"}
        </button>
      </header>

      <section className="readerPanel" aria-label="manual reader">
        {sampleLesson.paragraphs.map((paragraph) => (
          <article key={paragraph.id} className="paragraphBlock">
            <div className="pageTag">p. {paragraph.page}</div>
            {language === "en" ? (
              <p lang="en" className="readerText">
                {tokenizeEnglish(paragraph.en).map((token) =>
                  token.kind === "word" ? (
                    <button
                      key={token.id}
                      className="wordToken"
                      onClick={() => lookupWord(token.text, paragraph.page)}
                    >
                      {token.text}
                    </button>
                  ) : (
                    <span key={token.id}>{token.text}</span>
                  )
                )}
              </p>
            ) : (
              <p lang="zh-CN" className="readerText zhText">{paragraph.zh}</p>
            )}
          </article>
        ))}
      </section>

      <aside className="vocabDock" aria-label="saved vocabulary">
        <strong>词本</strong>
        <span>{savedTerms.length} 个</span>
      </aside>

      {activeTerm && (
        <section className="bottomSheet" aria-label="word explanation">
          <div className="sheetHandle" />
          <div className="sheetHeader">
            <div>
              <p className="eyebrow">Page {activePage}</p>
              <h2>{activeTerm.term}</h2>
            </div>
            <button className="closeButton" onClick={() => setActiveTerm(null)}>关闭</button>
          </div>
          <p className="translation">{activeTerm.translation}</p>
          {activeTerm.partOfSpeech && <p className="partOfSpeech">{activeTerm.partOfSpeech}</p>}
          {activeTerm.isSixSigmaTerm && <span className="termBadge">六西格玛术语</span>}
          <p className="explanation">{activeTerm.explanation}</p>
          <div className="exampleBox">
            <strong>原句/例句</strong>
            <p>{activeTerm.examples[0]}</p>
          </div>
          <button className="saveButton" onClick={saveActiveTerm}>
            {savedSet.has(activeTerm.term.toLowerCase()) ? "已加入词本" : "加入词本"}
          </button>
        </section>
      )}
    </main>
  );
}

