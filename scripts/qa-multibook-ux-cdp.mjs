import fs from "node:fs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4177/";
const bookId = "six-sigma-black-belt";
const sampleBookId = "agent-import-sample";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const vocabKey = "six-sigma-study:vocab:v1";
const notesKey = "six-sigma-study:notes:v1";
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
  await cdp.send("Page.navigate", { url: appUrl });
  await sleep(800);

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

  async function waitFor(description, fn, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await fn()) {
          return;
        }
      } catch {
        // DOM can be unavailable during reloads.
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  await evalPage(`(() => {
    localStorage.removeItem(${JSON.stringify(noticeAcceptedKey)});
    localStorage.removeItem(${JSON.stringify(activeBookKey)});
    localStorage.removeItem(${JSON.stringify(vocabKey)});
    localStorage.removeItem(${JSON.stringify(notesKey)});
    localStorage.removeItem(${JSON.stringify(readerPositionKey)});
    location.reload();
    return true;
  })()`);

  await waitFor("splash notice", () => evalPage(`Boolean(document.querySelector(".splashPanel .noticeBox"))`));
  const splash = await evalPage(`(() => {
    const text = document.body.innerText;
    return {
      logo: document.querySelector(".appLogo")?.textContent?.trim() ?? "",
      hasChineseNotice: text.includes("禁止任何商业化使用") && text.includes("不代表 CSSC 官方产品"),
      hasEnglishNotice: text.includes("Commercial use is prohibited") && text.includes("not an official CSSC product"),
      hasReader: Boolean(document.querySelector(".readerPanel"))
    };
  })()`);

  await evalPage(`document.querySelector(".splashPanel .primaryAction")?.click()`);
  await waitFor("home library", () => evalPage(`Boolean(document.querySelector(".bookCard .primaryAction"))`));
  const home = await evalPage(`(() => ({
    cardTitle: document.querySelector(".bookCard h2")?.textContent?.trim() ?? "",
    bookCount: document.querySelectorAll(".bookCard").length,
    intro: document.querySelector(".libraryIntro p")?.textContent?.trim() ?? "",
    sampleTitle: Array.from(document.querySelectorAll(".bookCard h2")).find((item) => item.textContent.includes("Agent"))?.textContent?.trim() ?? "",
    githubHref: document.querySelector('.libraryIntro a')?.href ?? "",
    watermark: document.querySelector(".homeWatermark")?.textContent?.trim() ?? "",
    noticeAccepted: localStorage.getItem(${JSON.stringify(noticeAcceptedKey)})
  }))()`);

  await evalPage(`(() => {
    const sampleCard = Array.from(document.querySelectorAll(".bookCard")).find((card) =>
      card.innerText.includes("Agent 教材导入示例手册")
    );
    sampleCard?.querySelector(".primaryAction")?.click();
  })()`);
  await waitFor("sample reader panel", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await sleep(600);
  const sampleReader = await evalPage(`(() => ({
    activeBook: localStorage.getItem(${JSON.stringify(activeBookKey)}),
    title: document.querySelector(".readerChrome h1")?.textContent?.trim() ?? "",
    hasSampleText: document.body.innerText.includes("Import Contract") && document.body.innerText.includes("What the Agent Receives")
  }))()`);
  const sampleLookup = await evalPage(`(() => {
    const token = Array.from(document.querySelectorAll(".wordToken")).find((item) =>
      item.textContent.trim().toLowerCase() === "import"
    ) ?? Array.from(document.querySelectorAll(".wordToken")).find((item) => item.textContent.trim().length > 3);
    token?.scrollIntoView({ block: "center" });
    token?.click();
    return token?.textContent?.trim() ?? "";
  })()`);
  await waitFor("sample lookup sheet", () => evalPage(`Boolean(document.querySelector(".bottomSheet"))`));
  await evalPage(`document.querySelector(".saveButton")?.click()`);
  await sleep(300);
  const savedSampleTerm = await evalPage(`(() => {
    const terms = JSON.parse(localStorage.getItem(${JSON.stringify(vocabKey)}) ?? "[]");
    return terms.find((item) => item.bookId === ${JSON.stringify(sampleBookId)}) ?? null;
  })()`);
  await evalPage(`document.querySelector(".closeButton")?.click()`);
  await sleep(200);
  await evalPage(`document.querySelector('[aria-label="back to library"]')?.click()`);
  await waitFor("home library after sample", () => evalPage(`Boolean(document.querySelector(".bookCard .primaryAction"))`));

  await evalPage(`(() => {
    const sixSigmaCard = Array.from(document.querySelectorAll(".bookCard")).find((card) =>
      card.innerText.includes("六西格玛黑带培训教材")
    );
    sixSigmaCard?.querySelector(".primaryAction")?.click();
  })()`);
  await waitFor("reader panel", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await sleep(600);

  await evalPage(`document.querySelector(".tocButton")?.click()`);
  await waitFor("toc panel", () => evalPage(`Boolean(document.querySelector(".tocPanel"))`));
  await evalPage(`(() => {
    const input = document.querySelector(".tocSearch input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "340");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor("page 340 result", () => evalPage(`Array.from(document.querySelectorAll(".tocItem")).some((item) => item.innerText.includes("p. 340"))`));
  await evalPage(`Array.from(document.querySelectorAll(".tocItem")).find((item) => item.innerText.includes("p. 340"))?.click()`);
  await waitFor("page 340 active", () =>
    evalPage(`document.querySelector(".readerChrome")?.innerText.toLowerCase().includes("page 340")`)
  );

  const pageSearch = await evalPage(`(() => {
    const block = Array.from(document.querySelectorAll("[data-block-id]")).find((item) => {
      const rect = item.getBoundingClientRect();
      return item.dataset.page === "340" && rect.top >= 0 && rect.top < window.innerHeight;
    });
    return {
      currentText: document.querySelector(".readerChrome")?.innerText ?? "",
      visiblePage340: Boolean(block),
      activeBook: localStorage.getItem(${JSON.stringify(activeBookKey)})
    };
  })()`);

  const lookup = await evalPage(`(() => {
    const tokens = Array.from(document.querySelectorAll(".wordToken"));
    const visibleToken = tokens.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top > 120 && rect.top < window.innerHeight - 160 && item.textContent.trim().length > 2;
    });
    const token =
      visibleToken ??
      tokens.find((item) => item.closest("[data-page='340']") && item.textContent.trim().length > 2) ??
      tokens.find((item) => item.textContent.trim().length > 2);
    token?.scrollIntoView({ block: "center" });
    token?.click();
    return token?.textContent?.trim() ?? "";
  })()`);
  await waitFor("lookup sheet", () => evalPage(`Boolean(document.querySelector(".bottomSheet"))`));
  const sheetLock = await evalPage(`(() => ({
    lookup: ${JSON.stringify(lookup)},
    bodyFixed: document.body.style.position === "fixed",
    sheetOverscroll: getComputedStyle(document.querySelector(".bottomSheet")).overscrollBehaviorY,
    sourceLength: document.querySelector(".exampleBox p")?.textContent?.length ?? 0
  }))()`);
  await evalPage(`document.querySelector(".saveButton")?.click()`);
  await sleep(300);
  const savedTerm = await evalPage(`(() => {
    const terms = JSON.parse(localStorage.getItem(${JSON.stringify(vocabKey)}) ?? "[]");
    return terms.find((item) => item.bookId === ${JSON.stringify(bookId)}) ?? null;
  })()`);
  await evalPage(`document.querySelector(".closeButton")?.click()`);
  await sleep(400);

  await evalPage(`document.querySelector('[aria-label="enter immersive reading"]')?.click()`);
  await waitFor("immersive mode", () => evalPage(`Boolean(document.querySelector(".immersiveExit"))`));
  const immersive = await evalPage(`(() => ({
    chromeHidden: getComputedStyle(document.querySelector(".readerChrome")).display === "none",
    dockHidden: !document.querySelector(".vocabDock"),
    exitText: document.querySelector(".immersiveExit")?.textContent?.trim() ?? ""
  }))()`);
  await evalPage(`document.querySelector(".immersiveExit")?.click()`);
  await sleep(300);

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const screenshotPath = "qa/screenshots/multibook-ux-qa.png";
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const ok =
    splash.logo === "6σ" &&
    splash.hasChineseNotice &&
    splash.hasEnglishNotice &&
    !splash.hasReader &&
    home.cardTitle.includes("六西格玛") &&
    home.bookCount >= 2 &&
    home.intro.includes(`${home.bookCount} 本教材`) &&
    home.sampleTitle.includes("Agent") &&
    home.githubHref === "https://github.com/Felix-Zuo" &&
    home.watermark.includes("Felix-Zuo") &&
    home.noticeAccepted === "true" &&
    sampleReader.activeBook === sampleBookId &&
    sampleReader.title.includes("Import Contract") &&
    sampleReader.hasSampleText &&
    sampleLookup.length > 0 &&
    savedSampleTerm?.bookId === sampleBookId &&
    pageSearch.currentText.toLowerCase().includes("page 340") &&
    pageSearch.visiblePage340 &&
    pageSearch.activeBook === bookId &&
    sheetLock.bodyFixed &&
    sheetLock.sheetOverscroll === "contain" &&
    sheetLock.sourceLength > 0 &&
    sheetLock.sourceLength <= 340 &&
    savedTerm?.bookId === bookId &&
    savedTerm?.blockId &&
    immersive.chromeHidden &&
    immersive.dockHidden &&
    immersive.exitText.includes("p.");

  console.log(
    JSON.stringify(
      {
        ok,
        splash,
        home,
        sampleReader,
        savedSampleTerm: savedSampleTerm
          ? {
              bookId: savedSampleTerm.bookId,
              bookTitle: savedSampleTerm.bookTitle,
              page: savedSampleTerm.page,
              sectionId: savedSampleTerm.sectionId,
              blockId: savedSampleTerm.blockId
            }
          : null,
        pageSearch,
        sheetLock,
        savedTerm: savedTerm
          ? {
              bookId: savedTerm.bookId,
              bookTitle: savedTerm.bookTitle,
              page: savedTerm.page,
              sectionId: savedTerm.sectionId,
              blockId: savedTerm.blockId
            }
          : null,
        immersive,
        screenshot: screenshotPath
      },
      null,
      2
    )
  );

  cdp.close();
  if (!ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
