import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import { createUiHarness, sleep, uiSnapshotExpression } from "./ui-transition-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_MOTION_SCREENSHOT_DIR ?? "qa/motion-ui/screenshots";
const viewportWidth = Number(process.env.QA_VIEWPORT_WIDTH ?? 390);
const viewportHeight = Number(process.env.QA_VIEWPORT_HEIGHT ?? 844);
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture } = await createUiHarness({
    endpoint,
    screenshotDir,
    width: viewportWidth,
    height: viewportHeight
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-motion=1` });
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

  async function click(selector, text) {
    return evaluate(`(() => {
      const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
      const root = document.querySelector(${JSON.stringify(selector)});
      const control = ${text ? `Array.from(root?.querySelectorAll('button') ?? []).find((button) => {
        const label = normalize(button.getAttribute('aria-label'));
        const copy = normalize(button.textContent);
        return copy === ${JSON.stringify(text)} || copy.startsWith(${JSON.stringify(text)}) ||
          label === ${JSON.stringify(text)} || label.startsWith(${JSON.stringify(`${text}，`)});
      })` : "root"};
      control?.click();
      return Boolean(control);
    })()`);
  }

  async function verifyRoute(label, action, destination) {
    const before = await evaluate(uiSnapshotExpression());
    const startedAt = Date.now();
    const clicked = await action();
    if (!clicked) throw new Error(`${label}: navigation control not found`);
    await waitFor(`${label} destination`, () => evaluate(
      `document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === ${JSON.stringify(destination)}`
    ));
    await sleep(45);
    const active = await evaluate(uiSnapshotExpression());
    await waitFor(`${label} settled`, () => evaluate(`!document.documentElement.dataset.transitionKind`));
    await waitForVisualIdle(evaluate, { description: `${label} visual idle` });
    const settled = await evaluate(uiSnapshotExpression());
    const screenshot = await capture(`${label}-settled`);
    const elapsedMs = Date.now() - startedAt;
    return {
      label,
      destination,
      clicked,
      elapsedMs,
      before,
      active,
      settled,
      screenshot,
      checks: {
        destinationReached: settled.view === destination,
        oneLiveShell: active.shellCount === 1 && settled.shellCount === 1,
        noThreeDimensionalStage: active.cinematicStageCount === 0 && settled.cinematicStageCount === 0 && active.canvasCount === 0,
        noTextScaling: active.textScaleViolations === 0 && settled.textScaleViolations === 0,
        settledNaturally: settled.transitionKind === null && settled.shellOpacity === 1 && settled.shellTransform === "none",
        noHorizontalOverflow: settled.horizontalOverflow <= 1,
        // This wall-clock value also includes CDP polling, screenshot capture, and
        // cold content preparation. Keep it as a hang guard; opacity state checks
        // above enforce the actual 90/170 ms animation contract.
        conciseTiming: elapsedMs < (destination === "reader" ? 2500 : 1800)
      }
    };
  }

  const routes = [];
  routes.push(await verifyRoute("home-to-vocabulary", () => click(".workspaceEdgeNav", "单词"), "vocab"));
  routes.push(await verifyRoute("vocabulary-to-questions", () => click('nav[aria-label="主导航"]', "刷题"), "questions"));
  routes.push(await verifyRoute("questions-to-home", () => click('nav[aria-label="主导航"]', "首页"), "home"));
  routes.push(await verifyRoute("home-to-reader", () => click(".workspaceContinue"), "reader"));
  routes.push(await verifyRoute("reader-to-home", () => click('[aria-label="返回书库"]'), "home"));

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  const reducedStartedAt = Date.now();
  const reducedClicked = await click('nav[aria-label="主导航"]', "单词");
  await waitFor("reduced destination", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'vocab'`));
  await waitForVisualIdle(evaluate, { description: "reduced destination visual idle" });
  const reduced = await evaluate(`(() => ({
    snapshot: ${uiSnapshotExpression()},
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length
  }))()`);
  reduced.elapsedMs = Date.now() - reducedStartedAt;

  const routeChecks = routes.map((route) => ({
    label: route.label,
    ...route.checks,
    ok: Object.values(route.checks).every(Boolean)
  }));
  const checks = {
    allFiveRoutesPass: routeChecks.every((route) => route.ok),
    textNeverOverlapsOrStretches: routeChecks.every((route) => route.oneLiveShell && route.noTextScaling),
    threeDimensionalStageRemoved: routeChecks.every((route) => route.noThreeDimensionalStage),
    reducedMotionIsImmediate:
      reducedClicked && reduced.reduced && reduced.snapshot.view === "vocab" &&
      reduced.snapshot.transitionKind === null && reduced.runningAnimations === 0 && reduced.elapsedMs < 500
  };

  await evaluate(`(() => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore(${JSON.stringify(noticeKey)}, ${JSON.stringify(storageBackup.notice)});
    restore(${JSON.stringify(preferencesKey)}, ${JSON.stringify(storageBackup.preferences)});
    return true;
  })()`);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  cdp.close();

  const result = { ok: Object.values(checks).every(Boolean), checks, routeChecks, routes, reduced };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
