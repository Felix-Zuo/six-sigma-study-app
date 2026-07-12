const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9340/json";
const mode = process.env.QA_KEYSTORE_MODE ?? "save";
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
  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function waitFor(description, predicate, timeout = 16000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await predicate()) return;
      } catch {
        // WebView reloads briefly invalidate the context.
      }
      await sleep(120);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }
  await waitFor("native app shell", () => evaluate(`Boolean(document.querySelector(".appShell"))`));
  await evaluate(`(() => {
    localStorage.setItem("six-sigma-study:notice-accepted:v1", "true");
    if (!document.querySelector(".mainNav")) location.reload();
  })()`);
  await waitFor("native main navigation", () => evaluate(`Boolean(document.querySelector(".mainNav"))`));
  await evaluate(`Array.from(document.querySelectorAll(".mainNavItem")).find((item) => item.textContent.includes("我的"))?.click()`);
  await waitFor("native AI settings", () => evaluate(`Boolean(document.querySelector(".apiKeyField input"))`));

  if (mode === "save") {
    const fakeKey = "s" + "k" + "-qa-native-keystore-only";
    await evaluate(`(() => {
      const input = document.querySelector(".apiKeyField input");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(fakeKey)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await waitFor("enabled native save", () => evaluate(`!Array.from(document.querySelectorAll(".aiSettingsActions button")).find((item) => item.textContent.includes("安全保存"))?.disabled`));
    await evaluate(`Array.from(document.querySelectorAll(".aiSettingsActions button")).find((item) => item.textContent.includes("安全保存"))?.click()`);
    await waitFor("native key configured", () => evaluate(`document.querySelector(".settingsTitleRow span")?.textContent?.trim() === "已配置"`));
  } else if (mode === "verify-clear") {
    await waitFor("persisted native key", () => evaluate(`document.querySelector(".settingsTitleRow span")?.textContent?.trim() === "已配置"`));
    await evaluate(`Array.from(document.querySelectorAll(".aiSettingsActions button")).find((item) => item.textContent.trim() === "清除")?.click()`);
    await waitFor("native key cleared", () => evaluate(`document.querySelector(".settingsTitleRow span")?.textContent?.trim() === "未配置"`));
  } else if (mode === "verify-empty") {
    await waitFor("empty native key status", () => evaluate(`document.querySelector(".settingsTitleRow span")?.textContent?.trim() === "未配置"`));
  } else {
    throw new Error(`Unknown QA_KEYSTORE_MODE: ${mode}`);
  }

  const state = await evaluate(`(() => ({
    configured: document.querySelector(".settingsTitleRow span")?.textContent?.trim(),
    storage: document.querySelector(".securityNote")?.textContent?.trim(),
    message: document.querySelector(".settingsMessage")?.textContent?.trim() ?? ""
  }))()`);
  const expected = mode === "save" ? "已配置" : "未配置";
  const ok = state.configured === expected && state.storage.includes("Android Keystore");
  cdp.close();
  console.log(JSON.stringify({ ok, mode, state }, null, 2));
  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
