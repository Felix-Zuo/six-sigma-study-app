import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const store = fs.readFileSync("apps/reader/src/lib/vocabStore.ts", "utf8");

const checks = [
  ["flash review state", app.includes("flashReviewActive") && app.includes("flashReviewStage") && app.includes("flashSessionIds")],
  ["start review action", app.includes("开始今日学习") && app.includes("单词学习")],
  ["tested review outcomes", app.includes("想起来了") && app.includes("暂时想不起来") && app.includes('"remembered"')],
  ["SM2 style fields", store.includes("familiarity") && store.includes("easeFactor") && store.includes("intervalDays")],
  ["question source vocabulary", store.includes("sourceQuestionId") && store.includes('sourceType: "manual" | "question"')],
  ["daily completion hook", app.includes("recordDailyCompletion(1)")],
  ["source metadata on card", app.includes("sourceDomain") && app.includes("sourceExamId")],
  ["context snapshot", store.includes("contextMeaning") && store.includes("sourceTranslation") && store.includes("exampleText")],
  ["independent session", app.includes("studySessionShell") && app.includes("hideNav: true")],
  ["no list self rating", !app.includes(">模糊</button>") && !app.includes(">认识</button>")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
