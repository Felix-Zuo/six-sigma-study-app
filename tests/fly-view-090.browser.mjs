// Full UI regression in an isolated real Chromium profile. AI responses are
// mocked at the network boundary; no API key, personal data, or paid call is used.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";

const root = process.cwd();
const artifacts = path.resolve(process.env.QA_090_ARTIFACT_DIR || ".qa/090");
fs.mkdirSync(artifacts, { recursive: true });
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(Boolean).find(fs.existsSync);
if (!browserPath) throw new Error("A Chromium browser is required (set CHROME_PATH).");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fly-view-090-ui-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const checks = [];
const screenshots = [];
let browser, vite, ws, cdp;
let phase = "startup";

async function until(label, check, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await check()) return; } catch {} await sleep(80); }
  throw new Error(`Timed out: ${label}`);
}
const mockNetwork = `(() => {
  const actual = window.fetch.bind(window);
  window.__qaAiMode = 'success'; window.__qaAiCalls = 0;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (String(url).startsWith('https://api.deepseek.com/')) {
      window.__qaAiCalls++;
      const body = JSON.parse(init.body || '{}');
      const source = body.messages?.at(-1)?.content || '';
      const result = {reply:'这段表达可以用来说明工作职责，原文已完整整理。',materials:[],memories:[]};
      if (body.messages?.[0]?.content?.includes('当前为收录模式')) result.materials = [{
        title:'供应商沟通练习',category:'work',kind:'article',sourceText:window.__qaAiMode==='invalid'?source.split('\\n')[0]:source,
        textEn:source,textZh:'我协调供应商并审查交货计划。清晰的沟通帮助团队共同解决问题。',
        terms:[{term:'coordinate',meaningZh:'协调',exampleEn:'I coordinate suppliers and review delivery schedules.'}],summary:'以工作中的真实表达练习清晰沟通。'
      }];
      return new Response(JSON.stringify({choices:[{message:{tool_calls:[{function:{name:'submit_study_chat',arguments:JSON.stringify(result)}}]}}],usage:{prompt_tokens:20,completion_tokens:30}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if (/^https?:/.test(String(url)) && !String(url).startsWith(location.origin)) {
      return new Response(JSON.stringify({error:{message:'External services are disabled during isolated QA'}}),{status:404,headers:{'Content-Type':'application/json'}});
    }
    return actual(input, init);
  };
})();`;

