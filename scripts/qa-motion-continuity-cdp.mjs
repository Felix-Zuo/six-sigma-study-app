import fs from "node:fs";
import path from "node:path";
import { waitForVisualIdle } from "./cdp-visual-idle.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/motion-continuity/screenshots";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const appOrigin = new URL(appUrl).origin;
  const page =
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl && item.url?.startsWith(appOrigin)) ??
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
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
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  async function waitFor(description, predicate, timeout = 16000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // Reloads briefly invalidate the execution context.
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name, waitForIdle = false) {
    if (waitForIdle) {
      await waitForVisualIdle(evaluate, { description: `${name} visual idle` });
    }
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filePath = path.resolve(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath.replaceAll("\\", "/");
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector("[data-app-view]"))`));
  const storageBackup = await evaluate(`(() => ({
    notice: localStorage.getItem(${JSON.stringify(noticeKey)}),
    preferences: localStorage.getItem(${JSON.stringify(preferencesKey)})
  }))()`);
  await evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(noticeKey)}, "true");
    localStorage.setItem(${JSON.stringify(preferencesKey)}, JSON.stringify({ theme: "light", textScale: "standard" }));
    location.reload();
    return true;
  })()`);
  await waitFor("home", () => evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "home"`));
  await waitForVisualIdle(evaluate, { description: "home visual idle" });

  const source = await evaluate(`(() => {
    const card = document.querySelector(".studyBookCard");
    const button = card?.querySelector(".primaryAction");
    card?.scrollIntoView({ block: "center", behavior: "instant" });
    const cardRect = card?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    return {
      found: Boolean(card && button),
      scrollY,
      card: cardRect ? { top: cardRect.top, bottom: cardRect.bottom, left: cardRect.left, right: cardRect.right } : null,
      button: buttonRect ? { top: buttonRect.top, bottom: buttonRect.bottom, left: buttonRect.left, right: buttonRect.right } : null
    };
  })()`);
  await sleep(180);
  const beforeShot = await capture("01-scrolled-book-card");

  await evaluate(`(() => {
    const nativeStart = document.startViewTransition?.bind(document);
    globalThis.__qaContinuity = { supported: Boolean(nativeStart), ready: false, finished: false, animations: [] };
    if (!nativeStart) return false;
    document.startViewTransition = (update) => {
      const transition = nativeStart(update);
      transition.ready.then(() => {
        const animations = document.getAnimations();
        for (const animation of animations) animation.pause();
        globalThis.__qaContinuity.animations = animations;
        globalThis.__qaContinuity.ready = true;
      });
      transition.finished.then(() => { globalThis.__qaContinuity.finished = true; });
      return transition;
    };
    return true;
  })()`);
  const clicked = await evaluate(`(() => {
    const button = document.querySelector(".studyBookCard .primaryAction");
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor("paused book transition", () => evaluate(`globalThis.__qaContinuity?.ready === true`));

  const animationEvidence = await evaluate(`(() => globalThis.__qaContinuity.animations.map((animation) => ({
    pseudoElement: animation.effect?.pseudoElement ?? null,
    animationName: animation.animationName ?? null,
    endTime: Number(animation.effect?.getComputedTiming?.().endTime) || 0
  })))()`);
  const targetAtReady = await evaluate(`(() => ({
    view: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
    scrollY,
    title: document.querySelector(".topBar h1")?.textContent?.trim() ?? null,
    transitionStyle: document.documentElement.dataset.transitionStyle ?? null,
    transitionSource: document.documentElement.dataset.transitionSource ?? null
  }))()`);
  const frameTimes = [90, 240, 430, 680, 900];
  const frameShots = [];
  for (const frameTime of frameTimes) {
    await evaluate(`(() => {
      for (const animation of globalThis.__qaContinuity.animations) {
        const endTime = Number(animation.effect?.getComputedTiming?.().endTime) || ${frameTime};
        animation.currentTime = Math.min(${frameTime}, Math.max(0, endTime - 0.01));
      }
      return true;
    })()`);
    frameShots.push(await capture(`02-frame-${String(frameTime).padStart(3, "0")}ms`));
  }

  await evaluate(`(() => {
    for (const animation of globalThis.__qaContinuity.animations) animation.play();
    return true;
  })()`);
  await waitFor("reader destination", () => evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "reader"`));
  await waitFor("book transition finish", () => evaluate(`globalThis.__qaContinuity?.finished === true`));
  const afterShot = await capture("03-reader-settled", true);
  const settled = await evaluate(`(() => ({
    view: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
    scrollY,
    title: document.querySelector(".topBar h1")?.textContent?.trim() ?? null,
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    transitionStyle: document.documentElement.dataset.transitionStyle ?? null,
    transitionSource: document.documentElement.dataset.transitionSource ?? null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

  await evaluate(`(() => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore(${JSON.stringify(noticeKey)}, ${JSON.stringify(storageBackup.notice)});
    restore(${JSON.stringify(preferencesKey)}, ${JSON.stringify(storageBackup.preferences)});
    return true;
  })()`);
  cdp.close();

  const pseudoElements = animationEvidence.map((item) => item.pseudoElement).filter(Boolean);
  const rootAnimations = animationEvidence
    .filter((item) => item.pseudoElement === "::view-transition-old(root)" || item.pseudoElement === "::view-transition-new(root)")
    .map((item) => item.animationName);
  const checks = {
    scrolledSourceVisible: source.found && source.scrollY > 300 && source.card?.top >= -1 && source.card?.bottom <= 845,
    clickAccepted: clicked,
    sharedPaperContinuity:
      pseudoElements.includes("::view-transition-old(app-reader-page)") &&
      pseudoElements.includes("::view-transition-new(app-reader-page)"),
    sharedTitleContinuity:
      pseudoElements.includes("::view-transition-old(app-reader-title)") &&
      pseudoElements.includes("::view-transition-new(app-reader-title)"),
    coherentCameraLayer:
      rootAnimations.includes("apertureSceneHoldOut") &&
      rootAnimations.includes("apertureBookCardSceneRevealIn") &&
      !rootAnimations.includes("apertureExitForward") &&
      !rootAnimations.includes("apertureEnterForward"),
    unrelatedFolderLayersSuppressed:
      !pseudoElements.includes("::view-transition-old(app-folder-cover)") &&
      !pseudoElements.includes("::view-transition-old(app-folder-tabs)"),
    nestedReaderLayersCollapsed:
      !pseudoElements.includes("::view-transition-new(app-reader-chrome)") &&
      !pseudoElements.includes("::view-transition-new(app-page-heading)") &&
      !pseudoElements.includes("::view-transition-new(app-reading-progress)"),
    destinationPreparedBeforeSnapshot:
      targetAtReady.view === "reader" && Boolean(targetAtReady.title) &&
      targetAtReady.transitionStyle === "book-open" && targetAtReady.transitionSource === "book-card",
    readerSettled:
      settled.view === "reader" && Math.abs(settled.scrollY - targetAtReady.scrollY) <= 2 && settled.title === targetAtReady.title &&
      settled.runningAnimations === 0 && settled.transitionStyle === null && settled.transitionSource === null,
    noHorizontalOverflow: settled.overflow <= 1
  };
  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    source,
    targetAtReady,
    animationEvidence,
    settled,
    screenshots: { beforeShot, frameShots, afterShot }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
