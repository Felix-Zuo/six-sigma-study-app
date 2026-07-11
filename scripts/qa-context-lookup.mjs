import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const context = fs.readFileSync("apps/reader/src/lib/contextLookup.ts", "utf8");
const vocab = fs.readFileSync("apps/reader/src/lib/vocabStore.ts", "utf8");

const checks = [
  ["context resolver", context.includes("resolveContextExplanation")],
  ["scope project sense", context.includes('meaning: "范围；项目边界"') && context.includes("project|problem")],
  ["statistics senses", ["yield", "population", "sample", "capability"].every((term) => context.includes(`${term}:`))],
  ["active lookup query", app.includes("query: string") && app.includes("activeLookup.query")],
  ["question bilingual context", app.includes("question.stem.zh") && app.includes("option.zh")],
  ["manual parallel context", app.includes("sourceTranslation") && app.includes("proportionalIndex")],
  ["context card", app.includes("本句中的意思") && app.includes("dictionaryDetails")],
  ["saved context fields", ["contextMeaning", "contextExplanation", "exampleTranslation"].every((field) => vocab.includes(field))]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
