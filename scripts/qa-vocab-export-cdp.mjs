import fs from "node:fs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const storageKey = "six-sigma-study:vocab:v1";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const bookId = "six-sigma-black-belt";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No debuggable WebView page found");
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
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  async function evalPage(expression, awaitPromise = false) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async function waitFor(description, fn, timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await fn()) {
          return;
        }
      } catch {
        // Keep polling while the WebView is reloading.
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  const seedTerms = [
    {
      id: "six-sigma-seed",
      term: "Six Sigma",
      translation: "六西格玛",
      chapter: 1,
      chapterTitle: "Chapter 1: What is Six Sigma?",
      page: 6,
      sectionId: "ch01-s01-introduction",
      sourceText: "Six Sigma is a disciplined, data-driven approach.",
      savedAt: "2026-06-22T00:00:00.000Z",
      status: "learning",
      reviewCount: 2,
      correctStreak: 1,
      lastReviewedAt: "2026-06-22T00:10:00.000Z",
      nextReviewAt: "2026-06-23T00:10:00.000Z"
    },
    {
      id: "quote-seed",
      term: "CTQ",
      translation: "关键质量特性",
      chapter: 8,
      chapterTitle: "Chapter 8: Quality",
      page: 88,
      sectionId: "ch08-s01-quality",
      sourceText: "A quoted field, with \"commas\", must export safely.",
      savedAt: "2026-06-22T00:20:00.000Z",
      status: "mastered",
      reviewCount: 4,
      correctStreak: 3,
      lastReviewedAt: "2026-06-22T00:30:00.000Z",
      nextReviewAt: "2026-07-22T00:30:00.000Z",
      masteredAt: "2026-06-22T00:30:00.000Z"
    }
  ];

  await evalPage(`(() => {
    localStorage.setItem(${JSON.stringify(noticeAcceptedKey)}, "true");
    localStorage.setItem(${JSON.stringify(activeBookKey)}, ${JSON.stringify(bookId)});
    localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(seedTerms))});
    location.reload();
    return true;
  })()`);

  await sleep(1800);
  await waitFor("book library", () => evalPage(`Boolean(document.querySelector(".bookCard .primaryAction"))`));
  await evalPage(`document.querySelector(".bookCard .primaryAction")?.click()`);
  await waitFor("reader shell", () => evalPage(`Boolean(document.querySelector(".vocabDock"))`));
  await evalPage(`(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text) => {
          window.__csvExportText = text;
          return undefined;
        }
      },
      configurable: true
    });
    document.querySelector(".vocabDock")?.click();
    return true;
  })()`);

  await waitFor("vocabulary panel", () => evalPage(`Boolean(document.querySelector(".vocabPanel"))`));
  await evalPage(`document.querySelector(".vocabTools button")?.click()`);
  await waitFor("CSV export text", () => evalPage(`typeof window.__csvExportText === "string" && window.__csvExportText.length > 0`));

  const result = await evalPage(`(() => {
    const csv = window.__csvExportText;
    const message = document.querySelector(".vocabTools small")?.textContent?.trim() ?? "";
    const doc = document.documentElement;
    return {
      rows: csv.split("\\r\\n").length,
      hasHeader: csv.startsWith('"term","bookId","bookTitle","contentVersion","translation","status"'),
      hasSixSigma: csv.includes('"Six Sigma","six-sigma-black-belt","六西格玛黑带教材",') && csv.includes('"六西格玛","learning"'),
      escapedQuote: csv.includes('"A quoted field, with ""commas"", must export safely."'),
      message,
      horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth
    };
  })()`);

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/vocab-export-qa.png", Buffer.from(screenshot.data, "base64"));

  const ok =
    result.rows === 3 &&
    result.hasHeader &&
    result.hasSixSigma &&
    result.escapedQuote &&
    result.message.includes("CSV") &&
    result.horizontalOverflow <= 1;

  console.log(
    JSON.stringify(
      {
        ok,
        ...result,
        screenshot: "qa/screenshots/vocab-export-qa.png"
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
