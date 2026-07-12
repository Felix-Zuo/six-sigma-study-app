import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const context = fs.readFileSync("apps/reader/src/lib/contextLookup.ts", "utf8");
const vocab = fs.readFileSync("apps/reader/src/lib/vocabStore.ts", "utf8");
const manual = JSON.parse(fs.readFileSync("apps/reader/public/content/manual.json", "utf8"));
const prospectGloss = manual.contextGlosses?.["calculating-sigma-level-en-003"];

const checks = [
  ["context resolver", context.includes("resolveContextExplanation")],
  ["scope project sense", context.includes('meaning: "范围；项目边界"') && context.includes("project|problem")],
  ["statistics senses", ["yield", "population", "sample", "capability"].every((term) => context.includes(`${term}:`))],
  ["function word senses", ["which", "what", "why", "how", "the"].every((term) => context.includes(`${term}:`))],
  ["safe unavailable fallback", context.includes("暂无可靠语境义") && context.includes("暂不把词典中的某一条释义硬套")],
  ["no dictionary-first context", !context.includes("firstMeaning(input.dictionaryTranslation)")],
  ["curated term priority", context.includes('rule?.meaning || alignedMeaning')],
  ["air traffic control sense", context.includes('meaning: "空中交通管制"') && context.includes("air\\s+traffic\\s+control")],
  ["regression context senses", ["distinguish", "constant", "equation"].every((term) => context.includes(`${term}: [`))],
  ["example translation selection", context.includes("selectExampleTranslation")],
  ["active lookup query", app.includes("query: string") && app.includes("activeLookup.query")],
  ["question bilingual context", app.includes("question.stem.zh") && app.includes("option.zh")],
  ["manual occurrence context", app.includes("manual.contextGlosses") && context.includes("selectAlignedSentence")],
  ["prospects context regression", prospectGloss?.sentences?.some((sentence) => sentence.meanings?.prospects === "潜在客户")],
  ["page 9 context blocks", Boolean(manual.contextGlosses?.["sigma-level-not-final-en-001"] && manual.contextGlosses?.["sigma-level-not-final-en-002"])],
  ["dictionary first context card", app.includes("词典释义") && app.includes("本句中的意思") && app.indexOf("词典释义") < app.indexOf("本句中的意思")],
  ["saved context fields", ["contextMeaning", "contextExplanation", "exampleTranslation"].every((field) => vocab.includes(field))]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
