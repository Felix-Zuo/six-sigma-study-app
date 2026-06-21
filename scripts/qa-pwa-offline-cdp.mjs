import fs from "node:fs";

const endpoint = process.env.CHROME_CDP_ENDPOINT ?? "http://127.0.0.1:9333/json";
const appUrl = process.env.PWA_URL ?? "http://127.0.0.1:4175/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page =
    pages.find((item) => item.type === "page" && item.url?.startsWith(appUrl) && item.webSocketDebuggerUrl) ??
    pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No debuggable Chrome page found");
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id || !pending.has(payload.id)) {
      return;
    }
    const { resolve, reject } = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) {
      reject(new Error(JSON.stringify(payload.error)));
      return;
    }
    resolve(payload.result);
  });

  function send(method, params = {}) {
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
  }

  return { send, close: () => ws.close() };
}

async function main() {
  const cdp = await connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  async function evalPage(expression, awaitPromise = false) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async function waitFor(description, fn, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await fn()) {
          return;
        }
      } catch {
        // Keep polling while navigation or service worker installation is in progress.
      }
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("reader render", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await waitFor("service worker ready", () => evalPage(`navigator.serviceWorker.ready.then(() => true)`, true));
  const controlledBeforeReload = await evalPage(`Boolean(navigator.serviceWorker.controller)`);
  if (!controlledBeforeReload) {
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor("controlled reader render", () =>
      evalPage(`Boolean(navigator.serviceWorker.controller) && Boolean(document.querySelector(".readerPanel"))`)
    );
  }

  const onlineCache = await evalPage(`(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const cacheName = names.find((name) => name.startsWith("six-sigma-study-"));
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const paths = keys.map((request) => new URL(request.url).pathname);
    return {
      controller: Boolean(navigator.serviceWorker.controller),
      cacheName,
      entries: paths.length,
      hasIndex: paths.includes("/") && paths.includes("/index.html"),
      hasJs: paths.some((path) => path.startsWith("/assets/index-") && path.endsWith(".js")),
      hasCss: paths.some((path) => path.startsWith("/assets/index-") && path.endsWith(".css")),
      hasManual: paths.includes("/content/manual.json"),
      hasManifest: paths.includes("/manifest.webmanifest"),
      figureCount: paths.filter((path) => path.startsWith("/content/assets/figures/")).length
    };
  })()`, true);

  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor("offline reader render", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  const offlineState = await evalPage(`(() => {
    const doc = document.documentElement;
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      sections: document.querySelectorAll("[data-section-id]").length,
      horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth,
      controller: Boolean(navigator.serviceWorker.controller)
    };
  })()`);

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/pwa-offline-qa.png", Buffer.from(screenshot.data, "base64"));

  const ok =
    onlineCache.controller &&
    onlineCache.hasIndex &&
    onlineCache.hasJs &&
    onlineCache.hasCss &&
    onlineCache.hasManual &&
    onlineCache.hasManifest &&
    onlineCache.figureCount === 470 &&
    offlineState.controller &&
    offlineState.sections > 0 &&
    offlineState.horizontalOverflow <= 1;

  console.log(
    JSON.stringify(
      {
        ok,
        onlineCache,
        offlineState,
        screenshot: "qa/screenshots/pwa-offline-qa.png"
      },
      null,
      2
    )
  );
  cdp.close();
  if (!ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
