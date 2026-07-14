import { waitForVisualIdle } from "./cdp-visual-idle.mjs";
import { createUiHarness, sleep, uiSnapshotExpression } from "./ui-transition-qa-helpers.mjs";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";
const screenshotDir = process.env.QA_CONTINUITY_SCREENSHOT_DIR ?? "qa/motion-continuity/screenshots";
const noticeKey = "six-sigma-study:notice-accepted:v1";
const preferencesKey = "six-sigma-study:reader-preferences:v1";

async function main() {
  const { cdp, evaluate, waitFor, capture } = await createUiHarness({ endpoint, screenshotDir });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await cdp.send("Page.navigate", { url: `${appUrl}?qa-motion-continuity=1` });
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

  const source = await evaluate(`(() => {
    const card = document.querySelector('.studyBookCard');
    card?.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = card?.getBoundingClientRect();
    return {
      found: Boolean(card),
      scrollY,
      rect: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null
    };
  })()`);
  const beforeShot = await capture("01-home-scrolled-source");
  const clicked = await evaluate(`(() => {
    const button = document.querySelector('.studyBookCard .primaryAction');
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor("reader destination", () => evaluate(`document.querySelector('[data-app-view]')?.getAttribute('data-app-view') === 'reader'`));
  await sleep(40);
  const active = await evaluate(`(() => ({ snapshot: ${uiSnapshotExpression()}, scrollY }))()`);
  const activeShot = await capture("02-reader-fading-in");
  await waitFor("reader transition settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  await waitForVisualIdle(evaluate, { description: "reader visual idle" });
  const settled = await evaluate(`(() => ({ snapshot: ${uiSnapshotExpression()}, scrollY }))()`);
  const settledShot = await capture("03-reader-settled");

  const checks = {
    scrolledSourceVisible:
      source.found && source.scrollY > 0 && source.rect?.bottom > 0 && source.rect?.top < 844,
    clickAccepted: clicked,
    destinationOwnsSingleShell:
      active.snapshot.view === "reader" && active.snapshot.shellCount === 1 && settled.snapshot.shellCount === 1,
    noStageOrCanvas:
      active.snapshot.cinematicStageCount === 0 && active.snapshot.canvasCount === 0 &&
      settled.snapshot.cinematicStageCount === 0 && settled.snapshot.canvasCount === 0,
    textGeometryNeverScaled:
      active.snapshot.textScaleViolations === 0 && settled.snapshot.textScaleViolations === 0 &&
      active.snapshot.shellTransform === "none" && settled.snapshot.shellTransform === "none",
    headingGeometryStable:
      !active.snapshot.headingRect || !settled.snapshot.headingRect ||
      Math.abs(active.snapshot.headingRect.width - settled.snapshot.headingRect.width) <= 0.5 &&
      Math.abs(active.snapshot.headingRect.height - settled.snapshot.headingRect.height) <= 0.5,
    readingPositionStable: Math.abs(settled.scrollY - active.scrollY) <= 2,
    transitionCleansUp:
      settled.snapshot.transitionKind === null && settled.snapshot.shellOpacity === 1 &&
      settled.snapshot.shellTransform === "none",
    noHorizontalOverflow: active.snapshot.horizontalOverflow <= 1 && settled.snapshot.horizontalOverflow <= 1
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
    source,
    active,
    settled,
    screenshots: { beforeShot, activeShot, settledShot }
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