try {
  vite = await createServer({ configFile: path.join(root, "apps/reader/vite.config.ts"), root: path.join(root, "apps/reader"),
    server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
  await vite.listen();
  const appUrl = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  await until("isolated Chrome", () => fs.existsSync(path.join(profile, "DevToolsActivePort")));
  const port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push({ phase, kind: "exception", detail: message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text });
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push({ phase, kind: "console", detail: message.params.args.map((arg) => arg.value || arg.description).join(" ") });
    const job = pending.get(message.id);
    if (job) { pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result); }
  });
  cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000) });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const value = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result?.value;
  };
  const click = async (selector) => {
    assert.ok(await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)});e?.scrollIntoView({block:'center'});e?.click();return Boolean(e);})()`), `Missing ${selector}`);
  };
  const button = async (label, scope = "body") => {
    assert.ok(await evaluate(`(() => {const e=Array.from(document.querySelector(${JSON.stringify(scope)})?.querySelectorAll('button')||[]).find(e=>e.textContent.trim()===${JSON.stringify(label)});e?.scrollIntoView({block:'center'});e?.click();return Boolean(e)})()`), `Missing button ${label}`);
  };
  const fill = async (selector, value) => {
    assert.ok(await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`), `Missing field ${selector}`);
  };
  const view = (name) => until(`view ${name}`, () => evaluate(`document.querySelector('[data-app-view]')?.dataset.appView===${JSON.stringify(name)} && !document.documentElement.dataset.transitionKind`));
  const nav = async (label, target) => { await button(label, "nav[aria-label='主导航']"); await view(target); };
  const screenshot = async (name) => {
    await sleep(250);
    const overflow = await evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth");
    assert.ok(overflow <= 1, `${name}: horizontal overflow ${overflow}`);
    checks.push({ name, horizontalOverflow: overflow });
    const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const filename = path.join(artifacts, `${name}.png`);
    fs.writeFileSync(filename, Buffer.from(shot.data, "base64")); screenshots.push(filename);
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: mockNetwork });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url: appUrl });
  await view("home");
  await until("new home", () => evaluate("Boolean(document.querySelector('.fv-home h1'))"));
  assert.match(await evaluate("document.querySelector('.fv-home h1').textContent"), /自己的语言/);
  await screenshot("mobile-home");

  phase = "chat draft and no-key recovery";
  await nav("助教", "chat");
  const draft = "Please check the sample before the meeting.\nA clear example makes the discussion easier.";
  await fill("textarea[aria-label='发送给学习助教']", draft);
  await nav("材料", "library"); await nav("助教", "chat");
  assert.equal(await evaluate("document.querySelector('.fv-composer textarea').value"), draft);
  await cdp("Page.reload"); await view("home"); await nav("助教", "chat");
  assert.equal(await evaluate("document.querySelector('.fv-composer textarea').value"), draft, "Draft must survive refresh");
  await click("button[aria-label='整理并收录']");
  await until("no-key guidance", () => evaluate("document.querySelector('.fv-chat [role=alert]')?.textContent.includes('API Key')"));
  assert.equal(await evaluate("document.querySelector('.fv-composer textarea').value"), draft, "Failed assistance must retain original input");
  assert.equal(await evaluate("window.__qaAiCalls"), 0, "Missing key must not invoke AI");
  await button("直接保存原文");
  await until("raw editor", () => evaluate("Boolean(document.querySelector('.fv-dialog'))"));
  assert.equal(await evaluate("document.querySelector('.fv-dialog textarea').value"), draft);
  await fill(".fv-dialog input", "会议前的清晰表达");
  await fill(".fv-dialog textarea:nth-of-type(1)", draft);
  await button("保存到学习材料", ".fv-dialog");
  await until("saved raw", () => evaluate("!document.querySelector('.fv-dialog') && Boolean(document.querySelector('.fv-saved-result'))"));
  await nav("材料", "library");
  await until("raw listed", () => evaluate("document.querySelector('.fv-material-list')?.textContent.includes('会议前的清晰表达')"));
  checks.push({ name: "draft-refresh-and-direct-save", passed: true });

  phase = "mock AI collection";
  await nav("我的", "settings");
  await fill(".apiKeyField input", "qa-only-fake-session-key"); await button("安全保存", ".aiSettingsPanel");
  await until("session key", () => evaluate("document.querySelector('.aiSettingsPanel')?.textContent.includes('已配置')"));
  await nav("助教", "chat");
  const original = "I coordinate suppliers and review delivery schedules.\nClear communication helps teams solve problems together.";
  await fill(".fv-composer textarea", original); await click("button[aria-label='整理并收录']");
  await until("mock collection saved", () => evaluate("document.querySelector('.fv-saved-result')?.textContent.includes('供应商沟通练习')"));
  await evaluate("window.scrollTo(0,document.documentElement.scrollHeight)");
  await screenshot("chat");
  await button("开始阅读", ".fv-saved-result"); await view("reader");
  await until("personal reader", () => evaluate("document.querySelector('.readerPanel')?.textContent.includes('coordinate') || document.querySelector('.readerPanel')?.textContent.includes('协调')"));
  if (!await evaluate("document.querySelector('.readerPanel')?.textContent.includes('coordinate')")) { await click("[aria-label='切换阅读语言']"); await until("English", () => evaluate("document.querySelector('.readerPanel')?.textContent.includes('coordinate')")); }
  assert.ok(await evaluate(`document.querySelector('.readerPanel').textContent.includes(${JSON.stringify(original.split("\n")[1])})`), "Whole source must reach reader");
  await evaluate("Array.from(document.querySelectorAll('.readerPanel .wordToken')).find(e=>e.textContent==='coordinate')?.click()");
  await until("word lookup", () => evaluate("document.querySelector('[aria-label=单词释义] h2')?.textContent==='coordinate'"));
  assert.match(await evaluate("document.querySelector('[aria-label=单词释义]').textContent"), /协调/);
  await click("[aria-label='加入词本']");
  await until("word saved", () => evaluate("Boolean(document.querySelector('[aria-label=已加入词本]'))"));
  await click("[aria-label='单词释义'] .closeButton");
  await click("[aria-label='切换阅读语言']");
  await until("Chinese reader", () => evaluate("document.querySelector('.readerPanel')?.textContent.includes('协调供应商')"));
  await click("[aria-label='打开阅读工具']"); await click("[aria-label='收藏当前内容']");
  await click("[aria-label='打开阅读工具']");
  await screenshot("reader");
  await click("[aria-label='返回书库']"); await view("library");
  await screenshot("materials");
  await cdp("Page.reload"); await view("home"); await nav("材料", "library");
  await until("materials persist", () => evaluate("document.querySelectorAll('.fv-material-card').length===2"));
  await nav("复习", "vocab");
  assert.ok(await evaluate("document.body.textContent.includes('coordinate')"), "Saved vocabulary remains visible after refresh");
  await nav("学习", "home"); await button("阅读收藏", ".fv-quick-links"); await view("favorites");
  assert.ok(await evaluate("document.body.textContent.includes('供应商沟通练习')"), "Personal reading favorite survives reload");
  checks.push({ name: "mock-collection-bilingual-lookup-vocab-favorite-refresh", passed: true });

  phase = "invalid AI source and chat mode";
  await nav("我的", "settings"); await fill(".apiKeyField input", "qa-only-fake-session-key"); await button("安全保存", ".aiSettingsPanel");
  await nav("助教", "chat");
  await evaluate("window.__qaAiMode='invalid'");
  const rejected = `${original}\nThe full final paragraph must be retained.`;
  await fill(".fv-composer textarea", rejected); await click("button[aria-label='整理并收录']");
  await until("invalid source rejected", () => evaluate("document.querySelector('.fv-chat [role=alert]')?.textContent.includes('原文')"));
  assert.equal(await evaluate("document.querySelector('.fv-composer textarea').value"), rejected);
  await nav("材料", "library"); assert.equal(await evaluate("document.querySelectorAll('.fv-material-card').length"), 2, "Rejected source cannot create a material");
  await nav("助教", "chat"); await button("聊天练习", ".fv-compose-modes");
  await evaluate("window.__qaAiMode='success'"); await fill(".fv-composer textarea", "帮我练习英语表达。"); await click("button[aria-label='发送消息']");
  await until("chat reply", () => evaluate("!document.querySelector('.fv-thinking') && document.querySelectorAll('.fv-message-assistant').length>=2"));
  await button("收录这段表达", ".fv-message-assistant");
  await until("assistant reply can be saved", () => evaluate("Boolean(document.querySelector('.fv-dialog'))"));
  await evaluate("window.confirm=()=>true"); await click("[aria-label='关闭编辑']");
  checks.push({ name: "invalid-ai-source-retained-and-chat-reply-save-entry", passed: true });

  phase = "legacy textbook and desktop";
  await nav("材料", "library"); await click(".fv-book-row"); await view("reader");
  await until("legacy manual content", () => evaluate("document.querySelector('.readerPanel')?.textContent.includes('Six Sigma') && document.querySelector('.readerPanel').textContent.length>100"));
  assert.ok(await evaluate("document.querySelector('.topBar').textContent.includes('Six Sigma') || document.querySelector('.topBar').textContent.includes('六西格玛')"));
  const legacyGeometry = await evaluate("({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,elements:Array.from(document.querySelectorAll('body *')).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.left<0||e.right>document.documentElement.clientWidth+.1)})");
  fs.writeFileSync(path.join(artifacts, "legacy-reader-geometry.json"), JSON.stringify(legacyGeometry, null, 2));
  await screenshot("legacy-reader");
  for (const width of [320, 360]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(100);
    const overflow = await evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth");
    assert.ok(overflow <= 1, `legacy-reader-${width}: horizontal overflow ${overflow}`);
    checks.push({ name: `legacy-reader-${width}`, horizontalOverflow: overflow });
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click("[aria-label='返回书库']"); await view("library");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await screenshot("desktop-materials"); await nav("学习", "home"); await evaluate("window.scrollTo(0,0)"); await screenshot("desktop-home");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  // Optional local CI parity run. Each legacy suite gets fresh storage in this
  // disposable profile; existing data and a developer's running browser are untouched.
  if (process.env.QA_090_LEGACY === "1") {
    const suites = process.env.QA_090_LEGACY_SUITES?.split(",") || ["motion-ui", "motion-continuity", "transition-resilience", "maturity-regressions", "vocab-study-ux", "fly-view-vocab"];
    for (const name of suites) {
      phase = `legacy ${name}`;
      await cdp("Page.navigate", { url: "about:blank" });
      await cdp("Storage.clearDataForOrigin", { origin: new URL(appUrl).origin, storageTypes: "all" });
      const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(root, `scripts/qa-${name}-cdp.mjs`)], {
          cwd: root, windowsHide: true,
          env: { ...process.env, CDP_ENDPOINT: `http://127.0.0.1:${port}/json`, QA_APP_URL: appUrl },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { output += chunk; });
        child.on("exit", (code) => resolve({ code, output }));
      });
      fs.writeFileSync(path.join(artifacts, `legacy-${name}.log`), result.output);
      checks.push({ name: `legacy-${name}`, passed: result.code === 0 });
      console.log(`legacy-${name}: ${result.code === 0 ? "PASS" : "FAIL"}`);
    }
    assert.ok(checks.every((check) => check.passed !== false), "An existing regression failed; see legacy logs");
  }
  const report = { ok: true, ai: "mock network responses only; no paid AI calls", mobile: "390x844", desktop: "1440x1000", errors, checks, screenshots };
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  fs.rmSync(path.join(artifacts, "failure.png"), { force: true });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (cdp) { try { const shot = await cdp("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(artifacts, "failure.png"), Buffer.from(shot.data, "base64")); } catch {} }
  const report = { ok: false, phase, error: error.stack || String(error), errors, checks, screenshots };
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
} finally {
  ws?.close(); browser?.kill(); await vite?.close();
  if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith("fly-view-090-ui-")) throw new Error("Unexpected test profile path");
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
