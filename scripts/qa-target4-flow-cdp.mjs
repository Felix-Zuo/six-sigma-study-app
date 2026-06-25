import fs from "node:fs";
import path from "node:path";

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
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filePath = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath.replaceAll("\\", "/");
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

  await cdp.send("Page.navigate", { url: appUrl });
  await sleep(400);
  await evalPage(`(() => {
    for (const key of ${JSON.stringify(Object.values(keys))}) {
      localStorage.removeItem(key);
    }
    location.reload();
    return true;
  })()`);

  await waitFor("opening animation", () => evalPage(`Boolean(document.querySelector(".splashPanel .appLogo.cinematic"))`));
  await sleep(1700);
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

  await waitFor("home workbench", () => evalPage(`Boolean(document.querySelector(".dashboardHero") && document.querySelector(".mainNav"))`));
  const home = await evalPage(`(() => ({
    navCount: document.querySelectorAll(".mainNavItem").length,
    bookCount: document.querySelectorAll(".bookCard").length,
    metricCount: document.querySelectorAll(".metricGrid button").length,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const homeShot = await capture("round1-02-home");

  await evalPage(`document.querySelectorAll(".bookCard .primaryAction")[1]?.click()`);
  await waitFor("second book reader", () => evalPage(`Boolean(document.querySelector(".readerPanel") && localStorage.getItem(${JSON.stringify(keys.activeBook)}) === "agent-import-sample")`));
  await sleep(500);
  const secondBook = await evalPage(`(() => ({
    activeBook: localStorage.getItem(${JSON.stringify(keys.activeBook)}),
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    sections: document.querySelectorAll("[data-section-id]").length,
    pageText: document.querySelector(".progressSummary strong")?.textContent?.trim() ?? "",
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const secondBookShot = await capture("round1-03-second-book");

  await evalPage(`document.querySelector('[aria-label="back to library"]')?.click()`);
  await waitFor("home after second book", () => evalPage(`Boolean(document.querySelector(".dashboardHero"))`));

  await evalPage(`document.querySelectorAll(".mainNavItem")[4]?.click()`);
  await waitFor("settings page", () => evalPage(`document.querySelector(".appPageHeader h1") && document.querySelectorAll(".settingsPanel").length >= 3`));
  const settingsBefore = await evalPage(`(() => ({
    panelCount: document.querySelectorAll(".settingsPanel").length,
    hasGithub: Boolean(document.querySelector('a[href*="github.com/Felix-Zuo"]')),
    hasDanger: Boolean(document.querySelector(".dangerButton")),
    themeBefore: document.querySelector(".appShell")?.dataset.theme,
    scaleBefore: document.querySelector(".appShell")?.dataset.textScale
  }))()`);
  const settingsShot = await capture("round1-04-settings");
  await evalPage(`Array.from(document.querySelectorAll(".settingsPanel button")).find((item) => item.textContent.trim().length > 0)?.click()`);
  await sleep(200);
  const settingsAfterTheme = await evalPage(`document.querySelector(".appShell")?.dataset.theme ?? ""`);
  await evalPage(`Array.from(document.querySelectorAll(".settingsPanel button")).find((item) => item.textContent.trim() === "A+")?.click()`);
  await sleep(200);
  const settingsAfterScale = await evalPage(`document.querySelector(".appShell")?.dataset.textScale ?? ""`);

  await evalPage(`document.querySelectorAll(".mainNavItem")[0]?.click()`);
  await waitFor("home after settings", () => evalPage(`Boolean(document.querySelector(".dashboardHero"))`));
  await evalPage(`document.querySelector(".bookCard .primaryAction")?.click()`);
  await waitFor("reader", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await sleep(600);
  const readerEn = await evalPage(`(() => ({
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    headerButtons: document.querySelectorAll(".headerActions button").length,
    overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const readerEnShot = await capture("round1-05-reader-en");

  await click('[aria-label="open table of contents"]');
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

  await click('[aria-label="enter immersive reading"]');
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
  await sleep(300);
  const lookupFull = await evalPage(`document.querySelector(".bottomSheet").getBoundingClientRect().height / window.innerHeight`);
  const lookupFullShot = await capture("round1-09-lookup-full");
  await click(".saveButton");
  await sleep(200);
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

  await click('[aria-label="favorite current source"]');
  await sleep(200);
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
  await waitFor("notes page", () => evalPage(`Boolean(document.querySelector(".studyItem textarea"))`));
  const notes = await evalPage(`(() => ({
    selectedText: ${JSON.stringify(selectedText)},
    itemCount: document.querySelectorAll(".studyItem").length,
    hasTextarea: Boolean(document.querySelector(".studyItem textarea")),
    hasSourceButton: Boolean(document.querySelector(".studyItemActions button")),
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(keys.notes)}) ?? "[]")[0] ?? null
  }))()`);
  const notesShot = await capture("round1-11-notes");

  await evalPage(`document.querySelectorAll(".mainNavItem")[3]?.click()`);
  await waitFor("favorites page", () => evalPage(`document.querySelectorAll(".studyItem").length >= 1`));
  const favorites = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".studyItem").length,
    hasSourceButton: Boolean(document.querySelector(".studyItemActions button")),
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(keys.favorites)}) ?? "[]")[0] ?? null
  }))()`);
  const favoritesShot = await capture("round1-12-favorites");

  await evalPage(`document.querySelectorAll(".mainNavItem")[1]?.click()`);
  await waitFor("vocab page", () => evalPage(`document.querySelectorAll(".studyItem").length >= 1`));
  const vocab = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".studyItem").length,
    hasSourceButton: Boolean(document.querySelector(".studyItemActions button")),
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
    notes.hasTextarea &&
    notes.stored?.bookId === "six-sigma-black-belt" &&
    favorites.itemCount >= 1 &&
    favorites.stored?.bookId === "six-sigma-black-belt" &&
    vocab.itemCount >= 1 &&
    vocab.stored?.bookId === "six-sigma-black-belt";

  console.log(JSON.stringify({
    ok,
    opening,
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
    vocab: { ...vocab, stored: vocab.stored ? { bookId: vocab.stored.bookId, page: vocab.stored.page, blockId: vocab.stored.blockId } : null },
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
