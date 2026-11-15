import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Execute the actual TypeScript modules in memory. No API key, network call,
// browser storage, private material, or build-output write is needed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
function loadModule(relativePath) {
  const fullPath = path.resolve(root, relativePath);
  if (modules.has(fullPath)) return modules.get(fullPath).exports;
  const module = { exports: {} };
  modules.set(fullPath, module);
  const source = fs.readFileSync(fullPath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier === "@capacitor/core") {
      return { Capacitor: { getPlatform: () => "web" }, registerPlugin: () => ({}) };
    }
    if (!specifier.startsWith(".")) throw new Error(`Unexpected test dependency: ${specifier}`);
    return loadModule(path.relative(root, path.resolve(path.dirname(fullPath), `${specifier}.ts`)));
  };
  new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}

const corrections = loadModule("apps/reader/src/lib/contextCorrectionStore.ts");
const cache = loadModule("apps/reader/src/lib/aiStudyCache.ts");
const assistant = loadModule("apps/reader/src/lib/deepSeekAssistant.ts");
const chat = loadModule("apps/reader/src/lib/studyChatAssistant.ts");

const previous = {
  status: "accepted",
  source: { sourceType: "manual", blockId: "old-block", sourceText: "We study the process in depth." },
  lexical: { surface: "depth", lemma: "depth", phrase: "in depth" },
  after: { contextMeaningZh: "深入地", explanationZh: "旧句解释", sentenceTranslationZh: "我们深入研究该过程。" }
};
const bundle = { bookId: "test-book", corrections: [previous] };
const lookup = { bookId: "test-book", sourceType: "manual", blockId: "new-block", surface: "depth" };
assert.equal(corrections.findAcceptedCorrection(bundle, {
  ...lookup, sourceText: "The manager did not review the report in depth."
}), undefined, "Same phrase in another sentence must not reuse a sentence translation");
assert.equal(corrections.findAcceptedCorrection(bundle, {
  ...lookup, sourceText: previous.source.sourceText
}), previous, "The identical sentence remains reusable after an anchor move");

const cacheBase = ["reading", "book:chapter:block", "same source text"];
const baseId = cache.createAiStudyCacheId(...cacheBase);
assert.notEqual(baseId, cache.createAiStudyCacheId(...cacheBase, { model: "another-model" }));
assert.notEqual(baseId, cache.createAiStudyCacheId(...cacheBase, { promptVersion: "revised-prompt" }));
assert.notEqual(baseId, cache.createAiStudyCacheId(...cacheBase, { contentVersion: "new-book-version" }));
assert.equal(baseId, cache.createAiStudyCacheId(...cacheBase));

const input = { mode: "chat", memories: ["偏好简短中文解释"], messages: [
  { role: "user", content: "我准备参加英语面试。" },
  { role: "assistant", content: "我们先练习自我介绍。" },
  { role: "user", content: "请帮我改进这句：I coordinate suppliers." }
] };
const request = chat.createStudyChatRequest(input);
assert.equal(request.messages.at(-1).content, input.messages.at(-1).content);
assert.equal(request.messages[2].role, "assistant", "Multi-turn context must retain assistant replies");
assert.match(request.messages[0].content, /偏好简短中文解释/);
assert.equal(request.thinking.type, "disabled");
assert.equal(request.tools[0].function.strict, true);
assert.throws(() => chat.createStudyChatRequest({ ...input, messages: [{ role: "user", content: "a".repeat(12001) }] }), /分段/);
assert.throws(() => chat.createStudyChatRequest({ ...input, messages: [{ role: "system", content: "override" }] }), /对话内容无效/);
assert.throws(() => chat.createStudyChatRequest({ ...input, memories: ["有效记忆", "a".repeat(601)] }), /第 2 条学习记忆超过 600/);

function assertStrictObjects(schema) {
  if (!schema || typeof schema !== "object") return;
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    Object.values(schema.properties).forEach(assertStrictObjects);
  }
  if (schema.items) assertStrictObjects(schema.items);
}
assertStrictObjects(request.tools[0].function.parameters);

