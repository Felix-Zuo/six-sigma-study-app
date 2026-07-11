import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4180/";
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? "qa/content-fidelity/screenshots";
const bookId = "six-sigma-black-belt";

const samples = [
  {
    label: "ch05-pareto",
    chapterId: "ch05",
    sectionId: "ch05-s03-the-pareto-principle",
    enBlockId: "ch05-s03-the-pareto-principle-en-007",
    zhBlockId: "ch05-s03-the-pareto-principle-zh-009",
    kind: "table"
  },
  {
    label: "ch16-control-plan",
    chapterId: "ch16",
    sectionId: "ch16-s03-create-a-control-plan",
    enBlockId: "ch16-s03-create-a-control-plan-en-023",
    zhBlockId: "ch16-s03-create-a-control-plan-zh-025",
    kind: "table"
  },
  {
    label: "ch23-control-chart-data",
    chapterId: "ch23",
    sectionId: "ch23-s03-creating-and-reading-control-charts-in-minitab",
    enBlockId: "ch23-s03-creating-and-reading-control-charts-in-minitab-en-086",
    zhBlockId: "ch23-s03-creating-and-reading-control-charts-in-minitab-zh-087",
    kind: "table"
  },
  {
    label: "ch29-modeling-report",
    chapterId: "ch29",
    sectionId: "ch29-s04-next-steps",
    enBlockId: "source-report-modeling-summary-ch29",
    zhBlockId: "source-report-modeling-summary-ch29-zh",
    kind: "image"
  },
  {
    label: "ch30-interaction-data",
    chapterId: "ch30",
    sectionId: "ch30-s02-the-importance-of-understanding-interactions",
    enBlockId: "ch30-s02-the-importance-of-understanding-interactions-en-011",
    zhBlockId: "ch30-s02-the-importance-of-understanding-interactions-zh-014",
    kind: "table"
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
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
    if (!payload.id || !pending.has(payload.id)) return;
    const { resolve, reject } = pending.get(payload.id);
    pending.delete(payload.id);
    payload.error ? reject(new Error(JSON.stringify(payload.error))) : resolve(payload.result);
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
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
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
      userGesture: true,
      awaitPromise: true
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
        // Reloads can temporarily invalidate the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const file = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
    return file.replaceAll("\\", "/");
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("application shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    location.reload();
    return true;
  })()`);
  await waitFor("fresh application shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  const results = [];

  for (const sample of samples) {
    for (const language of ["en", "zh"]) {
      const blockId = language === "en" ? sample.enBlockId : sample.zhBlockId;
      await evaluate(`(() => {
        localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
        localStorage.setItem("six-sigma-study:active-book:v1", ${JSON.stringify(bookId)});
        localStorage.setItem("six-sigma-study:reader-preferences:v1", JSON.stringify({ theme: "light", textScale: "standard" }));
        localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
          bookId: ${JSON.stringify(bookId)},
          chapterId: ${JSON.stringify(sample.chapterId)},
          sectionId: ${JSON.stringify(sample.sectionId)},
          blockId: ${JSON.stringify(blockId)},
          language: ${JSON.stringify(language)},
          scrollY: 0,
          updatedAt: new Date().toISOString()
        }));
        location.reload();
        return true;
      })()`);
      await waitFor("library", () => evaluate(`Boolean(document.querySelector(".bookCard .primaryAction"))`));
      await evaluate(`document.querySelector(".bookCard .primaryAction")?.click()`);
      await waitFor(`${sample.label} reader`, () => evaluate(`Boolean(document.querySelector(".readerPanel"))`));
      await waitFor(`${sample.label} target block`, () => evaluate(`Boolean(document.querySelector('[data-block-id="${blockId}"]'))`));
      await evaluate(`(() => {
        const target = document.querySelector('[data-block-id="${blockId}"]');
        target?.scrollIntoView({ block: "center", inline: "start", behavior: "instant" });
        window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
        return true;
      })()`);
      await sleep(350);
      const state = await evaluate(`(() => {
        const target = document.querySelector('[data-block-id="${blockId}"]');
        const image = target?.querySelector("img");
        const table = target?.querySelector("table");
        const rect = target?.getBoundingClientRect();
        return {
          language: document.querySelector(".sectionBody")?.classList.contains("zhText") ? "zh" : "en",
          visible: Boolean(rect && rect.bottom > 0 && rect.top < innerHeight),
          kind: table ? "table" : image ? "image" : "other",
          rows: table?.rows.length ?? 0,
          cells: table ? Array.from(table.rows).reduce((total, row) => total + row.cells.length, 0) : 0,
          imageLoaded: image ? image.complete && image.naturalWidth > 4 : null,
          bodyOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
          scrollX: window.scrollX,
          shellScrollLeft: document.querySelector(".appShell")?.scrollLeft ?? 0,
          readerScrollLeft: document.querySelector(".readerPanel")?.scrollLeft ?? 0,
          chromeScrollLeft: document.querySelector(".readerChrome")?.scrollLeft ?? 0,
          headerScrollLeft: document.querySelector(".headerActions")?.scrollLeft ?? 0,
          headerLeft: Math.round(document.querySelector(".headerActions")?.getBoundingClientRect().left ?? 0),
          railScrollLeft: document.querySelector(".chapterRail")?.scrollLeft ?? 0,
          targetOverflow: target ? Math.max(0, target.scrollWidth - target.clientWidth) : -1
        };
      })()`);
      const screenshot = await capture(`${sample.label}-${language}`);
      const validKind = state.kind === sample.kind;
      const validContent = sample.kind === "table" ? state.rows >= 2 && state.cells >= 4 : state.imageLoaded;
      results.push({ ...sample, language, blockId, state, screenshot, ok: state.language === language && state.visible && validKind && validContent && state.bodyOverflow <= 1 && state.scrollX === 0 });
    }
  }

  cdp.close();
  const failures = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failures.length === 0, results, failures }, null, 2));
  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
