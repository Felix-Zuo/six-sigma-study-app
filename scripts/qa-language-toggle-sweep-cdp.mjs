import fs from "node:fs";

const endpoint = process.env.CHROME_CDP_ENDPOINT ?? "http://127.0.0.1:9333/json";
const appUrl = process.env.PWA_URL ?? "http://127.0.0.1:4175/";
const manualPath = "apps/reader/public/content/manual.json";
const languageSettleMs = 850;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sectionBlockCount(section, language) {
  return section.content?.[language]?.length ?? 0;
}

function chooseSamples() {
  const manual = JSON.parse(fs.readFileSync(manualPath, "utf-8"));
  return manual.chapters.map((chapter) => {
    const section = [...chapter.sections].sort((a, b) => {
      const aMin = Math.min(sectionBlockCount(a, "en"), sectionBlockCount(a, "zh"));
      const bMin = Math.min(sectionBlockCount(b, "en"), sectionBlockCount(b, "zh"));
      return bMin - aMin;
    })[0];
    const comparableBlocks = Math.min(sectionBlockCount(section, "en"), sectionBlockCount(section, "zh"));
    return {
      chapterId: chapter.id,
      chapter: chapter.chapter,
      chapterTitle: chapter.title.en,
      sectionId: section.id,
      sectionTitle: section.title.en,
      comparableBlocks,
      targetBlockIndex: Math.max(0, Math.min(comparableBlocks - 1, Math.floor(comparableBlocks * 0.45)))
    };
  });
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page =
    pages.find((item) => item.type === "page" && item.url?.startsWith(appUrl) && item.webSocketDebuggerUrl) ??
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No debuggable Chrome page found");
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
  const samples = chooseSamples();
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

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

  async function waitFor(description, fn, timeout = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await fn()) {
          return;
        }
      } catch {}
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("initial reader render", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));

  async function loadSample(sample) {
    await evalPage(`(() => {
      localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
        chapterId: ${JSON.stringify(sample.chapterId)},
        sectionId: ${JSON.stringify(sample.sectionId)},
        language: "en",
        scrollY: 0,
        updatedAt: new Date().toISOString()
      }));
      location.reload();
      return true;
    })()`);
    await waitFor(`sample ${sample.chapter} section render`, () =>
      evalPage(`Boolean(document.querySelector(${JSON.stringify(`[data-section-id="${sample.sectionId}"]`)})?.querySelector(".sectionBody"))`)
    );
    await waitFor(`sample ${sample.chapter} English mode`, () =>
      evalPage(`!document.querySelector(${JSON.stringify(`[data-section-id="${sample.sectionId}"] .sectionBody`)})?.classList.contains("zhText")`)
    );
  }

  async function scrollToSampleBlock(sample) {
    return evalPage(`(() => {
      const section = document.querySelector(${JSON.stringify(`[data-section-id="${sample.sectionId}"]`)});
      const body = section?.querySelector(".sectionBody");
      const blocks = Array.from(body?.children ?? []);
      const block = blocks[Math.min(${sample.targetBlockIndex}, Math.max(0, blocks.length - 1))];
      const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
      if (!block) {
        return { blocks: blocks.length, index: -1, text: null };
      }
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
  }

  async function snapshot(label, sample) {
    return evalPage(`(() => {
      const selector = ${JSON.stringify(`[data-section-id="${sample.sectionId}"]`)};
      const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
      const targetSection = document.querySelector(selector);
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
        label: ${JSON.stringify(label)},
        chapter: ${sample.chapter},
        sectionId: visibleSection?.dataset.sectionId ?? null,
        expectedSectionId: ${JSON.stringify(sample.sectionId)},
        isChinese: Boolean(body?.classList.contains("zhText")),
        blockIndex,
        blockCount: blocks.length,
        scrollY: Math.round(window.scrollY),
        horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth,
        text: block ? block.innerText.replace(/\\s+/g, " ").slice(0, 140) : null
      };
    })()`);
  }

  const results = [];
  for (const sample of samples) {
    await loadSample(sample);
    const scrollTarget = await scrollToSampleBlock(sample);
    await sleep(350);
    const before = await snapshot("before-en", sample);

    await evalPage(`document.querySelector(".modeButton")?.click()`);
    await waitFor(`sample ${sample.chapter} Chinese mode`, () =>
      evalPage(`Boolean(document.querySelector(${JSON.stringify(`[data-section-id="${sample.sectionId}"] .sectionBody.zhText`)}))`)
    );
    await sleep(languageSettleMs);
    const afterZh = await snapshot("after-zh", sample);

    await evalPage(`document.querySelector(".modeButton")?.click()`);
    await waitFor(`sample ${sample.chapter} English mode after toggle`, () =>
      evalPage(`!document.querySelector(${JSON.stringify(`[data-section-id="${sample.sectionId}"] .sectionBody`)})?.classList.contains("zhText")`)
    );
    await sleep(languageSettleMs);
    const afterEn = await snapshot("after-en", sample);

    const blockTolerance = Math.max(2, Math.ceil(sample.comparableBlocks * 0.08));
    const ok =
      before.sectionId === sample.sectionId &&
      afterZh.sectionId === sample.sectionId &&
      afterEn.sectionId === sample.sectionId &&
      Math.abs(afterZh.blockIndex - before.blockIndex) <= blockTolerance &&
      Math.abs(afterEn.blockIndex - before.blockIndex) <= blockTolerance &&
      before.horizontalOverflow <= 1 &&
      afterZh.horizontalOverflow <= 1 &&
      afterEn.horizontalOverflow <= 1;

    results.push({
      ok,
      sample,
      blockTolerance,
      scrollTarget,
      before,
      afterZh,
      afterEn
    });
  }

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/language-toggle-sweep-qa.png", Buffer.from(screenshot.data, "base64"));

  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        sampleCount: results.length,
        failures,
        summary: results.map((result) => ({
          chapter: result.sample.chapter,
          sectionId: result.sample.sectionId,
          beforeBlock: result.before.blockIndex,
          afterZhBlock: result.afterZh.blockIndex,
          afterEnBlock: result.afterEn.blockIndex,
          overflow: Math.max(
            result.before.horizontalOverflow,
            result.afterZh.horizontalOverflow,
            result.afterEn.horizontalOverflow
          )
        })),
        screenshot: "qa/screenshots/language-toggle-sweep-qa.png"
      },
      null,
      2
    )
  );
  cdp.close();
  if (failures.length > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