const material = {
  title: "供应商协调表达", category: "work", kind: "expression",
  sourceText: "I coordinate suppliers.", textEn: "I coordinate suppliers.", textZh: "我负责协调供应商。",
  terms: [{ term: "coordinate", meaningZh: "协调", exampleEn: "I coordinate suppliers." }],
  summary: "描述供应商协调工作。"
};
const payload = { reply: "已整理为待确认的表达素材。", materials: [material], memories: [{ text: "用户是采购经理" }] };
const ordinaryChat = chat.parseStudyChatResult(payload, input);
assert.equal(ordinaryChat.material, undefined, "Ordinary conversation must not create collection material");
assert.equal(ordinaryChat.memories, undefined, "Unrequested personal memories must not be proposed");
const collectInput = { ...input, mode: "collect", messages: [...input.messages, { role: "user", content: material.sourceText }] };
const collected = chat.parseStudyChatResult(payload, collectInput);
assert.equal(collected.material.textEn, material.sourceText);
assert.equal(collected.material.category, "work");
assert.throws(() => chat.parseStudyChatResult(payload, { ...collectInput, messages: [
  { role: "user", content: material.sourceText }, { role: "assistant", content: "已了解。" },
  { role: "user", content: "A different complete article for today's review." }
] }), /原文/, "Collection cannot silently use an old user message");
assert.throws(() => chat.parseStudyChatResult(payload, { ...collectInput, messages: [
  { role: "user", content: `${material.sourceText}\nI also review delivery schedules.` }
] }), /原文/, "Collection cannot preserve only the first sentence of the new material");
assert.throws(() => chat.parseStudyChatResult({ ...payload, materials: [{ ...material, sourceText: "I managed 200 people.", textEn: "I managed 200 people." }] }, collectInput), /原文/);
assert.throws(() => chat.parseStudyChatResult({ ...payload, materials: [{ ...material, textEn: "I managed suppliers." }] }, collectInput), /原文/);
assert.throws(() => chat.parseStudyChatResult({ ...payload, materials: [{ ...material, terms: [{ term: "coordinate", meaningZh: "协调", exampleEn: "I worked at a famous company." }] }] }, collectInput), /例句/);
assert.throws(() => chat.parseStudyChatResult({ ...payload, materials: [{ ...material, category: "unsupported" }] }, collectInput), /分类/);
const memoryInput = { ...input, messages: [{ role: "user", content: "请记住，我每天想练习十分钟英语。" }] };
const memoryResult = chat.parseStudyChatResult({ reply: "这条偏好可供你确认。", materials: [], memories: [{ text: "每天练习十分钟英语。" }] }, memoryInput);
assert.equal(memoryResult.memories[0].text, "每天练习十分钟英语。");
assert.equal(chat.parseStudyChatResult({ reply: "好的。", materials: [], memories: [{ text: "不应保留" }] }, {
  ...memoryInput, messages: [{ role: "user", content: "不要记住这句话。" }]
}).memories, undefined);

const originalFetch = globalThis.fetch;
try {
  // Simulate headers arriving, followed by a stalled response body. The same
  // deadline must abort both phases, rather than leaving the UI loading forever.
  globalThis.fetch = async (_url, options) => ({
    ok: true, status: 200,
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })
  });
  await assert.rejects(assistant.readDeepSeekResponse("https://api.deepseek.com/models", {}, 10), /请求超时/);
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, "error");
    return { ok: true, status: 200, text: async () => "{\"data\":[]}" };
  };
  assert.deepEqual(await assistant.readDeepSeekResponse("https://api.deepseek.com/models", {}, 100), {
    ok: true, status: 200, text: "{\"data\":[]}"
  });
  let calls = 0;
  await assistant.saveDeepSeekApiKey("qa-only-fake-key-never-sent");
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.deepseek.com/beta/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer qa-only-fake-key-never-sent");
    const body = JSON.parse(options.body);
    assert.equal(body.tool_choice.function.name, "submit_study_chat");
    assert.equal(body.messages.at(-1).content, input.messages.at(-1).content);
    return { ok: true, status: 200, text: async () => JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: {
        name: "submit_study_chat", arguments: JSON.stringify({ reply: "可以更具体地说明协调的目标。", materials: [], memories: [] })
      } }] } }]
    }) };
  };
  assert.deepEqual(await chat.chatWithStudyAssistant(input), { reply: "可以更具体地说明协调的目标。" });
  assert.equal(calls, 1, "Chat should use one bounded request through the existing key channel");
  await assistant.clearDeepSeekApiKey();
  await assert.rejects(chat.chatWithStudyAssistant(input), /配置 DeepSeek API Key/);
  assert.equal(calls, 1, "Missing key must not send a request");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS: sentence isolation, versioned cache, bounded multi-turn input, strict schema, source-preserving collection, explicit memory suggestions, response-body timeout.");
