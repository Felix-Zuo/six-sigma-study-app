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
      } catch {}
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  await cdp.send("Page.navigate", { url: appUrl });
  await waitFor("reader render", () => evalPage(`Boolean(document.querySelector(".readerPanel"))`));
  await evalPage(`(() => {
    localStorage.setItem("six-sigma-study:reader-position:v1", JSON.stringify({
      chapterId: "ch01",
      sectionId: "ch01-overview",
      language: "en",
      scrollY: 0,
      updatedAt: new Date().toISOString()
    }));
    location.reload();
    return true;
  })()`);
  await waitFor("Chapter 1 English reader render", () =>
    evalPage(`Boolean(document.querySelector('[data-section-id="ch01-overview"] .sectionBody:not(.zhText)'))`)
  );

  const dictionaryState = await evalPage(`(async () => {
    const normalize = (value) => String(value)
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/[^a-z0-9σ]+/g, " ")
      .trim()
      .replace(/\\s+/g, " ");
    const manual = await fetch("/content/manual.json").then((response) => response.json());
    const index = new Map();
    for (const entry of manual.dictionary) {
      index.set(normalize(entry.term), entry);
      for (const key of entry.lookupKeys ?? []) {
        index.set(normalize(key), entry);
      }
    }
    const required = ["both", "responsibility", "copq", "dmadv", "poka", "seiri", "anderson darling", "accuracy"];
    const hits = Object.fromEntries(required.map((key) => {
      const entry = index.get(normalize(key));
      return [key, entry ? {
        term: entry.term,
        translation: entry.translation,
        source: entry.source ?? "curated",
        phonetic: entry.phonetic ?? null,
        isSixSigmaTerm: Boolean(entry.isSixSigmaTerm)
      } : null];
    }));
    return {
      count: manual.dictionary.length,
      ecdictCount: manual.dictionary.filter((entry) => entry.source === "ECDICT").length,
      hits
    };
  })()`, true);

  await waitFor("clickable word token", () =>
    evalPage(`Boolean([...document.querySelectorAll(".wordToken")]
      .find((item) => item.textContent.trim().toLowerCase() === "both"))`)
  );

  const clicked = await evalPage(`(() => {
    const button = [...document.querySelectorAll(".wordToken")]
      .find((item) => item.textContent.trim().toLowerCase() === "both");
    if (!button) {
      return false;
    }
    button.click();
    return true;
  })()`);
  await waitFor("lookup sheet", () => evalPage(`Boolean(document.querySelector(".bottomSheet"))`));

  const lookupState = await evalPage(`(() => {
    const sheet = document.querySelector(".bottomSheet");
    const doc = document.documentElement;
    return {
      clicked: ${JSON.stringify(clicked)},
      title: sheet?.querySelector("h2")?.textContent?.trim() ?? "",
      translation: sheet?.querySelector(".translation")?.textContent?.trim() ?? "",
      phonetic: sheet?.querySelector(".phonetic")?.textContent?.trim() ?? "",
      explanation: sheet?.querySelector(".explanation")?.textContent?.trim() ?? "",
      horizontalOverflow: Math.max(document.body.scrollWidth, doc.scrollWidth) - doc.clientWidth
    };
  })()`);

  fs.mkdirSync("qa/screenshots", { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync("qa/screenshots/dictionary-lookup-qa.png", Buffer.from(screenshot.data, "base64"));

  const requiredHits = Object.values(dictionaryState.hits).every(Boolean);
  const ok =
    dictionaryState.count >= 3900 &&
    dictionaryState.ecdictCount >= 3800 &&
    requiredHits &&
    lookupState.clicked &&
    lookupState.title.toLowerCase() === "both" &&
    lookupState.translation !== "待完善" &&
    lookupState.phonetic.length > 0 &&
    lookupState.horizontalOverflow <= 1;

  console.log(
    JSON.stringify(
      {
        ok,
        dictionaryState,
        lookupState,
        screenshot: "qa/screenshots/dictionary-lookup-qa.png"
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
