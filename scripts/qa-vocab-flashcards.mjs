import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const store = fs.readFileSync("apps/reader/src/lib/vocabStore.ts", "utf8");

const checks = [
  ["flash review state", app.includes("flashReviewActive") && app.includes("flashReviewRevealed")],
  ["start review action", app.includes("开始复习") && app.includes("快闪背词")],
  ["three review outcomes", app.includes('"again"') && app.includes('"fuzzy"') && app.includes('"remembered"')],
  ["SM2 style fields", store.includes("familiarity") && store.includes("easeFactor") && store.includes("intervalDays")],
  ["question source vocabulary", store.includes("sourceQuestionId") && store.includes('sourceType: "manual" | "question"')],
  ["daily completion hook", app.includes("recordDailyCompletion(1)")],
  ["source metadata on card", app.includes("sourceDomain") && app.includes("sourceExamId")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
