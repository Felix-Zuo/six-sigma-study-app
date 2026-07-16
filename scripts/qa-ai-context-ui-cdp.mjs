import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const artifactDir = path.resolve(process.env.QA_ARTIFACT_DIR ?? "qa/ai-context");
const screenshotDir = path.join(artifactDir, "screenshots");
const downloadDir = path.join(artifactDir, "downloads");
const bookId = "six-sigma-black-belt";
const correctionStorageKey = `six-sigma-study:context-corrections:v1:${bookId}`;
const fakeSessionKey = "s" + "k" + "-qa-context-correction-key";
const packageVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).version;
const expectedDisplayVersion = `版本 Beta ${packageVersion.match(/^\d+\.\d+\.\d+/)?.[0] ?? packageVersion}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("No debuggable page found");
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
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close: () => ws.close()
  };
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  async function waitFor(description, predicate, timeout = 18000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Reloads briefly invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    await sleep(180);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    localStorage.setItem("six-sigma-study:active-book:v1", ${JSON.stringify(bookId)});
    localStorage.setItem("six-sigma-study:reader-preferences:v1", JSON.stringify({ theme: "light", textScale: "standard" }));
    localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
      activeBookId: ${JSON.stringify(bookId)},
      positions: {
        [${JSON.stringify(bookId)}]: {
          bookId: ${JSON.stringify(bookId)}, chapterId: "ch02",
          sectionId: "ch02-s01-history-and-application-of-six-sigma",
          blockId: "ch02-s01-history-and-application-of-six-sigma-en-003",
          page: 14, language: "en", scrollY: 0, updatedAt: new Date().toISOString()
        }
      }
    }));
    location.reload();
  })()`);
  await waitFor("main navigation", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("我的"))?.click()`);
  await waitFor("AI settings", () => evaluate(`Boolean(document.querySelector(".apiKeyField input"))`));
  await evaluate(`(() => {
    const input = document.querySelector(".apiKeyField input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(fakeSessionKey)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitFor("enabled save key button", () => evaluate(`!Array.from(document.querySelectorAll(".aiSettingsActions button")).find((item) => item.textContent.includes("安全保存"))?.disabled`));
  await evaluate(`Array.from(document.querySelectorAll(".aiSettingsActions button")).find((item) => item.textContent.includes("安全保存"))?.click()`);
  await waitFor("session key configured", () => evaluate(`document.querySelector(".settingsTitleRow span")?.textContent?.trim() === "已配置"`));

  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    window.__qaDeepSeekCalls = { context: 0, reading: 0, question: 0 };
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("api.deepseek.com/beta/chat/completions")) {
        const body = JSON.parse(init?.body || "{}");
        const toolName = body.tools?.[0]?.function?.name;
        const userInput = JSON.parse(body.messages?.[1]?.content || "{}");
        let result;
        if (toolName === "submit_reading_assist") {
          window.__qaDeepSeekCalls.reading += 1;
          const term = (userInput.selectionEn.match(/[A-Za-z][A-Za-z-]*/) || ["process"])[0];
          result = {
            translationZh: "这段内容说明六西格玛控制措施会防止流程退回旧有做法。",
            explanationZh: "作者强调改进项目完成后仍需维持控制，使新的工作方式持续生效。",
            plainEnglish: "Six Sigma controls keep the improved process from returning to old habits.",
            terms: [{ term, meaningZh: "当前语境中的关键表达", noteZh: "它连接了控制阶段与持续改进。" }],
            grammarZh: "so that 引出控制措施要达到的结果。",
            confidence: "high"
          };
        } else if (toolName === "submit_question_assist") {
          window.__qaDeepSeekCalls.question += 1;
          result = {
            conceptZh: "DMAIC 阶段职责",
            explanationZh: "应依据题库给定答案，识别该阶段的核心目标，而不是只看表面关键词。",
            optionNotes: userInput.options.map((option) => ({
              optionId: option.id,
              verdict: userInput.correctAnswer.includes(option.id) ? "correct" : "wrong",
              noteZh: userInput.correctAnswer.includes(option.id) ? "该选项符合本题考点。" : "该选项属于其他阶段或概念。"
            })),
            pitfallZh: "容易把相邻 DMAIC 阶段的活动混在一起。",
            reviewTipZh: "按 Define、Measure、Analyze、Improve、Control 顺序复述每阶段目标。",
            confidence: "high"
          };
        } else {
          window.__qaDeepSeekCalls.context += 1;
          result = {
            detectedPhrase: "revert to old ways",
            lemma: "revert",
            partOfSpeech: "verb",
            phrasePattern: "revert to <previous-practice>",
            contextMeaningZh: "回到旧有做法；恢复到原来的状态",
            sentenceTranslationZh: "六西格玛建立保障措施和策略，即使项目被视为完成，也通过控制措施确保改进持续推进，不会退回原来的做法。",
            explanationZh: "revert to 表示回到先前的状态或做法；这里与 old ways 构成固定语义搭配。",
            alternativesZh: ["恢复原状", "重回旧习"],
            confidence: "high"
          };
        }
        return new Response(JSON.stringify({
          model: "deepseek-v4-flash",
          choices: [{ message: { tool_calls: [{ function: { name: toolName, arguments: JSON.stringify(result) } }] } }],
          usage: { prompt_tokens: 612, completion_tokens: 124 }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(input, init);
    };
  })()`);

  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("首页"))?.click()`);
  await waitFor("continue reading", () => evaluate(`Boolean(document.querySelector(".workspaceContinue"))`));
  await evaluate(`document.querySelector(".workspaceContinue")?.click()`);
  await waitFor("revert token", () => evaluate(`Array.from(document.querySelectorAll(".wordToken")).some((item) => item.textContent.trim().toLowerCase() === "revert")`));
  await evaluate(`Array.from(document.querySelectorAll(".wordToken")).find((item) => item.textContent.trim().toLowerCase() === "revert")?.click()`);
  await waitFor("revert lookup", () => evaluate(`document.querySelector(".bottomSheet h2")?.textContent?.trim().toLowerCase() === "revert"`));
  const offlineMeaning = await evaluate(`document.querySelector(".contextMeaningCard strong")?.textContent?.trim()`);
  await evaluate(`Array.from(document.querySelectorAll(".aiLookupAction button")).find((item) => item.textContent.includes("AI 核验"))?.click()`);
  await waitFor("AI proposal", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 语境修订建议"]'))`));
  const proposal = await evaluate(`(() => ({
    phrase: document.querySelector(".aiPhrase")?.textContent?.trim(),
    meaning: document.querySelector('[aria-label="AI 语境修订建议"] > strong')?.textContent?.trim(),
    sentence: document.querySelector('[aria-label="AI 语境修订建议"] > p:not(.aiPhrase)')?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  await evaluate(`(() => {
    const sheet = document.querySelector(".bottomSheet [data-sheet-scroll-body]");
    const card = document.querySelector('[aria-label="AI 语境修订建议"]');
    if (sheet && card) sheet.scrollTop = Math.max(0, card.offsetTop - 84);
  })()`);
  await sleep(520);
  const proposalShot = await capture("01-revert-ai-proposal");
  await evaluate(`Array.from(document.querySelectorAll(".aiCorrectionActions button")).find((item) => item.textContent.includes("采用本次修订"))?.click()`);
  await waitFor("accepted correction", () => evaluate(`Boolean(document.querySelector('[aria-label="已采用的语境修订"]'))`));
  const acceptedMeaning = await evaluate(`document.querySelector(".contextMeaningCard strong")?.textContent?.trim()`);
  await evaluate(`(() => {
    const sheet = document.querySelector(".bottomSheet [data-sheet-scroll-body]");
    const card = document.querySelector('[aria-label="已采用的语境修订"]');
    if (sheet && card) sheet.scrollTop = Math.max(0, card.offsetTop - 84);
  })()`);
  await sleep(520);
  const acceptedShot = await capture("02-revert-accepted");
  const storedBundle = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(correctionStorageKey)}))`);

  await evaluate(`document.querySelector(".closeButton")?.click()`);
  await waitFor("closed lookup", () => evaluate(`!document.querySelector(".bottomSheet")`));
  await evaluate(`Array.from(document.querySelectorAll(".wordToken")).find((item) => item.textContent.trim().toLowerCase() === "revert")?.click()`);
  await waitFor("accepted correction reused", () => evaluate(`Boolean(document.querySelector('[aria-label="已采用的语境修订"]'))`));
  const reused = await evaluate(`(() => ({
    meaning: document.querySelector(".contextMeaningCard strong")?.textContent?.trim(),
    calls: window.__qaDeepSeekCalls.context,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  await evaluate(`document.querySelector(".closeButton")?.click()`);

  const selectedReadingText = await evaluate(`(() => {
    const target = Array.from(document.querySelectorAll(".readerText")).find((item) => item.textContent.trim().length > 90);
    if (!target) return "";
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString().trim();
  })()`);
  await waitFor("AI selection action", () => evaluate(`Boolean(document.querySelector(".selectionActions .aiSelectionAction"))`));
  await evaluate(`document.querySelector(".selectionActions .aiSelectionAction")?.click()`);
  await waitFor("reading AI result", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 阅读简释"] .aiAssistResult'))`));
  const readingAssist = await evaluate(`(() => {
    const sheet = document.querySelector('[aria-label="AI 阅读简释"]');
    const chrome = sheet?.querySelector(".sheetChrome");
    const body = sheet?.querySelector("[data-sheet-scroll-body]");
    const before = chrome?.getBoundingClientRect();
    if (body) body.scrollTop = Math.min(280, body.scrollHeight - body.clientHeight);
    const after = chrome?.getBoundingClientRect();
    const cache = JSON.parse(localStorage.getItem("six-sigma-study:ai-study-cache:v1") || "[]");
    return {
      translation: sheet?.querySelector(".aiAnswerLead strong")?.textContent?.trim(),
      plainEnglish: sheet?.querySelector('[lang="en"]:not(blockquote)')?.textContent?.trim(),
      termCount: sheet?.querySelectorAll(".aiTermList article").length ?? 0,
      sheetScrollTop: sheet?.scrollTop ?? -1,
      bodyScrollTop: body?.scrollTop ?? 0,
      chromeStable: Boolean(before && after && Math.abs(before.top - after.top) < 1 && Math.abs(before.bottom - after.bottom) < 1),
      bodyStartsAfterChrome: Boolean(before && body && body.getBoundingClientRect().top >= before.bottom - 1),
      cacheKind: cache[0]?.kind,
      cacheContainsSecret: JSON.stringify(cache).includes(${JSON.stringify(fakeSessionKey)}),
      calls: window.__qaDeepSeekCalls.reading,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  await sleep(420);
  const readingShot = await capture("03-reading-ai-assist");
  await evaluate(`document.querySelector('[aria-label="AI 阅读简释"] .closeButton')?.click()`);
  await waitFor("reading AI closed", () => evaluate(`!document.querySelector('[aria-label="AI 阅读简释"]')`));

  await evaluate(`(() => {
    const target = Array.from(document.querySelectorAll(".readerText")).find((item) => item.textContent.trim().length > 90);
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  })()`);
  await waitFor("cached AI selection action", () => evaluate(`Boolean(document.querySelector(".selectionActions .aiSelectionAction"))`));
  await evaluate(`document.querySelector(".selectionActions .aiSelectionAction")?.click()`);
  await waitFor("cached reading AI result", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 阅读简释"] .aiAssistResult'))`));
  const readingCacheReuse = await evaluate(`(() => ({
    source: document.querySelector('[aria-label="AI 阅读简释"] .aiAssistFooter span')?.textContent?.trim(),
    calls: window.__qaDeepSeekCalls.reading
  }))()`);
  await evaluate(`document.querySelector('[aria-label="AI 阅读简释"] .closeButton')?.click()`);
  await waitFor("cached reading AI closed", () => evaluate(`!document.querySelector('[aria-label="AI 阅读简释"]')`));

  await evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })`);
  await waitFor("chapter completion footer", () => evaluate(`Boolean(document.querySelector('.chapterCompletion'))`));
  await evaluate(`Array.from(document.querySelectorAll('.chapterCompletion button')).find((item) => item.textContent.includes('标记已读完'))?.click()`);
  await waitFor("chapter completion persisted", () => evaluate(`document.querySelector('.chapterCompletion')?.dataset.chapterCompleted === 'true'`));
  const chapterCompletion = await evaluate(`(() => ({
    heading: document.querySelector('.chapterCompletion h2')?.textContent?.trim(),
    next: document.querySelector('.nextChapterButton')?.textContent?.replace(/\\s+/g, ' ').trim(),
    stored: JSON.parse(localStorage.getItem('six-sigma-study:chapter-progress:v1') || '{}')?.['six-sigma-black-belt']?.ch02?.completed,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);
  const chapterShot = await capture("04-chapter-completion");
  await evaluate(`document.querySelector('.nextChapterButton')?.click()`);
  await waitFor("next chapter navigation", () => evaluate(`document.querySelector('.topBar h1')?.textContent?.includes('Chapter 3')`));
  const nextChapterHeading = await evaluate(`document.querySelector('.topBar h1')?.textContent?.trim()`);

  await evaluate(`Array.from(document.querySelectorAll("button")).find((item) => item.textContent.trim() === "书库")?.click()`);
  await waitFor("home navigation after reader", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("刷题"))?.click()`);
  await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionModeCards"))`));
  await evaluate(`Array.from(document.querySelectorAll(".questionModeCards button")).find((item) => item.textContent.includes("看题"))?.click()`);
  await waitFor("question AI button", () => evaluate(`Boolean(document.querySelector(".questionActions .aiHelpButton"))`));
  const questionOptionCount = await evaluate(`document.querySelectorAll(".questionCard .questionOption").length`);
  await evaluate(`document.querySelector(".questionActions .aiHelpButton")?.click()`);
  await waitFor("question AI result", () => evaluate(`Boolean(document.querySelector('[aria-label="AI 题目精讲"] .questionAiResult'))`));
  const questionAssist = await evaluate(`(() => {
    const sheet = document.querySelector('[aria-label="AI 题目精讲"]');
    const cache = JSON.parse(localStorage.getItem("six-sigma-study:ai-study-cache:v1") || "[]");
    return {
      answer: sheet?.querySelector(".aiAnswerLead > strong")?.textContent?.trim(),
      concept: sheet?.querySelector(".aiAnswerLead p b")?.textContent?.trim(),
      optionCount: sheet?.querySelectorAll(".aiOptionNotes article").length ?? 0,
      hasPitfall: Array.from(sheet?.querySelectorAll(".aiStudyTips strong") || []).some((item) => item.textContent.includes("易错点")),
      calls: window.__qaDeepSeekCalls.question,
      cacheKinds: cache.map((item) => item.kind),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  const questionShot = await capture("05-question-ai-assist");
  await evaluate(`document.querySelector('[aria-label="AI 题目精讲"] .closeButton')?.click()`);
  await waitFor("question AI closed", () => evaluate(`!document.querySelector('[aria-label="AI 题目精讲"]')`));
  await evaluate(`document.querySelector('[aria-label="返回题库主页"]')?.click()`);
  await waitFor("question dashboard return", () => evaluate(`Boolean(document.querySelector(".questionModeCards"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("我的"))?.click()`);
  await waitFor("correction export", () => evaluate(`Array.from(document.querySelectorAll(".correctionExportRow button")).some((item) => item.textContent.includes("导出 JSON"))`));
  const settingsShot = await capture("06-ai-settings-and-export");
  await evaluate(`(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  })()`);
  await evaluate(`document.querySelector(".correctionExportRow button")?.click()`);
  await waitFor("correction download", async () => fs.readdirSync(downloadDir).some((item) => item.endsWith(".json")), 8000);
  const downloadName = fs.readdirSync(downloadDir).find((item) => item.endsWith(".json"));
  const exportedBundle = JSON.parse(fs.readFileSync(path.join(downloadDir, downloadName), "utf8"));
  const settings = await evaluate(`(() => ({
    version: Array.from(document.querySelectorAll(".settingsPanel p")).find((item) => item.textContent.includes("版本"))?.textContent?.trim(),
    status: document.querySelector(".settingsTitleRow span")?.textContent?.trim(),
    count: document.querySelector(".correctionExportRow span")?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

  const record = storedBundle?.corrections?.[0];
  const checks = {
    offlineRevertFixed: offlineMeaning?.includes("回到") && !offlineMeaning?.includes("进行"),
    proposalPhrase: proposal.phrase === "revert to old ways",
    proposalMeaning: proposal.meaning === "回到旧有做法；恢复到原来的状态",
    proposalSentence: proposal.sentence?.includes("不会退回原来的做法"),
    proposalLayout: proposal.overflow <= 1,
    acceptedMeaning: acceptedMeaning === proposal.meaning,
    exactReuseNoSecondCall: reused.meaning === proposal.meaning && reused.calls === 1,
    reusedLayout: reused.overflow <= 1,
    readingSelectionCaptured: selectedReadingText.length > 90,
    readingStructuredResult: readingAssist.translation?.includes("控制措施") && readingAssist.plainEnglish?.includes("Six Sigma") && readingAssist.termCount === 1,
    readingFixedChrome: readingAssist.sheetScrollTop === 0 && readingAssist.bodyScrollTop > 0 && readingAssist.chromeStable && readingAssist.bodyStartsAfterChrome,
    readingCachedPrivately: readingAssist.cacheKind === "reading" && !readingAssist.cacheContainsSecret && readingCacheReuse.source?.includes("本机缓存") && readingCacheReuse.calls === 1,
    readingLayout: readingAssist.overflow <= 1,
    chapterCompletionPersisted: chapterCompletion.heading === "本章已读完" && chapterCompletion.stored === true,
    chapterNextNavigation: chapterCompletion.next?.includes("第 3 章") && nextChapterHeading?.includes("Chapter 3"),
    chapterCompletionLayout: chapterCompletion.overflow <= 1,
    questionStructuredResult: questionAssist.answer?.length > 0 && questionAssist.concept === "DMAIC 阶段职责" && questionAssist.optionCount === questionOptionCount,
    questionHelpAndCache: questionAssist.hasPitfall && questionAssist.calls === 1 && questionAssist.cacheKinds.includes("reading") && questionAssist.cacheKinds.includes("question"),
    questionLayout: questionAssist.overflow <= 1,
    uniformBundle: storedBundle?.schemaVersion === "1.0.0" && storedBundle?.format === "six-sigma-context-corrections",
    acceptedRecord: record?.status === "accepted" && record?.review?.acceptedBy === "user",
    stableHashes: /^ctxcorr-[a-f0-9]{64}$/.test(record?.id ?? "") && /^[a-f0-9]{64}$/.test(record?.source?.sourceTextSha256 ?? ""),
    strictProvenance: record?.provenance?.model === "deepseek-v4-flash" && record?.provenance?.promptVersion === "context-correction-v1",
    noSecretInBundle: !JSON.stringify(storedBundle).toLowerCase().includes("api_key") && !JSON.stringify(storedBundle).includes(fakeSessionKey),
    exportedAcceptedOnly: exportedBundle.corrections?.length === 1 && exportedBundle.corrections[0].status === "accepted",
    settingsVersion: settings.version === expectedDisplayVersion,
    settingsConfigured: settings.status === "已配置" && settings.count === "已确认修订 1",
    settingsLayout: settings.overflow <= 1
  };
  const ok = Object.values(checks).every(Boolean);
  cdp.close();
  const result = {
    ok,
    checks,
    offlineMeaning,
    proposal,
    acceptedMeaning,
    reused,
    readingAssist,
    readingCacheReuse,
    chapterCompletion,
    nextChapterHeading,
    questionAssist,
    settings,
    downloadName,
    screenshots: { proposalShot, acceptedShot, readingShot, chapterShot, questionShot, settingsShot }
  };
  fs.writeFileSync(path.join(artifactDir, "report.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
