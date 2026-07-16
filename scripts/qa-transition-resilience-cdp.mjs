import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import { createUiHarness, sleep, uiSnapshotExpression } from "./ui-transition-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_RESILIENCE_SCREENSHOT_DIR ?? "qa/transition-resilience/screenshots";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture } = await createUiHarness({ endpoint, screenshotDir });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-transition-resilience=1` });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector('[data-app-view]'))`));
  const storageBackup = await evaluate(`(() => ({
    notice: localStorage.getItem(${JSON.stringify(noticeKey)}),
    preferences: localStorage.getItem(${JSON.stringify(preferencesKey)})
  }))()`);
  await evaluate(`(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
    localStorage.setItem(${JSON.stringify(noticeKey)}, 'true');
    localStorage.setItem(${JSON.stringify(preferencesKey)}, JSON.stringify({ theme: 'light', textScale: 'standard' }));
    location.reload();
    return true;
  })()`);
  await waitFor("home", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'home'`));
  await waitForVisualIdle(evaluate, { description: "home visual idle" });

  async function clickIn(selector, label) {
    return evaluate(`(() => {
      const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
      const root = document.querySelector(${JSON.stringify(selector)});
      const buttons = [...(root?.matches('button') ? [root] : []), ...Array.from(root?.querySelectorAll('button') ?? [])];
      const button = buttons.find((item) => normalize(item.textContent).startsWith(${JSON.stringify(label)}) ||
        normalize(item.getAttribute('aria-label')).startsWith(${JSON.stringify(label)}));
      button?.click();
      return Boolean(button);
    })()`);
  }

  const firstClick = await clickIn('nav[aria-label="主导航"]', "单词");
  await sleep(32);
  const interruptClick = await clickIn('nav[aria-label="主导航"]', "刷题");
  await waitFor("interrupted destination", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'questions'`));
  await waitFor("interrupted transition settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  await waitForVisualIdle(evaluate, { description: "interrupted transition visual idle" });
  const interrupted = await evaluate(uiSnapshotExpression());
  const interruptedShot = await capture("01-interrupted-navigation-settled");

  await clickIn('nav[aria-label="主导航"]', "首页");
  await waitFor("home restored", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'home' && !document.documentElement.dataset.transitionKind`));
  const openBook = await clickIn(".workspaceContinue", "继续阅读") || await clickIn(".workspaceContinue", "开始阅读");
  await waitFor("reader ready", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'reader' && !document.documentElement.dataset.transitionKind`));
  const languageBefore = await evaluate(`document.querySelector('[aria-label="切换阅读语言"]')?.textContent?.trim() ?? null`);
  await evaluate(`(() => {
    globalThis.__qaViewTransitionCalls = 0;
    globalThis.__qaOriginalStartViewTransition = document.startViewTransition;
    if (document.startViewTransition) {
      document.startViewTransition = (...args) => {
        globalThis.__qaViewTransitionCalls += 1;
        return globalThis.__qaOriginalStartViewTransition.apply(document, args);
      };
    }
    document.querySelector('[aria-label="切换阅读语言"]')?.click();
    return true;
  })()`);
  await waitFor("language fade active", () => evaluate(`document.documentElement.dataset.transitionKind === 'language'`));
  await waitFor("language surface opacity changed", () => evaluate(`(() => {
    const surface = document.querySelector('.readerPanel');
    return Boolean(surface && Number.parseFloat(getComputedStyle(surface).opacity) < 0.99);
  })()`));
  const languageActive = await evaluate(uiSnapshotExpression());
  await waitFor("language changed", () => evaluate(`document.querySelector('[aria-label="切换阅读语言"]')?.textContent?.trim() !== ${JSON.stringify(languageBefore)}`));
  await waitFor("language fade settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  const languageSettled = await evaluate(`(() => {
    const snapshot = ${uiSnapshotExpression()};
    const viewTransitionCalls = globalThis.__qaViewTransitionCalls ?? -1;
    if (globalThis.__qaOriginalStartViewTransition) document.startViewTransition = globalThis.__qaOriginalStartViewTransition;
    delete globalThis.__qaOriginalStartViewTransition;
    delete globalThis.__qaViewTransitionCalls;
    return { ...snapshot, viewTransitionCalls };
  })()`);
  const languageShot = await capture("02-language-fade-settled");

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await clickIn('[aria-label="返回书库"]', "书库");
  await waitFor("reduced home", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'home'`));
  const reducedStartedAt = Date.now();
  const reducedClick = await clickIn('nav[aria-label="主导航"]', "单词");
  await waitFor("reduced destination", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'vocab' && !document.documentElement.dataset.transitionKind`));
  const reduced = await evaluate(`(() => ({
    snapshot: ${uiSnapshotExpression()},
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
  }))()`);
  reduced.elapsedMs = Date.now() - reducedStartedAt;
  const reducedShot = await capture("03-reduced-motion-settled");

  const checks = {
    interruptionLeavesOneStablePage:
      firstClick && interruptClick && interrupted.view === "questions" && interrupted.transitionKind === null &&
      interrupted.shellCount === 1 && interrupted.shellOpacity === 1 && interrupted.shellTransform === "none",
    noLegacyStageSurvives:
      interrupted.cinematicStageCount === 0 && interrupted.canvasCount === 0 &&
      languageActive.cinematicStageCount === 0 && languageSettled.cinematicStageCount === 0,
    languageUsesNativeTextSafeFade:
      openBook && languageActive.shellCount === 1 && languageActive.shellTransform === "none" &&
      languageActive.readerPanelOpacity < 1 && languageActive.textScaleViolations === 0 &&
      languageSettled.readerPanelOpacity === 1 && languageSettled.viewTransitionCalls === 0 &&
      languageSettled.shellOpacity === 1 && languageSettled.shellTransform === "none",
    reducedMotionIsImmediate:
      reducedClick && reduced.reduced && reduced.snapshot.view === "vocab" &&
      reduced.snapshot.transitionKind === null && reduced.runningAnimations === 0 && reduced.elapsedMs < 500,
    noHorizontalOverflow:
      interrupted.horizontalOverflow <= 1 && languageSettled.horizontalOverflow <= 1 && reduced.snapshot.horizontalOverflow <= 1
  };

  await evaluate(`(() => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore(${JSON.stringify(noticeKey)}, ${JSON.stringify(storageBackup.notice)});
    restore(${JSON.stringify(preferencesKey)}, ${JSON.stringify(storageBackup.preferences)});
    return true;
  })()`);
  cdp.close();

  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    interrupted,
    languageActive,
    languageSettled,
    reduced,
    screenshots: { interruptedShot, languageShot, reducedShot }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
