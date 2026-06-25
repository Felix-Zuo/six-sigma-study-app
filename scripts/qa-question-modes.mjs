import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const questionStore = fs.readFileSync("apps/reader/src/lib/questionBank.ts", "utf8");
const sample = JSON.parse(fs.readFileSync("samples/question-bank/public-sample.questions.json", "utf8"));

const sampleHasSingle = sample.questions.some((question) => question.questionType === "single");
const sampleHasMultiple = sample.questions.some((question) => question.questionType === "multiple");

const checks = [
  ["main nav questions", app.includes('{ view: "questions", label: "刷题"')],
  ["four modes", ["看题", "刷题", "错题", "模拟考试"].every((label) => app.includes(label))],
  ["browse mode answer", app.includes('variant === "browse"') && app.includes("标记已看") && app.includes("确认答对")],
  ["correct auto next", app.includes("if (isCorrect)") && app.includes("moveToNextQuestion();")],
  ["unknown button", app.includes("markQuestionUnknown") && app.includes(">不会<")],
  ["wrong priority", questionStore.includes("wrongPriority") && questionStore.includes("correctStreak >= 3")],
  ["exam delayed answers", app.includes("finishExam") && app.includes("examFinishedResult") && app.includes("交卷")],
  ["language toggle", app.includes("setQuestionLanguage") && app.includes("questionLanguage === \"zh\"")],
  ["question lookup", app.includes("InlineQuestionText") && app.includes("lookupQuestionText")],
  ["question vocab source", app.includes('sourceType: activeLookup.questionSource ? "question" : "manual"')],
  ["sample single and multiple", sampleHasSingle && sampleHasMultiple]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
