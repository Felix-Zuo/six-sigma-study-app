import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { waitForVisualIdle } from "./cdp-visual-idle.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4177/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/target4-audit/screenshots";

const keys = {
  notice: "six-sigma-study:notice-accepted:v1",
  activeBook: "six-sigma-study:active-book:v1",
  vocab: "six-sigma-study:vocab:v1",
  notes: "six-sigma-study:notes:v1",
  favorites: "six-sigma-study:favorites:v1",
  readerPosition: "six-sigma-study:reader-position:v1",
  preferences: "six-sigma-study:reader-preferences:v1"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const appOrigin = new URL(appUrl).origin;
  const page =
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl && item.url?.startsWith(appOrigin)) ??
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No debuggable page found");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id || !pending.has(payload.id)) {
      return;
    }
    const { resolve, reject } = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) {
      reject(new Error(JSON.stringify(payload.error)));
      return;
    }
    resolve(payload.result);
  });
  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }
  return { send, close: () => ws.close() };
}

async function main() {
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  async function evalPage(expression, awaitPromise = false) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
    }
    return result.result?.value;
  }

  async function waitFor(description, fn, timeout = 16000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await fn()) {
          return;
        }
      } catch {
        // DOM can be unavailable during reloads.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    await waitForVisualIdle((expression) => evalPage(expression, true), {
      description: `${name} visual idle`
    });
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filePath = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath.replaceAll("\\", "/");
  }

  function screenshotHash(filePath) {
    return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  }

  async function click(selector) {
    return evalPage(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      node?.click();
      return Boolean(node);
    })()`);
  }

  async function clickByText(selector, text) {
    return evalPage(`(() => {
      const node = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((item) => item.textContent.includes(${JSON.stringify(text)}));
      node?.click();
      return Boolean(node);
    })()`);
  }

  async function clickNamedControl(containerSelector, accessibleName) {
    const clicked = await evalPage(`(() => {
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      const container = document.querySelector(${JSON.stringify(containerSelector)});
      const node = Array.from(container?.querySelectorAll("button, a, [role='button']") ?? [])
        .find((item) => {
          const visibleName = normalize(item.textContent);
          const ariaName = normalize(item.getAttribute("aria-label"));
          return visibleName === ${JSON.stringify(accessibleName)} ||
            ariaName === ${JSON.stringify(accessibleName)} ||
            ariaName.startsWith(${JSON.stringify(`${accessibleName}，`)});
        });
      node?.click();
      return Boolean(node);
    })()`);
    if (!clicked) {
      throw new Error(`Could not find ${accessibleName} in ${containerSelector}`);
    }
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application navigation", () => evalPage(`location.href.startsWith(${JSON.stringify(new URL(appUrl).origin)}) && Boolean(document.querySelector("[data-app-view]"))`));
  await evalPage(`(() => {
    for (const key of ${JSON.stringify(Object.values(keys))}) {
      localStorage.removeItem(key);
    }
    location.reload();
    return true;
  })()`);

  await waitFor("opening animation", () => evalPage(`Boolean(document.querySelector(".splashPanel .appLogo.cinematic"))`));
  const openingAnimationCount = await evalPage(`(() => {
    const panel = document.querySelector(".splashPanel");
    const animations = panel?.getAnimations({ subtree: true }) ?? [];
    for (const animation of animations) {
      animation.pause();
      const endTime = Number(animation.effect?.getComputedTiming?.().endTime);
      if (Number.isFinite(endTime)) animation.currentTime = endTime * 0.72;
    }
    globalThis.__qaOpeningAnimations = animations;
    return animations.length;
  })()`);
  const opening = await evalPage(`(() => {
    const panel = document.querySelector(".splashPanel");
    const leads = Array.from(document.querySelectorAll(".splashLead")).map((item) => item.textContent.trim());
    return {
      logo: document.querySelector(".appLogo")?.textContent?.trim() ?? "",
      leadCount: leads.length,
      hasEnglishLine: leads.some((line) => line.includes("For study and translation reference only")),
      hasOldButton: Boolean(panel?.querySelector(".primaryAction")),
      hasLongNotice: Boolean(panel?.querySelector(".noticeBox"))
    };
  })()`);
  const openingShot = await capture("round1-01-opening");
  await evalPage(`(() => {
    for (const animation of globalThis.__qaOpeningAnimations ?? []) animation.play();
    delete globalThis.__qaOpeningAnimations;
    return true;
  })()`);

  await waitFor("home workbench", () => evalPage(`Boolean(document.querySelector(".dashboardHero") && document.querySelector(".mainNav"))`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "home workbench visual idle" });
  const home = await evalPage(`(() => ({
    navCount: document.querySelectorAll(".mainNavItem").length,
    bookCount: document.querySelectorAll(".bookCard").length,
    metricCount: document.querySelectorAll(".metricGrid button").length,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const homeShot = await capture("round1-02-home");

  await evalPage(`document.querySelectorAll(".bookCard .primaryAction")[1]?.click()`);
  await waitFor("second book reader", () => evalPage(`Boolean(document.querySelector(".readerPanel") && localStorage.getItem(${JSON.stringify(keys.activeBook)}) === "agent-import-sample")`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "second book reader visual idle" });
  const secondBook = await evalPage(`(() => ({
    activeBook: localStorage.getItem(${JSON.stringify(keys.activeBook)}),
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    sections: document.querySelectorAll("[data-section-id]").length,
    pageText: document.querySelector(".progressSummary strong")?.textContent?.trim() ?? "",
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const secondBookShot = await capture("round1-03-second-book");

  await evalPage(`document.querySelector('[aria-label="返回书库"]')?.click()`);
  await waitFor("home after second book", () => evalPage(`Boolean(document.querySelector(".dashboardHero"))`));

  await clickNamedControl('nav[aria-label="主导航"]', "我的");
  await waitFor("settings page", () => evalPage(`document.querySelector('[data-app-view="settings"] .appPageHeader h1')?.textContent?.trim() === "我的" && document.querySelectorAll(".settingsPanel").length >= 3`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "settings page visual idle" });
  const settingsBefore = await evalPage(`(() => ({
    panelCount: document.querySelectorAll(".settingsPanel").length,
    hasGithub: Boolean(document.querySelector('a[href*="github.com/Felix-Zuo"]')),
    hasDanger: Boolean(document.querySelector(".dangerButton")),
    themeBefore: document.querySelector(".appShell")?.dataset.theme,
    scaleBefore: document.querySelector(".appShell")?.dataset.textScale
  }))()`);
  const settingsShot = await capture("round1-04-settings");
  await evalPage(`Array.from(document.querySelectorAll(".settingsPanel button")).find((item) => item.textContent.trim().length > 0)?.click()`);
  await waitFor("theme preference update", () => evalPage(`document.querySelector(".appShell")?.dataset.theme !== ${JSON.stringify(settingsBefore.themeBefore)}`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "theme preference visual idle" });
  const settingsAfterTheme = await evalPage(`document.querySelector(".appShell")?.dataset.theme ?? ""`);
  await evalPage(`Array.from(document.querySelectorAll(".settingsPanel button")).find((item) => item.textContent.trim() === "A+")?.click()`);
  await waitFor("text scale preference update", () => evalPage(`document.querySelector(".appShell")?.dataset.textScale !== ${JSON.stringify(settingsBefore.scaleBefore)}`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "text scale preference visual idle" });
  const settingsAfterScale = await evalPage(`document.querySelector(".appShell")?.dataset.textScale ?? ""`);

  await clickNamedControl('nav[aria-label="主导航"]', "首页");
  await waitFor("home after settings", () => evalPage(`Boolean(document.querySelector(".dashboardHero"))`));
  await evalPage(`document.querySelector(".bookCard .primaryAction")?.click()`);
  await waitFor("reader", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "reader visual idle" });
  const readerEn = await evalPage(`(() => ({
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    headerButtons: document.querySelectorAll(".headerActions button").length,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const readerEnShot = await capture("round1-05-reader-en");

  await click('[aria-label="打开目录"]');
  await waitFor("toc sheet", () => evalPage(`Boolean(document.querySelector(".tocPanel"))`));
  await evalPage(`(() => {
    const input = document.querySelector(".tocSearch input");
    input.value = "26";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor("toc filtered results", () => evalPage(`document.querySelectorAll(".tocItem").length > 0`));
  const toc = await evalPage(`(() => ({
    resultCount: document.querySelectorAll(".tocItem").length,
    heightRatio: document.querySelector(".tocPanel").getBoundingClientRect().height / window.innerHeight,
    bodyFixed: document.body.style.position === "fixed",
    overscroll: getComputedStyle(document.querySelector(".tocPanel")).overscrollBehaviorY
  }))()`);
  const tocShot = await capture("round1-06-toc");
  await click(".tocPanel .closeButton");
  await waitFor("toc closed", () => evalPage(`!document.querySelector(".tocPanel")`));

  await click('[aria-label="进入沉浸阅读"]');
  await waitFor("immersive mode", () => evalPage(`Boolean(document.querySelector(".immersiveMode") && document.querySelector(".immersiveExit"))`));
  const immersive = await evalPage(`(() => ({
    hasReader: Boolean(document.querySelector(".readerPanel")),
    chromeHidden: getComputedStyle(document.querySelector(".readerChrome")).display === "none",
    hasExit: Boolean(document.querySelector(".immersiveExit")),
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const immersiveShot = await capture("round1-07-immersive");
  await click(".immersiveExit");
  await waitFor("immersive closed", () => evalPage(`!document.querySelector(".immersiveMode")`));

  const lookupWord = await evalPage(`(() => {
    const token = Array.from(document.querySelectorAll(".wordToken")).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top > 120 && rect.top < window.innerHeight - 180 && item.textContent.trim().length > 3;
    }) ?? document.querySelector(".wordToken");
    token?.scrollIntoView({ block: "center" });
    token?.click();
    return token?.textContent?.trim() ?? "";
  })()`);
  await waitFor("lookup sheet", () => evalPage(`Boolean(document.querySelector(".bottomSheet"))`));
  const lookupHalf = await evalPage(`(() => {
    const sheet = document.querySelector(".bottomSheet");
    return {
      word: ${JSON.stringify(lookupWord)},
      heightRatio: sheet.getBoundingClientRect().height / window.innerHeight,
      saveVisible: document.querySelector(".saveButton").getBoundingClientRect().bottom <= window.innerHeight,
      sourceVisible: Boolean(document.querySelector(".sourceButton")),
      bodyFixed: document.body.style.position === "fixed",
      overscroll: getComputedStyle(sheet).overscrollBehaviorY
    };
  })()`);
  const lookupHalfShot = await capture("round1-08-lookup-half");

  await evalPage(`(() => {
    const handle = document.querySelector(".bottomSheet .sheetHandle");
    handle.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientY: 720, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientY: 80, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientY: 80, bubbles: true }));
    return true;
  })()`);
  await waitFor("expanded lookup sheet", () => evalPage(`document.querySelector(".bottomSheet")?.getBoundingClientRect().height / window.innerHeight > 0.84`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "expanded lookup sheet visual idle" });
  const lookupFull = await evalPage(`document.querySelector(".bottomSheet").getBoundingClientRect().height / window.innerHeight`);
  const lookupFullShot = await capture("round1-09-lookup-full");
  await click(".saveButton");
  await waitFor("saved vocabulary record", () => evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.vocab)}) ?? "[]").length >= 1`));
  const savedTerm = await evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.vocab)}) ?? "[]")[0] ?? null`);
  await click(".sourceButton");
  await waitFor("lookup source returned", () => evalPage(`!document.querySelector(".bottomSheet") && Boolean(document.querySelector(".sourceHighlight"))`));
  const lookupSourceReturn = await evalPage(`(() => {
    const highlight = document.querySelector(".sourceHighlight");
    return {
      blockId: highlight?.dataset.blockId ?? "",
      page: Number(highlight?.dataset.page),
      visible: Boolean(highlight)
    };
  })()`);

  await click('[aria-label="收藏当前内容"]');
  await waitFor("saved favorite record", () => evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.favorites)}) ?? "[]").length >= 1`));
  const savedFavorite = await evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(keys.favorites)}) ?? "[]")[0] ?? null`);

  await click(".modeButton");
  await waitFor("Chinese reader with images", () => evalPage(`document.querySelector(".sectionBody")?.classList.contains("zhText") && document.querySelectorAll(".figureBlock img").length >= 2`));
  await evalPage(`document.querySelector(".figureBlock img")?.scrollIntoView({ block: "center" })`);
  await waitFor("Chinese image loaded", () => evalPage(`Array.from(document.querySelectorAll(".figureBlock img")).some((img) => img.complete && img.naturalWidth > 4)`));
  const readerZh = await evalPage(`(() => ({
    imageCount: document.querySelectorAll(".figureBlock img").length,
    loadedImages: Array.from(document.querySelectorAll(".figureBlock img")).filter((img) => img.complete && img.naturalWidth > 4).length,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const readerZhShot = await capture("round1-10-reader-zh-image");

  const selectedText = await evalPage(`(() => {
    const paragraph = Array.from(document.querySelectorAll(".readerText")).find((item) => item.innerText.trim().length > 20);
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!node || !node.nodeValue) return "";
    const start = Math.max(0, node.nodeValue.search(/\\S/));
    const end = Math.min(node.nodeValue.length, start + 16);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString();
  })()`);
  await waitFor("note selection action", () => evalPage(`Boolean(document.querySelector(".selectionActions button"))`));
  await evalPage(`document.querySelector(".selectionActions button:last-child")?.click()`);
  await waitFor("notes page", () => evalPage(`document.querySelector('[data-app-view="notes"] .appPageHeader h1')?.textContent?.trim() === "笔记" && Boolean(document.querySelector(".studyItem textarea"))`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "notes page visual idle" });
  const notes = await evalPage(`(() => ({
    view: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? "",
    title: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? "",
    selectedText: ${JSON.stringify(selectedText)},
    itemCount: document.querySelectorAll(".studyItem").length,
    hasTextarea: Boolean(document.querySelector(".studyItem textarea")),
    hasSourceButton: Boolean(document.querySelector(".studyItemActions button")),
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(keys.notes)}) ?? "[]")[0] ?? null
  }))()`);
  const notesShot = await capture("round1-11-notes");

  await clickNamedControl('nav[aria-label="主导航"]', "首页");
  await waitFor("home before favorites", () => evalPage(`document.querySelector('[data-app-view="home"] .appPageHeader h1')?.textContent?.trim() === "学习工作台"`));
  await clickNamedControl('nav[aria-label="学习入口"]', "收藏");
  await waitFor("favorites page", () => evalPage(`document.querySelector('[data-app-view="favorites"] .appPageHeader h1')?.textContent?.trim() === "收藏" && document.querySelectorAll(".studyItem").length >= 1`));
  await waitForVisualIdle((expression) => evalPage(expression, true), { description: "favorites page visual idle" });
  const favorites = await evalPage(`(() => ({
    view: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? "",
    title: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? "",
    itemCount: document.querySelectorAll(".studyItem").length,
    hasSourceButton: Boolean(document.querySelector(".studyItemActions button")),
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(keys.favorites)}) ?? "[]")[0] ?? null
  }))()`);
  const favoritesShot = await capture("round1-12-favorites");
  const studyPageScreenshotHashes = {
    notes: screenshotHash(notesShot),
    favorites: screenshotHash(favoritesShot)
  };
  studyPageScreenshotHashes.different = studyPageScreenshotHashes.notes !== studyPageScreenshotHashes.favorites;

  await clickNamedControl('nav[aria-label="主导航"]', "单词");
  await waitFor("vocab learning page", () => evalPage(`Boolean(document.querySelector(".vocabPlanHero") && document.querySelector(".vocabStartButton"))`));
  const vocabPlan = await evalPage(`(() => ({
    hasReviewEntry: Boolean(document.querySelector(".vocabStartButton")),
    hasSourceSummary: Boolean(document.querySelector(".vocabSourceSummary"))
  }))()`);
  await evalPage(`Array.from(document.querySelectorAll(".vocabModeTabs button")).find((item) => item.textContent.trim() === "词库")?.click()`);
  await waitFor("vocab library", () => evalPage(`document.querySelectorAll(".vocabLibraryItem").length >= 1`));
  const vocab = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".vocabLibraryItem").length,
    hasSourceButton: Boolean(document.querySelector(".vocabLibraryItem .studyItemActions button")),
    hasPlanTabs: document.querySelectorAll(".vocabModeTabs button").length === 2,
    hasReviewEntry: ${JSON.stringify(true)},
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(keys.vocab)}) ?? "[]")[0] ?? null
  }))()`);
  const vocabShot = await capture("round1-13-vocab");

  const ok =
    opening.logo.length > 0 &&
    opening.leadCount >= 2 &&
    opening.hasEnglishLine &&
    !opening.hasOldButton &&
    !opening.hasLongNotice &&
    home.navCount === 5 &&
    home.bookCount >= 2 &&
    home.metricCount === 3 &&
    home.overflow <= 1 &&
    secondBook.activeBook === "agent-import-sample" &&
    secondBook.title.length > 0 &&
    secondBook.sections > 0 &&
    secondBook.overflow <= 1 &&
    settingsBefore.panelCount >= 3 &&
    settingsBefore.hasGithub &&
    settingsBefore.hasDanger &&
    settingsAfterTheme &&
    settingsAfterTheme !== settingsBefore.themeBefore &&
    settingsAfterScale !== settingsBefore.scaleBefore &&
    readerEn.title.length > 0 &&
    readerEn.headerButtons <= 8 &&
    readerEn.overflow <= 1 &&
    toc.resultCount > 0 &&
    toc.heightRatio > 0.5 &&
    toc.bodyFixed &&
    toc.overscroll === "contain" &&
    immersive.hasReader &&
    immersive.chromeHidden &&
    immersive.hasExit &&
    immersive.overflow <= 1 &&
    lookupHalf.word.length > 0 &&
    lookupHalf.heightRatio > 0.42 &&
    lookupHalf.heightRatio < 0.7 &&
    lookupHalf.saveVisible &&
    lookupHalf.sourceVisible &&
    lookupHalf.bodyFixed &&
    lookupHalf.overscroll === "contain" &&
    lookupFull > 0.84 &&
    savedTerm?.bookId === "six-sigma-black-belt" &&
    lookupSourceReturn.visible &&
    (!savedTerm?.blockId || lookupSourceReturn.blockId === savedTerm.blockId) &&
    savedFavorite?.bookId === "six-sigma-black-belt" &&
    readerZh.imageCount >= 2 &&
    readerZh.loadedImages >= 1 &&
    readerZh.overflow <= 1 &&
    notes.itemCount >= 1 &&
    notes.view === "notes" &&
    notes.title === "笔记" &&
    notes.hasTextarea &&
    notes.stored?.bookId === "six-sigma-black-belt" &&
    favorites.itemCount >= 1 &&
    favorites.view === "favorites" &&
    favorites.title === "收藏" &&
    favorites.stored?.bookId === "six-sigma-black-belt" &&
    studyPageScreenshotHashes.different &&
    vocab.itemCount >= 1 &&
    vocab.hasPlanTabs &&
    vocabPlan.hasReviewEntry &&
    vocabPlan.hasSourceSummary &&
    vocab.stored?.bookId === "six-sigma-black-belt";

  console.log(JSON.stringify({
    ok,
    opening: { ...opening, animationCount: openingAnimationCount },
    home,
    secondBook,
    settings: { before: settingsBefore, afterTheme: settingsAfterTheme, afterScale: settingsAfterScale },
    readerEn,
    toc,
    immersive,
    lookupHalf,
    lookupFull,
    lookupSourceReturn,
    readerZh,
    notes: { ...notes, stored: notes.stored ? { bookId: notes.stored.bookId, page: notes.stored.page, sectionId: notes.stored.sectionId } : null },
    favorites: { ...favorites, stored: favorites.stored ? { bookId: favorites.stored.bookId, page: favorites.stored.page, sectionId: favorites.stored.sectionId } : null },
    studyPageScreenshotHashes,
    vocab: { plan: vocabPlan, ...vocab, stored: vocab.stored ? { bookId: vocab.stored.bookId, page: vocab.stored.page, blockId: vocab.stored.blockId } : null },
    screenshots: {
      opening: openingShot,
      home: homeShot,
      secondBook: secondBookShot,
      settings: settingsShot,
      readerEn: readerEnShot,
      toc: tocShot,
      immersive: immersiveShot,
      lookupHalf: lookupHalfShot,
      lookupFull: lookupFullShot,
      readerZh: readerZhShot,
      notes: notesShot,
      favorites: favoritesShot,
      vocab: vocabShot
    }
  }, null, 2));

  cdp.close();
  if (!ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
