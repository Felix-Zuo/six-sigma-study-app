import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4180/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/fly-view-vocab/screenshots";
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

  async function waitFor(description, predicate, timeout = 18_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Reloads briefly invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name, delay = 800) {
    await sleep(delay);
    await cdp.send("Page.bringToFront");
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    fs.mkdirSync(screenshotDir, { recursive: true });
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  await cdp.send("Page.navigate", { url: `${appUrl}?qa-fly-view=1` });
  await waitFor("application", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
    localStorage.removeItem("six-sigma-study:notice-accepted:v1");
    localStorage.setItem("six-sigma-study:reader-preferences:v1", JSON.stringify({ theme: "light", textScale: "standard" }));
    location.reload();
  })()`);
  await waitFor("Fly View opening", () => evaluate(`document.querySelector('[data-app-view="splash"] h1')?.textContent.trim() === "飞阅"`));
  const splash = await evaluate(`(() => {
    const image = document.querySelector(".splashMark img");
    return {
      title: document.querySelector(".splashCopy h1")?.textContent?.trim(),
      english: document.querySelector(".splashCopy .eyebrow")?.textContent?.trim(),
      imageReady: Boolean(image?.complete && image?.naturalWidth),
      imageAlt: image?.getAttribute("alt"),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  const splashShot = await capture("01-fly-view-opening", 760);

  await evaluate(`(() => {
    const now = new Date();
    const base = {
      bookId: "six-sigma-black-belt", bookTitle: "六西格玛黑带培训教材",
      contentVersion: "0.2.0", entryKind: "word", partOfSpeech: "n.",
      chapter: 1, chapterTitle: "Chapter 1: What is Six Sigma?", page: 7,
      sectionId: "ch01-s01", blockId: "qa-fly-view-block",
      savedAt: now.toISOString(), familiarity: 0, reviewCount: 0, lapseCount: 0,
      correctStreak: 0, nextReviewAt: now.toISOString(), intervalDays: 0, easeFactor: 2.1
    };
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", "six-sigma-black-belt");
    localStorage.setItem("six-sigma-study:vocab:v1", JSON.stringify([
      { ...base, id: "qa-manual-new", term: "variation", translation: "变异；差异", dictionaryMeaning: "变异；差异", sourceText: "Variation is present in every process.", sourceTranslation: "每个流程中都存在变异。", contextMeaning: "流程变异", contextExplanation: "这里指流程输出随时间发生的差异。", exampleText: "Variation is present in every process.", exampleTranslation: "每个流程中都存在变异。", status: "new", sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7 },
      { ...base, id: "qa-question-learning", term: "distinguish", translation: "区分；辨别", dictionaryMeaning: "区分；辨别", sourceText: "A control chart helps distinguish common and special causes.", sourceTranslation: "控制图有助于区分普通原因和特殊原因。", contextMeaning: "区分", contextExplanation: "在题目中表示辨别两类波动原因。", exampleText: "A control chart helps distinguish common and special causes.", exampleTranslation: "控制图有助于区分普通原因和特殊原因。", status: "learning", sourceType: "question", sourceQuestionId: "public-sample-001", sourceDomain: "Control" },
      { ...base, id: "qa-manual-mastered", term: "capability", translation: "能力；过程能力", dictionaryMeaning: "能力；过程能力", sourceText: "Process capability compares output with specifications.", sourceTranslation: "过程能力将输出与规格进行比较。", contextMeaning: "过程能力", contextExplanation: "这里指流程持续满足规格要求的能力。", exampleText: "Process capability compares output with specifications.", exampleTranslation: "过程能力将输出与规格进行比较。", status: "mastered", familiarity: 5, reviewCount: 5, correctStreak: 4, masteredAt: now.toISOString(), sourceType: "manual", sourceBookId: "six-sigma-black-belt", sourcePage: 7 }
    ]));
    location.reload();
  })()`);
  await waitFor("home", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'home'`));
  const homeBrand = await evaluate(`(() => ({
    brand: document.querySelector(".workspaceBrand .eyebrow")?.textContent?.trim(),
    title: document.title,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("单词"))?.click()`);
  await waitFor("vocabulary plan", () => evaluate(`Boolean(document.querySelector(".vocabPlanHero"))`));
  const plan = await evaluate(`(() => ({
    labels: Array.from(document.querySelectorAll(".vocabSourceSummary button")).map((button) => button.textContent.replace(/\\s+/g, " ").trim()),
    tags: Array.from(document.querySelectorAll(".vocabSourceSummary > *")).map((item) => item.tagName),
    aria: Array.from(document.querySelectorAll(".vocabSourceSummary button")).map((button) => button.getAttribute("aria-label")),
    targets: Array.from(document.querySelectorAll(".vocabSourceSummary button")).map((button) => {
      const rect = button.getBoundingClientRect(); return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const planShot = await capture("02-vocabulary-collections");

  await evaluate(`document.querySelector('.vocabSourceSummary button[aria-label*="教材词语"]')?.click()`);
  await waitFor("manual collection", () => evaluate(`document.querySelector(".vocabCollectionHeader h2")?.textContent.trim() === "教材词语"`));
  const manual = await evaluate(`(() => ({
    count: document.querySelectorAll(".vocabLibraryItem").length,
    terms: Array.from(document.querySelectorAll(".vocabLibraryCopy > strong")).map((item) => item.textContent.trim()),
    selected: document.querySelector('.vocabCollectionTabs [aria-selected="true"]')?.textContent.replace(/\\s+/g, " ").trim(),
    scrollY: window.scrollY
  }))()`);
  const manualShot = await capture("03-manual-vocabulary");

  await evaluate(`Array.from(document.querySelectorAll(".vocabCollectionTabs button")).find((button) => button.textContent.includes("题目"))?.click()`);
  await waitFor("question collection", () => evaluate(`document.querySelector(".vocabCollectionHeader h2")?.textContent.trim() === "题目词语"`));
  await evaluate(`document.querySelector(".vocabLibraryToggle")?.click()`);
  await waitFor("question term expanded", () => evaluate(`Boolean(document.querySelector(".vocabLibraryDetails"))`));
  const question = await evaluate(`(() => ({
    count: document.querySelectorAll(".vocabLibraryItem").length,
    term: document.querySelector(".vocabLibraryCopy > strong")?.textContent?.trim(),
    expanded: document.querySelector(".vocabLibraryToggle")?.getAttribute("aria-expanded"),
    context: document.querySelector(".vocabLibraryDetails p")?.textContent?.trim(),
    sourceAction: document.querySelector(".vocabLibraryDetails .studyItemActions button")?.textContent?.trim(),
    scrollY: window.scrollY,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const questionShot = await capture("04-question-vocabulary-expanded");

  await evaluate(`Array.from(document.querySelectorAll(".vocabCollectionTabs button")).find((button) => button.textContent.includes("已掌握"))?.click()`);
  await waitFor("mastered collection", () => evaluate(`document.querySelector(".vocabCollectionHeader h2")?.textContent.trim() === "已掌握"`));
  await evaluate(`document.querySelector(".vocabLibraryToggle")?.click()`);
  await waitFor("mastered term expanded", () => evaluate(`Boolean(document.querySelector(".vocabLibraryDetails"))`));
  const mastered = await evaluate(`(() => ({
    count: document.querySelectorAll(".vocabLibraryItem").length,
    term: document.querySelector(".vocabLibraryCopy > strong")?.textContent?.trim(),
    expanded: document.querySelector(".vocabLibraryToggle")?.getAttribute("aria-expanded"),
    sourceAction: document.querySelector(".vocabLibraryDetails .studyItemActions button")?.textContent?.trim(),
    scrollY: window.scrollY,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const masteredShot = await capture("05-mastered-vocabulary-expanded");

  const checks = {
    openingBrand: splash.title === "飞阅" && splash.english === "Fly View" && splash.imageReady && splash.imageAlt === "" && splash.overflow <= 1,
    homeBrand: homeBrand.brand === "Fly View · 飞阅" && homeBrand.title === "飞阅 · Fly View" && homeBrand.overflow <= 1,
    semanticCollectionControls: plan.tags.length === 3 && plan.tags.every((tag) => tag === "BUTTON") && plan.aria.every(Boolean),
    collectionCountsVisible: plan.labels.some((label) => label.includes("2") && label.includes("教材词语")) && plan.labels.some((label) => label.includes("1") && label.includes("题目词语")) && plan.labels.some((label) => label.includes("1") && label.includes("已掌握")),
    touchTargets: plan.targets.every(({ width, height }) => width >= 44 && height >= 44) && plan.overflow <= 1,
    manualCollection: manual.count === 2 && manual.terms.map((term) => term.toLowerCase()).includes("variation") && manual.terms.map((term) => term.toLowerCase()).includes("capability") && manual.selected?.startsWith("教材") && manual.scrollY === 0,
    questionCollection: question.count === 1 && question.term === "distinguish" && question.expanded === "true" && question.context?.length > 8 && question.sourceAction === "回到题目" && question.scrollY === 0 && question.overflow <= 1,
    masteredCollection: mastered.count === 1 && mastered.term === "capability" && mastered.expanded === "true" && mastered.sourceAction === "回到原文" && mastered.scrollY === 0 && mastered.overflow <= 1
  };
  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    splash,
    homeBrand,
    plan,
    manual,
    question,
    mastered,
    screenshots: { splashShot, planShot, manualShot, questionShot, masteredShot }
  };
  cdp.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
