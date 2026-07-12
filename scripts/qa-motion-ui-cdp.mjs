import { waitForVisualIdle } from "./cdp-visual-idle.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
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

  async function installTransitionProbe(label) {
    return evaluate(`(() => {
      const nativeStart = typeof document.startViewTransition === "function"
        ? document.startViewTransition.bind(document)
        : null;
      const state = {
        label: ${JSON.stringify(label)},
        supported: Boolean(nativeStart),
        path: nativeStart ? "pending" : "fallback",
        calls: 0,
        updateCalls: 0,
        kindAtCall: null,
        directionAtCall: null,
        ready: false,
        finished: false,
        animationCountAtReady: 0,
        runningAnimationsAtReady: 0,
        maxAnimationEndMsAtReady: 0,
        error: null
      };
      globalThis.__qaTransitionProbe = state;
      if (nativeStart) {
        document.startViewTransition = (update) => {
          state.calls += 1;
          state.path = "native";
          state.kindAtCall = document.documentElement.dataset.transitionKind ?? null;
          state.directionAtCall = document.documentElement.dataset.transitionDirection ?? null;
          const transition = nativeStart(() => {
            state.updateCalls += 1;
            return update();
          });
          transition.ready.then(() => {
            const animations = document.getAnimations();
            state.ready = true;
            state.animationCountAtReady = animations.length;
            state.runningAnimationsAtReady = animations.filter((animation) => animation.playState === "running").length;
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
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    })()`);
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

  const normalProbeSetup = await installTransitionProbe("normal-navigation");
  const normalClick = await clickPrimaryNavigation("单词");
  const normalImmediatelyAfterClick = await motionSnapshot();
  await waitFor("normal navigation destination", () => evaluate(`document.querySelector("[data-app-view]")?.getAttribute("data-app-view") === "vocab"`));
  if (normalProbeSetup.supported) {
    await waitFor("native view transition completion", () => evaluate(`globalThis.__qaTransitionProbe?.finished === true`));
  }
  await waitForVisualIdle(evaluate, { description: "normal navigation visual idle" });
  const normalTransition = await evaluate(`(() => ({
    ...globalThis.__qaTransitionProbe,
    destination: document.querySelector("[data-app-view]")?.getAttribute("data-app-view") ?? null,
    destinationTitle: document.querySelector(".appPageHeader h1")?.textContent?.trim() ?? null,
    transitionKindAfterSettle: document.documentElement.dataset.transitionKind ?? null,
    transitionDirectionAfterSettle: document.documentElement.dataset.transitionDirection ?? null,
    runningAnimationsAfterSettle: document.getAnimations().filter((animation) => animation.playState === "running").length,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

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
    runningAnimationsAfterSettle: document.getAnimations().filter((animation) => animation.playState === "running").length,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

  const normalPathVerified = normalTransition.supported
    ? normalTransition.path === "native" &&
      normalTransition.calls === 1 &&
      normalTransition.updateCalls === 1 &&
      normalTransition.kindAtCall === "navigation" &&
      normalTransition.directionAtCall === "forward" &&
      normalTransition.ready &&
      normalTransition.finished &&
      normalTransition.animationCountAtReady > 0 &&
      normalTransition.maxAnimationEndMsAtReady >= 100
    : normalTransition.path === "fallback" && normalTransition.calls === 0;

  const checks = {
    normalTransitionTriggered:
      normalClick.beforeView === "home" && normalTransition.destination === "vocab" && normalTransition.destinationTitle === "单词本",
    normalTransitionPathVerified: normalPathVerified,
    normalTransitionSettled:
      normalTransition.transitionKindAfterSettle === null &&
      normalTransition.transitionDirectionAfterSettle === null &&
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
      reducedTransition.transitionDirectionAfterSettle === null,
    reducedTransitionAnimationsDisabled:
      reducedImmediatelyAfterClick.reduced &&
      reducedImmediatelyAfterClick.maxAnimationActiveMs <= 1 &&
      reducedTransition.runningAnimationsAfterSettle === 0,
    noHorizontalOverflow:
      normalTransition.horizontalOverflow <= 1 && reducedTransition.horizontalOverflow <= 1
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
      probeSetup: normalProbeSetup,
      immediatelyAfterClick: normalImmediatelyAfterClick,
      transition: normalTransition
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
