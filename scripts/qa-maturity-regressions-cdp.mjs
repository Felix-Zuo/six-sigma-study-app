const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const storagePageUrl = new URL("content/catalog.json", appUrl).href;

const mainBookId = "six-sigma-black-belt";
const sampleBookId = "agent-import-sample";
const firstQuestionId = "sample-dmaic-001";
const secondQuestionId = "sample-sipoc-002";
const fixturePrefix = "qa-maturity-";

const storageKeys = {
  notice: "six-sigma-study:notice-accepted:v1",
  activeBook: "six-sigma-study:active-book:v1",
  preferences: "six-sigma-study:reader-preferences:v1",
  vocab: "six-sigma-study:vocab:v1",
  notes: "six-sigma-study:notes:v1",
  favorites: "six-sigma-study:favorites:v1",
  readerPosition: "six-sigma-study:reader-position:v1",
  streak: "six-sigma-study:daily-streak:v1",
  questionBank: "six-sigma-study:question-bank:v1",
  questionProgress: "six-sigma-study:question-progress:v1",
  examResults: "six-sigma-study:exam-results:v1",
  mainCorrections: `six-sigma-study:context-corrections:v1:${mainBookId}`,
  sampleCorrections: `six-sigma-study:context-corrections:v1:${sampleBookId}`
};

const touchedStorageKeys = Object.values(storageKeys);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debuggerBaseUrl(value) {
  const url = new URL(value);
  const basePath = url.pathname.replace(/\/json(?:\/list)?\/?$/, "").replace(/\/$/, "");
  return `${url.protocol}//${url.host}${basePath}`;
}

async function readJsonResponse(response, description) {
  if (!response.ok) {
    throw new Error(`${description} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function openDebugTarget() {
  const baseUrl = debuggerBaseUrl(endpoint);
  let creationError = "";
  try {
    const response = await fetch(`${baseUrl}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
    const target = await readJsonResponse(response, "creating an isolated CDP target");
    if (!target.id || !target.webSocketDebuggerUrl) {
      throw new Error("created target did not include an id and websocket URL");
    }
    return { ...target, owned: true, mode: "isolated", baseUrl, creationError };
  } catch (error) {
    creationError = error instanceof Error ? error.message : String(error);
  }

  const pages = await readJsonResponse(await fetch(endpoint), "listing CDP targets");
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error(`No debuggable page found after isolated-target creation failed: ${creationError}`);
  }
  return {
    ...page,
    owned: false,
    mode: "existing-fallback",
    baseUrl,
    originalUrl: page.url,
    creationError
  };
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out opening the CDP websocket")), 10000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Failed to open the CDP websocket"));
      }, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id || !this.pending.has(payload.id)) {
        return;
      }
      const pending = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      clearTimeout(pending.timer);
      if (payload.error) {
        pending.reject(new Error(`${pending.method}: ${JSON.stringify(payload.error)}`));
        return;
      }
      pending.resolve(payload.result);
    });

    this.ws.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP websocket closed while waiting for ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, timeout = 20000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Cannot call ${method}: CDP websocket is not open`));
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out calling ${method}`));
      }, timeout);
      this.pending.set(id, { method, resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
      this.ws.close();
    }
  }
}

class AssertionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "AssertionError";
    this.details = details;
  }
}

function assert(condition, message, details) {
  if (!condition) {
    throw new AssertionError(message, details);
  }
}

function errorDetails(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof AssertionError && error.details !== undefined ? { details: error.details } : {})
  };
}

