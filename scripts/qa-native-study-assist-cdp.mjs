import { execFileSync } from "node:child_process";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9340/json";
const appUrl = process.env.QA_APP_URL ?? "https://localhost/";
const adbPath = process.env.QA_ADB_PATH ?? "adb";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("No Android WebView page found");
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
    send(method, params = {}, timeout = 20000) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`CDP ${method} timed out`));
        }, timeout);
        pending.set(callId, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          }
        });
      });
    },
    close: () => ws.close()
  };
}

async function main() {
  const cdp = await connect();
  await cdp.send("Runtime.enable");
  const androidApiLevel = Number.parseInt(
    execFileSync(adbPath, ["shell", "getprop", "ro.build.version.sdk"], { encoding: "utf8" }).trim(),
    10
  );
  const backDispatchMode = androidApiLevel >= 36 ? "document-backbutton-bridge" : "adb-keyevent";

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

  async function waitFor(description, predicate, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Native reloads briefly replace the execution context.
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function pressBack() {
    if (androidApiLevel >= 36) {
      await evaluate(`document.dispatchEvent(new Event("backbutton"))`);
      return;
    }
    execFileSync(adbPath, ["shell", "input", "keyevent", "4"], { stdio: "ignore" });
  }

  async function clickByText(selector, label) {
    const clicked = await evaluate(`(() => {
      const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((item) => item.textContent?.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(label)}));
      target?.click();
      return Boolean(target);
    })()`);
    if (!clicked) throw new Error(`Could not click ${label}`);
  }

  await waitFor("native app shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`), 60000);
  await evaluate(`(() => {
    const keys = [
      "six-sigma-study:reader-position:v1",
      "six-sigma-study:active-book:v1",
      "six-sigma-study:chapter-progress:v1"
    ];
    if (!sessionStorage.getItem("qa-native-study-assist-backup")) {
      sessionStorage.setItem("qa-native-study-assist-backup", JSON.stringify(
        Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]))
      ));
    }
    const now = new Date().toISOString();
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", "six-sigma-black-belt");
    localStorage.removeItem("six-sigma-study:chapter-progress:v1");
    localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
      activeBookId: "six-sigma-black-belt",
      positions: {
        "six-sigma-black-belt": {
          bookId: "six-sigma-black-belt",
          chapterId: "ch01",
          sectionId: "ch01-overview",
          page: 6,
          language: "en",
          scrollY: 0,
          updatedAt: now
        }
      },
      updatedAt: now
    }));
    location.href = ${JSON.stringify(`${appUrl}?qa-native-study-assist=1`)};
    return true;
  })()`);
  await waitFor("reloaded native shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`), 60000);
  await waitFor("native home navigation", () => evaluate(`Boolean(document.querySelector(".mainNav"))`), 60000);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await clickByText(".mainNavItem", "首页");
  await waitFor("home", () => evaluate(`document.querySelector("main")?.dataset.appView === "home"`));
  await evaluate(`document.querySelector('section[aria-label="教材库"] article .primaryAction')?.click()`);
  await waitFor("chapter one reader", () => evaluate(`document.querySelector(".topBar h1")?.textContent?.includes("Chapter 1")`));
  await waitFor("English reader words", () => evaluate(`document.querySelectorAll(".wordToken").length > 0`));

  const tokenClicked = await evaluate(`(() => {
    const token = Array.from(document.querySelectorAll(".wordToken"))
      .find((item) => item.textContent.trim().toLowerCase() === "sigma") || document.querySelector(".wordToken");
    token?.click();
    return Boolean(token);
  })()`);
  if (!tokenClicked) throw new Error("Could not click a reader word token");
  await waitFor("lookup sheet", () => evaluate(`Boolean(document.querySelector('[aria-label="单词释义"]'))`));
  const lookup = await evaluate(`(async () => {
    const sheet = document.querySelector('[aria-label="单词释义"]');
    const chrome = sheet?.querySelector(".sheetChrome");
    const body = sheet?.querySelector("[data-sheet-scroll-body]");
    const before = chrome?.getBoundingClientRect();
    if (body) body.scrollTop = Math.min(260, body.scrollHeight - body.clientHeight);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = chrome?.getBoundingClientRect();
    return {
      word: sheet?.querySelector(".sheetHeader h2")?.textContent?.trim(),
      outerScrollTop: sheet?.scrollTop ?? -1,
      bodyScrollTop: body?.scrollTop ?? 0,
      chromeStable: Boolean(before && after && Math.abs(before.top - after.top) < 1 && Math.abs(before.bottom - after.bottom) < 1),
      bodyStartsAfterChrome: Boolean(after && body && body.getBoundingClientRect().top >= after.bottom - 1),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  await pressBack();
  await waitFor("lookup closed by Android back", () => evaluate(`!document.querySelector('[aria-label="单词释义"]')`));

  const selection = await evaluate(`(() => {
    const target = Array.from(document.querySelectorAll(".readerText")).find((item) => item.textContent.trim().length > 90);
    if (!target) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const selected = window.getSelection();
    selected.removeAllRanges();
    selected.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selected.toString().trim();
  })()`);
  await waitFor("reading AI action", () => evaluate(`Boolean(document.querySelector(".aiSelectionAction"))`));
  await evaluate(`document.querySelector(".aiSelectionAction")?.click()`);
  await waitFor("reading AI key boundary", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 阅读简释"] .aiAssistStatus'))`));
  const readingAi = await evaluate(`({
    selectedLength: ${JSON.stringify(selection)}.length,
    status: document.querySelector('[aria-label="AI 阅读简释"] .aiAssistStatus strong')?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })`);
  await pressBack();
  await waitFor("reading AI closed by Android back", () => evaluate(`!document.querySelector('[aria-label="AI 阅读简释"]')`));

  await evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })`);
  await waitFor("chapter footer", () => evaluate(`Boolean(document.querySelector(".chapterCompletion"))`));
  await clickByText(".chapterCompletion button", "标记已读完");
  await waitFor("chapter one completed", () => evaluate(`document.querySelector(".chapterCompletion")?.dataset.chapterCompleted === "true"`));
  const chapter = await evaluate(`(() => ({
    heading: document.querySelector(".chapterCompletion h2")?.textContent?.trim(),
    stored: JSON.parse(localStorage.getItem("six-sigma-study:chapter-progress:v1") || "{}")?.["six-sigma-black-belt"]?.ch01?.completed,
    next: document.querySelector(".nextChapterButton")?.textContent?.replace(/\\s+/g, " ").trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  await evaluate(`document.querySelector(".nextChapterButton")?.click()`);
  await waitFor("chapter two", () => evaluate(`document.querySelector(".topBar h1")?.textContent?.includes("Chapter 2")`));

  await clickByText(".readerControlButton", "书库");
  await waitFor("home after reader", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await clickByText(".mainNavItem", "刷题");
  await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionModeCards"))`));
  await clickByText(".questionModeCards button", "看题");
  await waitFor("question AI button", () => evaluate(`Boolean(document.querySelector(".questionActions .aiHelpButton"))`));
  await evaluate(`document.querySelector(".questionActions .aiHelpButton")?.click()`);
  await waitFor("question AI key boundary", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 题目精讲"] .aiAssistStatus'))`));
  const questionAi = await evaluate(`({
    status: document.querySelector('[aria-label="AI 题目精讲"] .aiAssistStatus strong')?.textContent?.trim(),
    questionCount: document.querySelector(".questionSessionMeta")?.textContent?.replace(/\\s+/g, " ").trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })`);
  await pressBack();
  await waitFor("question AI closed by Android back", () => evaluate(`!document.querySelector('[aria-label="AI 题目精讲"]')`));

  await evaluate(`(() => {
    const backup = JSON.parse(sessionStorage.getItem("qa-native-study-assist-backup") || "{}");
    for (const [key, value] of Object.entries(backup)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    sessionStorage.removeItem("qa-native-study-assist-backup");
  })()`);

  const checks = {
    lookupChromeFixed: lookup.word?.toLowerCase() === "six sigma" && lookup.outerScrollTop === 0 && lookup.bodyScrollTop > 0 && lookup.chromeStable && lookup.bodyStartsAfterChrome,
    lookupLayout: lookup.overflow <= 1,
    readingAiEntry: readingAi.selectedLength > 90 && readingAi.status === "需要个人 DeepSeek API Key" && readingAi.overflow <= 1,
    chapterCompletion: chapter.heading === "本章已读完" && chapter.stored === true && chapter.next?.includes("第 2 章") && chapter.overflow <= 1,
    questionAiEntry: questionAi.status === "需要个人 DeepSeek API Key" && questionAi.overflow <= 1
  };
  const ok = Object.values(checks).every(Boolean);
  cdp.close();
  console.log(JSON.stringify({ ok, androidApiLevel, backDispatchMode, checks, lookup, readingAi, chapter, questionAi }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
