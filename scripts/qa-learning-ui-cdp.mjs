import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4180/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/learning-ui/screenshots";
const nativeWebView = process.env.QA_NATIVE_WEBVIEW === "1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    if (!payload.id || !pending.has(payload.id)) return;
    const handlers = pending.get(payload.id);
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
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      userGesture: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  async function waitFor(description, predicate, timeout = 16000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Reloads can temporarily invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    await sleep(1250);
    await cdp.send("Page.bringToFront");
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  if (!nativeWebView) {
    await cdp.send("Page.navigate", { url: appUrl });
  }
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(() => {
    const now = new Date().toISOString();
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", "six-sigma-black-belt");
    localStorage.setItem("six-sigma-study:reader-preferences:v1", JSON.stringify({ theme: "light", textScale: "standard" }));
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([{
      id: "qa-context-term",
      bookId: "six-sigma-black-belt",
      bookTitle: "六西格玛黑带培训教材",
      term: "scope",
      translation: "范围",
      contextMeaning: "项目范围",
      contextExplanation: "本句中的 scope 指六西格玛项目明确包含与排除的工作边界。",
      contextCorrectionId: "qa-user-confirmed-scope",
      exampleText: "The project scope should be defined before the team begins measurement.",
      exampleTranslation: "团队开始测量之前，应先明确项目范围。",
      chapter: 9,
      chapterTitle: "Chapter 9: Selecting the Right Projects",
      page: 99,
      sectionId: "ch09-s02-selecting-the-right-projects",
      blockId: "qa-block",
      sourceText: "The project scope should be defined before the team begins measurement.",
      sourceTranslation: "团队开始测量之前，应先明确项目范围。",
      savedAt: now,
      status: "new",
      familiarity: 0,
      reviewCount: 0,
      lapseCount: 0,
      correctStreak: 0,
      nextReviewAt: now,
      intervalDays: 0,
      easeFactor: 2.1,
      sourceType: "manual",
      sourceBookId: "six-sigma-black-belt",
      sourcePage: 99
    }]));
    localStorage.removeItem("six-sigma-study:daily-streak:v1");
    localStorage.removeItem("six-sigma-study:question-progress:v1");
    location.reload();
    return true;
  })()`);
  await waitFor("home", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));

  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("单词"))?.click()`);
  await waitFor("vocabulary plan", () => evaluate(`Boolean(document.querySelector(".vocabPlanHero") && !document.querySelector(".flashAnswer"))`));
  const vocabHome = await evaluate(`(() => ({
    dueText: document.querySelector(".vocabPlanHero h2")?.textContent?.trim(),
    recentTerm: document.querySelector(".recentTerms strong")?.textContent?.trim(),
    answerLeaked: Boolean(document.querySelector(".flashAnswer")),
    bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const vocabHomeShot = await capture("01-vocab-plan");

  await waitFor("vocabulary dictionary ready", () => evaluate(`document.querySelector(".vocabStartButton")?.disabled === false`));
  await evaluate(`document.querySelector(".vocabStartButton")?.click()`);
  await waitFor("flash prompt", () => evaluate(`Boolean(document.querySelector(".flashCard .flashPromptActions"))`));
  const flashPrompt = await evaluate(`(() => ({
    term: document.querySelector(".flashCard h2")?.textContent?.trim(),
    answerHidden: !document.querySelector(".flashAnswer"),
    navHidden: !document.querySelector(".mainNav"),
    scrollY: window.scrollY,
    panelTop: Math.round(document.querySelector(".flashReviewPanel")?.getBoundingClientRect().top ?? -1)
  }))()`);
  const promptShot = await capture("02-flash-prompt");

  await evaluate(`Array.from(document.querySelectorAll(".flashPromptActions button")).find((item) => item.textContent.includes("暂时想不起来"))?.click()`);
  await waitFor("flash answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer .flashExample"))`));
  const flashAnswer = await evaluate(`(() => ({
    dictionaryMeaning: document.querySelector(".flashAnswer .dictionaryTranslation")?.textContent?.trim(),
    contextMeaning: document.querySelector(".flashAnswer .contextMeaningCard .translation")?.textContent?.trim(),
    explanation: document.querySelector(".flashAnswer .contextMeaningCard p:not(.translation)")?.textContent?.trim(),
    underlined: document.querySelector(".flashAnswer .studyTargetTerm")?.textContent?.trim(),
    examples: document.querySelectorAll(".flashExample p").length,
    source: document.querySelector(".flashAnswer .sourceLine")?.textContent?.trim(),
    scrollY: window.scrollY,
    panelTop: Math.round(document.querySelector(".flashReviewPanel")?.getBoundingClientRect().top ?? -1)
  }))()`);
  const answerShot = await capture("03-flash-answer");
  await evaluate(`Array.from(document.querySelectorAll(".flashRatingActions button")).find((item) => item.textContent.trim() === "不认识")?.click()`);
  await waitFor("review completion", () => evaluate(`Boolean(document.querySelector(".flashCompleteState"))`));
  const reviewedTerm = await evaluate(`JSON.parse(localStorage.getItem("six-sigma-study:vocab:v1") ?? "[]")[0]`);

  await evaluate(`document.querySelector(".flashCompleteState .primaryAction")?.click()`);
  await waitFor("vocabulary home return", () => evaluate(`Boolean(document.querySelector(".vocabPlanHero"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("刷题"))?.click()`);
  await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionDashboardHero") && document.querySelector(".questionModeCards"))`));
  const questionHome = await evaluate(`(() => ({
    totalText: document.querySelector(".questionDashboardHero h2")?.textContent?.trim(),
    modeCount: document.querySelectorAll(".questionModeCards button").length,
    bundledText: document.querySelector(".questionBankManager p")?.textContent?.trim(),
    bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const questionHomeShot = await capture("04-question-home");

  await evaluate(`document.querySelector(".questionContinueButton")?.click()`);
  await waitFor("question session", () => evaluate(`Boolean(document.querySelector(".questionSession .questionCard"))`));
  await evaluate(`document.querySelector('[aria-label="切换题目语言"]')?.click()`);
  await waitFor("English question tokens", () => evaluate(`document.querySelectorAll(".questionCard .wordToken").length > 0`));
  const initialQuestionId = await evaluate(`document.querySelector(".questionCard")?.dataset.questionId`);
  const lookupWord = await evaluate(`(() => {
    const token = Array.from(document.querySelectorAll(".questionCard .wordToken"))
      .find((item) => item.textContent.trim().length >= 4);
    token?.click();
    return token?.textContent?.trim() ?? "";
  })()`);
  await waitFor("question word sheet", () => evaluate(`Boolean(document.querySelector(".bottomSheet .contextMeaningCard"))`));
  const questionLookup = await evaluate(`(() => ({
    word: document.querySelector(".bottomSheet h2")?.textContent?.trim(),
    contextMeaning: document.querySelector(".contextMeaningCard strong")?.textContent?.trim(),
    contextExplanation: document.querySelector(".contextMeaningCard p")?.textContent?.trim(),
    hasSave: Boolean(document.querySelector(".bottomSheet .saveButton")),
    sourceLabel: document.querySelector(".lookupContext")?.textContent?.trim(),
    bodyFixed: document.body.style.position === "fixed"
  }))()`);
  const lookupShot = await capture("05-question-word-lookup");
  await evaluate(`document.querySelector(".bottomSheet .closeButton")?.click()`);
  await waitFor("question lookup closed", () => evaluate(`!document.querySelector(".bottomSheet")`));

  await evaluate(`Array.from(document.querySelectorAll(".questionActions button")).find((item) => item.textContent.trim() === "不会")?.click()`);
  await waitFor("question explanation", () => evaluate(`Boolean(document.querySelector(".questionCard .answerPanel"))`));
  const unknownState = await evaluate(`(() => ({
    answer: document.querySelector(".answerPanel strong")?.parentElement?.textContent?.trim(),
    explanation: document.querySelectorAll(".answerPanel p")[2]?.textContent?.trim(),
    stored: JSON.parse(localStorage.getItem("six-sigma-study:question-progress:v1") ?? "{}")[${JSON.stringify(initialQuestionId)}] ?? null
  }))()`);
  const unknownShot = await capture("06-question-unknown-explanation");

  await evaluate(`Array.from(document.querySelectorAll(".questionPager button")).find((item) => item.textContent.trim() === "下一题")?.click()`);
  await waitFor("explicit next after explanation", () => evaluate(`document.querySelector(".questionCard")?.dataset.questionId !== ${JSON.stringify(initialQuestionId)}`));
  const nextQuestionId = await evaluate(`document.querySelector(".questionCard")?.dataset.questionId`);
  await evaluate(`document.querySelector(".questionOption")?.click()`);
  await evaluate(`Array.from(document.querySelectorAll(".questionActions button")).find((item) => item.textContent.trim() === "提交")?.click()`);
  await waitFor("answer revealed without auto advance", () => evaluate(`Boolean(document.querySelector(".questionCard .answerPanel"))`));
  const afterSubmitQuestionId = await evaluate(`document.querySelector(".questionCard")?.dataset.questionId`);
  const advancedShot = await capture("07-question-explicit-next");

  const checks = {
    vocabHome: vocabHome.dueText === "1 个待学" && vocabHome.recentTerm === "scope" && !vocabHome.answerLeaked && vocabHome.bodyOverflow <= 1,
    flashPrompt: flashPrompt.term === "scope" && flashPrompt.answerHidden && flashPrompt.navHidden && flashPrompt.scrollY === 0 && flashPrompt.panelTop < 220,
    flashAnswer: flashAnswer.dictionaryMeaning?.includes("范围") && flashAnswer.contextMeaning === "项目范围" && flashAnswer.explanation.length > 8 && flashAnswer.underlined === "scope" && flashAnswer.examples >= 2 && flashAnswer.scrollY === 0 && flashAnswer.panelTop < 220,
    reviewStored: reviewedTerm.reviewCount === 1 && reviewedTerm.lapseCount === 1 && reviewedTerm.status === "learning",
    questionHome: questionHome.modeCount === 5 && /^\d+\/[1-9]\d*$/.test(questionHome.totalText ?? "") && questionHome.bodyOverflow <= 1,
    questionLookup: lookupWord.length >= 4 && questionLookup.word?.toLowerCase() === lookupWord.toLowerCase() && questionLookup.contextMeaning && questionLookup.contextExplanation && questionLookup.hasSave && questionLookup.bodyFixed,
    unknownExplanation: unknownState.answer?.includes("答案") && unknownState.explanation?.length > 8 && unknownState.stored?.unknownCount >= 1,
    explicitNextAndStableSubmit: Boolean(initialQuestionId && nextQuestionId && initialQuestionId !== nextQuestionId && afterSubmitQuestionId === nextQuestionId)
  };

  cdp.close();
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    ok,
    checks,
    vocabHome,
    flashPrompt,
    flashAnswer,
    reviewedTerm: { status: reviewedTerm.status, reviewCount: reviewedTerm.reviewCount, lapseCount: reviewedTerm.lapseCount, nextReviewAt: reviewedTerm.nextReviewAt },
    questionHome,
    questionLookup,
    unknownState,
    initialQuestionId,
    nextQuestionId,
    afterSubmitQuestionId,
    screenshots: { vocabHomeShot, promptShot, answerShot, questionHomeShot, lookupShot, unknownShot, advancedShot }
  }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
