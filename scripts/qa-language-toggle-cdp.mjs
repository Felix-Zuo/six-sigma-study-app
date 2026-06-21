import fs from "node:fs";

const targetSectionId = "ch26-s02-the-graph-menu-option";
const targetChapterId = "ch26";
const targetBlockIndex = 120;
const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";

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

function pageSelectorExpression(sectionId) {
  return `document.querySelector(${JSON.stringify(`[data-section-id="${sectionId}"]`)})`;
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

  const targetSelector = `[data-section-id="${targetSectionId}"]`;
  await evalPage(`(() => {
    localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
      chapterId: ${JSON.stringify(targetChapterId)},
      sectionId: ${JSON.stringify(targetSectionId)},
      language: "en",
      scrollY: 0,
      updatedAt: new Date().toISOString()
    }));
    location.reload();
    return true;
  })()`);

  await sleep(1800);
  await waitFor("target section render", () =>
    evalPage(`Boolean(${pageSelectorExpression(targetSectionId)}?.querySelector(".sectionBody"))`)
  );
  await waitFor("English mode", () =>
    evalPage(`!${pageSelectorExpression(targetSectionId)}?.querySelector(".sectionBody")?.classList.contains("zhText")`)
  );

  const scrollTarget = await evalPage(`(() => {
    const section = ${pageSelectorExpression(targetSectionId)};
    const body = section?.querySelector(".sectionBody");
    const blocks = Array.from(body?.children ?? []);
    const block = blocks[Math.min(${targetBlockIndex}, blocks.length - 1)];
    const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
    window.scrollTo({
      top: Math.max(0, window.scrollY + block.getBoundingClientRect().top - anchor + block.scrollHeight * 0.35),
      behavior: "instant"
    });
    return {
      blocks: blocks.length,
      index: blocks.indexOf(block),
      text: block.innerText.replace(/\\s+/g, " ").slice(0, 120)
    };
  })()`);

  await sleep(900);

  const snapshotExpression = `(label) => (() => {
    const targetSelector = ${JSON.stringify(targetSelector)};
    const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
    const targetSection = document.querySelector(targetSelector);
    const sections = Array.from(document.querySelectorAll("[data-section-id]"));
    const visibleSection = sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= anchor + 20 && rect.bottom >= anchor;
    }) || targetSection;
    const body = visibleSection?.querySelector(".sectionBody");
    const blocks = Array.from(body?.children ?? []);
    const blockIndex = blocks.findIndex((block) => block.getBoundingClientRect().bottom >= anchor);
    const block = blockIndex >= 0 ? blocks[blockIndex] : null;
    const doc = document.documentElement;
    return {
      label,
      isChinese: Boolean(body?.classList.contains("zhText")),
      sectionId: visibleSection?.dataset.sectionId ?? null,
      targetSectionTop: targetSection?.getBoundingClientRect().top ?? null,
      blockIndex,
      blockTop: block ? Math.round(block.getBoundingClientRect().top) : null,
      blockBottom: block ? Math.round(block.getBoundingClientRect().bottom) : null,
      anchor: Math.round(anchor),
      scrollY: Math.round(window.scrollY),
      horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth,
      text: block ? block.innerText.replace(/\\s+/g, " ").slice(0, 140) : null,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  })()`;

  const before = await evalPage(`(${snapshotExpression})("before-en")`);

  await evalPage(`document.querySelector(".modeButton")?.click()`);
  await waitFor("Chinese mode", () =>
    evalPage(`Boolean(${pageSelectorExpression(targetSectionId)}?.querySelector(".sectionBody.zhText"))`)
  );
  await sleep(800);
  const afterZh = await evalPage(`(${snapshotExpression})("after-zh")`);

  await evalPage(`document.querySelector(".modeButton")?.click()`);
  await waitFor("English mode after toggle back", () =>
    evalPage(`!${pageSelectorExpression(targetSectionId)}?.querySelector(".sectionBody")?.classList.contains("zhText")`)
  );
  await sleep(800);
  const afterEn = await evalPage(`(${snapshotExpression})("after-en")`);

  const clickedWord = await evalPage(`(() => {
    const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
    const token = Array.from(document.querySelectorAll(".wordToken")).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top > anchor && rect.top < window.innerHeight - 120 && rect.width > 8 && rect.height > 8;
    });
    if (!token) {
      return null;
    }
    const text = token.textContent;
    token.click();
    return text;
  })()`);
  await sleep(500);
  const lookupState = await evalPage(`(() => {
    const sheet = document.querySelector(".bottomSheet[aria-label='word explanation']");
    const translation = sheet?.querySelector(".translation")?.textContent?.trim() ?? null;
    const explanation = sheet?.querySelector(".explanation")?.textContent?.trim() ?? null;
    return {
      clickedWord: ${JSON.stringify(clickedWord)},
      sheetOpen: Boolean(sheet),
      sheetTitle: sheet?.querySelector("h2")?.textContent?.trim() ?? null,
      translation,
      explanation,
      usedFallback: translation === "待完善" || Boolean(explanation?.includes("还没有进入本地词库")),
      saveButton: sheet?.querySelector(".saveButton")?.textContent?.trim() ?? null,
      bottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : null,
      viewportHeight: window.innerHeight
    };
  })()`);

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/language-toggle-block-qa.png", Buffer.from(screenshot.data, "base64"));

  const ok =
    before.sectionId === targetSectionId &&
    afterZh.sectionId === targetSectionId &&
    afterEn.sectionId === targetSectionId &&
    Math.abs(afterZh.blockIndex - before.blockIndex) <= 2 &&
    Math.abs(afterEn.blockIndex - before.blockIndex) <= 1 &&
    before.horizontalOverflow <= 1 &&
    afterZh.horizontalOverflow <= 1 &&
    afterEn.horizontalOverflow <= 1 &&
    lookupState.sheetOpen &&
    !lookupState.usedFallback;

  console.log(
    JSON.stringify(
      {
        ok,
        scrollTarget,
        before,
        afterZh,
        afterEn,
        lookupState,
        screenshot: "qa/screenshots/language-toggle-block-qa.png"
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
