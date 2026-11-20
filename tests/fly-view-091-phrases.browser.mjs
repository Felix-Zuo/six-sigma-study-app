// Real UI acceptance using synthetic data only, an isolated profile, and the
// normal backup restore control. No account, personal material, or live AI call.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { build, preview } from "vite";

const root = process.cwd();
const legacyVocabularyOnly = process.env.QA_091_LEGACY_VOCAB === "1";
const artifacts = path.resolve(legacyVocabularyOnly ? ".qa/091-clock-regression" : ".qa/091-phrases");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fly-view-091-phrases-"));
fs.mkdirSync(artifacts, { recursive: true });
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"].filter(Boolean).find(fs.existsSync);
if (!browserPath) throw new Error("Chromium is required; set CHROME_PATH.");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const date = "2025-01-01T00:00:00.000Z";
const oralCard = {
  term: "switch off", meaningZh: "放松下来", sourceSentence: "After a busy day, I need a moment to switch off.",
  contextMeaning: "此处指让自己暂时不再想着忙碌的事。", usageTip: "switch off 可表示精神上放松；也可用 need time to switch off。",
  exampleEn: "A walk by the river helps me switch off.", exampleZh: "沿河散步能让我放松下来。",
};
const academicCard = {
  term: "allow for delays", meaningZh: "考虑到可能耽搁", sourceSentence: "We should allow for delays when planning a trip.",
  contextMeaning: "计划旅行时，要给可能出现的延误留出时间。", usageTip: "allow for + 可能情况；也可说 allow for extra time。",
  exampleEn: "We left early to allow for delays on the bus route.", exampleZh: "我们提早出发，预留了公交可能晚点的时间。",
};
const make = (id, title, category, textEn, summary, terms = [], textZh = "这是合成测试材料，不包含真实个人经历。") => ({
  id: `qa-phrases-${id}`, title, category, kind: "article", textEn, textZh, summary, terms,
  createdAt: date, updatedAt: date, revision: 1, source: "desktop",
});
const materials = [
  make("speaking-part1", "雅思口语｜Part 1 放松片刻（合成测试）", "ielts",
    `${oralCard.sourceSentence}\n\nPlease switch off the lamp before you leave.\n\nI keep a notebook beside the window.`,
    "Part 1 日常短问答与表达练习。", [oralCard, { term: "notebook", meaningZh: "笔记本" }]),
  make("speaking-part2", "雅思口语｜Part 2 日常技能（合成测试）", "ielts", "Describe a skill you would like to learn.", "Part 2 话题陈述。"),
  make("speaking-part3", "雅思口语｜Part 3 学习观点（合成测试）", "ielts", "How can people learn a new skill?", "Part 3 观点讨论。"),
  make("reading-completion", "雅思阅读｜旅行计划与证据（合成测试）", "ielts", `${academicCard.sourceSentence}\n\nComplete each sentence with one word from the passage.`, "句子填空练习。", [academicCard]),
  make("reading-judgment", "雅思阅读｜观察记录（合成测试）", "ielts", "A notebook can record a short observation. TRUE / FALSE / NOT GIVEN", "判断题练习。"),
  make("reading-matching", "雅思阅读｜城市活动（合成测试）", "ielts", "Match the information to paragraphs A and B.", "段落信息匹配题。"),
  make("interview-introduction", "求职面试｜自我介绍（合成测试）", "interview", "Could you introduce yourself briefly?", "自我介绍练习。"),
  make("interview-questions", "求职面试｜通用问答（合成测试）", "interview", "What is one of your strengths?", "通用问题练习。"),
  make("interview-behavior", "求职面试｜行为与情境（合成测试）", "interview", "Tell me about a time you learned something new.", "STAR 行为题练习。"),
];
const backupPath = path.join(profile, "synthetic-backup.json");
fs.writeFileSync(backupPath, JSON.stringify({ format: "fly-view-learning-backup", schemaVersion: 1,
  exportedAt: date, materials, memories: [], messages: [], legacyStorage: {} }));
