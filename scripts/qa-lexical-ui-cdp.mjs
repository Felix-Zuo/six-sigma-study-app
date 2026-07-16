import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4180/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/lexical-ui/screenshots";
const nativeWebView = process.env.QA_NATIVE_WEBVIEW === "1";

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
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
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
        // Reloads temporarily invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    await sleep(1250);
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  if (!nativeWebView) {
    await cdp.send("Page.navigate", { url: appUrl });
  }
  await waitFor("application", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  if (!nativeWebView) {
    await evaluate(`(async () => {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheNames = await caches?.keys?.() ?? [];
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      return true;
    })()`);
  }
  await evaluate(`(() => {
    const now = new Date().toISOString();
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", "six-sigma-black-belt");
    localStorage.removeItem("six-sigma-study:reader-position:v1");
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([{
      id: "qa-old-constant", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "constant", translation: "常数", contextMeaning: "常数", contextExplanation: "旧错误语境义",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "real-world-examples", blockId: "real-world-examples-en-015",
      sourceText: "For most organizations, Six Sigma processes are a constant target.",
      sourceTranslation: "美国空中交通管制员每天处理商业航班。",
      savedAt: now, status: "new", familiarity: 0, reviewCount: 0, lapseCount: 0, correctStreak: 0,
      nextReviewAt: now, intervalDays: 0, easeFactor: 2.1, sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7
    }, {
      id: "qa-old-equation", bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      term: "equation", translation: "相等", contextMeaning: "相等", contextExplanation: "旧错误语境义",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 8,
      sectionId: "calculating-sigma-level", blockId: "calculating-sigma-level-en-001",
      sourceText: "Organizations and teams can calculate the sigma level of a product or process using the equation below:",
      savedAt: now, status: "new", familiarity: 0, reviewCount: 0, lapseCount: 0, correctStreak: 0,
      nextReviewAt: now, intervalDays: 0, easeFactor: 2.1, sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 8
    }]));
    localStorage.removeItem("six-sigma-study:daily-streak:v1");
    localStorage.removeItem("six-sigma-study:question-progress:v1");
    location.reload();
  })()`);
  await waitFor("main navigation", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("单词"))?.click()`);
  await waitFor("vocab plan", () => evaluate(`Boolean(document.querySelector(".vocabStartButton:not(:disabled)"))`));
  await evaluate(`document.querySelector(".vocabStartButton")?.click()`);
  await waitFor("constant quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "constant" && Boolean(document.querySelector(".flashQuiz"))`));
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)"))
    .find((item) => item.textContent.includes("常数"))?.click()`);
  await waitFor("constant answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer"))`));
  const flash = await evaluate(`(() => ({
    phonetic: document.querySelector(".flashTermMeta .phonetic")?.textContent?.trim(),
    dictionary: document.querySelector(".flashDictionarySummary .dictionaryTranslation")?.textContent?.trim(),
    context: document.querySelector(".flashAnswer .contextMeaningCard .translation")?.textContent?.trim(),
    translation: document.querySelector(".flashExample p:not([lang='en'])")?.textContent?.trim(),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const flashShot = await capture("01-constant-rich-answer");

  await evaluate(`document.querySelector(".flashRatingActions .primaryAction")?.click()`);
  await waitFor("equation quiz", () => evaluate(`document.querySelector(".flashCard h2")?.textContent?.trim() === "equation" && Boolean(document.querySelector(".flashQuiz"))`));
  await evaluate(`Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)"))
    .find((item) => item.textContent.includes("等式") || item.textContent.includes("方程式"))?.click()`);
  await waitFor("equation answer", () => evaluate(`Boolean(document.querySelector(".flashAnswer"))`));
  const equation = await evaluate(`(() => ({
    phonetic: document.querySelector(".flashTermMeta .phonetic")?.textContent?.trim(),
    dictionary: document.querySelector(".flashDictionarySummary .dictionaryTranslation")?.textContent?.trim(),
    context: document.querySelector(".flashAnswer .contextMeaningCard .translation")?.textContent?.trim(),
    translation: document.querySelector(".flashExample p:not([lang='en'])")?.textContent?.trim(),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const equationShot = await capture("02-equation-rich-answer");

  await evaluate(`location.reload()`);
  await waitFor("navigation after reload", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("刷题"))?.click()`);
  await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionContinueButton"))`));
  await evaluate(`document.querySelector(".questionContinueButton")?.click()`);
  await waitFor("question session", () => evaluate(`Boolean(document.querySelector(".questionCard"))`));
  for (let index = 0; index < 4; index += 1) {
    const before = await evaluate(`document.querySelector(".questionCard")?.dataset.questionId`);
    await evaluate(`Array.from(document.querySelectorAll(".questionPager button")).find((item) => item.textContent.includes("下一题"))?.click()`);
    await waitFor("next public question", () => evaluate(`document.querySelector(".questionCard")?.dataset.questionId !== ${JSON.stringify(before)}`));
  }
  await evaluate(`document.querySelector('[aria-label="切换题目语言"]')?.click()`);
  await waitFor("English distinguish token", () => evaluate(`Array.from(document.querySelectorAll(".questionWordToken")).some((item) => item.textContent.trim().toLowerCase() === "distinguish")`));
  await evaluate(`Array.from(document.querySelectorAll(".questionWordToken")).find((item) => item.textContent.trim().toLowerCase() === "distinguish")?.click()`);
  await waitFor("distinguish lookup", () => evaluate(`document.querySelector(".bottomSheet h2")?.textContent?.trim().toLowerCase() === "distinguish"`));
  const lookup = await evaluate(`(() => ({
    phonetic: document.querySelector(".dictionaryCard .phonetic")?.textContent?.trim(),
    dictionary: document.querySelector(".dictionaryCard .dictionaryTranslation")?.textContent?.trim(),
    partOfSpeech: document.querySelector(".dictionaryCard .partOfSpeech")?.textContent?.trim(),
    context: document.querySelector(".contextMeaningCard strong")?.textContent?.trim(),
    exampleTranslation: document.querySelector(".exampleBox p:not([lang='en'])")?.textContent?.trim(),
    hasPronunciation: Boolean(document.querySelector('.dictionaryCard [aria-label*="播放 distinguish"]')),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  let nativePronunciationMessage = null;
  if (nativeWebView) {
    await evaluate(`document.querySelector('.dictionaryCard [aria-label*="播放 distinguish"]')?.click()`);
    await sleep(700);
    nativePronunciationMessage = await evaluate(`document.querySelector(".pronunciationMessage")?.textContent?.trim() ?? ""`);
  }
  const lookupShot = await capture("03-distinguish-question-lookup");

  const checks = {
    constantPhonetic: flash.phonetic?.includes("ˈkɒnstənt"),
    constantRichDictionary: flash.dictionary?.includes("常数") && flash.dictionary?.includes("不变的") && flash.dictionary?.includes("；"),
    constantContext: flash.context === "持续不变的；恒定的",
    constantExampleTranslation: flash.translation?.includes("持续追求的目标"),
    constantLayout: flash.horizontalOverflow <= 1,
    equationPhonetic: equation.phonetic?.includes("iˈkweiʃən"),
    equationRichDictionary: equation.dictionary?.includes("等式") && equation.dictionary?.includes("方程式") && equation.dictionary?.includes("；"),
    equationContext: equation.context === "方程式；计算公式",
    equationExampleTranslation: equation.translation?.includes("使用下面的公式计算"),
    equationLayout: equation.horizontalOverflow <= 1,
    distinguishPhonetic: lookup.phonetic?.includes("disˈtiŋgwiʃ"),
    distinguishDictionary: lookup.dictionary?.includes("区别") && lookup.dictionary?.includes("辨别"),
    distinguishContext: lookup.context === "区分；辨别",
    distinguishPartOfSpeech: lookup.partOfSpeech?.includes("动词"),
    distinguishExampleTranslation: lookup.exampleTranslation?.includes("区分普通原因波动"),
    pronunciationControl: lookup.hasPronunciation,
    nativePronunciation: !nativeWebView || nativePronunciationMessage === "",
    lookupLayout: lookup.horizontalOverflow <= 1
  };
  const ok = Object.values(checks).every(Boolean);
  cdp.close();
  console.log(JSON.stringify({ ok, checks, flash, equation, lookup, nativePronunciationMessage, screenshots: { flashShot, equationShot, lookupShot } }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
