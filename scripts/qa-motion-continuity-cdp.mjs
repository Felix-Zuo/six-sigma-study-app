import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import {
  analyzePng,
  createCinematicHarness,
  sleep,
  stageSnapshotExpression
} from "./cinematic-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/motion-continuity/screenshots";
const captureCanvasOnly = process.env.QA_CINEMATIC_CAPTURE_CANVAS === "1";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture, saveDataUrl } = await createCinematicHarness({ endpoint, appUrl, screenshotDir });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-scrolled-book=1` });
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
  await evaluate(`globalThis.__qaCinematicDurationScale = 2.5; true`);

  const source = await evaluate(`(() => {
    const card = document.querySelector('.studyBookCard');
    const button = card?.querySelector('.primaryAction');
    card?.scrollIntoView({ block: 'center', behavior: 'instant' });
    const cardRect = card?.getBoundingClientRect();
    const titleRect = card?.querySelector('h2')?.getBoundingClientRect();
    return {
      found: Boolean(card && button),
      scrollY,
      card: cardRect ? { top: cardRect.top, bottom: cardRect.bottom, left: cardRect.left, right: cardRect.right, width: cardRect.width, height: cardRect.height } : null,
      title: titleRect ? { width: titleRect.width, height: titleRect.height } : null
    };
  })()`);
  await sleep(100);
  const beforeShot = await capture("01-scrolled-book-card");
  if (captureCanvasOnly) {
    await evaluate(`(() => {
      const recorder = { departure: null, arrival: null, stopped: false };
      globalThis.__qaMotionContinuityRecorder = recorder;
      const snapshot = () => ({
        ...(${stageSnapshotExpression()}),
        scrollY,
        title: document.querySelector('.topBar h1')?.textContent?.trim() ?? null,
        transitionSource: document.documentElement.dataset.transitionSource ?? null
      });
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
        if (!recorder.departure && phase === 'depart' && progress >= 0.24) {
          recorder.departure = { snapshot: snapshot(), dataUrl: captureFrame() };
        }
        if (!recorder.arrival && phase === 'arrive' && progress >= 0.16) {
          recorder.arrival = { snapshot: snapshot(), dataUrl: captureFrame() };
        }
      };
      return true;
    })()`);
  }
  const clicked = await evaluate(`(() => {
    const button = document.querySelector('.studyBookCard .primaryAction');
    button?.click();
    return Boolean(button);
  })()`);

  let departure;
  let departureShot;
  let arrival;
  let arrivalShot;
  if (captureCanvasOnly) {
    await waitFor("recorded book transition frames", () => evaluate(`Boolean(
      globalThis.__qaMotionContinuityRecorder?.departure?.dataUrl &&
      globalThis.__qaMotionContinuityRecorder?.arrival?.dataUrl
    )`), 30000);
    const recorded = await evaluate(`(() => {
      const recorder = globalThis.__qaMotionContinuityRecorder;
      if (recorder) recorder.stopped = true;
      delete globalThis.__qaObserveCinematicFrame;
      return recorder ? { departure: recorder.departure, arrival: recorder.arrival } : null;
    })()`);
    departure = recorded.departure.snapshot;
    arrival = recorded.arrival.snapshot;
    departureShot = saveDataUrl("02-book-departure", recorded.departure.dataUrl);
    arrivalShot = saveDataUrl("03-book-arrival", recorded.arrival.dataUrl);
  } else {
    await waitFor("book departure geometry", () => evaluate(`(() => {
      const stage = document.querySelector('[data-cinematic-stage]');
      return stage?.dataset.phase === 'depart' && Number(stage.dataset.progress) >= 0.24;
    })()`));
    departure = await evaluate(stageSnapshotExpression());
    departureShot = await capture("02-book-departure");

    await waitFor("reader prepared", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'reader'`));
    await waitFor("book arrival geometry", () => evaluate(`(() => {
      const stage = document.querySelector('[data-cinematic-stage]');
      return stage?.dataset.phase === 'arrive' && Number(stage.dataset.progress) >= 0.16;
    })()`));
    arrival = await evaluate(`(() => ({
      ...(${stageSnapshotExpression()}),
      scrollY,
      title: document.querySelector('.topBar h1')?.textContent?.trim() ?? null,
      transitionSource: document.documentElement.dataset.transitionSource ?? null
    }))()`);
    arrivalShot = await capture("03-book-arrival");
  }
  const arrivalPixels = analyzePng(arrivalShot);

  await waitFor("book transition settled", () => evaluate(`!document.documentElement.dataset.cinematicActive`));
  await waitForVisualIdle(evaluate, { description: "reader visual idle" });
  const settled = await evaluate(`(() => {
    const heading = document.querySelector('.topBar h1');
    const rect = heading?.getBoundingClientRect();
    return {
      view: document.querySelector('[data-app-view]')?.getAttribute('data-app-view') ?? null,
      scrollY,
      title: heading?.textContent?.trim() ?? null,
      headingRect: rect ? { width: rect.width, height: rect.height, top: rect.top, left: rect.left } : null,
      active: document.documentElement.dataset.cinematicActive ?? null,
      transitionStyle: document.documentElement.dataset.transitionStyle ?? null,
      transitionSource: document.documentElement.dataset.transitionSource ?? null,
      stageHidden: document.querySelector('[data-cinematic-stage]')?.hidden ?? true,
      shellTransform: getComputedStyle(document.querySelector('.appShell')).transform,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`);
  const afterShot = await capture("04-reader-settled");

  const checks = {
    scrolledSourceVisible:
      source.found && source.scrollY > 300 && source.card?.top >= -1 && source.card?.bottom <= 845,
    clickAccepted: clicked,
    geometryOnlyBookStage:
      departure.style === "book-open" && departure.contentMode === "geometry-only" && departure.stageText === "" &&
      departure.canvasCount === 1 && departure.canvasWidth > 0 && departure.canvasHeight > 0,
    sourceAndDestinationMutuallyExclusive:
      departure.view === "home" && arrival.view === "reader" && departure.shellCount === 1 && arrival.shellCount === 1,
    liveTextNeverScaled:
      departure.shellTransform === "none" && arrival.shellTransform === "none" && settled.shellTransform === "none",
    readerPreparedBehindStage:
      arrival.title && arrival.transitionSource === "book-card" && arrival.shellOpacity === 0,
    arrivalCanvasVisible:
      arrivalPixels.blackRatio < 0.02 && arrivalPixels.luminanceMean > 24 &&
      arrivalPixels.luminanceStdDev > 2 && arrivalPixels.quantizedColorBins >= 6,
    headingGeometryStable:
      !arrival.headingRect || !settled.headingRect ||
      Math.abs(arrival.headingRect.width - settled.headingRect.width) <= 0.5 &&
      Math.abs(arrival.headingRect.height - settled.headingRect.height) <= 0.5,
    readerSettled:
      settled.view === "reader" && settled.title === arrival.title && Math.abs(settled.scrollY - arrival.scrollY) <= 2 &&
      settled.active === null && settled.transitionStyle === null && settled.transitionSource === null &&
      settled.stageHidden && settled.runningAnimations === 0,
    noHorizontalOverflow: settled.overflow <= 1
  };

  await evaluate(`(() => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore(${JSON.stringify(noticeKey)}, ${JSON.stringify(storageBackup.notice)});
    restore(${JSON.stringify(preferencesKey)}, ${JSON.stringify(storageBackup.preferences)});
    delete globalThis.__qaCinematicDurationScale;
    delete globalThis.__qaMotionContinuityRecorder;
    delete globalThis.__qaObserveCinematicFrame;
    return true;
  })()`);
  cdp.close();

  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    source,
    departure,
    arrival,
    arrivalPixels,
    settled,
    screenshots: { beforeShot, departureShot, arrivalShot, afterShot }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
