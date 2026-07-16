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
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions.reinforcement button")).find((item) => item.querySelector("strong")?.textContent.trim() === "已经记住")?.click()`);
  await waitFor("session summary", () => evaluate(`Boolean(document.querySelector(".flashCompleteState"))`));
  const completion = await evaluate(`(() => ({
    title: document.querySelector(".flashCompleteState h2")?.textContent?.trim(),
    counts: Array.from(document.querySelectorAll(".flashSessionResultGrid span")).map((item) => item.textContent.replace(/\s+/g, "").trim()),
    scheduler: document.querySelector(".flashCompleteState small")?.textContent?.trim(),
    daily: JSON.parse(localStorage.getItem("six-sigma-study:daily-streak:v1") ?? "null"),
    terms: JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]")
      .filter((item) => ["qa-legacy-trial", "qa-legacy-throughout"].includes(item.id))
      .map((item) => ({ id: item.id, schedulerVersion: item.schedulerVersion, reviewCard: item.reviewCard, reviewHistory: item.reviewHistory }))
  }))()`);
  const completionShot = await capture("04-session-summary");

  const checks = {
    phraseMigrated: migrated?.term === "trial and error" && migrated?.entryKind === "phrase" && migrated?.dictionaryMeaning === "反复试验",
    exactLocationStored: migrated?.sourceStart === 17 && migrated?.sourceEnd === 32 && migrated?.sourceOccurrence === 0,
    staleSourceNotHijacked: staleSource?.term === "scope" && staleSource?.sourceStart === undefined && staleSource?.sourceOccurrence === undefined,
    dictionaryQuizCopy: phraseQuiz.prompt === "选出它的常用词典义：" && !phraseQuiz.hasPromptStage,
    phraseDictionaryOption: phraseQuiz.options.includes("反复试验") && !phraseQuiz.options.some((item) => item.includes("审判")),
    conciseBalancedDistractors: phraseQuiz.options.length === 4 && phraseQuiz.options.every((item) => item.length <= 24 && !/^(?:n|v|adj|adv|prep)\./i.test(item)),
    phraseAnswer: phraseAnswer.dictionary === "反复试验" && phraseAnswer.underlined === "trial and error" && phraseAnswer.exampleLength <= 170 && phraseAnswer.detailsCollapsed,
    intervalPreviews: phraseAnswer.intervalLabels.length === 3 && phraseAnswer.intervalLabels.every(Boolean),
    ratingDock: phraseAnswer.dockVisible && phraseAnswer.dockVisibleAfterScroll && phraseAnswer.bodyScroll === 0,
    phraseLayout: phraseAnswer.horizontalOverflow <= 1,
    contextNotQuiz: !throughoutQuiz.includes("后续") && throughoutQuiz.every((item) => !item.includes("贯穿全书")),
    throughoutDictionary: throughoutAnswer.dictionary && throughoutAnswer.dictionary !== "后续" && throughoutAnswer.underlined === "throughout",
    shortBilingualExample: throughoutAnswer.exampleLength <= 170 && throughoutAnswer.translationLength <= 110,
    aiPersisted: throughoutAnswer.aiMeaning === "贯穿全书；在全书各处" && throughoutAnswer.aiTranslation.some((item) => item.includes("自始至终")),
    throughoutDockAndLayout: throughoutAnswer.dockVisible && throughoutAnswer.horizontalOverflow <= 1 && nextCardScrollTop === 0,
    sameSessionReinforcement: reinforcement.progress === "巩固" && reinforcement.badge === "巩固轮" && reinforcement.options.includes("反复试验"),
    sessionSummary: completion.title === "本轮完成" && completion.counts.includes("1记得") && completion.counts.includes("1模糊") && completion.counts.includes("0忘记"),
    uniqueDailyCompletion: completion.daily?.completed === 2,
    fsrsPersisted: completion.terms.length === 2 && completion.terms.every((item) => item.schedulerVersion?.startsWith("fsrs-") && item.reviewCard?.due && item.reviewHistory?.length === 1),
    schedulerDisclosure: completion.scheduler?.includes("目标保持率 90%")
  };
  const ok = Object.values(checks).every(Boolean);
  cdp.close();
  console.log(JSON.stringify({ ok, checks, migrated, staleSource, phraseQuiz, phraseAnswer, throughoutQuiz, throughoutAnswer, nextCardScrollTop, reinforcement, completion, screenshots: { vocabHomeShot, quizShot, phraseShot, throughoutShot, reinforcementShot, completionShot } }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
