import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const questionStore = fs.readFileSync("apps/reader/src/lib/questionBank.ts", "utf8");
const sample = JSON.parse(fs.readFileSync("samples/question-bank/public-sample.questions.json", "utf8"));

const sampleHasSingle = sample.questions.some((question) => question.questionType === "single");
const sampleHasMultiple = sample.questions.some((question) => question.questionType === "multiple");

const checks = [
  ["main nav questions", app.includes('{ view: "questions", label: "刷题"')],
  ["five modes", ["看题", "顺序练习", "错题", "收藏题", "模拟考试"].every((label) => app.includes(label))],
  ["question dashboard", app.includes("questionDashboardHero") && app.includes("questionModeCards") && app.includes("专项练习")],
  ["independent question session", app.includes("questionSessionTopbar") && app.includes("hideNav: true")],
  ["browse mode answer", app.includes('variant === "browse"') && app.includes("标记已看") && app.includes("确认答对")],
  ["answer reveal before next", app.includes("setSubmittedQuestionIds") && app.includes("setRevealedQuestionId(question.questionId)")],
  ["stable question session", app.includes("questionSessionIds") && app.includes("questionSessionAnswers")],
  ["unknown button", app.includes("markQuestionUnknown") && app.includes(">不会<")],
  ["wrong priority", questionStore.includes("wrongPriority") && questionStore.includes("correctStreak >= 3")],
  ["exam delayed answers", app.includes("finishExam") && app.includes("examFinishedResult") && app.includes("交卷")],
  ["exam absolute countdown", app.includes("examRemainingSeconds") && app.includes("Date.parse(examStartedAt) + examMinutes * 60_000")],
  ["exam timeout submit", app.includes("remaining === 0") && app.includes("examSubmissionRef.current") && app.includes("finishExam();")],
  ["exam actual elapsed time", app.includes("elapsedMinutes") && app.includes("minutes: elapsedMinutes")],
  ["exam answers and restart", questionStore.includes("answers?: Record<string, string[]>") && app.includes("再考一次")],
  ["resume first unanswered", app.includes("!progressForQuestion(questionProgress, question.questionId).lastAnsweredAt") && app.includes('startPractice("practice", true)')],
  ["language toggle", app.includes("setQuestionLanguage") && app.includes("questionLanguage === \"zh\"")],
  ["question lookup", app.includes("InlineQuestionText") && app.includes("lookupQuestionText")],
  ["global question lookup sheet", app.includes("function renderLookupSheet()") && app.includes("{renderLookupSheet()}")],
  ["question option word events", app.includes("event.stopPropagation()") && app.includes('role="button"')],
  ["question vocab source", app.includes('sourceType: activeLookup.questionSource ? "question" : "manual"')],
  ["sample single and multiple", sampleHasSingle && sampleHasMultiple]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
