import { execFileSync } from "node:child_process";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9340/json";
const adbPath = process.env.QA_ADB_PATH ?? "adb";
const appUrl = process.env.QA_APP_URL ?? "https://localhost/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  const pages = await (await fetch(endpoint)).json();
  const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("No Android WebView page found");
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
  await cdp.send("Runtime.enable");
  const androidApiLevel = Number.parseInt(
    execFileSync(adbPath, ["shell", "getprop", "ro.build.version.sdk"], { encoding: "utf8" }).trim(),
    10
  );
  const backDispatchMode = androidApiLevel >= 36 ? "document-backbutton-bridge" : "adb-keyevent";

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
        // Android WebView reloads briefly replace the execution context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async function pressBack() {
    if (androidApiLevel >= 36) {
      await evaluate(`document.dispatchEvent(new Event("backbutton"))`);
      return;
    }
    execFileSync(adbPath, ["shell", "input", "keyevent", "4"], { stdio: "ignore" });
  }

  async function clickByText(selector, label) {
    const clicked = await evaluate(`(() => {
      const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
        .find((item) => item.textContent?.replace(/\\s+/g, " ").trim().includes(${JSON.stringify(label)}));
      target?.click();
      return Boolean(target);
    })()`);
    if (!clicked) throw new Error(`Could not click ${label}`);
  }

  await waitFor("native app shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(() => {
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    location.href = ${JSON.stringify(`${appUrl}?qa-android-back=1`)};
    return true;
  })()`);
  await waitFor("reloaded native app shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`), 45000);
  await waitFor("native primary navigation", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await clickByText(".mainNavItem", "首页");
  await waitFor("home", () => evaluate(`document.querySelector("main")?.dataset.appView === "home"`));

  await clickByText(".mainNavItem", "单词");
  await waitFor("active native transition", () => evaluate(`
    document.documentElement.dataset.transitionKind === "navigation"
  `));
  await pressBack();
  await waitFor("native transition cancelled by back", () => evaluate(`
    !document.documentElement.dataset.transitionKind
  `));
  const transitionBack = await evaluate(`({
    view: document.querySelector("main")?.dataset.appView,
    stageCount: document.querySelectorAll('[data-cinematic-stage]').length,
    shellOpacity: Number.parseFloat(getComputedStyle(document.querySelector('.appShell')).opacity),
    shellTransform: getComputedStyle(document.querySelector('.appShell')).transform
  })`);

  await clickByText(".mainNavItem", "刷题");
  await waitFor("question dashboard", () => evaluate(`Boolean(document.querySelector(".questionContinueButton"))`));
  await waitFor("question transition settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  await evaluate(`document.querySelector(".questionContinueButton")?.click()`);
  await waitFor("question session", () => evaluate(`Boolean(document.querySelector(".questionSession .questionCard"))`));
  await pressBack();
  await waitFor("question dashboard after Android back", () => evaluate(`Boolean(document.querySelector(".questionDashboardHero"))`));
  const questionBack = await evaluate(`document.querySelector("main")?.dataset.appView`);
  await pressBack();
  await waitFor("home after module back", () => evaluate(`document.querySelector("main")?.dataset.appView === "home"`));

  await evaluate(`document.querySelector('section[aria-label="教材库"] article .primaryAction')?.click()`);
  await waitFor("reader", () => evaluate(`document.querySelector("main")?.dataset.appView === "reader"`));
  await waitFor("reader transition settled", () => evaluate(`!document.documentElement.dataset.transitionKind`));
  await clickByText(".readerControlButton", "更多");
  await waitFor("reader tools", () => evaluate(`Boolean(document.querySelector(".readerMenu"))`));
  await pressBack();
  await waitFor("reader tools closed", () => evaluate(`!document.querySelector(".readerMenu")`));
  const menuBack = await evaluate(`document.querySelector("main")?.dataset.appView`);

  await clickByText(".readerControlButton", "沉浸");
  await waitFor("immersive reader", () => evaluate(`Boolean(document.querySelector(".immersiveExit"))`));
  await pressBack();
  await waitFor("immersive reader closed", () => evaluate(`!document.querySelector(".immersiveExit") && Boolean(document.querySelector(".readerChrome"))`));
  const immersiveBack = await evaluate(`document.querySelector("main")?.dataset.appView`);

  const language = await evaluate(`document.querySelector('[aria-label="切换阅读语言"]')?.textContent?.trim()`);
  if (language === "EN") {
    await evaluate(`document.querySelector('[aria-label="切换阅读语言"]')?.click()`);
    await waitFor("English reader words", () => evaluate(`document.querySelectorAll(".wordToken").length > 0`));
  }
  await evaluate(`document.querySelector(".wordToken")?.click()`);
  await waitFor("lookup sheet", () => evaluate(`Boolean(document.querySelector('section[aria-label="单词释义"]'))`));
  await pressBack();
  await waitFor("lookup sheet closed", () => evaluate(`!document.querySelector('section[aria-label="单词释义"]')`));
  const lookupBack = await evaluate(`({ view: document.querySelector("main")?.dataset.appView, bodyPosition: document.body.style.position })`);

  const ok = transitionBack.view === "home" && transitionBack.stageCount === 0 &&
    transitionBack.shellOpacity === 1 && transitionBack.shellTransform === "none" &&
    questionBack === "questions" && menuBack === "reader" && immersiveBack === "reader" &&
    lookupBack.view === "reader" && lookupBack.bodyPosition === "";
  cdp.close();
  console.log(JSON.stringify({ ok, androidApiLevel, backDispatchMode, transitionBack, questionBack, menuBack, immersiveBack, lookupBack }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
