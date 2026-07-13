import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import {
  analyzePng,
  createCinematicHarness,
  sleep,
  stageSnapshotExpression
} from "./cinematic-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/cinematic-resilience/screenshots";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture } = await createCinematicHarness({
    endpoint,
    appUrl,
    screenshotDir
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-cinematic-resilience=1` });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector('[data-app-view]'))`));
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
  await evaluate(`globalThis.__qaCinematicDurationScale = 4; true`);

  async function click(selector, label) {
    return evaluate(`(() => {
      const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
      const root = document.querySelector(${JSON.stringify(selector)});
      const controls = [...(root?.matches('button') ? [root] : []), ...Array.from(root?.querySelectorAll('button') ?? [])];
      const control = controls.find((button) => {
        const text = normalize(button.textContent);
        const aria = normalize(button.getAttribute('aria-label'));
        return text === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(label)}) ||
          aria === ${JSON.stringify(label)} || aria.startsWith(${JSON.stringify(`${label}，`)});
      });
      control?.click();
      return Boolean(control);
    })()`);
  }

  async function waitForSettled(view, description) {
    await waitFor(description, () => evaluate(`
      document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === ${JSON.stringify(view)} &&
      !document.documentElement.dataset.cinematicActive && !document.documentElement.dataset.transitionKind
    `));
    await waitForVisualIdle(evaluate, { description });
  }

  const firstClick = await click('nav[aria-label="主导航"]', "单词");
  await waitFor("first departure", () => evaluate(`Number(document.querySelector('[data-cinematic-stage]')?.dataset.progress ?? 0) >= 0.12`));
  const interruptClick = await click('nav[aria-label="主导航"]', "刷题");
  await waitForSettled("questions", "interrupted navigation settled");
  const interrupted = await evaluate(stageSnapshotExpression());
  const interruptedShot = await capture("01-interrupted-navigation-settled");
  const interruptedPixels = analyzePng(interruptedShot);

  await click('nav[aria-label="主导航"]', "首页");
  await waitForSettled("home", "home before language test");
  const openBook = await click(".workspaceContinue", "继续阅读");
  await waitForSettled("reader", "reader before language test");
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
  await sleep(72);
  const languageMidpoint = await evaluate(stageSnapshotExpression());
  await waitFor("language changed", () => evaluate(`document.querySelector('[aria-label="切换阅读语言"]')?.textContent?.trim() !== ${JSON.stringify(languageBefore)}`));
  await waitFor("language fade settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  const languageSettled = await evaluate(`(() => {
    const snapshot = ${stageSnapshotExpression()};
    const calls = globalThis.__qaViewTransitionCalls ?? -1;
    if (globalThis.__qaOriginalStartViewTransition) {
      document.startViewTransition = globalThis.__qaOriginalStartViewTransition;
    }
    delete globalThis.__qaOriginalStartViewTransition;
    delete globalThis.__qaViewTransitionCalls;
    return { ...snapshot, viewTransitionCalls: calls };
  })()`);
  const languageShot = await capture("02-language-native-fade-settled");

  await click('[aria-label="返回书库"]', "返回书库");
  await waitForSettled("home", "home before context-loss test");
  await evaluate(`globalThis.__qaCinematicDurationScale = 4; true`);
  const contextClick = await click('nav[aria-label="主导航"]', "单词");
  await waitFor("context-loss departure", () => evaluate(`Number(document.querySelector('[data-cinematic-stage]')?.dataset.progress ?? 0) >= 0.12`));
  const contextLoss = await evaluate(`(() => {
    const canvas = document.querySelector('[data-cinematic-canvas]');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return { supported: Boolean(extension), stageCount: document.querySelectorAll('[data-cinematic-stage]').length };
  })()`);
  await waitForSettled("vocab", "context-loss fallback settled");
  const contextFallback = await evaluate(stageSnapshotExpression());
  const contextShot = await capture("03-context-loss-fallback-settled");
  const contextPixels = analyzePng(contextShot);

  await click('nav[aria-label="主导航"]', "首页");
  await waitForSettled("home", "rebuilt stage navigation settled");
  const rebuilt = await evaluate(stageSnapshotExpression());
  const rebuiltShot = await capture("04-context-rebuilt-settled");
  const rebuiltPixels = analyzePng(rebuiltShot);

  const checks = {
    interruptedOwnerSafe:
      firstClick && interruptClick && interrupted.view === "questions" && interrupted.active === null &&
      interrupted.stageCount === 1 && interrupted.stageHidden && interrupted.shellCount === 1 &&
      interrupted.shellTransform === "none" && interrupted.textScaleViolations === 0 && interruptedPixels.blackRatio < 0.02,
    languageUsesNativeFade:
      openBook && languageMidpoint.active === null && languageMidpoint.shellTransform === "none" &&
      languageMidpoint.textScaleViolations === 0 && languageSettled.viewTransitionCalls === 0 &&
      languageSettled.shellCount === 1 && languageSettled.textScaleViolations === 0,
    contextLossFallsBack:
      contextClick && contextLoss.supported && contextLoss.stageCount === 1 && contextFallback.view === "vocab" &&
      contextFallback.active === null && contextFallback.stageHidden && contextFallback.shellOpacity === 1 &&
      contextPixels.blackRatio < 0.02,
    contextRebuildsSingleStage:
      rebuilt.view === "home" && rebuilt.stageCount === 1 && rebuilt.stageHidden && rebuilt.active === null &&
      rebuilt.textScaleViolations === 0 && rebuiltPixels.blackRatio < 0.02
  };

  await evaluate(`delete globalThis.__qaCinematicDurationScale; true`);
  cdp.close();
  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    interrupted,
    languageMidpoint,
    languageSettled,
    contextLoss,
    contextFallback,
    rebuilt,
    screenshots: { interruptedShot, languageShot, contextShot, rebuiltShot }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