let browser, vite, ws, cdp, evaluate;
let phase = "startup";
const checks = [], errors = [], screenshots = [];
let buildSources;
async function until(label, predicate, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await predicate()) return; } catch {} await sleep(75); }
  throw new Error(`Timed out: ${label}`);
}
try {
  // A private build snapshot prevents concurrent development HMR from resetting
  // navigation during acceptance. It does not touch apps/reader/dist.
  const buildConfig = { configFile: path.join(root, "apps/reader/vite.config.ts"), root: path.join(root, "apps/reader"),
    build: { outDir: path.join(profile, "app-build"), emptyOutDir: true }, logLevel: "error" };
  const sourceFiles = ["apps/reader/src/App.tsx", "apps/reader/src/components/PersonalWorkspace.tsx", "apps/reader/src/lib/phraseCards.ts", "apps/reader/src/lib/materialClassification.ts"];
  const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
  buildSources = sourceHashes();
  await build(buildConfig);
  assert.deepEqual(sourceHashes(), buildSources, "Source changed during the build; retry against a stable snapshot");
  vite = await preview({ ...buildConfig, preview: { host: "127.0.0.1", port: 0, strictPort: false } });
  const appUrl = `http://127.0.0.1:${vite.httpServer.address().port}/`;
  browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  await until("isolated browser", () => fs.existsSync(path.join(profile, "DevToolsActivePort")));
  const port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push({ phase, detail: message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text });
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push({ phase, detail: message.params.args.map(arg => arg.value || arg.description).join(" ") });
    const job = pending.get(message.id);
    if (job) { pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result); }
  });
  cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 25000) });
    ws.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const click = async selector => assert.ok(await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); e?.scrollIntoView({block:'center'}); e?.click(); return Boolean(e)})()`), `Missing ${selector}`);
  const textButton = async (label, scope = "body") => assert.ok(await evaluate(`(() => {const e=Array.from(document.querySelector(${JSON.stringify(scope)})?.querySelectorAll('button')||[]).find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));e?.scrollIntoView({block:'center'});e?.click();return Boolean(e)})()`), `Missing ${label}`);
  const view = name => until(`view ${name}`, () => evaluate(`document.querySelector('[data-app-view]')?.dataset.appView===${JSON.stringify(name)} && !document.documentElement.dataset.transitionKind`));
  const nav = async (label, target) => { await textButton(label, "nav[aria-label='主导航']"); await view(target); };
  const count = number => until(`${number} filtered materials`, () => evaluate(`document.querySelectorAll('.fv-material-card').length===${number}`));
  const screenshot = async name => {
    await sleep(200);
    const overflow = await evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth");
    assert.ok(overflow <= 1, `${name} overflow ${overflow}`);
    const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifacts, `${name}.png`), Buffer.from(shot.data, "base64"));
    checks.push({ name, horizontalOverflow: overflow }); screenshots.push(`${name}.png`);
  };
  const lookupText = () => evaluate("document.querySelector('[aria-label=单词释义]')?.textContent || ''");
  const assertCard = async card => {
    await until(`card ${card.term}`, () => evaluate(`document.querySelector('[aria-label=单词释义] h2')?.textContent===${JSON.stringify(card.term)}`));
    const text = await lookupText();
    for (const value of ["在这句话里", "平时怎么用", card.contextMeaning, card.usageTip, card.sourceSentence, card.exampleEn, card.exampleZh]) assert.ok(text.includes(value), `Card omitted ${value}`);
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const actual=window.fetch.bind(window); window.__qaExternalRequests=0; window.fetch=(input,init)=>{const url=typeof input==='string'?input:input.url; if(/^https?:/.test(url)&&!url.startsWith(location.origin)){window.__qaExternalRequests++; return Promise.resolve(new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));} return actual(input,init);}; })();` });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url: appUrl }); await view("home");

  if (legacyVocabularyOnly) {
    phase = "existing vocabulary and clock-skew regression";
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "scripts/qa-vocab-study-ux-cdp.mjs")], {
        cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CDP_ENDPOINT: `http://127.0.0.1:${port}/json`, QA_APP_URL: appUrl,
          QA_SCREENSHOT_DIR: path.join(artifacts, "legacy-screenshots") },
      });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
      child.on("error", reject); child.on("exit", code => resolve({ code, output }));
    });
    fs.writeFileSync(path.join(artifacts, "legacy-vocab-study-ux.log"), result.output);
    assert.equal(result.code, 0, "Existing vocabulary regression failed; see legacy-vocab-study-ux.log");
    const legacy = JSON.parse(result.output);
    assert.equal(legacy.ok, true);
    checks.push({ name: "legacy-vocab-study-ux-and-clock-skew", passed: true, checks: legacy.checks });
  } else {
  phase = "normal backup import";
  await nav("我的", "settings");
  await evaluate("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent.includes('备份与恢复'))?.click()");
  const doc = await cdp("DOM.getDocument");
  const node = await cdp("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[aria-label='选择飞阅学习备份']" });
  assert.ok(node.nodeId, "Backup file input is available");
  await cdp("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [backupPath] });
  await until("nine materials restored", () => evaluate("document.body.textContent.includes('已恢复 9 篇材料')"));
  await cdp("Page.reload"); await view("home"); await nav("材料", "library"); await count(9);
  checks.push({ name: "synthetic-backup-import-through-ui", materials: 9 });

  phase = "category discovery";
  await textButton("求职面试", ".fv-library-directions"); await count(3);
  await textButton("自我介绍", ".fv-library-facets"); await count(1);
  assert.ok(await evaluate("document.querySelector('.fv-material-card h2').textContent.includes('自我介绍')"));
  await textButton("重置筛选"); await count(9);
  await textButton("雅思英语", ".fv-library-directions"); await count(6);
  await textButton("阅读", ".fv-library-facets"); await count(3);
  await textButton("匹配题", ".fv-library-topics"); await count(1);
  assert.ok(await evaluate("document.querySelector('.fv-material-card h2').textContent.includes('城市活动')"));
  await textButton("口语", ".fv-library-facets"); await count(3);
  await textButton("Part 1", ".fv-library-topics"); await count(1);
  assert.ok(await evaluate("document.querySelector('.fv-material-card h2').textContent.includes('Part 1')"));
  await evaluate("window.scrollTo(0,0)"); await screenshot("mobile-classification");
  await click(".fv-material-main"); await view("reader");
  if (!await evaluate("document.querySelector('.readerPanel').textContent.includes('switch off')")) await click("[aria-label='切换阅读语言']");
  await until("English reader", () => evaluate("document.querySelector('.readerPanel').textContent.includes('switch off')"));
  checks.push({ name: "category-interview-ielts-reading-speaking-filters", passed: true });

  phase = "authored oral phrase";
  const marks = await evaluate("Array.from(document.querySelectorAll('.readerPanel .wordToken')).filter(e=>e.textContent==='switch').map(e=>e.classList.contains('fv-phrase-mark'))");
  assert.deepEqual(marks, [true, false], "Only the annotated source sentence receives a phrase underline");
  await screenshot("mobile-underlined-reader");
  await click(".readerPanel .wordToken.fv-phrase-mark[aria-label='查看表达 switch off 的用法']");
  await assertCard(oralCard); await screenshot("mobile-oral-card");
  await click("[aria-label='加入词本']"); await until("saved oral card", () => evaluate("Boolean(document.querySelector('[aria-label=已加入词本]'))"));
  await click("[aria-label='单词释义'] .closeButton");
  checks.push({ name: "oral-card-source-meaning-usage-transfer-example-save", passed: true });

  phase = "ordinary and same-spelling occurrence isolation";
  await evaluate("Array.from(document.querySelectorAll('.readerPanel .wordToken')).filter(e=>e.textContent==='switch')[1].click()");
  await until("ordinary lookup", () => evaluate("Boolean(document.querySelector('[aria-label=单词释义]'))"));
  assert.equal(await evaluate("Boolean(document.querySelector('.fv-phrase-context,.fv-phrase-usage'))"), false, "Unannotated occurrence cannot show authored phrase card");
  const literalLookup = await lookupText();
  for (const value of [oralCard.contextMeaning, oralCard.usageTip, oralCard.exampleZh]) assert.ok(!literalLookup.includes(value), "A different sentence reused the authored card");
  const literalMeaning = await evaluate("document.querySelector('[aria-label=单词释义] .dictionaryTranslation')?.textContent || ''");
  assert.ok(!literalMeaning.includes(oralCard.meaningZh), "An unannotated literal occurrence reused the authored dictionary meaning");
  checks.push({ name: "unannotated-switch-occurrence", heading: await evaluate("document.querySelector('[aria-label=单词释义] h2').textContent"), dictionaryMeaning: literalMeaning, passed: true });
  await click("[aria-label='单词释义'] .closeButton");
  await evaluate("Array.from(document.querySelectorAll('.readerPanel .wordToken')).find(e=>e.textContent==='notebook').click()");
  await until("ordinary notebook", () => evaluate("document.querySelector('[aria-label=单词释义] h2')?.textContent==='notebook'"));
  assert.ok((await lookupText()).includes("笔记本"));
  assert.equal(await evaluate("Boolean(document.querySelector('.fv-phrase-context,.fv-phrase-usage'))"), false);
  await click("[aria-label='单词释义'] .closeButton");
  checks.push({ name: "ordinary-word-lookup-remains-normal", passed: true });

  phase = "authored academic phrase";
  await click("[aria-label='返回书库']"); await view("library");
  await textButton("雅思英语", ".fv-library-directions"); await textButton("阅读", ".fv-library-facets");
  await textButton("填空与简答", ".fv-library-topics"); await count(1);
  await click(".fv-material-main"); await view("reader");
  await click(".readerPanel .wordToken.fv-phrase-mark[aria-label='查看表达 allow for delays 的用法']");
  await assertCard(academicCard); await screenshot("mobile-academic-card");
  await click("[aria-label='加入词本']"); await until("saved academic card", () => evaluate("Boolean(document.querySelector('[aria-label=已加入词本]'))"));
  await click("[aria-label='单词释义'] .closeButton");
  checks.push({ name: "academic-card-source-meaning-usage-transfer-example-save", passed: true });

  phase = "refresh and actual review";
  await cdp("Page.reload"); await view("home"); await nav("复习", "vocab");
  await until("two saved expressions due", () => evaluate("document.querySelector('.vocabPlanHero h2')?.textContent==='2 个待复习'"));
  await until("review ready", () => evaluate("document.querySelector('.vocabStartButton')?.disabled===false"));
  await click(".vocabStartButton");
  for (let i = 0; i < 2; i++) {
    await until("review quiz", () => evaluate("Boolean(document.querySelector('.flashQuiz'))"));
    const term = await evaluate("document.querySelector('.flashCard h2').textContent");
    const card = [oralCard, academicCard].find(item => item.term === term);
    assert.ok(card, `Unexpected review term ${term}`);
    await textButton("看答案", ".flashQuiz"); await click(".flashMoreDetails summary");
    const answer = await evaluate("document.querySelector('.flashAnswer').textContent");
    for (const value of [card.contextMeaning, card.usageTip, card.exampleEn, card.exampleZh]) assert.ok(answer.includes(value), `Refresh lost review field ${value}`);
    await evaluate("document.querySelector('.fv-phrase-usage')?.scrollIntoView({block:'center'})");
    await screenshot(`mobile-review-${i + 1}`);
    await textButton("记得", ".flashRatingActions");
  }
  await until("review completion", () => evaluate("!document.querySelector('.flashQuiz') && !document.querySelector('.flashAnswer')"));
  checks.push({ name: "save-refresh-review-two-complete-cards", passed: true });
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const report = { ok: true, profile: "isolated temporary Chromium", fixture: legacyVocabularyOnly ? "existing synthetic vocabulary fixtures" : "nine synthetic materials through normal backup restore", viewport: "390x844", externalServices: "blocked; no account or AI used", buildSources, errors, checks, screenshots };
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  fs.rmSync(path.join(artifacts, "failure.png"), { force: true });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  let ui;
  try { ui = await evaluate?.("({view:document.querySelector('[data-app-view]')?.dataset.appView,headings:Array.from(document.querySelectorAll('h1,h2,h3')).map(e=>e.textContent),alerts:Array.from(document.querySelectorAll('[role=alert]')).map(e=>e.textContent)})"); } catch {}
  try { const shot = await cdp?.("Page.captureScreenshot", { format: "png" }); if (shot) fs.writeFileSync(path.join(artifacts, "failure.png"), Buffer.from(shot.data, "base64")); } catch {}
  const report = { ok: false, phase, error: error.stack || String(error), ui, errors, checks, screenshots };
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2)); console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
} finally {
  ws?.close(); browser?.kill(); await vite?.close();
  if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith("fly-view-091-phrases-")) throw new Error("Unexpected profile cleanup path");
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
