const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9338/json";
const appUrl = process.env.QA_APP_URL ?? "http://127.0.0.1:4183/";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await cdp.send("Page.navigate", { url: appUrl });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 15000) {
    if (await evaluate(`Boolean(document.querySelector(".appPageContent"))`)) {
      ready = true;
      break;
    }
    await sleep(120);
  }
  if (!ready) throw new Error("Timed out waiting for settled application content");

  const snapshot = `(() => {
    const parseTime = (value) => value.split(",").reduce((max, item) => {
      const token = item.trim();
      const milliseconds = token.endsWith("ms") ? Number.parseFloat(token) : Number.parseFloat(token) * 1000;
      return Math.max(max, Number.isFinite(milliseconds) ? milliseconds : 0);
    }, 0);
    const selectors = [".appPageContent", ".workspaceFocus", ".workspaceEdgeNav button"];
    const durations = selectors.map((selector) => {
      const element = document.querySelector(selector);
      return element ? parseTime(getComputedStyle(element).animationDuration) : 0;
    });
    return {
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      maxAnimationMs: Math.max(...durations),
      viewTransitionSupported: typeof document.startViewTransition === "function",
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  })()`;

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  const normal = await evaluate(snapshot);

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  const reduced = await evaluate(snapshot);

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  cdp.close();

  const checks = {
    nativeViewTransitions: normal.viewTransitionSupported,
    normalMotionPresent: normal.maxAnimationMs >= 500,
    reducedMotionApplied: reduced.reduced && reduced.maxAnimationMs <= 1,
    noHorizontalOverflow: normal.horizontalOverflow <= 1 && reduced.horizontalOverflow <= 1
  };
  const result = { ok: Object.values(checks).every(Boolean), checks, normal, reduced };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
