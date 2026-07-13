import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import {
  analyzePng,
  createCinematicHarness,
  sleep,
  stageSnapshotExpression
} from "./cinematic-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_MOTION_SCREENSHOT_DIR ?? "qa/motion-ui/screenshots";
const viewportWidth = Number(process.env.QA_VIEWPORT_WIDTH ?? 390);
const viewportHeight = Number(process.env.QA_VIEWPORT_HEIGHT ?? 844);
const durationScale = Math.max(0.5, Math.min(4, Number(process.env.QA_CINEMATIC_DURATION_SCALE ?? 2.5)));
const captureCanvasOnly = process.env.QA_CINEMATIC_CAPTURE_CANVAS === "1";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture, captureCinematicCanvas, saveDataUrl } = await createCinematicHarness({
    endpoint,
    appUrl,
    screenshotDir,
    width: viewportWidth,
    height: viewportHeight
  });
  const captureMotionFrame = captureCanvasOnly ? captureCinematicCanvas : capture;
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-cinematic=1` });
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
  await sleep(240);
  await evaluate(`globalThis.__qaCinematicDurationScale = ${durationScale}; true`);

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
      const beforeView = document.querySelector('[data-app-view]')?.getAttribute('data-app-view') ?? null;
      control?.click();
      return { clicked: Boolean(control), beforeView };
    })()`);
  }

  async function captureTransition({ label, action, destination, expectedStyle }) {
    const departureThreshold = expectedStyle === "page-turn" ? 0.46 : 0.24;
    const arrivalThreshold = expectedStyle === "page-turn" ? 0.52 : 0.16;
    if (captureCanvasOnly) {
      await evaluate(`(() => {
        const recorder = { departure: null, arrival: null, stopped: false };
        globalThis.__qaCinematicRecorder = recorder;
        const snapshot = () => ${stageSnapshotExpression()};
        const captureFrame = () => {
          try {
            return globalThis.__qaCaptureCinematicFrame?.() ??
              document.querySelector('[data-cinematic-canvas]')?.toDataURL('image/png') ?? null;
          } catch {
            return null;
          }
        };
        globalThis.__qaObserveCinematicFrame = (phase, progress) => {
          if (recorder.stopped) return;
          if (!recorder.departure && phase === 'depart' && progress >= ${departureThreshold}) {
            recorder.departure = { snapshot: snapshot(), dataUrl: captureFrame() };
          }
          if (!recorder.arrival && phase === 'arrive' && progress >= ${arrivalThreshold}) {
            recorder.arrival = { snapshot: snapshot(), dataUrl: captureFrame() };
          }
        };
        return true;
      })()`);
    }
    const clickResult = await action();
    if (!clickResult.clicked) throw new Error(`${label}: navigation control not found`);
    let departure;
    let departureShot;
    let arrival;
    let arrivalShot;
    if (captureCanvasOnly) {
      await waitFor(`${label} recorded frames`, () => evaluate(`Boolean(
        globalThis.__qaCinematicRecorder?.departure?.dataUrl &&
        globalThis.__qaCinematicRecorder?.arrival?.dataUrl
      )`), 30000);
      const recorded = await evaluate(`(() => {
        const recorder = globalThis.__qaCinematicRecorder;
        if (recorder) recorder.stopped = true;
        delete globalThis.__qaObserveCinematicFrame;
        return recorder ? { departure: recorder.departure, arrival: recorder.arrival } : null;
      })()`);
      departure = recorded.departure.snapshot;
      arrival = recorded.arrival.snapshot;
      departureShot = saveDataUrl(`${label}-departure`, recorded.departure.dataUrl);
      arrivalShot = saveDataUrl(`${label}-arrival`, recorded.arrival.dataUrl);
    } else {
      await waitFor(`${label} departure`, () => evaluate(`(() => {
        const stage = document.querySelector('[data-cinematic-stage]');
        return stage?.dataset.phase === 'depart' && Number(stage.dataset.progress) >= ${departureThreshold};
      })()`));
      departure = await evaluate(stageSnapshotExpression());
      departureShot = await captureMotionFrame(`${label}-departure`);

      await waitFor(`${label} destination`, () => evaluate(
        `document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === ${JSON.stringify(destination)}`
      ));
      await waitFor(`${label} arrival geometry`, () => evaluate(`(() => {
        const stage = document.querySelector('[data-cinematic-stage]');
        return stage?.dataset.phase === 'arrive' && Number(stage.dataset.progress) >= ${arrivalThreshold};
      })()`));
      arrival = await evaluate(stageSnapshotExpression());
      arrivalShot = await captureMotionFrame(`${label}-arrival`);
    }
    const departurePixels = analyzePng(departureShot);
    const arrivalPixels = analyzePng(arrivalShot);

    await waitFor(`${label} settled`, () => evaluate(`!document.documentElement.dataset.cinematicActive`));
    await waitForVisualIdle(evaluate, { description: `${label} settled visual idle` });
    const settled = await evaluate(stageSnapshotExpression());
    const settledShot = await capture(`${label}-settled`);
    const settledPixels = analyzePng(settledShot);
    const headingStable = !arrival.headingRect || !settled.headingRect ||
      Math.abs(arrival.headingRect.width - settled.headingRect.width) <= 0.5 &&
      Math.abs(arrival.headingRect.height - settled.headingRect.height) <= 0.5;

    return {
      label,
      expectedStyle,
      destination,
      clickResult,
      departure,
      departurePixels,
      arrival,
      settled,
      settledPixels,
      arrivalPixels,
      headingStable,
      screenshots: { departureShot, arrivalShot, settledShot }
    };
  }

  const routes = [];
  routes.push(await captureTransition({
    label: "folder-extract",
    action: () => click(".workspaceEdgeNav", "单词"),
    destination: "vocab",
    expectedStyle: "folder-extract"
  }));
  routes.push(await captureTransition({
    label: "module-page-turn",
    action: () => click('nav[aria-label="主导航"]', "刷题"),
    destination: "questions",
    expectedStyle: "page-turn"
  }));
  routes.push(await captureTransition({
    label: "folder-close",
    action: () => click('nav[aria-label="主导航"]', "首页"),
    destination: "home",
    expectedStyle: "folder-close"
  }));
  routes.push(await captureTransition({
    label: "book-open",
    action: () => click(".workspaceContinue"),
    destination: "reader",
    expectedStyle: "book-open"
  }));
  routes.push(await captureTransition({
    label: "book-close",
    action: () => click('[aria-label="返回书库"]'),
    destination: "home",
    expectedStyle: "book-close"
  }));

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await evaluate(`globalThis.__qaCinematicDurationScale = 1; true`);
  const reducedClick = await click('nav[aria-label="主导航"]', "单词");
  await waitFor("reduced destination", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'vocab'`));
  await waitForVisualIdle(evaluate, { description: "reduced destination visual idle" });
  const reduced = await evaluate(`(() => ({
    destination: document.querySelector('[data-app-view]')?.getAttribute('data-app-view') ?? null,
    active: document.documentElement.dataset.cinematicActive ?? null,
    stageHidden: document.querySelector('[data-cinematic-stage]')?.hidden ?? true,
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }))()`);

  const routeChecks = routes.map((route) => ({
    label: route.label,
    sourceAccepted: route.clickResult.clicked,
    destinationPrepared: route.arrival.view === route.destination,
    correctGeometry: route.departure.style === route.expectedStyle && route.arrival.style === route.expectedStyle,
    geometryOnlyStage:
      route.departure.contentMode === "geometry-only" &&
      route.departure.stageText === "" && route.arrival.stageText === "" &&
      route.departure.stageCount === 1 && route.arrival.stageCount === 1 && route.settled.stageCount === 1 &&
      route.departure.canvasCount === 1 && route.departure.canvasWidth > 0 && route.departure.canvasHeight > 0,
    singleLivePage: route.departure.shellCount === 1 && route.arrival.shellCount === 1 && route.settled.shellCount === 1,
    liveTextNeverScaled:
      route.departure.shellTransform === "none" && route.arrival.shellTransform === "none" && route.settled.shellTransform === "none" &&
      route.departure.textScaleViolations === 0 && route.arrival.textScaleViolations === 0 && route.settled.textScaleViolations === 0,
    headingGeometryStable: route.headingStable,
    canvasFrameVisible:
      route.departurePixels.blackRatio < 0.02 && route.arrivalPixels.blackRatio < 0.02 &&
      route.departurePixels.luminanceMean > 24 &&
      route.arrivalPixels.luminanceMean > 24 &&
      route.departurePixels.quantizedColorBins >= 6 &&
      route.arrivalPixels.luminanceStdDev > 2 &&
      route.arrivalPixels.quantizedColorBins >= 6,
    settledClean:
      route.settled.view === route.destination && route.settled.active === null && route.settled.stageHidden &&
      route.settled.horizontalOverflow <= 1 && route.settledPixels.blackRatio < 0.02 && route.settledPixels.luminanceMean > 24
  }));

  const checks = {
    allFiveRoutesPass: routeChecks.every((route) => Object.entries(route).every(([key, value]) => key === "label" || value)),
    noTextOverlapOrStretch: routeChecks.every((route) => route.geometryOnlyStage && route.singleLivePage && route.liveTextNeverScaled && route.headingGeometryStable),
    canvasPixelFramesValid: routeChecks.every((route) => route.canvasFrameVisible),
    reducedMotionUsesDirectPath:
      reducedClick.clicked && reduced.reduced && reduced.destination === "vocab" && reduced.active === null &&
      reduced.stageHidden && reduced.runningAnimations === 0 && reduced.overflow <= 1
  };

  await evaluate(`(() => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore(${JSON.stringify(noticeKey)}, ${JSON.stringify(storageBackup.notice)});
    restore(${JSON.stringify(preferencesKey)}, ${JSON.stringify(storageBackup.preferences)});
    delete globalThis.__qaCinematicDurationScale;
    delete globalThis.__qaCinematicRecorder;
    delete globalThis.__qaObserveCinematicFrame;
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
