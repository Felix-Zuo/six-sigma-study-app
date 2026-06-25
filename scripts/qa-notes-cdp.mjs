import fs from "node:fs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const readerPositionKey = "six-sigma-study:reader-position:v1";
const notesKey = "six-sigma-study:notes:v1";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const bookId = "six-sigma-black-belt";
const sampleBookId = "agent-import-sample";
const targetChapterId = "ch01";
const targetSectionId = "data-driven-processes";

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

  async function evalPage(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
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

  await evalPage(`(() => {
    localStorage.setItem(${JSON.stringify(noticeAcceptedKey)}, "true");
    localStorage.setItem(${JSON.stringify(activeBookKey)}, ${JSON.stringify(bookId)});
    localStorage.setItem(${JSON.stringify(readerPositionKey)}, JSON.stringify({
      bookId: ${JSON.stringify(bookId)},
      chapterId: ${JSON.stringify(targetChapterId)},
      sectionId: ${JSON.stringify(targetSectionId)},
      page: 13,
      language: "zh",
      scrollY: 0,
      updatedAt: new Date().toISOString()
    }));
    localStorage.setItem(${JSON.stringify(notesKey)}, JSON.stringify([
      {
        id: "sample-note-existing",
        bookId: ${JSON.stringify(sampleBookId)},
        bookTitle: "Agent 教材导入示例手册",
        text: "Sample book note",
        note: "This note must stay hidden while the Six Sigma book is active.",
        language: "en",
        chapter: 1,
        chapterTitle: "Chapter 1: Import Contract",
        page: 1,
        sectionId: "sample-ch01-s01",
        blockId: "sample-ch01-s01-en-002",
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]));
    location.reload();
    return true;
  })()`);

  await waitFor("book library", () => evalPage(`Boolean(document.querySelector(".bookCard .primaryAction"))`));
  await evalPage(`document.querySelector(".bookCard .primaryAction")?.click()`);
  await waitFor("Chinese target section", () =>
    evalPage(`Boolean(document.querySelector('[data-section-id="${targetSectionId}"] .sectionBody.zhText'))`)
  );

  const selectedText = await evalPage(`(() => {
    const section = document.querySelector('[data-section-id="${targetSectionId}"]');
    section?.scrollIntoView({ block: "start" });
    const paragraph = section?.querySelector(".readerText");
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!node || !node.nodeValue) {
      return null;
    }
    const raw = node.nodeValue;
    const start = raw.search(/\\S/);
    const end = Math.min(raw.length, start + 18);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString().trim();
  })()`);

  await waitFor("selection actions", () => evalPage(`Boolean(document.querySelector(".selectionActions button"))`));
  await evalPage(`document.querySelector(".selectionActions button:last-child")?.click()`);
  await waitFor("notes page", () => evalPage(`document.querySelector(".appPageHeader h1")?.textContent?.includes("笔记") && Boolean(document.querySelector(".studyItem"))`));

  const savedState = await evalPage(`(() => {
    const notes = JSON.parse(localStorage.getItem(${JSON.stringify(notesKey)}) ?? "[]");
    const item = notes.find((note) => note.bookId === ${JSON.stringify(bookId)});
    const sampleItem = notes.find((note) => note.bookId === ${JSON.stringify(sampleBookId)});
    const visibleItems = Array.from(document.querySelectorAll(".studyItem")).map((item) => item.innerText);
    return {
      count: notes.length,
      visibleCount: visibleItems.length,
      sampleHidden: Boolean(sampleItem) && visibleItems.every((text) => !text.includes("Sample book note")),
      text: item?.text ?? null,
      bookId: item?.bookId ?? null,
      language: item?.language ?? null,
      page: item?.page ?? null,
      sectionId: item?.sectionId ?? null
    };
  })()`);

  await evalPage(`(() => {
    const textarea = document.querySelector(".studyItem textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(textarea, "复习：注意术语定义和例句。");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await sleep(300);

  const editedState = await evalPage(`(() => {
    const notes = JSON.parse(localStorage.getItem(${JSON.stringify(notesKey)}) ?? "[]");
    const item = notes.find((note) => note.bookId === ${JSON.stringify(bookId)});
    const doc = document.documentElement;
    return {
      totalNotes: notes.length,
      note: item?.note ?? "",
      textareaValue: document.querySelector(".studyItem textarea")?.value ?? "",
      horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth
    };
  })()`);

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/notes-panel-qa.png", Buffer.from(screenshot.data, "base64"));

  const ok =
    typeof selectedText === "string" &&
    selectedText.length >= 2 &&
    savedState.count === 2 &&
    savedState.visibleCount === 1 &&
    savedState.sampleHidden &&
    savedState.text === selectedText &&
    savedState.bookId === bookId &&
    savedState.language === "zh" &&
    savedState.sectionId === targetSectionId &&
    editedState.totalNotes === 2 &&
    editedState.note === "复习：注意术语定义和例句。" &&
    editedState.textareaValue === editedState.note &&
    editedState.horizontalOverflow <= 1;

  console.log(
    JSON.stringify(
      {
        ok,
        selectedText,
        savedState,
        editedState,
        screenshot: "qa/screenshots/notes-panel-qa.png"
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
