import fs from "node:fs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4177/";
const bookId = "six-sigma-black-belt";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const vocabKey = "six-sigma-study:vocab:v1";
const notesKey = "six-sigma-study:notes:v1";
const favoritesKey = "six-sigma-study:favorites:v1";
const readerPositionKey = "six-sigma-study:reader-position:v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
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
  await cdp.send("Page.navigate", { url: appUrl });
  await sleep(500);

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

  async function waitFor(description, fn, timeout = 14000) {
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
    fs.mkdirSync("qa/screenshots", { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const path = `qa/screenshots/${name}.png`;
    fs.writeFileSync(path, Buffer.from(screenshot.data, "base64"));
    return path;
  }

  await evalPage(`(() => {
    localStorage.removeItem(${JSON.stringify(noticeAcceptedKey)});
    localStorage.removeItem(${JSON.stringify(activeBookKey)});
    localStorage.removeItem(${JSON.stringify(vocabKey)});
    localStorage.removeItem(${JSON.stringify(notesKey)});
    localStorage.removeItem(${JSON.stringify(favoritesKey)});
    localStorage.removeItem(${JSON.stringify(readerPositionKey)});
    location.reload();
    return true;
  })()`);

  await waitFor("animated splash", () => evalPage(`Boolean(document.querySelector(".splashPanel .appLogo.cinematic"))`));
  const splash = await evalPage(`(() => {
    const text = document.body.innerText;
    return {
      logo: document.querySelector(".appLogo")?.textContent?.trim() ?? "",
      hasShortChinese: text.includes("仅供学习与翻译研究"),
      hasShortEnglish: text.includes("For study and translation reference only"),
      hasOldButton: Boolean(document.querySelector(".splashPanel .primaryAction")),
      hasLongNotice: Boolean(document.querySelector(".splashPanel .noticeBox"))
    };
  })()`);
  const splashShot = await capture("target3-01-splash");

  await waitFor("home dashboard", () => evalPage(`Boolean(document.querySelector(".dashboardHero") && document.querySelector(".mainNav"))`));
  const home = await evalPage(`(() => ({
    navItems: Array.from(document.querySelectorAll(".mainNavItem strong")).map((item) => item.textContent.trim()),
    bookCount: document.querySelectorAll(".bookCard").length,
    hasDashboard: Boolean(document.querySelector(".dashboardHero")),
    hasMetrics: document.querySelectorAll(".metricGrid button").length === 3,
    noticeAccepted: localStorage.getItem(${JSON.stringify(noticeAcceptedKey)}),
    horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const homeShot = await capture("target3-02-home");

  await evalPage(`Array.from(document.querySelectorAll(".bookCard")).find((card) => card.innerText.includes("六西格玛黑带培训教材"))?.querySelector(".primaryAction")?.click()`);
  await waitFor("reader", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await sleep(700);
  const readerEn = await evalPage(`(() => ({
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    headerButtons: document.querySelectorAll(".headerActions button").length,
    imageCount: document.querySelectorAll(".figureBlock img").length,
    hasMainNav: Boolean(document.querySelector(".mainNav"))
  }))()`);
  const readerEnShot = await capture("target3-03-reader-en");

  await evalPage(`document.querySelector(".modeButton")?.click()`);
  await waitFor("reader zh with images", () => evalPage(`document.querySelector(".sectionBody")?.classList.contains("zhText") && document.querySelectorAll(".figureBlock img").length >= 2`));
  await evalPage(`document.querySelector(".figureBlock img")?.scrollIntoView({ block: "center", inline: "nearest" })`);
  await waitFor("reader zh image loaded", () => evalPage(`Array.from(document.querySelectorAll(".figureBlock img")).some((img) => img.complete && img.naturalWidth > 4 && img.naturalHeight > 4 && img.getBoundingClientRect().height > 20)`));
  const readerZh = await evalPage(`(() => ({
    imageCount: document.querySelectorAll(".figureBlock img").length,
    imagesLoaded: Array.from(document.querySelectorAll(".figureBlock img")).some((img) => img.complete && img.naturalWidth > 4 && img.naturalHeight > 4 && img.getBoundingClientRect().height > 20),
    horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth
  }))()`);
  const readerZhShot = await capture("target3-04-reader-zh-image");

  await evalPage(`document.querySelector(".modeButton")?.click()`);
  await sleep(500);
  const lookupWord = await evalPage(`(() => {
    const token = Array.from(document.querySelectorAll(".wordToken")).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top > 140 && rect.top < window.innerHeight - 180 && item.textContent.trim().length > 3;
    }) ?? document.querySelector(".wordToken");
    token?.scrollIntoView({ block: "center" });
    token?.click();
    return token?.textContent?.trim() ?? "";
  })()`);
  await waitFor("lookup sheet", () => evalPage(`Boolean(document.querySelector(".bottomSheet"))`));
  const sheetHalf = await evalPage(`(() => {
    const sheet = document.querySelector(".bottomSheet");
    const save = document.querySelector(".saveButton");
    return {
      word: ${JSON.stringify(lookupWord)},
      heightRatio: sheet.getBoundingClientRect().height / window.innerHeight,
      saveVisible: save.getBoundingClientRect().bottom <= window.innerHeight,
      bodyFixed: document.body.style.position === "fixed",
      overscroll: getComputedStyle(sheet).overscrollBehaviorY
    };
  })()`);
  const sheetHalfShot = await capture("target3-05-sheet-half");

  await evalPage(`(() => {
    const handle = document.querySelector(".bottomSheet .sheetHandle");
    handle.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientY: 720, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientY: 80, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientY: 80, bubbles: true }));
    return true;
  })()`);
  await sleep(350);
  const sheetFull = await evalPage(`document.querySelector(".bottomSheet").getBoundingClientRect().height / window.innerHeight`);
  const sheetFullShot = await capture("target3-06-sheet-full");

  await evalPage(`(() => {
    const handle = document.querySelector(".bottomSheet .sheetHandle");
    handle.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, clientY: 100, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientY: 720, bubbles: true }));
    handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, clientY: 720, bubbles: true }));
    document.querySelector(".saveButton")?.click();
    return true;
  })()`);
  await sleep(300);
  const savedTerm = await evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(vocabKey)}) ?? "[]").find((item) => item.bookId === ${JSON.stringify(bookId)}) ?? null`);
  await evalPage(`document.querySelector(".closeButton")?.click()`);
  await sleep(300);

  await evalPage(`document.querySelector('[aria-label="back to library"]')?.click()`);
  await waitFor("home before vocab page", () => evalPage(`Boolean(document.querySelector(".dashboardHero") && document.querySelector(".mainNav"))`));
  await evalPage(`document.querySelectorAll(".mainNavItem")[1]?.click()`);
  await waitFor("vocab page", () => evalPage(`Boolean(document.querySelector(".appPageHeader h1")?.textContent?.includes("单词本") && document.querySelector(".studyItem"))`));
  const vocabPage = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".studyItem").length,
    hasReader: Boolean(document.querySelector(".readerPanel")),
    hasSourceButton: Boolean(Array.from(document.querySelectorAll(".studyItemActions button")).find((item) => item.textContent.includes("原文")))
  }))()`);
  const vocabShot = await capture("target3-07-vocab");

  await evalPage(`Array.from(document.querySelectorAll(".studyItemActions button")).find((item) => item.textContent.includes("原文"))?.click()`);
  await waitFor("reader from vocab source", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await sleep(500);
  await evalPage(`document.querySelector('[aria-label="favorite current source"]')?.click()`);
  const savedFavorite = await evalPage(`JSON.parse(localStorage.getItem(${JSON.stringify(favoritesKey)}) ?? "[]")[0] ?? null`);

  await evalPage(`(() => {
    const paragraph = Array.from(document.querySelectorAll(".readerText")).find((item) => item.innerText.trim().length > 20);
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!node || !node.nodeValue) return false;
    const start = Math.max(0, node.nodeValue.search(/\\S/));
    const end = Math.min(node.nodeValue.length, start + 18);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString();
  })()`);
  await waitFor("selection actions", () => evalPage(`Boolean(document.querySelector(".selectionActions button"))`));
  await evalPage(`document.querySelector(".selectionActions button:last-child")?.click()`);
  await waitFor("notes page", () => evalPage(`Boolean(document.querySelector(".appPageHeader h1")?.textContent?.includes("笔记") && document.querySelector(".studyItem"))`));
  const notesPage = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".studyItem").length,
    hasTextarea: Boolean(document.querySelector(".studyItem textarea")),
    hasSourceButton: Boolean(Array.from(document.querySelectorAll(".studyItemActions button")).find((item) => item.textContent.includes("原文")))
  }))()`);
  const notesShot = await capture("target3-08-notes");

  await evalPage(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.innerText.includes("收藏"))?.click()`);
  await waitFor("favorites page", () => evalPage(`Boolean(document.querySelector(".appPageHeader h1")?.textContent?.includes("收藏") && document.querySelector(".studyItem"))`));
  const favoritesPage = await evalPage(`(() => ({
    itemCount: document.querySelectorAll(".studyItem").length,
    hasSourceButton: Boolean(Array.from(document.querySelectorAll(".studyItemActions button")).find((item) => item.textContent.includes("原文")))
  }))()`);
  const favoritesShot = await capture("target3-09-favorites");

  const ok =
    splash.logo === "6σ" &&
    splash.hasShortChinese &&
    splash.hasShortEnglish &&
    !splash.hasOldButton &&
    !splash.hasLongNotice &&
    home.navItems.join("|") === "书库|单词|笔记|收藏|我的" &&
    home.bookCount >= 2 &&
    home.hasDashboard &&
    home.hasMetrics &&
    home.noticeAccepted === "true" &&
    home.horizontalOverflow <= 1 &&
    readerEn.title.length > 0 &&
    readerEn.headerButtons <= 8 &&
    !readerEn.hasMainNav &&
    readerZh.imageCount >= 2 &&
    readerZh.imagesLoaded &&
    readerZh.horizontalOverflow <= 1 &&
    sheetHalf.word.length > 0 &&
    sheetHalf.heightRatio > 0.42 &&
    sheetHalf.heightRatio < 0.7 &&
    sheetHalf.saveVisible &&
    sheetHalf.bodyFixed &&
    sheetHalf.overscroll === "contain" &&
    sheetFull > 0.84 &&
    savedTerm?.bookId === bookId &&
    vocabPage.itemCount >= 1 &&
    vocabPage.hasSourceButton &&
    !vocabPage.hasReader &&
    savedFavorite?.bookId === bookId &&
    notesPage.itemCount >= 1 &&
    notesPage.hasTextarea &&
    notesPage.hasSourceButton &&
    favoritesPage.itemCount >= 1 &&
    favoritesPage.hasSourceButton;

  console.log(JSON.stringify({
    ok,
    splash,
    home,
    readerEn,
    readerZh,
    sheetHalf,
    sheetFull,
    savedTerm: savedTerm ? { bookId: savedTerm.bookId, page: savedTerm.page, blockId: savedTerm.blockId } : null,
    savedFavorite: savedFavorite ? { bookId: savedFavorite.bookId, page: savedFavorite.page, blockId: savedFavorite.blockId } : null,
    vocabPage,
    notesPage,
    favoritesPage,
    screenshots: {
      splash: splashShot,
      home: homeShot,
      readerEn: readerEnShot,
      readerZh: readerZhShot,
      sheetHalf: sheetHalfShot,
      sheetFull: sheetFullShot,
      vocab: vocabShot,
      notes: notesShot,
      favorites: favoritesShot
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
