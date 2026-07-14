import fs from "node:fs";
import path from "node:path";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectCdp(endpoint) {
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

export async function createUiHarness({
  endpoint,
  screenshotDir,
  width = 390,
  height = 844,
  mobile = width < 768
}) {
  const cdp = await connectCdp(endpoint);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile
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
      await sleep(30);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function capture(name) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const filePath = path.resolve(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
    return filePath.replaceAll("\\", "/");
  }

  return { cdp, evaluate, waitFor, capture };
}

export function uiSnapshotExpression() {
  return `(() => {
    const root = document.documentElement;
    const shell = document.querySelector('.appShell');
    const readerPanel = document.querySelector('.readerPanel');
    const heading = document.querySelector('.workspaceBrand h1, .appPageHeader h1, .topBar h1');
    const headingRect = heading?.getBoundingClientRect();
    const visibleText = Array.from(shell?.querySelectorAll('h1, h2, h3, p, button, a, label, li') ?? []).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (element.textContent ?? '').trim() && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const textScaleViolations = visibleText.filter((element) => {
      const transform = getComputedStyle(element).transform;
      if (!transform || transform === 'none') return false;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        const scaleX = Math.hypot(matrix.a, matrix.b);
        const scaleY = Math.hypot(matrix.c, matrix.d);
        return Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01;
      } catch {
        return true;
      }
    }).length;
    return {
      view: shell?.dataset.appView ?? null,
      transitionKind: root.dataset.transitionKind ?? null,
      shellCount: document.querySelectorAll('.appShell').length,
      shellOpacity: shell ? Number.parseFloat(getComputedStyle(shell).opacity) : null,
      shellTransform: shell ? getComputedStyle(shell).transform : null,
      readerPanelOpacity: readerPanel ? Number.parseFloat(getComputedStyle(readerPanel).opacity) : null,
      headingText: heading?.textContent?.trim() ?? null,
      headingRect: headingRect ? { width: headingRect.width, height: headingRect.height, top: headingRect.top, left: headingRect.left } : null,
      textScaleViolations,
      cinematicStageCount: document.querySelectorAll('[data-cinematic-stage], .cinematicStage').length,
      canvasCount: document.querySelectorAll('.cinematicStage canvas').length,
      horizontalOverflow: root.scrollWidth - root.clientWidth
    };
  })()`;
}
