import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

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

export async function createCinematicHarness({
  endpoint,
  appUrl,
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

  async function captureCinematicCanvas(name) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const dataUrl = await evaluate(`globalThis.__qaCaptureCinematicFrame?.() ?? document.querySelector('[data-cinematic-canvas]')?.toDataURL('image/png') ?? null`);
    if (!dataUrl?.startsWith("data:image/png;base64,")) return capture(name);
    return saveDataUrl(name, dataUrl);
  }

  function saveDataUrl(name, dataUrl) {
    if (!dataUrl?.startsWith("data:image/png;base64,")) {
      throw new Error(`${name}: cinematic frame was not captured`);
    }
    fs.mkdirSync(screenshotDir, { recursive: true });
    const filePath = path.resolve(screenshotDir, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    return filePath.replaceAll("\\", "/");
  }

  return { cdp, evaluate, waitFor, capture, captureCinematicCanvas, saveDataUrl, appUrl, width, height };
}

export function analyzePng(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  let samples = 0;
  let black = 0;
  let chromatic = 0;
  let luminanceSum = 0;
  let luminanceSquared = 0;
  const bins = new Set();
  for (let y = 0; y < png.height; y += 4) {
    for (let x = 0; x < png.width; x += 4) {
      const offset = (png.width * y + x) * 4;
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      const alpha = png.data[offset + 3];
      if (alpha < 16) continue;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      samples += 1;
      luminanceSum += luminance;
      luminanceSquared += luminance * luminance;
      if (red < 10 && green < 10 && blue < 10) black += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 24) chromatic += 1;
      bins.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
    }
  }
  const mean = samples ? luminanceSum / samples : 0;
  const variance = samples ? Math.max(0, luminanceSquared / samples - mean * mean) : 0;
  return {
    width: png.width,
    height: png.height,
    samples,
    blackRatio: samples ? black / samples : 1,
    chromaticRatio: samples ? chromatic / samples : 0,
    luminanceMean: mean,
    luminanceStdDev: Math.sqrt(variance),
    quantizedColorBins: bins.size
  };
}

export function stageSnapshotExpression() {
  return `(() => {
    const root = document.documentElement;
    const stage = document.querySelector('[data-cinematic-stage]');
    const shell = document.querySelector('.appShell');
    const heading = document.querySelector('.appPageHeader h1, .topBar h1');
    const headingRect = heading?.getBoundingClientRect();
    const visibleTextElements = Array.from(shell?.querySelectorAll('h1, h2, h3, p, button, a, label, li') ?? []).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (element.textContent ?? '').trim() && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const textScaleViolations = visibleTextElements.filter((element) => {
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
      view: document.querySelector('[data-app-view]')?.getAttribute('data-app-view') ?? null,
      active: root.dataset.cinematicActive ?? null,
      phase: stage?.dataset.phase ?? null,
      progress: Number(stage?.dataset.progress ?? 0),
      style: stage?.dataset.style ?? null,
      contentMode: stage?.dataset.contentMode ?? null,
      stageText: (stage?.textContent ?? '').trim(),
      stageHidden: stage?.hidden ?? true,
      stageCount: document.querySelectorAll('[data-cinematic-stage]').length,
      stageOpacity: stage ? Number.parseFloat(getComputedStyle(stage).opacity) : 0,
      canvasCount: stage?.querySelectorAll('canvas').length ?? 0,
      canvasWidth: stage?.querySelector('canvas')?.width ?? 0,
      canvasHeight: stage?.querySelector('canvas')?.height ?? 0,
      shellCount: document.querySelectorAll('.appShell').length,
      shellOpacity: shell ? Number.parseFloat(getComputedStyle(shell).opacity) : null,
      shellTransform: shell ? getComputedStyle(shell).transform : null,
      visibleTextCount: visibleTextElements.length,
      textScaleViolations,
      headingText: heading?.textContent?.trim() ?? null,
      headingRect: headingRect ? { width: headingRect.width, height: headingRect.height, top: headingRect.top, left: headingRect.left } : null,
      horizontalOverflow: root.scrollWidth - root.clientWidth
    };
  })()`;
}
