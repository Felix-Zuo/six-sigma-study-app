import fs from "node:fs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const manualPath = "apps/reader/public/content/manual.json";
const readerPositionKey = "six-sigma-study:reader-position:v1";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";
const activeBookKey = "six-sigma-study:active-book:v1";
const bookId = "six-sigma-black-belt";
const targetChapterNumbers = [1, 7, 26, 33];
const languageSettleMs = 900;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentBlockCount(section, language) {
  return section.content?.[language]?.length ?? 0;
}

function textLikeBlockIndexes(section, language) {
  return (section.content?.[language] ?? [])
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind !== "image" && (block.text || block.rows?.length));
}

function imageBlockCount(chapter, language) {
  return chapter.sections.reduce(
    (total, section) => total + (section.content?.[language] ?? []).filter((block) => block.kind === "image").length,
    0
  );
}

function chooseSamples() {
  const manual = JSON.parse(fs.readFileSync(manualPath, "utf-8"));
  return targetChapterNumbers.map((chapterNumber) => {
    const chapter = manual.chapters.find((item) => item.chapter === chapterNumber);
    if (!chapter) {
      throw new Error(`Chapter ${chapterNumber} is missing from ${manualPath}`);
    }

    const textSection = [...chapter.sections].sort((a, b) => {
      const aText = textLikeBlockIndexes(a, "en").length + textLikeBlockIndexes(a, "zh").length;
      const bText = textLikeBlockIndexes(b, "en").length + textLikeBlockIndexes(b, "zh").length;
      const aMin = Math.min(contentBlockCount(a, "en"), contentBlockCount(a, "zh"));
      const bMin = Math.min(contentBlockCount(b, "en"), contentBlockCount(b, "zh"));
      return bText - aText || bMin - aMin;
    })[0];

    const textIndexes = textLikeBlockIndexes(textSection, "en");
    const targetText = textIndexes[Math.max(0, Math.min(textIndexes.length - 1, Math.floor(textIndexes.length * 0.45)))];

    return {
      chapterId: chapter.id,
      chapter: chapter.chapter,
      title: chapter.title.en,
      sectionCount: chapter.sections.length,
      pageStart: chapter.pageStart,
      pageEnd: chapter.pageEnd,
      textSectionId: textSection.id,
      textSectionTitle: textSection.title.en,
      targetBlockIndex: targetText?.index ?? 0,
      preferredLookupText: chapter.chapter === 33 ? "left-to-right" : null,
      expectedImages: {
        en: imageBlockCount(chapter, "en"),
        zh: Math.max(imageBlockCount(chapter, "en"), imageBlockCount(chapter, "zh"))
      }
    };
  });
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No debuggable Android WebView page found");
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
      } catch {
        // The WebView can briefly reject DOM reads while reloading.
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function loadChapter(sample, language) {
    await evalPage(`(() => {
      localStorage.setItem(${JSON.stringify(noticeAcceptedKey)}, "true");
      localStorage.setItem(${JSON.stringify(activeBookKey)}, ${JSON.stringify(bookId)});
      localStorage.setItem(${JSON.stringify(readerPositionKey)}, JSON.stringify({
        bookId: ${JSON.stringify(bookId)},
        chapterId: ${JSON.stringify(sample.chapterId)},
        sectionId: ${JSON.stringify(sample.textSectionId)},
        page: ${sample.pageStart},
        language: ${JSON.stringify(language)},
        scrollY: 0,
        updatedAt: new Date().toISOString()
      }));
      location.reload();
      return true;
    })()`);
    await waitFor("book library", () => evalPage(`Boolean(document.querySelector(".bookCard .primaryAction"))`));
    await evalPage(`document.querySelector(".bookCard .primaryAction")?.click()`);
    await waitFor(`Chapter ${sample.chapter} reader render`, () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
    await waitFor(`Chapter ${sample.chapter} section render`, () =>
      evalPage(`Boolean(document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody`)}))`)
    );
    const currentLanguage = await evalPage(
      `document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody`)})?.classList.contains("zhText") ? "zh" : "en"`
    );
    if (currentLanguage !== language) {
      await evalPage(`document.querySelector(".modeButton")?.click()`);
      await sleep(languageSettleMs);
    }
    await waitFor(`Chapter ${sample.chapter} ${language} mode`, () =>
      evalPage(`Boolean(document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody${language === "zh" ? ".zhText" : ""}`)})) && ${language === "en" ? `!document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody`)})?.classList.contains("zhText")` : "true"}`)
    );
    await sleep(500);
  }

  async function scrollToTextBlock(sample) {
    return evalPage(`(() => {
      const section = document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"]`)});
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
        text: block.innerText.replace(/\\s+/g, " ").slice(0, 140)
      };
    })()`);
  }

  async function snapshot(label, sample) {
    return evalPage(`(() => {
      const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
      const targetSection = document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"]`)});
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
      const imageCount = document.querySelectorAll(".figureBlock img").length;
      return {
        label: ${JSON.stringify(label)},
        chapter: ${sample.chapter},
        language: body?.classList.contains("zhText") ? "zh" : "en",
        visibleSectionId: visibleSection?.dataset.sectionId ?? null,
        expectedSectionId: ${JSON.stringify(sample.textSectionId)},
        blockIndex,
        blockCount: blocks.length,
        sectionCount: sections.length,
        imageCount,
        horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth,
        scrollY: Math.round(window.scrollY),
        text: block ? block.innerText.replace(/\\s+/g, " ").slice(0, 140) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    })()`);
  }

  async function clickVisibleWord(preferredText = null) {
    let clickedWord = null;
    for (let attempt = 0; attempt < 3 && !clickedWord; attempt += 1) {
      clickedWord = await evalPage(`(() => {
        const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
        const preferred = ${JSON.stringify(preferredText)};
        const tokens = Array.from(document.querySelectorAll(".wordToken")).filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.top > anchor && rect.top < window.innerHeight - 150 && rect.width > 8 && rect.height > 8;
        });
        const preferredAnywhere = preferred
          ? Array.from(document.querySelectorAll(".wordToken")).find((item) => item.textContent?.trim().toLowerCase() === preferred.toLowerCase())
          : null;
        if (preferredAnywhere && !tokens.includes(preferredAnywhere)) {
          preferredAnywhere.scrollIntoView({ block: "center" });
        }
        const token =
          (preferred ? tokens.find((item) => item.textContent?.trim().toLowerCase() === preferred.toLowerCase()) : null) ??
          preferredAnywhere ??
          tokens.find((item) => !item.textContent?.includes("-")) ??
          tokens[0];
        if (!token) {
          const fallbackText = Array.from(document.querySelectorAll(".readerText")).find((item) => /[A-Za-z]{4,}/.test(item.innerText));
          fallbackText?.scrollIntoView({ block: "center" });
          return null;
        }
        const text = token.textContent;
        token.click();
        return text;
      })()`);
      if (!clickedWord) {
        await sleep(550);
      }
    }
    await sleep(450);
    return evalPage(`(() => {
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
        bottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : null,
        viewportHeight: window.innerHeight
      };
    })()`);
  }

  async function verifyImages(sample, language) {
    await loadChapter(sample, language);
    const expectedCount = sample.expectedImages[language];
    await waitFor(`Chapter ${sample.chapter} ${language} image count`, () =>
      evalPage(`document.querySelectorAll(".figureBlock img").length === ${expectedCount}`)
    );

    for (let index = 0; index < expectedCount; index += 1) {
      await evalPage(`(() => {
        const img = document.querySelectorAll(".figureBlock img")[${index}];
        img?.scrollIntoView({ block: "center", inline: "nearest" });
        return Boolean(img);
      })()`);
      await waitFor(`Chapter ${sample.chapter} ${language} image ${index + 1}`, () =>
        evalPage(`(() => {
          const img = document.querySelectorAll(".figureBlock img")[${index}];
          return Boolean(img?.complete && img.naturalWidth > 4 && img.naturalHeight > 4);
        })()`)
      );
    }

    return evalPage(`(() => {
      const images = Array.from(document.querySelectorAll(".figureBlock img"));
      const doc = document.documentElement;
      const broken = images
        .map((img, index) => ({
          index,
          alt: img.alt,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          clientWidth: Math.round(img.getBoundingClientRect().width),
          clientHeight: Math.round(img.getBoundingClientRect().height)
        }))
        .filter((img) => !img.complete || img.naturalWidth <= 4 || img.naturalHeight <= 4 || img.clientWidth <= 4 || img.clientHeight <= 4);
      return {
        language: ${JSON.stringify(language)},
        expectedCount: ${expectedCount},
        actualCount: images.length,
        broken,
        horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth,
        lastScrollY: Math.round(window.scrollY)
      };
    })()`);
  }

  async function capture(name) {
    fs.mkdirSync("qa/screenshots", { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const path = `qa/screenshots/${name}.png`;
    fs.writeFileSync(path, Buffer.from(screenshot.data, "base64"));
    return path;
  }

  const results = [];
  for (const sample of samples) {
    await loadChapter(sample, "en");
    const scrollTarget = await scrollToTextBlock(sample);
    await sleep(500);
    const before = await snapshot("before-en", sample);

    await evalPage(`document.querySelector(".modeButton")?.click()`);
    await waitFor(`Chapter ${sample.chapter} Chinese mode after toggle`, () =>
      evalPage(`Boolean(document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody.zhText`)}))`)
    );
    await sleep(languageSettleMs);
    const afterZh = await snapshot("after-zh", sample);
    const zhScreenshot = await capture(`android-key-ch${String(sample.chapter).padStart(2, "0")}-zh`);

    await evalPage(`document.querySelector(".modeButton")?.click()`);
    await waitFor(`Chapter ${sample.chapter} English mode after toggle`, () =>
      evalPage(`!document.querySelector(${JSON.stringify(`[data-section-id="${sample.textSectionId}"] .sectionBody`)})?.classList.contains("zhText")`)
    );
    await sleep(languageSettleMs);
    const afterEn = await snapshot("after-en", sample);
    const lookup = await clickVisibleWord(sample.preferredLookupText);
    const enScreenshot = await capture(`android-key-ch${String(sample.chapter).padStart(2, "0")}-en-lookup`);

    const enImages = await verifyImages(sample, "en");
    const zhImages = await verifyImages(sample, "zh");
    const imageScreenshot = await capture(`android-key-ch${String(sample.chapter).padStart(2, "0")}-images`);

    const blockTolerance = Math.max(2, Math.ceil(Math.max(before.blockCount, 1) * 0.1));
    const ok =
      before.visibleSectionId === sample.textSectionId &&
      afterZh.visibleSectionId === sample.textSectionId &&
      afterEn.visibleSectionId === sample.textSectionId &&
      Math.abs(afterEn.blockIndex - before.blockIndex) <= blockTolerance &&
      before.horizontalOverflow <= 1 &&
      afterZh.horizontalOverflow <= 1 &&
      afterEn.horizontalOverflow <= 1 &&
      before.sectionCount === sample.sectionCount &&
      afterZh.sectionCount === sample.sectionCount &&
      afterEn.sectionCount === sample.sectionCount &&
      lookup.sheetOpen &&
      !lookup.usedFallback &&
      (!sample.preferredLookupText || lookup.sheetTitle === sample.preferredLookupText) &&
      enImages.actualCount === enImages.expectedCount &&
      zhImages.actualCount === zhImages.expectedCount &&
      enImages.broken.length === 0 &&
      zhImages.broken.length === 0 &&
      enImages.horizontalOverflow <= 1 &&
      zhImages.horizontalOverflow <= 1;

    results.push({
      ok,
      sample,
      blockTolerance,
      scrollTarget,
      before,
      afterZh,
      afterEn,
      lookup,
      images: { en: enImages, zh: zhImages },
      screenshots: { zh: zhScreenshot, enLookup: enScreenshot, images: imageScreenshot }
    });
  }

  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        endpoint,
        chapters: results.map((result) => ({
          chapter: result.sample.chapter,
          section: result.sample.textSectionId,
          beforeBlock: result.before.blockIndex,
          afterZhBlock: result.afterZh.blockIndex,
          afterEnBlock: result.afterEn.blockIndex,
          lookup: {
            word: result.lookup.clickedWord,
            title: result.lookup.sheetTitle,
            fallback: result.lookup.usedFallback
          },
          images: {
            en: {
              expected: result.images.en.expectedCount,
              actual: result.images.en.actualCount,
              broken: result.images.en.broken.length
            },
            zh: {
              expected: result.images.zh.expectedCount,
              actual: result.images.zh.actualCount,
              broken: result.images.zh.broken.length
            }
          },
          overflow: Math.max(
            result.before.horizontalOverflow,
            result.afterZh.horizontalOverflow,
            result.afterEn.horizontalOverflow,
            result.images.en.horizontalOverflow,
            result.images.zh.horizontalOverflow
          ),
          screenshots: result.screenshots
        })),
        failures
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
