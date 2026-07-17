import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4180/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/vocab-study-ux/screenshots";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("No debuggable page found");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    const handlers = pending.get(payload.id);
    if (!handlers) return;
    pending.delete(payload.id);
    payload.error ? handlers.reject(new Error(JSON.stringify(payload.error))) : handlers.resolve(payload.result);
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close: () => ws.close()
  };
}

async function main() {
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  async function waitFor(description, predicate, timeout = 18000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Reloads can briefly invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    await sleep(1_000);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(async () => {
    if ("serviceWorker" in navigator) {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
    const now = new Date().toISOString();
    const phraseSource = "Teams improve by trial and error before they standardize the better method.";
    const longSource = "Six Sigma as a methodology for process improvement involves a vast library of tools and knowledge, which will be covered throughout this book. This second sentence must not be copied into the study example because it makes the review card unnecessarily long.";
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", "six-sigma-black-belt");
    localStorage.setItem("six-sigma-study:reader-preferences:v1", JSON.stringify({ theme: "light", textScale: "standard" }));
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([{
      id: "qa-legacy-trial", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "trial", translation: "n. 审判；试验；艰苦；麻烦事", contextMeaning: "n. 审判；试验；艰苦；麻烦事",
      contextExplanation: "旧版本只识别了短语的第一个单词。",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "qa-section", blockId: "qa-trial-block", sourceText: phraseSource,
      sourceStart: phraseSource.indexOf("trial"), sourceEnd: phraseSource.indexOf("trial") + 5,
      exampleText: phraseSource, exampleTranslation: "团队在标准化更好的方法前通过反复试验进行改进。",
      savedAt: now, status: "new", familiarity: 0, reviewCount: 0, lapseCount: 0, correctStreak: 0,
      nextReviewAt: now, intervalDays: 0, easeFactor: 2.1, sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7
    }, {
      id: "qa-legacy-throughout", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "throughout", translation: "后续", contextMeaning: "后续", contextExplanation: "旧错误语境义。",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "real-world-examples", blockId: "qa-throughout-block", sourceText: longSource,
      sourceStart: longSource.indexOf("throughout"), sourceEnd: longSource.indexOf("throughout") + "throughout".length,
      exampleText: longSource,
      exampleTranslation: "作为一种流程改进方法，六西格玛包含大量工具和知识，本书会自始至终逐步介绍；这段旧译文还错误地附带了后续句子，导致复习卡过长。",
      aiContextMeaning: "贯穿全书；在全书各处", aiTranslation: "本书将自始至终介绍这些工具和知识。",
      aiExplanation: "throughout this book 表示内容贯穿整本书，而不是时间上的“后续”。", aiModel: "deepseek-v4-flash", aiGeneratedAt: now,
      savedAt: new Date(Date.now() + 1).toISOString(), status: "new", familiarity: 0, reviewCount: 0, lapseCount: 0, correctStreak: 0,
      nextReviewAt: new Date(Date.now() + 1).toISOString(), intervalDays: 0, easeFactor: 2.1, sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7
    }, {
      id: "qa-stale-source-term", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "scope", translation: "范围", chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "qa-section", blockId: "qa-stale-block", sourceText: phraseSource,
      savedAt: new Date(Date.now() + 2).toISOString(), status: "new", familiarity: 0, reviewCount: 0, lapseCount: 0, correctStreak: 0,
      nextReviewAt: new Date(Date.now() + 30 * 86400000).toISOString(), intervalDays: 30, easeFactor: 2.1,
      sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7
    }]));
    localStorage.removeItem("six-sigma-study:daily-streak:v1");
    location.reload();
  })()`);

  await waitFor("home", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("单词"))?.click()`);
  await waitFor("phrase migration", () => evaluate(`Array.from(document.querySelectorAll(".recentTerms strong")).some((item) => item.textContent?.trim() === "trial and error")`));
  await waitFor("stale source cleanup", () => evaluate(`(() => {
    const item = JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]").find((entry) => entry.id === "qa-stale-source-term");
    return Boolean(item && item.sourceStart === undefined && item.sourceEnd === undefined && item.sourceOccurrence === undefined);
  })()`));
  const migrated = await evaluate(`JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]").find((item) => item.id === "qa-legacy-trial")`);
  const staleSource = await evaluate(`JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]").find((item) => item.id === "qa-stale-source-term")`);
  const vocabHomeShot = await capture("00-vocab-home");

  await evaluate(`document.querySelector(".vocabStartButton")?.click()`);
  await waitFor("phrase dictionary quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "trial and error" && Boolean(document.querySelector(".flashQuiz"))`));
  const phraseQuiz = await evaluate(`(() => ({
    prompt: document.querySelector(".flashQuiz p")?.textContent?.trim(),
    options: Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).map((item) => item.textContent.trim()),
    hasPromptStage: Boolean(document.querySelector(".flashPromptActions"))
  }))()`);
  const quizShot = await capture("01-direct-retrieval-quiz");
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button")).find((item) => item.textContent.includes("反复试验"))?.click()`);
  await waitFor("phrase answer", () => evaluate(`Boolean(document.querySelector(".flashRatingDock"))`));
  const phraseAnswer = await evaluate(`(() => {
    const dock = document.querySelector(".flashRatingDock")?.getBoundingClientRect();
    return {
      dictionary: document.querySelector(".flashDictionarySummary .dictionaryTranslation")?.textContent?.trim(),
      underlined: document.querySelector(".flashExample .studyTargetTerm")?.textContent?.trim(),
      exampleLength: document.querySelector(".flashExample p[lang='en']")?.textContent?.trim().length,
      intervalLabels: Array.from(document.querySelectorAll(".flashRatingActions button small")).map((item) => item.textContent.trim()),
      detailsCollapsed: !document.querySelector(".flashMoreDetails")?.open,
      dockVisible: Boolean(dock && dock.top >= 0 && dock.bottom <= innerHeight + 1),
      bodyScroll: scrollY,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  const phraseShot = await capture("01-phrase-dictionary-answer");
  phraseAnswer.dockVisibleAfterScroll = await evaluate(`(() => {
    const scroller = document.querySelector(".flashReviewScroller");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    const rect = document.querySelector(".flashRatingDock")?.getBoundingClientRect();
    return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight + 1);
  })()`);

  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.querySelector("strong")?.textContent.trim() === "模糊")?.click()`);
  await waitFor("throughout quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "throughout" && Boolean(document.querySelector(".flashQuiz"))`));
  const nextCardScrollTop = await evaluate(`document.querySelector(".flashReviewScroller")?.scrollTop`);
  const throughoutQuiz = await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).map((item) => item.textContent.trim())`);
  await evaluate(`document.querySelector(".flashUnknownAction")?.click()`);
  await waitFor("throughout answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer"))`));
  const throughoutAnswer = await evaluate(`(() => ({
    dictionary: document.querySelector(".flashDictionarySummary .dictionaryTranslation")?.textContent?.trim(),
    underlined: document.querySelector(".flashExample .studyTargetTerm")?.textContent?.trim(),
    exampleLength: document.querySelector(".flashExample p[lang='en']")?.textContent?.trim().length,
    translationLength: document.querySelector(".flashExample p:not([lang='en'])")?.textContent?.trim().length,
    aiMeaning: document.querySelector(".flashAiSupplement > strong")?.textContent?.trim(),
    aiTranslation: Array.from(document.querySelectorAll(".flashAiSupplement p")).map((item) => item.textContent.trim()),
    dockVisible: (() => { const rect = document.querySelector(".flashRatingDock")?.getBoundingClientRect(); return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight + 1); })(),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const throughoutShot = await capture("02-throughout-short-example-ai");
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.querySelector("strong")?.textContent.trim() === "记得")?.click()`);
  await waitFor("same-session reinforcement", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "trial and error" && Boolean(document.querySelector(".reinforcementBadge"))`));
  const reinforcement = await evaluate(`(() => ({
    progress: document.querySelector(".studySessionBar > strong")?.textContent?.trim(),
    badge: document.querySelector(".reinforcementBadge")?.textContent?.trim(),
    options: Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).map((item) => item.textContent.trim())
  }))()`);
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button")).find((item) => item.textContent.trim() === "反复试验")?.click()`);
  await waitFor("reinforcement answer", () => evaluate(`Boolean(document.querySelector(".flashRatingActions.reinforcement"))`));
  const reinforcementShot = await capture("03-same-session-reinforcement");
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions.reinforcement button")).find((item) => item.querySelector("strong")?.textContent.trim() === "记得")?.click()`);
  await waitFor("session summary", () => evaluate(`Boolean(document.querySelector(".flashCompleteState"))`));
  const completion = await evaluate(`(() => ({
    title: document.querySelector(".flashCompleteState h2")?.textContent?.trim(),
    counts: Array.from(document.querySelectorAll(".flashSessionResultGrid span")).map((item) => item.textContent.replace(/\s+/g, "").trim()),
    hasVerbosePolicy: /薄弱词|目标保持率|本轮末尾/.test(document.querySelector(".flashCompleteState")?.textContent ?? ""),
    daily: JSON.parse(localStorage.getItem("six-sigma-study:daily-streak:v1") ?? "null"),
    terms: JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]")
      .filter((item) => ["qa-legacy-trial", "qa-legacy-throughout"].includes(item.id))
      .map((item) => ({ id: item.id, schedulerVersion: item.schedulerVersion, reviewCard: item.reviewCard, reviewHistory: item.reviewHistory }))
  }))()`);
  const completionShot = await capture("04-session-summary");

  await evaluate(`(() => {
    const now = new Date();
    const futureReview = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([{
      id: "qa-clock-skew", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "variation", translation: "变异；波动", dictionaryMeaning: "变异；波动", entryKind: "word",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "qa-clock-section", blockId: "qa-clock-block", sourceText: "Variation occurs in every process.",
      sourceStart: 0, sourceEnd: 9, exampleText: "Variation occurs in every process.",
      exampleTranslation: "每个流程中都会出现变异。", savedAt: now.toISOString(), status: "learning",
      familiarity: 20, reviewCount: 1, lapseCount: 0, correctStreak: 1,
      nextReviewAt: now.toISOString(), intervalDays: 1, easeFactor: 2.1,
      schedulerVersion: "legacy-clock-skew", reviewCard: {
        due: now.toISOString(), stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1,
        learningSteps: 0, reps: 1, lapses: 0, state: 2, lastReview: futureReview
      }, reviewHistory: [], sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7
    }]));
    localStorage.removeItem("six-sigma-study:daily-streak:v1");
    location.reload();
  })()`);
  await waitFor("home after clock-skew seed", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`document.querySelectorAll(".mainNavItem")[1]?.click()`);
  await waitFor("clock-skew vocabulary plan", () => evaluate(`Boolean(document.querySelector(".vocabStartButton"))`));
  await evaluate(`document.querySelector(".vocabStartButton")?.click()`);
  await waitFor("clock-skew review card", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim().toLocaleLowerCase() === "variation"`));
  const clockSkewQuiz = await evaluate(`(() => ({
    bodyBlank: document.body.innerText.trim().length === 0,
    optionCount: document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)").length,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  await evaluate(`document.querySelector(".flashUnknownAction")?.click()`);
  await waitFor("clock-skew answer", () => evaluate(`Boolean(document.querySelector(".flashRatingDock"))`));
  const clockSkewIntervals = await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button small")).map((item) => item.textContent.trim())`);
  const clockSkewShot = await capture("05-clock-skew-recovery");
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.querySelector("strong")?.textContent.trim() === "记得")?.click()`);
  await waitFor("clock-skew review completion", () => evaluate(`Boolean(document.querySelector(".flashCompleteState"))`));
  await waitFor("clock-skew schedule persistence", () => evaluate(`(() => {
    const term = JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]").find((item) => item.id === "qa-clock-skew");
    return Boolean(term?.reviewHistory?.length === 1 && term?.reviewCard?.lastReview);
  })()`));
  const clockSkewPersisted = await evaluate(`JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]").find((item) => item.id === "qa-clock-skew")`);

  await evaluate(`(() => {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const tableSource = "Process Performance Metric(s) Current Sigma Level Attaching a decorative element to food item Decorative touch is centered on food product and stable so it won't fall off in transit 2.2 Packing product Product is sealed for freshness 3.1 Shipping of product Product reaches the right customer in a timely manner 4.3";
    const inDepthSource = "(Sampling and extrapolation are covered in depth in the advanced chapters on statistics.)";
    const makeTerm = (id, term, sourceText, sectionId, blockId, page, offset) => ({
      id, bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term, translation: "旧释义", dictionaryMeaning: "旧释义", entryKind: term.includes(" ") ? "phrase" : "word",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page, sectionId, blockId, sourceText,
      sourceStart: sourceText.toLocaleLowerCase().indexOf(term), sourceEnd: sourceText.toLocaleLowerCase().indexOf(term) + term.length,
      exampleText: sourceText, exampleTranslation: "西格玛水平能让组织从高层次了解流程表现，但领导层还应考虑成本和资源。",
      savedAt: new Date(now.getTime() + offset).toISOString(), status: "new", familiarity: 0, reviewCount: 0,
      lapseCount: 0, correctStreak: 0, nextReviewAt: new Date(now.getTime() + offset).toISOString(), intervalDays: 0,
      easeFactor: 2.1, sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: page
    });
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([
      makeTerm("qa-transit", "transit", tableSource, "sigma-level-not-final", "sigma-level-not-final-en-004", 9, 0),
      makeTerm("qa-manner", "manner", tableSource, "sigma-level-not-final", "sigma-level-not-final-en-004", 9, 1),
      makeTerm("qa-in-depth", "in depth", inDepthSource, "calculating-sigma-level", "calculating-sigma-level-en-003", 8, 2)
    ]));
    localStorage.setItem("six-sigma-study:daily-streak:v1", JSON.stringify({
      day: today, baseGoal: 8, goal: 8, completed: 0, streak: 0, missedDays: 0,
      checkedInToday: false, updatedAt: now.toISOString()
    }));
    location.reload();
  })()`);
  await waitFor("home after reported-regression seed", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("单词"))?.click()`);
  await waitFor("migrated daily plan", () => evaluate(`document.querySelector('[aria-label="每日学习数量"]')?.value === "20"`));
  const migratedDailyPlan = await evaluate(`JSON.parse(localStorage.getItem("six-sigma-study:daily-streak:v1") ?? "null")`);
  const planCopy = await evaluate(`document.querySelector(".vocabPlanHero h2")?.textContent?.trim()`);
  await evaluate(`document.querySelector(".vocabStartButton")?.click()`);
  await waitFor("transit quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "transit"`));
  const transitQuiz = await evaluate(`(() => ({
    options: Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).map((item) => item.textContent.trim()),
    noPageHeader: !document.querySelector(".appPageHeader"),
    coreFits: document.querySelector(".flashReviewScroller").scrollHeight <= document.querySelector(".flashReviewScroller").clientHeight + 2
  }))()`);
  const transitShot = await capture("06-transit-unambiguous-quiz");
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).find((item) => item.textContent.includes("经过") && item.textContent.includes("运输"))?.click()`);
  await waitFor("transit answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer"))`));
  const transitAnswer = await evaluate(`(() => ({
    example: document.querySelector(".flashExample p[lang='en']")?.textContent?.trim(),
    translation: document.querySelector(".flashExample p:not([lang='en'])")?.textContent?.trim(),
    coreFits: document.querySelector(".flashReviewScroller").scrollHeight <= document.querySelector(".flashReviewScroller").clientHeight + 2,
    verboseCopy: /本轮末尾|目标保持率|真实回忆难度/.test(document.querySelector(".flashReviewPanel")?.textContent ?? "")
  }))()`);
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.querySelector("strong")?.textContent.trim() === "记得")?.click()`);
  await waitFor("manner quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "manner"`));
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).find((item) => item.textContent.includes("样子"))?.click()`);
  await waitFor("manner answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer"))`));
  const mannerAnswer = await evaluate(`(() => ({
    example: document.querySelector(".flashExample p[lang='en']")?.textContent?.trim(),
    translation: document.querySelector(".flashExample p:not([lang='en'])")?.textContent?.trim(),
    context: document.querySelector(".flashMoreDetails .contextMeaningCard .translation")?.textContent?.trim(),
    coreFits: document.querySelector(".flashReviewScroller").scrollHeight <= document.querySelector(".flashReviewScroller").clientHeight + 2
  }))()`);
  const mannerShot = await capture("07-manner-correct-bilingual-example");
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.querySelector("strong")?.textContent.trim() === "记得")?.click()`);
  await waitFor("multi-word phrase quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "in depth"`));
  const phraseLemmaQuiz = await evaluate(`(() => ({
    title: document.querySelector(".flashCard h2")?.textContent?.trim(),
    options: Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)")).map((item) => item.textContent.trim()),
    bodyBlank: document.body.innerText.trim().length === 0
  }))()`);
  const phraseLemmaShot = await capture("08-multi-word-phrase-review");

  const checks = {
    phraseMigrated: migrated?.term === "trial and error" && migrated?.entryKind === "phrase" && migrated?.dictionaryMeaning === "反复试验",
    exactLocationStored: migrated?.sourceStart === 17 && migrated?.sourceEnd === 32 && migrated?.sourceOccurrence === 0,
    staleSourceNotHijacked: staleSource?.term === "scope" && staleSource?.sourceStart === undefined && staleSource?.sourceOccurrence === undefined,
    dictionaryQuizCopy: phraseQuiz.prompt === "选择词义" && !phraseQuiz.hasPromptStage,
    phraseDictionaryOption: phraseQuiz.options.includes("反复试验") && !phraseQuiz.options.some((item) => item.includes("审判")),
    conciseBalancedDistractors: phraseQuiz.options.length === 4 && phraseQuiz.options.every((item) => item.length <= 34 && !/^(?:n|v|adj|adv|prep)\./i.test(item)),
    phraseAnswer: phraseAnswer.dictionary === "反复试验" && phraseAnswer.underlined === "trial and error" && phraseAnswer.exampleLength <= 104 && phraseAnswer.detailsCollapsed,
    intervalPreviews: phraseAnswer.intervalLabels.length === 3 && phraseAnswer.intervalLabels.every(Boolean),
    ratingDock: phraseAnswer.dockVisible && phraseAnswer.dockVisibleAfterScroll && phraseAnswer.bodyScroll === 0,
    phraseLayout: phraseAnswer.horizontalOverflow <= 1,
    contextNotQuiz: !throughoutQuiz.includes("后续") && throughoutQuiz.every((item) => !item.includes("贯穿全书")),
    throughoutDictionary: throughoutAnswer.dictionary && throughoutAnswer.dictionary !== "后续" && throughoutAnswer.underlined === "throughout",
    shortBilingualExample: throughoutAnswer.exampleLength <= 104 && throughoutAnswer.translationLength <= 72,
    aiPersisted: throughoutAnswer.aiMeaning === "贯穿全书；在全书各处" && throughoutAnswer.aiTranslation.some((item) => item.includes("自始至终")),
    throughoutDockAndLayout: throughoutAnswer.dockVisible && throughoutAnswer.horizontalOverflow <= 1 && nextCardScrollTop === 0,
    sameSessionReinforcement: reinforcement.progress === "巩固" && reinforcement.badge === "巩固轮" && reinforcement.options.includes("反复试验"),
    sessionSummary: completion.title === "本轮完成" && completion.counts.includes("1记得") && completion.counts.includes("1模糊") && completion.counts.includes("0忘记"),
    uniqueDailyCompletion: completion.daily?.completed === 2,
    fsrsPersisted: completion.terms.length === 2 && completion.terms.every((item) => item.schedulerVersion?.startsWith("fsrs-") && item.reviewCard?.due && item.reviewHistory?.length === 1),
    quietCompletion: completion.hasVerbosePolicy === false,
    clockSkewDoesNotBlank: !clockSkewQuiz.bodyBlank && clockSkewQuiz.optionCount === 4 && clockSkewQuiz.horizontalOverflow <= 1,
    clockSkewIntervals: clockSkewIntervals.length === 3 && clockSkewIntervals.every(Boolean),
    clockSkewScheduleHealed: clockSkewPersisted?.reviewHistory?.length === 1 && Date.parse(clockSkewPersisted.reviewCard?.lastReview) <= Date.now() + 5_000,
    dailyPlanMigrated: migratedDailyPlan?.planVersion === 2 && migratedDailyPlan?.baseGoal === 20 && migratedDailyPlan?.goal === 20 && planCopy === "3 个待复习",
    transitSingleCorrectOption: transitQuiz.options.some((item) => item.includes("经过") && item.includes("通行") && item.includes("运输")) && transitQuiz.options.filter((item) => /经过|通行|运输/.test(item)).length === 1,
    transitTableContext: transitAnswer.example === "Decorative touch is centered on food product and stable so it won't fall off in transit." && transitAnswer.translation.includes("运输途中"),
    compactResponsiveSession: transitQuiz.noPageHeader && transitQuiz.coreFits && transitAnswer.coreFits && mannerAnswer.coreFits && !transitAnswer.verboseCopy,
    mannerBilingualAlignment: mannerAnswer.example === "Product reaches the right customer in a timely manner." && mannerAnswer.translation === "产品及时送达正确的客户。" && !/西格玛水平|领导层/.test(mannerAnswer.translation),
    phraseEntryPreserved: phraseLemmaQuiz.title === "in depth" && phraseLemmaQuiz.options.includes("深入地") && !phraseLemmaQuiz.bodyBlank
  };
  const ok = Object.values(checks).every(Boolean);
  cdp.close();
  console.log(JSON.stringify({ ok, checks, migrated, staleSource, phraseQuiz, phraseAnswer, throughoutQuiz, throughoutAnswer, nextCardScrollTop, reinforcement, completion, clockSkewQuiz, clockSkewIntervals, clockSkewPersisted, migratedDailyPlan, planCopy, transitQuiz, transitAnswer, mannerAnswer, phraseLemmaQuiz, screenshots: { vocabHomeShot, quizShot, phraseShot, throughoutShot, reinforcementShot, completionShot, clockSkewShot, transitShot, mannerShot, phraseLemmaShot } }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