function localDay(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeTerm({ id, term, translation, contextMeaning, nextReviewAt, savedAt }) {
  return {
    id,
    bookId: mainBookId,
    bookTitle: "六西格玛黑带培训教材",
    contentVersion: "qa-maturity",
    term,
    translation,
    partOfSpeech: "noun",
    chapter: 1,
    chapterTitle: "Chapter 1: What is Six Sigma?",
    page: 6,
    sectionId: "ch01-overview",
    blockId: `${id}-block`,
    sourceText: `${term} appears in this controlled maturity regression fixture.`,
    sourceTranslation: `${term} 出现在成熟度回归测试夹具中。`,
    contextMeaning,
    contextExplanation: `这里的 ${term} 用于验证到期复习筛选。`,
    exampleText: `${term} appears in this controlled maturity regression fixture.`,
    exampleTranslation: `${term} 出现在成熟度回归测试夹具中。`,
    savedAt,
    status: "new",
    familiarity: 0,
    reviewCount: 0,
    lapseCount: 0,
    correctStreak: 0,
    nextReviewAt,
    intervalDays: 0,
    easeFactor: 2.1,
    sourceType: "manual",
    sourceBookId: mainBookId,
    sourcePage: 6
  };
}

function makeFixture(overrides = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const pastIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const futureIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sampleUpdatedAt = new Date(now.getTime() - 1000).toISOString();
  const vocab = overrides.vocab ?? [
    makeTerm({
      id: `${fixturePrefix}due-term`,
      term: "capability",
      translation: "能力",
      contextMeaning: "过程能力",
      nextReviewAt: pastIso,
      savedAt: pastIso
    }),
    makeTerm({
      id: `${fixturePrefix}future-term`,
      term: "variation",
      translation: "波动",
      contextMeaning: "过程波动",
      nextReviewAt: futureIso,
      savedAt: nowIso
    })
  ];
  const daily = overrides.daily ?? {
    day: localDay(now),
    baseGoal: 8,
    goal: 8,
    completed: 0,
    streak: 17,
    missedDays: 0,
    checkedInToday: false,
    updatedAt: nowIso
  };
  const readerPosition = overrides.readerPosition ?? {
    activeBookId: mainBookId,
    positions: {
      [mainBookId]: {
        bookId: mainBookId,
        bookTitle: "六西格玛黑带培训教材",
        chapterId: "ch01",
        sectionId: "ch01-overview",
        page: 6,
        language: "en",
        scrollY: 0,
        updatedAt: nowIso
      },
      [sampleBookId]: {
        bookId: sampleBookId,
        bookTitle: "教材导入练习手册",
        chapterId: "sample-ch02",
        sectionId: "sample-ch02-s02",
        page: 4,
        language: "en",
        scrollY: 0,
        updatedAt: sampleUpdatedAt
      }
    },
    updatedAt: nowIso
  };
  const questionProgress = overrides.questionProgress ?? {
    [firstQuestionId]: {
      questionId: firstQuestionId,
      seen: true,
      favorite: false,
      correctCount: 1,
      wrongCount: 0,
      unknownCount: 0,
      correctStreak: 1,
      wrongPriority: 0,
      mastered: false,
      lastSeenAt: pastIso,
      lastAnsweredAt: pastIso
    },
    [secondQuestionId]: {
      questionId: secondQuestionId,
      seen: true,
      favorite: false,
      correctCount: 0,
      wrongCount: 0,
      unknownCount: 0,
      correctStreak: 0,
      wrongPriority: 0,
      mastered: false,
      lastSeenAt: nowIso
    }
  };

  return {
    [storageKeys.notice]: "true",
    [storageKeys.activeBook]: mainBookId,
    [storageKeys.preferences]: JSON.stringify({ theme: "light", textScale: "standard" }),
    [storageKeys.vocab]: JSON.stringify(vocab),
    [storageKeys.notes]: JSON.stringify(overrides.notes ?? []),
    [storageKeys.favorites]: JSON.stringify(overrides.favorites ?? []),
    [storageKeys.readerPosition]: JSON.stringify(readerPosition),
    [storageKeys.streak]: JSON.stringify(daily),
    [storageKeys.questionBank]: null,
    [storageKeys.questionProgress]: JSON.stringify(questionProgress),
    [storageKeys.examResults]: JSON.stringify(overrides.examResults ?? []),
    [storageKeys.mainCorrections]: null,
    [storageKeys.sampleCorrections]: null
  };
}

async function main() {
  const startedAt = new Date();
  const cases = [];
  const cleanup = { storageRestored: false, targetClosed: false };
  let target;
  let cdp;
  let snapshot;
  let infrastructureError;

  try {
    target = await openDebugTarget();
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Accessibility.enable")
    ]);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }]
    });

    async function evaluate(expression) {
      const response = await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      });
      if (response.exceptionDetails) {
        const description = response.exceptionDetails.exception?.description
          ?? response.exceptionDetails.text
          ?? "Runtime.evaluate failed";
        throw new Error(description);
      }
      return response.result?.value;
    }

    async function waitFor(description, predicate, timeout = 20000) {
      const started = Date.now();
      let lastError;
      while (Date.now() - started < timeout) {
        try {
          if (await predicate()) {
            return;
          }
        } catch (error) {
          lastError = error;
        }
        await sleep(100);
      }
      throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
    }

    async function navigate(url, description) {
      const result = await cdp.send("Page.navigate", { url });
      if (result.errorText) {
        throw new Error(`${description} navigation failed: ${result.errorText}`);
      }
      await waitFor(description, () => evaluate(`document.readyState === "complete" && location.href === ${JSON.stringify(url)}`));
    }

    async function setViewport(width, height = 900) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        screenWidth: width,
        screenHeight: height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await waitFor(`viewport ${width}x${height}`, () => evaluate(`window.innerWidth === ${width} && window.innerHeight === ${height}`));
      await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    }

    async function goToStoragePage() {
      await navigate(storagePageUrl, "same-origin storage page");
    }

    async function readStorage(keys = touchedStorageKeys) {
      return evaluate(`(() => {
        const keys = ${JSON.stringify(keys)};
        return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
      })()`);
    }

    async function writeStorage(values) {
      await evaluate(`(() => {
        const values = ${JSON.stringify(values)};
        for (const [key, value] of Object.entries(values)) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
        return true;
      })()`);
    }

    async function waitForHome() {
      await waitFor("home view and primary navigation", () => evaluate(`Boolean(
        document.querySelector('main[data-app-view="home"]') &&
        document.querySelector('nav[aria-label="主导航"]')
      )`), 35000);
    }

    async function installFixture(overrides = {}) {
      await goToStoragePage();
      await writeStorage(makeFixture(overrides));
      await setViewport(390, 844);
      await navigate(appUrl, "study application");
      await waitForHome();
    }

    async function clickPrimaryNav(label) {
      const result = await evaluate(`(() => {
        const label = ${JSON.stringify(label)};
        const nav = document.querySelector('nav[aria-label="主导航"]');
        const button = Array.from(nav?.querySelectorAll("button") ?? [])
          .find((item) => item.querySelector("strong")?.textContent?.trim() === label);
        if (!button) return { clicked: false, available: Array.from(nav?.querySelectorAll("strong") ?? []).map((item) => item.textContent?.trim()) };
        button.click();
        return { clicked: true };
      })()`);
      assert(result.clicked, `Primary navigation item ${label} was not found`, result);
    }

    async function clickBook(title) {
      const result = await evaluate(`(() => {
        const title = ${JSON.stringify(title)};
        const library = document.querySelector('section[aria-label="教材库"]');
        const card = Array.from(library?.querySelectorAll("article") ?? [])
          .find((item) => item.querySelector("h2")?.textContent?.trim() === title);
        const button = card?.querySelector("button.primaryAction");
        if (!button) return { clicked: false, available: Array.from(library?.querySelectorAll("article h2") ?? []).map((item) => item.textContent?.trim()) };
        button.click();
        return { clicked: true };
      })()`);
      assert(result.clicked, `Book card ${title} was not found`, result);
    }

    async function clickSelector(selector, description) {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement) || element.matches(":disabled")) return false;
        element.click();
        return true;
      })()`);
      assert(clicked, `${description} was not available`, { selector });
    }

    async function readerState() {
      return evaluate(`(() => {
        const main = document.querySelector('main[data-app-view="reader"]');
        const text = document.querySelector(".readerChrome .eyebrow")?.textContent?.trim() ?? "";
        const pagePair = text.startsWith("Page ") ? text.slice(5).split(" · ")[0] : "";
        const [page, pageCount] = pagePair.split("/").map((value) => Number(value.trim()));
        return {
          bookId: main?.getAttribute("data-book-id") ?? "",
          page: Number.isFinite(page) ? page : null,
          pageCount: Number.isFinite(pageCount) ? pageCount : null,
          text
        };
      })()`);
    }

    async function waitForReader(bookId, page, pageCount) {
      await waitFor(`${bookId} reader at p${page}`, async () => {
        const state = await readerState();
        return state.bookId === bookId && state.page === page && state.pageCount === pageCount;
      });
      return readerState();
    }

    async function backToLibrary() {
      await clickSelector('[aria-label="返回书库"]', "back-to-library control");
      await waitForHome();
    }

    async function runCase(name, fn) {
      const caseStarted = Date.now();
      try {
        const evidence = await fn();
        cases.push({ name, pass: true, durationMs: Date.now() - caseStarted, evidence });
      } catch (error) {
        cases.push({ name, pass: false, durationMs: Date.now() - caseStarted, error: errorDetails(error) });
      }
    }

    await goToStoragePage();
    snapshot = await readStorage();

    await runCase("multibook-position-isolation", async () => {
      await installFixture();
      const sequence = [
        { id: mainBookId, title: "六西格玛黑带培训教材", page: 6, pageCount: 449 },
        { id: sampleBookId, title: "教材导入练习手册", page: 4, pageCount: 5 },
        { id: mainBookId, title: "六西格玛黑带培训教材", page: 6, pageCount: 449 },
        { id: sampleBookId, title: "教材导入练习手册", page: 4, pageCount: 5 }
      ];
      const observations = [];
      for (const expected of sequence) {
        await clickBook(expected.title);
        const observed = await waitForReader(expected.id, expected.page, expected.pageCount);
        observations.push(observed);
        assert(observed.page <= observed.pageCount, `${expected.id} restored beyond its page count`, observed);
        await backToLibrary();
      }

      const stored = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.readerPosition)}) ?? "{}")`);
      const mainPosition = stored.positions?.[mainBookId];
      const samplePosition = stored.positions?.[sampleBookId];
      const mismatches = Object.entries(stored.positions ?? {})
        .filter(([bookId, position]) => position.bookId !== bookId)
        .map(([bookId, position]) => ({ mapKey: bookId, storedBookId: position.bookId, page: position.page }));
      assert(mainPosition?.bookId === mainBookId && mainPosition?.page === 6, "Main-book position was overwritten", mainPosition);
      assert(samplePosition?.bookId === sampleBookId && samplePosition?.page === 4, "Sample-book position was overwritten", samplePosition);
      assert(samplePosition.page <= 5, "Sample-book position exceeded page 5", samplePosition);
      assert(mismatches.length === 0, "Reader positions were written under another book id", mismatches);
      return {
        observations,
        stored: {
          activeBookId: stored.activeBookId,
          main: { bookId: mainPosition.bookId, page: mainPosition.page },
          sample: { bookId: samplePosition.bookId, page: samplePosition.page }
        },
        crossBookMismatches: mismatches
      };
    });

    await runCase("reader-state-isolation-and-navigation-load-stability", async () => {
      await installFixture();
      await clickBook("六西格玛黑带培训教材");
      await waitForReader(mainBookId, 6, 449);
      await backToLibrary();
      await evaluate(`(() => {
        const originalFetch = window.fetch.bind(window);
        window.__qaManualNavigationLoads = [];
        window.fetch = (input, init) => {
          const source = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(source, window.location.href);
          if (url.pathname.endsWith("/manual.json")) {
            window.__qaManualNavigationLoads.push(url.href);
          }
          return originalFetch(input, init);
        };
      })()`);
      await clickPrimaryNav("单词");
      await waitFor("vocabulary view before manual-load audit", () => evaluate(`Boolean(document.querySelector('main[data-app-view="vocab"]'))`));
      await clickPrimaryNav("刷题");
      await waitFor("question view before manual-load audit", () => evaluate(`Boolean(document.querySelector('main[data-app-view="questions"]'))`));
      await clickPrimaryNav("首页");
      await waitForHome();
      const navigationLoads = await evaluate(`window.__qaManualNavigationLoads ?? []`);
      assert(navigationLoads.length === 0, "Primary navigation reloaded the active manual", navigationLoads);

      await clickBook("六西格玛黑带培训教材");
      await waitForReader(mainBookId, 6, 449);
      const readerScroll = await evaluate(`(() => {
        const target = Array.from(document.querySelectorAll('.readerPanel [data-page="7"]'))
          .find((item) => item.getBoundingClientRect().height > 0);
        target?.scrollIntoView({ block: "start" });
        return Boolean(target);
      })()`);
      assert(readerScroll, "No visible page-7 reader target was available");
      await waitFor("reader observer to report page 7", async () => (await readerState()).page === 7);
      await sleep(350);
      const storedReaderPosition = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.readerPosition)}) ?? "{}").positions?.[${JSON.stringify(mainBookId)}] ?? null`);
      assert(storedReaderPosition?.page === 7 && storedReaderPosition.scrollY > 0, "Reader scroll was not persisted at page 7", storedReaderPosition);

      await backToLibrary();
      await evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight })`);
      await sleep(350);
      const afterHomeScroll = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.readerPosition)}) ?? "{}").positions?.[${JSON.stringify(mainBookId)}] ?? null`);
      assert(
        afterHomeScroll?.page === storedReaderPosition.page && afterHomeScroll?.scrollY === storedReaderPosition.scrollY,
        "Non-reader scrolling overwrote the saved reader position",
        { storedReaderPosition, afterHomeScroll }
      );

      await clickBook("六西格玛黑带培训教材");
      await waitForReader(mainBookId, 7, 449);
      const restored = await evaluate(`({
        scrollY: Math.round(window.scrollY),
        savedScrollY: Math.round(JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.readerPosition)}) ?? "{}").positions?.[${JSON.stringify(mainBookId)}]?.scrollY ?? 0)
      })`);
      assert(Math.abs(restored.scrollY - restored.savedScrollY) <= 2, "Reader did not restore the saved scroll position", restored);
      return { navigationLoads, storedReaderPosition, afterHomeScroll, restored };
    });

    await runCase("question-priority-is-stable-across-reloads", async () => {
      const priorityQuestionId = "qa-maturity-priority";
      const priorityProgress = {
        [priorityQuestionId]: {
          questionId: priorityQuestionId,
          seen: true,
          favorite: false,
          correctCount: 2,
          wrongCount: 4,
          unknownCount: 1,
          correctStreak: 2,
          wrongPriority: 5,
          mastered: false,
          lastAnsweredAt: new Date().toISOString()
        }
      };
      await installFixture({ questionProgress: priorityProgress });
      await waitFor("normalized question priority persistence", () => evaluate(`Boolean(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}))`));
      await sleep(100);
      const firstLoad = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}")[${JSON.stringify(priorityQuestionId)}]`);
      await cdp.send("Page.reload", { ignoreCache: true });
      await waitForHome();
      await sleep(100);
      const secondLoad = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}")[${JSON.stringify(priorityQuestionId)}]`);
      assert(firstLoad?.wrongPriority === 5, "Question priority changed during initial normalization", firstLoad);
      assert(secondLoad?.wrongPriority === 5, "Question priority decayed merely from reloading", { firstLoad, secondLoad });
      return { firstLoad, secondLoad };
    });

    await runCase("reader-interaction-continuity", async () => {
      await installFixture();
      await clickBook("六西格玛黑带培训教材");
      await waitForReader(mainBookId, 6, 449);
      const wordSemantics = await evaluate(`({
        wordCount: document.querySelectorAll(".readerPanel .wordToken").length,
        buttonCount: document.querySelectorAll(".readerPanel button.wordToken").length,
        semanticButtonCount: document.querySelectorAll('.readerPanel .wordToken[role="button"]').length,
        tabStopCount: document.querySelectorAll('.readerPanel .wordToken[tabindex="0"]').length
      })`);
      assert(wordSemantics.wordCount > 100 && wordSemantics.buttonCount === 0 && wordSemantics.semanticButtonCount === wordSemantics.wordCount && wordSemantics.tabStopCount === 1,
        "Reader word lookup did not expose exactly one roving keyboard entry", wordSemantics);
      const keyboardLookup = await evaluate(`(() => {
        const entry = document.querySelector('.readerPanel .wordToken[tabindex="0"]');
        entry?.focus();
        entry?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        const moved = document.activeElement;
        moved?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return {
          moved: moved?.classList.contains("wordToken") ?? false,
          tabStopCount: document.querySelectorAll('.readerPanel .wordToken[tabindex="0"]').length
        };
      })()`);
      await waitFor("keyboard word lookup", () => evaluate(`Boolean(document.querySelector('section[aria-label="单词释义"]'))`));
      assert(keyboardLookup.moved && keyboardLookup.tabStopCount === 1, "Roving word keyboard navigation was not stable", keyboardLookup);
      await evaluate(`document.querySelector('section[aria-label="单词释义"] .closeButton')?.click()`);
      await waitFor("keyboard lookup close", () => evaluate(`!document.querySelector('section[aria-label="单词释义"]')`));

      const positioned = await evaluate(`(() => {
        const target = Array.from(document.querySelectorAll('.readerPanel [data-page="7"][data-block-id]'))
          .find((item) => item.getBoundingClientRect().height > 40);
        target?.scrollIntoView({ block: "start" });
        return target?.getAttribute("data-block-id") ?? "";
      })()`);
      assert(positioned, "No stable page-7 block was available for immersive continuity");
      await waitFor("page 7 before immersive mode", async () => (await readerState()).page === 7);
      const beforeImmersive = await evaluate(`(() => {
        const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 120) + 10;
        const block = Array.from(document.querySelectorAll('.readerPanel [data-block-id]')).find((item) => {
          const rect = item.getBoundingClientRect();
          return rect.top <= anchor && rect.bottom >= anchor;
        });
        const rect = block?.getBoundingClientRect();
        return {
          blockId: block?.getAttribute("data-block-id") ?? "",
          ratio: rect ? Math.max(0, Math.min(1, (anchor - rect.top) / Math.max(1, rect.height))) : null,
          page: Number(block?.getAttribute("data-page"))
        };
      })()`);
      assert(beforeImmersive.blockId && Number.isFinite(beforeImmersive.ratio), "Could not capture the pre-immersive reading anchor", beforeImmersive);
      await clickSelector('[aria-label="进入沉浸阅读"]', "enter immersive reading control");
      await waitFor("immersive reader", () => evaluate(`document.querySelector('main[data-app-view="reader"]')?.classList.contains("immersiveMode")`));
      await sleep(800);
      const duringImmersive = await evaluate(`(() => {
        const anchor = (document.querySelector(".readerChrome")?.getBoundingClientRect().height ?? 0) + 10;
        const block = document.querySelector('[data-block-id=${JSON.stringify(beforeImmersive.blockId)}]');
        const rect = block?.getBoundingClientRect();
        return {
          ratio: rect ? Math.max(0, Math.min(1, (anchor - rect.top) / Math.max(1, rect.height))) : null,
          pageLabel: document.querySelector(".immersiveExit")?.textContent?.trim() ?? ""
        };
      })()`);
      assert(Number.isFinite(duringImmersive.ratio) && Math.abs(duringImmersive.ratio - beforeImmersive.ratio) <= 0.08, "Entering immersive mode lost the semantic reading anchor", { beforeImmersive, duringImmersive });
      assert(duringImmersive.pageLabel.includes("p. 7"), "Immersive mode changed the active page", duringImmersive);
      await clickSelector('[aria-label="退出沉浸阅读"]', "exit immersive reading control");
      await waitFor("normal reader after immersive", () => evaluate(`!document.querySelector('main[data-app-view="reader"]')?.classList.contains("immersiveMode")`));
      await sleep(800);

      await clickSelector('[aria-label="打开阅读工具"]', "reader tools control");
      await waitFor("reader tools menu", () => evaluate(`Boolean(document.querySelector('.readerMenu[aria-label="阅读工具"]'))`));
      await evaluate(`document.querySelector('[aria-label="打开阅读工具"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
      await waitFor("reader tools Escape close", () => evaluate(`!document.querySelector(".readerMenu")`));

      await clickSelector('[aria-label="打开目录"]', "table-of-contents control");
      await waitFor("table-of-contents dialog", () => evaluate(`Boolean(document.querySelector('section[role="dialog"][aria-label="目录"]'))`));
      const pageSearch = await evaluate(`(() => {
        const input = document.querySelector('.tocSearch input[type="search"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (!input || !setter) return false;
        setter.call(input, "51");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      assert(pageSearch, "TOC page search could not be populated");
      await waitFor("page 51 TOC result", () => evaluate(`Array.from(document.querySelectorAll(".tocItem span")).some((item) => item.textContent?.trim() === "p. 51")`));
      const jumped = await evaluate(`(() => {
        const item = Array.from(document.querySelectorAll(".tocItem"))
          .find((button) => button.querySelector("span")?.textContent?.trim() === "p. 51");
        item?.click();
        return Boolean(item);
      })()`);
      assert(jumped, "Page 51 TOC result could not be activated");
      await waitForReader(mainBookId, 51, 449);
      await waitFor("active page in visible chapter rail", () => evaluate(`(() => {
        const container = document.querySelector(".chapterRail");
        const active = container?.querySelector(".sectionPill.active");
        const containerRect = container?.getBoundingClientRect();
        const activeRect = active?.getBoundingClientRect();
        return Boolean(containerRect && activeRect && active?.textContent?.trim() === "51" &&
          activeRect.left >= containerRect.left - 1 && activeRect.right <= containerRect.right + 1);
      })()`));
      const rail = await evaluate(`(() => {
        const container = document.querySelector(".chapterRail");
        const active = container?.querySelector(".sectionPill.active");
        const containerRect = container?.getBoundingClientRect();
        const activeRect = active?.getBoundingClientRect();
        return {
          activeText: active?.textContent?.trim() ?? "",
          visible: Boolean(containerRect && activeRect && activeRect.left >= containerRect.left - 1 && activeRect.right <= containerRect.right + 1),
          scrollLeft: container?.scrollLeft ?? 0
        };
      })()`);
      assert(rail.activeText === "51" && rail.visible, "Active chapter page remained outside the visible rail", rail);
      return { wordSemantics, beforeImmersive, duringImmersive, rail };
    });

    await runCase("due-vocabulary-session", async () => {
      await installFixture();
      await clickPrimaryNav("单词");
      await waitFor("vocabulary plan", () => evaluate(`Boolean(document.querySelector('section[aria-label="今日学习状态"]'))`));
      await waitFor("active vocabulary dictionary", () => evaluate(`document.querySelector(".vocabStartButton")?.disabled === false`));
      const plan = await evaluate(`(() => ({
        dueText: document.querySelector('section[aria-label="今日学习状态"] h2')?.textContent?.trim() ?? "",
        startText: document.querySelector(".vocabStartButton")?.textContent?.trim() ?? ""
      }))()`);
      assert(plan.dueText === "1 个待复习", "Vocabulary plan did not show exactly one due term", plan);
      await clickSelector(".vocabStartButton", "start vocabulary review control");
      await waitFor("due-only vocabulary session", () => evaluate(`Boolean(document.querySelector('section[aria-label="单词复习"] .flashCard'))`));
      const session = await evaluate(`(() => ({
        term: document.querySelector(".flashCard h2")?.textContent?.trim() ?? "",
        counter: document.querySelector(".studySessionBar > strong")?.textContent?.trim() ?? "",
        progressLabel: document.querySelector('[aria-label="复习进度"]')?.getAttribute("aria-label") ?? "",
        futureVisible: document.querySelector(".flashCard")?.textContent?.includes("variation") ?? false
      }))()`);
      const terms = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.vocab)}) ?? "[]").map((item) => ({ id: item.id, term: item.term, nextReviewAt: item.nextReviewAt }))`);
      assert(session.term === "capability", "Review session did not start with the due term", session);
      assert(session.counter === "1/1", "Review session included more than the one due term", session);
      assert(!session.futureVisible, "Future vocabulary leaked into the due review session", session);
      assert(terms.some((term) => term.id === `${fixturePrefix}future-term` && Date.parse(term.nextReviewAt) > Date.now()), "Future fixture term was not retained as future", terms);
      const dueOptionClicked = await evaluate(`(() => {
        const option = Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)"))
          .find((item) => item.textContent.includes("能力"));
        option?.click();
        return Boolean(option);
      })()`);
      assert(dueOptionClicked, "Due vocabulary dictionary option was not available");
      await waitFor("vocabulary answer stage", () => evaluate(`Boolean(document.querySelector(".flashRatingActions"))`));
      await clickSelector(".flashRatingActions button:first-child", "rate due vocabulary as unknown");
      await waitFor("same-session reinforcement quiz", () => evaluate(`Boolean(document.querySelector(".reinforcementBadge") && document.querySelector(".flashQuiz"))`));
      const reinforcementOptionClicked = await evaluate(`(() => {
        const option = Array.from(document.querySelectorAll(".flashQuiz button:not(.flashUnknownAction)"))
          .find((item) => item.textContent.includes("能力"));
        option?.click();
        return Boolean(option);
      })()`);
      assert(reinforcementOptionClicked, "Reinforcement dictionary option was not available");
      await waitFor("same-session reinforcement answer", () => evaluate(`Boolean(document.querySelector(".flashRatingActions.reinforcement"))`));
      await clickSelector(".flashRatingActions.reinforcement .primaryAction", "complete same-session reinforcement");
      await waitFor("limited vocabulary session completion", () => evaluate(`Boolean(document.querySelector(".flashCompleteState"))`));
      const completion = await evaluate(`(() => ({
        streak: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.streak)}) ?? "{}"),
        reviewed: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.vocab)}) ?? "[]")
          .find((item) => item.id === ${JSON.stringify(`${fixturePrefix}due-term`)}) ?? null,
        progressText: document.querySelector(".flashCompleteState p:last-of-type")?.textContent?.trim() ?? ""
      }))()`);
      assert(completion.streak.checkedInToday === true && completion.streak.completed === 1 && completion.streak.goal === 1,
        "A due queue smaller than the base goal could not complete today's check-in", completion);
      assert(completion.reviewed?.reviewCount === 1 && completion.reviewed?.lapseCount === 1,
        "The limited due session did not persist its self-rating", completion);
      assert(completion.reviewed?.schedulerVersion?.startsWith("fsrs-") && completion.reviewed?.reviewHistory?.length === 1,
        "The limited due session did not persist one FSRS review event", completion.reviewed);
      return { plan, session, terms, completion };
    });

    await runCase("question-resume-first-unanswered", async () => {
      await installFixture();
      await clickPrimaryNav("刷题");
      await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionContinueButton"))`));
      const dashboard = await evaluate(`(() => ({
        summary: document.querySelector(".questionDashboardHero h2")?.textContent?.trim() ?? "",
        action: document.querySelector(".questionContinueButton")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""
      }))()`);
      assert(dashboard.action.includes("继续练习"), "Question dashboard did not offer continue practice", dashboard);
      await clickSelector(".questionContinueButton", "continue-practice control");
      await waitFor("second question after resume", () => evaluate(`document.querySelector(".questionCard")?.getAttribute("data-question-id") === ${JSON.stringify(secondQuestionId)}`));
      const resumed = await evaluate(`(() => ({
        questionId: document.querySelector(".questionCard")?.getAttribute("data-question-id") ?? "",
        progress: document.querySelector(".questionProgressLine span:last-child")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        heading: document.querySelector(".questionCard h2")?.textContent?.trim() ?? ""
      }))()`);
      assert(resumed.questionId === secondQuestionId, "Continue practice did not resume at the second unanswered question", resumed);
      await clickSelector(".questionOption", "temporary answer before unknown rating");
      const unknownClicked = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll(".questionActions button"))
          .find((item) => item.textContent?.trim() === "不会");
        button?.click();
        return Boolean(button);
      })()`);
      assert(unknownClicked, "Unknown-answer control was not available");
      await waitFor("question explanation without navigation", () => evaluate(`Boolean(document.querySelector(".questionCard .answerPanel"))`));
      await waitFor("question progress persistence", () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}")[${JSON.stringify(secondQuestionId)}]?.unknownCount === 1`));
      const afterSubmit = await evaluate(`(() => ({
        questionId: document.querySelector(".questionCard")?.getAttribute("data-question-id") ?? "",
        unknownCount: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}")[${JSON.stringify(secondQuestionId)}]?.unknownCount ?? 0,
        userAnswer: document.querySelector(".answerPanel p:first-child")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        inputsLocked: ["不会", "已提交"].every((label) =>
          Array.from(document.querySelectorAll(".questionActions button"))
            .some((button) => button.textContent?.trim() === label && button.disabled)
        )
      }))()`);
      await evaluate(`Array.from(document.querySelectorAll(".questionActions button")).find((button) => button.textContent?.trim() === "不会")?.click()`);
      await sleep(120);
      const afterRepeat = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}")[${JSON.stringify(secondQuestionId)}]?.unknownCount ?? 0`);
      assert(afterSubmit.questionId === secondQuestionId && afterSubmit.unknownCount === 1 && afterSubmit.userAnswer.includes("未作答") && afterSubmit.inputsLocked,
        "Question submission did not stay on the current explanation or lock repeat input", afterSubmit);
      assert(afterRepeat === 1, "Repeated submission counted the same question twice", { afterSubmit, afterRepeat });
      await clickSelector(".questionPager button:last-child", "explicit next-question control");
      await waitFor("explicit next question", () => evaluate(`document.querySelector(".questionCard")?.getAttribute("data-question-id") !== ${JSON.stringify(secondQuestionId)}`));
      const nextQuestionId = await evaluate(`document.querySelector(".questionCard")?.getAttribute("data-question-id") ?? ""`);
      return { dashboard, resumed, afterSubmit, afterRepeat, nextQuestionId, firstAnsweredQuestionId: firstQuestionId };
    });

    await runCase("malformed-local-data-is-preserved-or-salvaged", async () => {
      await installFixture();
      await goToStoragePage();
      const invalidRaw = "{invalid-json";
      await evaluate(`localStorage.setItem(${JSON.stringify(storageKeys.vocab)}, ${JSON.stringify(invalidRaw)})`);
      await navigate(appUrl, "application with unreadable vocabulary storage");
      await waitForHome();
      await sleep(250);
      const preservedRaw = await evaluate(`localStorage.getItem(${JSON.stringify(storageKeys.vocab)})`);
      assert(preservedRaw === invalidRaw, "Unreadable vocabulary was overwritten during initial hydration", { preservedRaw });

      await goToStoragePage();
      const salvagedFixture = makeTerm({
        id: `${fixturePrefix}salvaged-term`,
        term: "capability",
        translation: "能力",
        contextMeaning: "过程能力",
        nextReviewAt: new Date(Date.now() - 60_000).toISOString(),
        savedAt: new Date().toISOString()
      });
      await evaluate(`localStorage.setItem(${JSON.stringify(storageKeys.vocab)}, JSON.stringify([${JSON.stringify(salvagedFixture)}, null, "broken-item"]))`);
      await navigate(appUrl, "application with partially malformed vocabulary storage");
      await waitForHome();
      await clickPrimaryNav("单词");
      await waitFor("salvaged vocabulary plan", () => evaluate(`document.querySelector(".vocabPlanHero h2")?.textContent?.trim() === "1 个待复习"`));
      const salvaged = await evaluate(`(() => ({
        dueText: document.querySelector(".vocabPlanHero h2")?.textContent?.trim() ?? "",
        runtimeErrors: Boolean(document.querySelector("vite-error-overlay"))
      }))()`);
      assert(salvaged.dueText === "1 个待复习" && !salvaged.runtimeErrors,
        "One malformed vocabulary item prevented valid items from loading", salvaged);
      return { preservedRaw, salvaged };
    });

    await runCase("mock-exam-absolute-timeout", async () => {
      await installFixture({ questionProgress: {}, examResults: [] });
      await clickPrimaryNav("刷题");
      await waitFor("question dashboard for exam", () => evaluate(`Boolean(document.querySelector(".questionModeCards"))`));
      const opened = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll(".questionModeCards button"))
          .find((item) => item.querySelector("strong")?.textContent?.trim() === "模拟考试");
        button?.click();
        return Boolean(button);
      })()`);
      assert(opened, "Mock-exam mode was not available");
      await waitFor("mock-exam setup", () => evaluate(`Boolean(document.querySelector(".examSetup"))`));
      const configured = await evaluate(`(() => {
        const inputs = document.querySelectorAll(".examSetup input");
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (inputs.length < 2 || !setValue) return false;
        setValue.call(inputs[0], "1");
        inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
        setValue.call(inputs[1], "0.01");
        inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      assert(configured, "Mock-exam fixture inputs could not be configured");
      await clickSelector(".examSetup .primaryAction", "start mock exam control");
      await waitFor("running mock exam", () => evaluate(`Boolean(document.querySelector(".examSession .examCountdown"))`));
      const running = await evaluate(`(() => ({
        countdown: document.querySelector(".examCountdown")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        questionId: document.querySelector(".examSession .questionCard")?.getAttribute("data-question-id") ?? ""
      }))()`);
      await waitFor("automatic mock-exam submission", () => evaluate(`Boolean(document.querySelector(".examResult"))`), 8000);
      const finished = await evaluate(`(() => {
        const results = JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.examResults)}) ?? "[]");
        const latest = results[0] ?? null;
        return {
          score: document.querySelector(".examResult .scoreBlock strong")?.textContent?.trim() ?? "",
          elapsedLabel: document.querySelector(".examResult .scoreBlock small")?.textContent?.trim() ?? "",
          latest,
          elapsedMs: latest ? Date.parse(latest.finishedAt) - Date.parse(latest.startedAt) : null
        };
      })()`);
      assert(running.countdown.startsWith("剩余 "), "Mock exam did not expose a countdown", running);
      assert(finished.latest?.total === 1, "Timed mock exam did not persist its one-question result", finished);
      assert(finished.elapsedMs >= 0 && finished.elapsedMs < 8000, "Timed mock exam did not submit near its deadline", finished);
      return { running, finished };
    });

    await runCase("clear-local-data-does-not-revive", async () => {
      await installFixture();
      await evaluate(`(() => {
        localStorage.setItem(${JSON.stringify(storageKeys.mainCorrections)}, JSON.stringify({ bookId: ${JSON.stringify(mainBookId)}, corrections: [] }));
        localStorage.setItem(${JSON.stringify(storageKeys.sampleCorrections)}, JSON.stringify({ bookId: ${JSON.stringify(sampleBookId)}, corrections: [] }));
      })()`);
      await clickPrimaryNav("我的");
      await waitFor("settings local-data panel", () => evaluate(`Boolean(document.querySelector(".settingsPanel .dangerButton"))`));
      await evaluate(`window.confirm = () => true`);
      await clickSelector(".settingsPanel .dangerButton", "clear-local-learning-data control");
      await waitFor("fixture removal from persisted learning state", () => evaluate(`(() => {
        const terms = JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.vocab)}) ?? "[]");
        const progress = JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}");
        const streak = JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.streak)}) ?? "{}");
        return !terms.some((item) => String(item.id).startsWith(${JSON.stringify(fixturePrefix)})) &&
          !progress[${JSON.stringify(firstQuestionId)}] && Number(streak.streak ?? 0) === 0;
      })()`));
      const immediatelyAfterClear = await evaluate(`(() => ({
        view: document.querySelector("main")?.getAttribute("data-app-view") ?? "",
        vocab: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.vocab)}) ?? "[]"),
        progress: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}"),
        streak: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.streak)}) ?? "{}"),
        correctionKeys: Object.keys(localStorage).filter((key) => key.startsWith("six-sigma-study:context-corrections:v1:"))
      }))()`);

      await cdp.send("Page.reload", { ignoreCache: true });
      await waitForHome();
      const homeAfterReload = await evaluate(`(() => ({
        streakValue: document.querySelector(".metricGrid button:nth-child(3) strong")?.textContent?.trim() ?? "",
        streakLabel: document.querySelector(".metricGrid button:nth-child(3) span")?.textContent?.trim() ?? "",
        currentNav: document.querySelector('nav[aria-label="主导航"] [aria-current="page"] strong')?.textContent?.trim() ?? ""
      }))()`);
      await clickPrimaryNav("单词");
      await waitFor("empty vocabulary plan after reload", () => evaluate(`Boolean(document.querySelector(".vocabPlanHero"))`));
      const vocabAfterReload = await evaluate(`document.querySelector(".vocabPlanHero h2")?.textContent?.trim() ?? ""`);
      await clickPrimaryNav("刷题");
      await waitFor("question dashboard after reload", () => evaluate(`Boolean(document.querySelector(".questionContinueButton"))`));
      const questionsAfterReload = await evaluate(`(() => ({
        summary: document.querySelector(".questionDashboardHero h2")?.textContent?.trim() ?? "",
        action: document.querySelector(".questionContinueButton")?.textContent?.replace(/\\s+/g, " ").trim() ?? ""
      }))()`);
      const persistedAfterReload = await evaluate(`(() => ({
        vocab: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.vocab)}) ?? "[]"),
        progress: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.questionProgress)}) ?? "{}"),
        streak: JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.streak)}) ?? "{}")
      }))()`);

      assert(immediatelyAfterClear.vocab.length === 0, "Vocabulary remained after normal clear", immediatelyAfterClear);
      assert(Object.keys(immediatelyAfterClear.progress).length === 0, "Question progress remained after normal clear", immediatelyAfterClear);
      assert(Number(immediatelyAfterClear.streak.streak ?? 0) === 0, "Old streak remained after normal clear", immediatelyAfterClear);
      assert(immediatelyAfterClear.correctionKeys.length === 0, "Context corrections from another book remained after local-data clear", immediatelyAfterClear);
      assert(homeAfterReload.streakValue === "0" && homeAfterReload.streakLabel === "连续天数", "Old streak revived after reload", homeAfterReload);
      assert(vocabAfterReload === "0 个待复习", "Old vocabulary revived after reload", { vocabAfterReload, persistedAfterReload });
      assert(questionsAfterReload.summary.startsWith("0/") && questionsAfterReload.action.includes("开始练习"), "Old question progress revived after reload", questionsAfterReload);
      assert(!persistedAfterReload.vocab.some((item) => String(item.id).startsWith(fixturePrefix)), "Fixture vocabulary was persisted again", persistedAfterReload);
      assert(!persistedAfterReload.progress[firstQuestionId], "Fixture question progress was persisted again", persistedAfterReload);
      return { immediatelyAfterClear, homeAfterReload, vocabAfterReload, questionsAfterReload, persistedAfterReload };
    });

    await runCase("removeitem-failure-keeps-ui-alive", async () => {
      await installFixture();
      await clickPrimaryNav("我的");
      await waitFor("settings before removeItem failure", () => evaluate(`Boolean(document.querySelector(".settingsPanel .dangerButton"))`));
      let evidence;
      try {
        const patched = await evaluate(`(() => {
          window.__qaMaturityErrors = [];
          window.addEventListener("error", (event) => window.__qaMaturityErrors.push(event.message || "window error"));
          window.addEventListener("unhandledrejection", (event) => window.__qaMaturityErrors.push(String(event.reason || "unhandled rejection")));
          window.confirm = () => true;
          window.__qaMaturityOriginalRemoveItem = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function () { throw new Error("qa-maturity removeItem failure"); };
          try {
            localStorage.removeItem("qa-maturity-removeitem-probe");
            return { patched: true, throwObserved: false };
          } catch (error) {
            return { patched: true, throwObserved: error.message.includes("qa-maturity") };
          }
        })()`);
        assert(patched.throwObserved, "removeItem failure simulation did not throw", patched);
        await clickSelector(".settingsPanel .dangerButton", "clear control under removeItem failure");
        await waitFor("settings UI after removeItem failure", () => evaluate(`Boolean(document.querySelector('main[data-app-view="settings"] .settingsPanel'))`));
        await sleep(250);
        evidence = await evaluate(`(() => ({
          throwObserved: true,
          view: document.querySelector("main")?.getAttribute("data-app-view") ?? "",
          h1: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? "",
          currentNavCount: document.querySelectorAll('nav[aria-label="主导航"] [aria-current="page"]').length,
          rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
          viteErrorOverlay: Boolean(document.querySelector("vite-error-overlay")),
          runtimeErrors: window.__qaMaturityErrors ?? []
        }))()`);
        assert(evidence.view === "settings" && evidence.h1 === "我的", "Settings UI disappeared when removeItem threw", evidence);
        assert(evidence.rootChildren > 0 && !evidence.viteErrorOverlay, "Application root crashed when removeItem threw", evidence);
        assert(evidence.currentNavCount === 1 && evidence.runtimeErrors.length === 0, "UI reported an uncaught error when removeItem threw", evidence);
      } finally {
        try {
          await evaluate(`(() => {
            if (window.__qaMaturityOriginalRemoveItem) {
              Storage.prototype.removeItem = window.__qaMaturityOriginalRemoveItem;
            }
            return true;
          })()`);
        } catch {
          // The next case starts in a new document realm.
        }
      }
      return evidence;
    });

    await runCase("lookup-sheet-keyboard-and-breakpoints", async () => {
      await installFixture({ vocab: [] });
      await clickBook("六西格玛黑带培训教材");
      await waitForReader(mainBookId, 6, 449);
      const token = await evaluate(`(() => {
        const section = Array.from(document.querySelectorAll('.readerPanel [data-section-id]'))
          .find((item) => item.querySelector(".sectionMeta")?.textContent?.trim() === "p. 6");
        const word = Array.from(section?.querySelectorAll(".wordToken") ?? [])
          .find((item) => (item.textContent?.trim().length ?? 0) >= 4);
        if (!word) return "";
        word.scrollIntoView({ block: "center", inline: "nearest" });
        word.click();
        return word.textContent?.trim() ?? "";
      })()`);
      assert(token.length >= 4, "No stable lookup token was available on p6", { token });
      await waitFor("lookup sheet", () => evaluate(`Boolean(document.querySelector('section[aria-label="单词释义"]'))`));
      const initial = await evaluate(`(() => {
        const sheet = document.querySelector('section[aria-label="单词释义"]');
        const separator = document.querySelector('section[aria-label="单词释义"] [role="separator"]');
        return {
          dialogRole: sheet?.getAttribute("role") ?? "",
          ariaModal: sheet?.getAttribute("aria-modal") ?? "",
          focusedLabel: document.activeElement?.textContent?.trim() ?? "",
          backdropTag: document.querySelector(".overlayBackdrop")?.tagName ?? "",
          backdropFocusable: document.querySelector(".overlayBackdrop")?.matches("button, a[href], [tabindex]:not([tabindex='-1'])") ?? false,
          role: separator?.getAttribute("role") ?? "",
          label: separator?.getAttribute("aria-label") ?? "",
          min: Number(separator?.getAttribute("aria-valuemin")),
          max: Number(separator?.getAttribute("aria-valuemax")),
          now: Number(separator?.getAttribute("aria-valuenow")),
          text: separator?.getAttribute("aria-valuetext") ?? ""
        };
      })()`);
      assert(initial.dialogRole === "dialog" && initial.ariaModal === "true", "Lookup sheet did not expose modal dialog semantics", initial);
      assert(initial.focusedLabel === "关闭", "Lookup sheet did not receive a predictable initial focus", initial);
      assert(initial.backdropTag === "DIV" && !initial.backdropFocusable, "Lookup backdrop remained an invisible keyboard control", initial);
      assert(initial.role === "separator" && initial.label.length > 0, "Lookup separator was not accessible", initial);
      assert(initial.min === 46 && initial.max === 92 && Number.isFinite(initial.now) && initial.text.length > 0, "Lookup separator aria values were incomplete", initial);

      await evaluate(`(() => {
        const separator = document.querySelector('section[aria-label="单词释义"] [role="separator"]');
        separator.focus();
        separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
        return true;
      })()`);
      await waitFor("ArrowUp sheet height", () => evaluate(`document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow") === "72"`));
      const afterArrowUp = await evaluate(`Number(document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow"))`);

      await evaluate(`(() => {
        const separator = document.querySelector('section[aria-label="单词释义"] [role="separator"]');
        separator.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        return true;
      })()`);
      await waitFor("End sheet height", () => evaluate(`document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow") === "92"`));
      const afterEnd = await evaluate(`Number(document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow"))`);
      assert(afterArrowUp !== initial.now && afterEnd !== afterArrowUp, "ArrowUp and End did not change sheet height", { initial, afterArrowUp, afterEnd });

      await evaluate(`(() => {
        const separator = document.querySelector('section[aria-label="单词释义"] [role="separator"]');
        separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
        return true;
      })()`);
      await waitFor("Home sheet height", () => evaluate(`document.querySelector('[role="separator"]')?.getAttribute("aria-valuenow") === "46"`));

      const stickyChrome = await evaluate(`(() => {
        const sheet = document.querySelector('section[aria-label="单词释义"]');
        const scrollBody = sheet?.querySelector('[data-sheet-scroll-body]');
        scrollBody.scrollTop = Math.min(520, scrollBody.scrollHeight - scrollBody.clientHeight);
        const sheetRect = sheet.getBoundingClientRect();
        const closeRect = sheet.querySelector(".closeButton")?.getBoundingClientRect();
        const handleRect = sheet.querySelector('[role="separator"]')?.getBoundingClientRect();
        return {
          scrollTop: scrollBody?.scrollTop ?? 0,
          sheetScrollTop: sheet.scrollTop,
          closeVisible: Boolean(closeRect && closeRect.top >= sheetRect.top - 1 && closeRect.bottom <= sheetRect.bottom + 1),
          handleVisible: Boolean(handleRect && handleRect.top >= sheetRect.top - 12 && handleRect.bottom <= sheetRect.bottom + 1)
        };
      })()`);
      assert(
        stickyChrome.scrollTop > 0 && stickyChrome.sheetScrollTop === 0 && stickyChrome.closeVisible && stickyChrome.handleVisible,
        "Lookup fixed chrome or isolated scroll body failed",
        stickyChrome
      );

      const layouts = [];
      for (const width of [759, 760, 800, 859, 860]) {
        await setViewport(width, 900);
        const layout = await evaluate(`(() => {
          const sheet = document.querySelector('section[aria-label="单词释义"]');
          const rect = sheet.getBoundingClientRect();
          return {
            requestedWidth: ${width},
            viewportWidth: window.innerWidth,
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            overflowLeft: Math.max(0, Math.round(-rect.left * 100) / 100),
            overflowRight: Math.max(0, Math.round((rect.right - window.innerWidth) * 100) / 100)
          };
        })()`);
        layouts.push(layout);
        assert(layout.viewportWidth === width && layout.left >= -1 && layout.right <= width + 1, `Lookup sheet overflowed at ${width}px`, layout);
      }
      await setViewport(390, 844);
      const trapped = await evaluate(`(() => {
        const sheet = document.querySelector('section[aria-label="单词释义"]');
        const close = sheet?.querySelector(".closeButton");
        close?.focus();
        close?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
        return Boolean(sheet?.contains(document.activeElement));
      })()`);
      assert(trapped, "Shift+Tab escaped behind the lookup sheet");
      await evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
      await waitFor("Escape lookup close", () => evaluate(`!document.querySelector('section[aria-label="单词释义"]')`));
      await evaluate(`new Promise((resolve) => requestAnimationFrame(resolve))`);
      const restoredFocus = await evaluate(`({
        isWord: document.activeElement?.classList.contains("wordToken") ?? false,
        text: document.activeElement?.textContent?.trim() ?? ""
      })`);
      assert(restoredFocus.isWord && restoredFocus.text === token, "Closing the lookup sheet did not restore focus to its word", restoredFocus);
      return { token, initial, afterArrowUp, afterEnd, stickyChrome, layouts, trapped, restoredFocus };
    });

    await runCase("home-accessible-heading-and-current-nav", async () => {
      await installFixture();
      const tree = await cdp.send("Accessibility.getFullAXTree");
      const accessibleH1 = tree.nodes
        .filter((node) => !node.ignored && node.role?.value === "heading")
        .filter((node) => node.properties?.some((property) => property.name === "level" && Number(property.value?.value) === 1))
        .map((node) => node.name?.value ?? "");
      const dom = await evaluate(`(() => {
        const nav = document.querySelector('nav[aria-label="主导航"]');
        const current = Array.from(nav?.querySelectorAll('[aria-current="page"]') ?? []);
        const visibleH1 = Array.from(document.querySelectorAll("h1")).filter((item) => {
          const style = getComputedStyle(item);
          const rect = item.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        return {
          view: document.querySelector("main")?.getAttribute("data-app-view") ?? "",
          primaryNavCount: document.querySelectorAll('nav[aria-label="主导航"]').length,
          currentCount: current.length,
          currentLabels: current.map((item) => item.querySelector("strong")?.textContent?.trim() ?? item.textContent?.trim() ?? ""),
          visibleH1: visibleH1.map((item) => item.textContent?.trim() ?? "")
        };
      })()`);
      assert(dom.view === "home", "Landmark checks did not run on home", dom);
      assert(accessibleH1.length === 1, "Home did not expose exactly one accessible H1", { accessibleH1, dom });
      assert(dom.primaryNavCount === 1 && dom.currentCount === 1 && dom.currentLabels[0] === "首页", "Primary navigation did not expose exactly one current page", dom);
      return { accessibleH1, ...dom };
    });

    await runCase("primary-navigation-scroll-isolation", async () => {
      await installFixture();
      await clickPrimaryNav("刷题");
      await waitFor("question dashboard for scroll isolation", () => evaluate(`Boolean(document.querySelector(".questionDashboardHero"))`));
      await evaluate(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })`);
      const questionScroll = await evaluate(`window.scrollY`);
      assert(questionScroll > 100, "Question page fixture did not become scrollable", { questionScroll });
      await clickPrimaryNav("首页");
      await waitForHome();
      await waitFor("home scroll reset", () => evaluate(`window.scrollY === 0`));
      const homeScroll = await evaluate(`window.scrollY`);
      await evaluate(`window.scrollTo({ top: 320, behavior: "instant" })`);
      const homeBeforeActive = await evaluate(`window.scrollY`);
      assert(homeBeforeActive > 100, "Home fixture did not become scrollable for active-navigation testing", { homeBeforeActive });
      await clickPrimaryNav("首页");
      await waitFor("active navigation scroll-to-top", () => evaluate(`window.scrollY === 0`));
      const activeNavScroll = await evaluate(`window.scrollY`);
      return { questionScroll, homeScroll, homeBeforeActive, activeNavScroll };
    });
  } catch (error) {
    infrastructureError = errorDetails(error);
  } finally {
    if (cdp && snapshot) {
      try {
        const response = await cdp.send("Page.navigate", { url: storagePageUrl });
        if (response.errorText) {
          throw new Error(response.errorText);
        }
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          try {
            const ready = await cdp.send("Runtime.evaluate", {
              expression: `document.readyState === "complete" && location.href === ${JSON.stringify(storagePageUrl)}`,
              returnByValue: true
            });
            if (ready.result?.value) break;
          } catch {
            // Navigation replaces the execution context briefly.
          }
          await sleep(100);
        }
        const restored = await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            const values = ${JSON.stringify(snapshot)};
            for (const [key, value] of Object.entries(values)) {
              if (value === null) localStorage.removeItem(key);
              else localStorage.setItem(key, value);
            }
            return Object.entries(values).every(([key, value]) => localStorage.getItem(key) === value);
          })()`,
          returnByValue: true
        });
        cleanup.storageRestored = restored.result?.value === true;
        if (!cleanup.storageRestored) {
          cleanup.storageError = "Storage snapshot verification failed";
        }
      } catch (error) {
        cleanup.storageError = error instanceof Error ? error.message : String(error);
      }
    }

    if (cdp && target && !target.owned && target.originalUrl) {
      try {
        await cdp.send("Page.navigate", { url: target.originalUrl });
        cleanup.targetClosed = true;
      } catch (error) {
        cleanup.targetError = error instanceof Error ? error.message : String(error);
      }
    }

    if (cdp) {
      cdp.close();
    }

    if (target?.owned) {
      try {
        const response = await fetch(`${target.baseUrl}/json/close/${encodeURIComponent(target.id)}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        cleanup.targetClosed = true;
      } catch (error) {
        cleanup.targetError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const passed = cases.filter((item) => item.pass).length;
  const failed = cases.length - passed;
  const ok = !infrastructureError && failed === 0 && cleanup.storageRestored && cleanup.targetClosed;
  const report = {
    ok,
    script: "qa-maturity-regressions-cdp",
    endpoint,
    appUrl,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    target: target ? {
      id: target.id,
      mode: target.mode,
      ...(target.creationError ? { isolatedTargetError: target.creationError } : {})
    } : null,
    summary: { total: cases.length, passed, failed },
    cases,
    cleanup,
    ...(infrastructureError ? { infrastructureError } : {})
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    script: "qa-maturity-regressions-cdp",
    endpoint,
    appUrl,
    fatalError: errorDetails(error)
  }, null, 2)}\n`);
  process.exitCode = 1;
});
