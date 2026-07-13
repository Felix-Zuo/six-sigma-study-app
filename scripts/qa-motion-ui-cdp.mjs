import fs from "node:fs";
import path from "node:path";
import { waitForVisualIdle } from "./cdp-visual-idle.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_MOTION_SCREENSHOT_DIR ?? "qa/motion-ui/screenshots";
const noticeAcceptedKey = "six-sigma-study:notice-accepted:v1";

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

function reducedOpeningProbeSource() {
  return `(() => {
    const state = {
      reduced: false,
      splashSeenAt: null,
      homeSeenAt: null,
      splashSamples: 0,
      observedOpeningAnimations: 0,
      maxOpeningAnimationEndMs: 0,
      maxOpeningAnimationActiveMs: 0,
      maxOpeningAnimationRemainingMs: 0,
      maxOpeningRunningAnimations: 0,
      runningAfterHome: null,
      homeFrames: 0,
      complete: false
    };
    globalThis.__qaReducedOpening = state;

    const sample = () => {
      const now = performance.now();
      const view = document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null;
      const animations = document.getAnimations();
      state.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (view === "splash") {
        if (state.splashSeenAt === null) state.splashSeenAt = now;
        state.splashSamples += 1;
        state.observedOpeningAnimations = Math.max(state.observedOpeningAnimations, animations.length);
        const running = animations.filter((animation) => animation.playState === "running");
        state.maxOpeningRunningAnimations = Math.max(state.maxOpeningRunningAnimations, running.length);
        for (const animation of animations) {
          const timing = animation.effect?.getComputedTiming?.();
          const endTime = Number(timing?.endTime);
          const activeDuration = Number(timing?.activeDuration);
          const currentTime = Number(animation.currentTime);
          if (Number.isFinite(endTime)) {
            state.maxOpeningAnimationEndMs = Math.max(state.maxOpeningAnimationEndMs, endTime);
            if (animation.playState === "running") {
              const remaining = endTime - (Number.isFinite(currentTime) ? currentTime : 0);
              state.maxOpeningAnimationRemainingMs = Math.max(state.maxOpeningAnimationRemainingMs, remaining);
            }
          }
          if (Number.isFinite(activeDuration)) {
            state.maxOpeningAnimationActiveMs = Math.max(state.maxOpeningAnimationActiveMs, activeDuration);
          }
        }
      }

      if (view === "home") {
        if (state.homeSeenAt === null) state.homeSeenAt = now;
        state.homeFrames += 1;
        if (state.homeFrames >= 3) {
          state.runningAfterHome = document.getAnimations().filter((animation) => animation.playState === "running").length;
          state.complete = true;
          return;
        }
      } else {
        state.homeFrames = 0;
      }
      requestAnimationFrame(sample);
    };

    const start = () => requestAnimationFrame(sample);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();`;
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
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filePath = path.resolve(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath.replaceAll("\\", "/");
  }

  async function clickPrimaryNavigation(accessibleName) {
    const result = await evaluate(`(() => {
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      const nav = document.querySelector('nav[aria-label="主导航"]');
      const button = Array.from(nav?.querySelectorAll("button") ?? []).find((item) => {
        const text = normalize(item.textContent);
        const aria = normalize(item.getAttribute("aria-label"));
        return text === ${JSON.stringify(accessibleName)} || aria === ${JSON.stringify(accessibleName)} ||
          aria.startsWith(${JSON.stringify(`${accessibleName}，`)});
      });
      const beforeView = document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null;
      button?.click();
      return { clicked: Boolean(button), beforeView };
    })()`);
    if (!result.clicked) throw new Error(`Could not find primary navigation control: ${accessibleName}`);
    return result;
  }

  async function clickWorkspaceEntry(accessibleName) {
    const result = await evaluate(`(() => {
      const normalize = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
      const nav = document.querySelector('nav[aria-label="学习入口"]');
      const button = Array.from(nav?.querySelectorAll("button") ?? [])
        .find((item) => normalize(item.textContent) === ${JSON.stringify(accessibleName)});
      const beforeView = document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null;
      button?.click();
      return { clicked: Boolean(button), beforeView };
    })()`);
    if (!result.clicked) throw new Error(`Could not find workspace entry: ${accessibleName}`);
    return result;
  }

  async function clickWorkspaceContinue() {
    const result = await evaluate(`(() => {
      const button = document.querySelector(".workspaceContinue");
      const beforeView = document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null;
      button?.click();
      return { clicked: Boolean(button), beforeView };
    })()`);
    if (!result.clicked) throw new Error("Could not find workspace continue control");
    return result;
  }

  async function clickReaderLibrary() {
    const result = await evaluate(`(() => {
      const button = document.querySelector('[aria-label="返回书库"]');
      const beforeView = document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null;
      button?.click();
      return { clicked: Boolean(button), beforeView };
    })()`);
    if (!result.clicked) throw new Error("Could not find Reader library control");
    return result;
  }

  async function installTransitionProbe(label) {
    return evaluate(`(() => {
      const nativeStart = globalThis.__qaNativeStartViewTransition ?? (
        typeof document.startViewTransition === "function"
          ? document.startViewTransition.bind(document)
          : null
      );
      if (nativeStart) globalThis.__qaNativeStartViewTransition = nativeStart;
      const state = {
        label: ${JSON.stringify(label)},
        supported: Boolean(nativeStart),
        path: nativeStart ? "pending" : "fallback",
        calls: 0,
        updateCalls: 0,
        kindAtCall: null,
        directionAtCall: null,
        styleAtCall: null,
        originAtCall: null,
        ready: false,
        finished: false,
        animationCountAtReady: 0,
        runningAnimationsAtReady: 0,
        maxAnimationEndMsAtReady: 0,
        pseudoElementsAtReady: [],
        namedElementsAtCall: [],
        namedElementsAfterUpdate: [],
        error: null
      };
      const collectNamedElements = () => Array.from(document.querySelectorAll("*"))
        .map((element) => ({
          name: getComputedStyle(element).viewTransitionName,
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : ""
        }))
        .filter((item) => item.name && item.name !== "none");
      globalThis.__qaTransitionProbe = state;
      if (nativeStart) {
        document.startViewTransition = (update) => {
          state.calls += 1;
          state.path = "native";
          state.kindAtCall = document.documentElement.dataset.transitionKind ?? null;
          state.directionAtCall = document.documentElement.dataset.transitionDirection ?? null;
          state.styleAtCall = document.documentElement.dataset.transitionStyle ?? null;
          state.originAtCall = {
            x: document.documentElement.style.getPropertyValue("--transition-origin-x"),
            y: document.documentElement.style.getPropertyValue("--transition-origin-y")
          };
          state.namedElementsAtCall = collectNamedElements();
          const transition = nativeStart(async () => {
            state.updateCalls += 1;
            await update();
            state.namedElementsAfterUpdate = collectNamedElements();
          });
          transition.ready.then(() => {
            const animations = document.getAnimations();
            globalThis.__qaTransitionAnimations = animations;
            state.ready = true;
            state.animationCountAtReady = animations.length;
            state.runningAnimationsAtReady = animations.filter((animation) => animation.playState === "running").length;
            state.pseudoElementsAtReady = animations
              .map((animation) => animation.effect?.pseudoElement ?? null)
              .filter(Boolean);
            state.maxAnimationEndMsAtReady = animations.reduce((max, animation) => {
              const endTime = Number(animation.effect?.getComputedTiming?.().endTime);
              return Number.isFinite(endTime) ? Math.max(max, endTime) : max;
            }, 0);
          }).catch((error) => {
            state.error = String(error);
          });
          transition.finished.then(() => {
            state.finished = true;
          }).catch((error) => {
            state.error = String(error);
          });
          return transition;
        };
      }
      return { supported: state.supported, path: state.path };
    })()`);
  }

  async function motionSnapshot() {
    return evaluate(`(() => {
      const animations = document.getAnimations();
      return {
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        view: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
        title: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? null,
        runningAnimations: animations.filter((animation) => animation.playState === "running").length,
        animationCount: animations.length,
        maxAnimationEndMs: animations.reduce((max, animation) => {
          const endTime = Number(animation.effect?.getComputedTiming?.().endTime);
          return Number.isFinite(endTime) ? Math.max(max, endTime) : max;
        }, 0),
        maxAnimationActiveMs: animations.reduce((max, animation) => {
          const activeDuration = Number(animation.effect?.getComputedTiming?.().activeDuration);
          return Number.isFinite(activeDuration) ? Math.max(max, activeDuration) : max;
        }, 0),
        transitionKind: document.documentElement.dataset.transitionKind ?? null,
        transitionDirection: document.documentElement.dataset.transitionDirection ?? null,
        transitionStyle: document.documentElement.dataset.transitionStyle ?? null,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    })()`);
  }

  async function captureTransition({ label, click, destination, frameTime = 480 }) {
    const probeSetup = await installTransitionProbe(label);
    const clickResult = await click();
    const immediatelyAfterClick = await motionSnapshot();
    await waitFor(`${label} destination`, () =>
      evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === ${JSON.stringify(destination)}`)
    );
    if (probeSetup.supported) {
      await waitFor(`${label} native transition ready`, () => evaluate(`globalThis.__qaTransitionProbe?.ready === true`));
      await evaluate(`(() => {
        for (const animation of globalThis.__qaTransitionAnimations ?? []) {
          animation.pause();
          const endTime = Number(animation.effect?.getComputedTiming?.().endTime) || ${frameTime};
          animation.currentTime = Math.min(${frameTime}, Math.max(0, endTime - 0.01));
        }
        return true;
      })()`);
      const frameShot = await capture(`${label}-${String(frameTime).padStart(3, "0")}ms`);
      await evaluate(`(() => {
        for (const animation of globalThis.__qaTransitionAnimations ?? []) animation.play();
        return true;
      })()`);
      await waitFor(`${label} native transition completion`, () =>
        evaluate(`globalThis.__qaTransitionProbe?.finished === true`)
      );
      globalThis.__qaLastTransitionFrame = frameShot;
    }
    await waitForVisualIdle(evaluate, { description: `${label} visual idle` });
    const transition = await evaluate(`(() => ({
      ...globalThis.__qaTransitionProbe,
      destination: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
      destinationTitle: document.querySelector(".appPageHeader h1, .readerHeading h1")?.textContent?.trim() ?? null,
      transitionKindAfterSettle: document.documentElement.dataset.transitionKind ?? null,
      transitionDirectionAfterSettle: document.documentElement.dataset.transitionDirection ?? null,
      transitionStyleAfterSettle: document.documentElement.dataset.transitionStyle ?? null,
      runningAnimationsAfterSettle: document.getAnimations().filter((animation) => animation.playState === "running").length,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    return {
      probeSetup,
      clickResult,
      immediatelyAfterClick,
      transition,
      frameShot: probeSetup.supported ? globalThis.__qaLastTransitionFrame ?? null : null
    };
  }

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector("[data-app-view]"))`));
  await evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(noticeAcceptedKey)}, "true");
    location.reload();
    return true;
  })()`);
  await waitFor("normal-motion home", () => evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "home"`));
  await waitForVisualIdle(evaluate, { description: "normal-motion home visual idle" });

  const folderExtract = await captureTransition({
    label: "folder-extract",
    click: () => clickWorkspaceEntry("单词"),
    destination: "vocab"
  });
  const pageTurn = await captureTransition({
    label: "module-page-turn",
    click: () => clickPrimaryNavigation("刷题"),
    destination: "questions"
  });
  const folderClose = await captureTransition({
    label: "folder-close",
    click: () => clickPrimaryNavigation("首页"),
    destination: "home"
  });
  const bookOpen = await captureTransition({
    label: "book-open",
    click: () => clickWorkspaceContinue(),
    destination: "reader"
  });
  const bookClose = await captureTransition({
    label: "book-close",
    click: () => clickReaderLibrary(),
    destination: "home"
  });

  const normalProbeSetup = folderExtract.probeSetup;
  const normalClick = folderExtract.clickResult;
  const normalImmediatelyAfterClick = folderExtract.immediatelyAfterClick;
  const normalTransition = folderExtract.transition;

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  const probeRegistration = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: reducedOpeningProbeSource()
  });
  await evaluate(`localStorage.removeItem(${JSON.stringify(noticeAcceptedKey)}); true`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor("reduced-motion opening completion", () => evaluate(`Boolean(globalThis.__qaReducedOpening?.complete) && document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "home"`));
  await waitForVisualIdle(evaluate, { description: "reduced-motion opening visual idle" });
  const reducedOpening = await evaluate(`(() => {
    const state = globalThis.__qaReducedOpening;
    return {
      ...state,
      durationMs: state.homeSeenAt - state.splashSeenAt,
      currentRunningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
      currentView: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null
    };
  })()`);

  const reducedProbeSetup = await installTransitionProbe("reduced-navigation");
  const reducedClick = await clickPrimaryNavigation("单词");
  const reducedImmediatelyAfterClick = await motionSnapshot();
  await waitFor("reduced navigation destination", () => evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "vocab"`));
  await waitForVisualIdle(evaluate, { description: "reduced navigation visual idle" });
  const reducedTransition = await evaluate(`(() => ({
    ...globalThis.__qaTransitionProbe,
    actualPath: globalThis.__qaTransitionProbe?.calls > 0 ? "native" : "fallback",
    destination: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
    destinationTitle: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? null,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    transitionKindAfterSettle: document.documentElement.dataset.transitionKind ?? null,
    transitionDirectionAfterSettle: document.documentElement.dataset.transitionDirection ?? null,
    transitionStyleAfterSettle: document.documentElement.dataset.transitionStyle ?? null,
    runningAnimationsAfterSettle: document.getAnimations().filter((animation) => animation.playState === "running").length,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

  const nativeTransitionVerified = (capture, expectedStyle, expectedDirection) => {
    const transition = capture.transition;
    return transition.supported
      ? transition.path === "native" &&
        transition.calls === 1 &&
        transition.updateCalls === 1 &&
        transition.kindAtCall === "navigation" &&
        transition.directionAtCall === expectedDirection &&
        transition.styleAtCall === expectedStyle &&
        transition.ready &&
        transition.finished &&
        transition.animationCountAtReady > 0 &&
        transition.maxAnimationEndMsAtReady >= 600 &&
        transition.transitionKindAfterSettle === null &&
        transition.transitionDirectionAfterSettle === null &&
        transition.transitionStyleAfterSettle === null &&
        transition.runningAnimationsAfterSettle === 0 &&
        transition.horizontalOverflow <= 1
      : transition.path === "fallback" && transition.calls === 0;
  };

  const originX = Number.parseFloat(normalTransition.originAtCall?.x ?? "");
  const folderLayerEvidence = !normalTransition.supported ||
    normalTransition.pseudoElementsAtReady.some((value) => value.includes("app-folder-tabs")) &&
    normalTransition.pseudoElementsAtReady.includes("::view-transition-old(app-module-surface)") &&
    normalTransition.pseudoElementsAtReady.includes("::view-transition-new(app-module-surface)") &&
    normalTransition.pseudoElementsAtReady.includes("::view-transition-old(app-page-heading)") &&
    normalTransition.pseudoElementsAtReady.includes("::view-transition-new(app-page-heading)") &&
    !normalTransition.pseudoElementsAtReady.some((value) => value.includes("app-folder-cover"));

  const checks = {
    normalTransitionTriggered:
      normalClick.beforeView === "home" && normalTransition.destination === "vocab" && normalTransition.destinationTitle === "单词本",
    folderExtractVerified: nativeTransitionVerified(folderExtract, "folder-extract", "forward"),
    folderExtractUsesSourceOrigin:
      !normalTransition.supported || Number.isFinite(originX) && originX > 280 && originX <= 390,
    folderLayersAnimateIndependently: folderLayerEvidence,
    modulePageTurnVerified:
      pageTurn.clickResult.beforeView === "vocab" &&
      pageTurn.transition.destination === "questions" &&
      nativeTransitionVerified(pageTurn, "page-turn", "forward"),
    folderCloseVerified:
      folderClose.clickResult.beforeView === "questions" &&
      folderClose.transition.destination === "home" &&
      nativeTransitionVerified(folderClose, "folder-close", "backward"),
    bookOpenVerified:
      bookOpen.clickResult.beforeView === "home" &&
      bookOpen.transition.destination === "reader" &&
      nativeTransitionVerified(bookOpen, "book-open", "forward"),
    bookCloseVerified:
      bookClose.clickResult.beforeView === "reader" &&
      bookClose.transition.destination === "home" &&
      nativeTransitionVerified(bookClose, "book-close", "backward"),
    normalTransitionSettled:
      normalTransition.transitionKindAfterSettle === null &&
      normalTransition.transitionDirectionAfterSettle === null &&
      normalTransition.transitionStyleAfterSettle === null &&
      normalTransition.runningAnimationsAfterSettle === 0,
    reducedOpeningFast:
      reducedOpening.reduced &&
      reducedOpening.splashSamples > 0 &&
      reducedOpening.durationMs >= 0 &&
      reducedOpening.durationMs <= 750 &&
      reducedOpening.currentView === "home",
    reducedOpeningAnimationsDisabled:
      reducedOpening.maxOpeningAnimationActiveMs <= 1 &&
      reducedOpening.maxOpeningAnimationRemainingMs <= 1 &&
      reducedOpening.currentRunningAnimations === 0,
    reducedTransitionUsesFallback:
      reducedProbeSetup.supported === normalProbeSetup.supported &&
      reducedClick.beforeView === "home" &&
      reducedTransition.actualPath === "fallback" &&
      reducedTransition.calls === 0 &&
      reducedTransition.destination === "vocab" &&
      reducedTransition.destinationTitle === "单词本" &&
      reducedTransition.transitionKindAfterSettle === null &&
      reducedTransition.transitionDirectionAfterSettle === null &&
      reducedTransition.transitionStyleAfterSettle === null,
    reducedTransitionAnimationsDisabled:
      reducedImmediatelyAfterClick.reduced &&
      reducedImmediatelyAfterClick.maxAnimationActiveMs <= 1 &&
      reducedTransition.runningAnimationsAfterSettle === 0,
    noHorizontalOverflow:
      [folderExtract, pageTurn, folderClose, bookOpen, bookClose]
        .every((capture) => capture.transition.horizontalOverflow <= 1) &&
      reducedTransition.horizontalOverflow <= 1
  };

  if (probeRegistration.identifier) {
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: probeRegistration.identifier });
  }
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  cdp.close();

  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    normal: {
      folderExtract,
      pageTurn,
      folderClose,
      bookOpen,
      bookClose
    },
    reduced: {
      opening: reducedOpening,
      probeSetup: reducedProbeSetup,
      immediatelyAfterClick: reducedImmediatelyAfterClick,
      transition: reducedTransition
    }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
