import fs from "node:fs";

const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");
const store = fs.readFileSync("apps/reader/src/lib/vocabStore.ts", "utf8");
const study = fs.readFileSync("apps/reader/src/lib/vocabStudy.ts", "utf8");
const scheduler = fs.readFileSync("apps/reader/src/lib/reviewScheduler.ts", "utf8");
const readerPackage = JSON.parse(fs.readFileSync("apps/reader/package.json", "utf8"));

const checks = [
  ["flash review state", app.includes("flashReviewActive") && app.includes("flashReviewStage") && app.includes("flashSessionIds")],
  ["start review action", app.includes("开始今日学习") && app.includes("单词学习")],
  ["direct retrieval quiz", app.includes("选择词义") && !app.includes('FlashReviewStage = "prompt"')],
  ["three tested outcomes", app.includes('"again"') && app.includes('"fuzzy"') && app.includes('"remembered"')],
  ["FSRS dependency", readerPackage.dependencies?.["ts-fsrs"] && scheduler.includes("request_retention: reviewTargetRetention")],
  ["90 percent target retention", scheduler.includes("reviewTargetRetention = 0.9")],
  ["FSRS persisted state", store.includes("schedulerVersion") && store.includes("reviewCard") && store.includes("reviewHistory")],
  ["legacy review migration", store.includes("legacySnapshot") && store.includes("normalizeReviewCard")],
  ["question source vocabulary", store.includes("sourceQuestionId") && store.includes('sourceType: "manual" | "question"')],
  ["daily completion only on first encounter", app.includes("if (isReinforcement)") && app.indexOf("recordDailyCompletion(1, flashSessionGoal || undefined)") > app.indexOf("if (isReinforcement)")],
  ["source metadata on card", app.includes("sourceDomain") && app.includes("sourceExamId")],
  ["context snapshot", store.includes("contextMeaning") && store.includes("sourceTranslation") && store.includes("exampleText")],
  ["dictionary meaning separated from context", store.includes("dictionaryMeaning") && app.includes("currentFlashDictionaryMeaning") && app.includes("flashDictionarySummary")],
  ["whole phrase lookup", study.includes("resolveDictionaryTarget") && study.includes('entryKind: "phrase"') && app.includes("resolveDictionaryTarget(")],
  ["exact source range", store.includes("sourceStart") && store.includes("sourceEnd") && store.includes("sourceOccurrence")],
  ["short marked example", app.includes("compactStudyExample") && app.includes("studyTargetTerm")],
  ["persisted AI supplement", store.includes("aiTranslation") && store.includes("aiExplanation") && app.includes("requestFlashAiSupplement")],
  ["independent session", app.includes("studySessionShell") && app.includes("hideNav: true")],
  ["same-session reinforcement", app.includes("currentFlashIsReinforcement") && app.includes("flashSessionRequeues")],
  ["interval previews", app.includes("previewTermReview") && app.includes("flashReviewPreviews?.remembered.intervalLabel")],
  ["progressive answer details", app.includes('className="flashMoreDetails"') && app.includes("<summary>更多</summary>")],
  ["overlapping distractors rejected", app.includes("quizMeaningsOverlap(answer, candidate.value)")],
  ["stored translation guarded", store.includes("isReliableStudyTranslation") && app.includes("currentFlashContext")],
  ["headerless compact session", app.includes("hideHeader: true") && app.includes("flashAnswerStatus")],
  ["session outcome summary", app.includes("flashSessionResultGrid") && app.includes("flashSessionOutcomes")],
  [
    "answer-stage memory rating",
    app.includes('className="flashRatingDock"') && app.includes('className="flashRatingActions"') &&
      app.includes('reviewSavedTerm(currentFlashTerm.id, "again")') &&
      app.includes('reviewSavedTerm(currentFlashTerm.id, "fuzzy")') &&
      app.includes('reviewSavedTerm(currentFlashTerm.id, "remembered")')
  ],
  ["due-only daily queue", app.includes("studyScopeTerms") && app.includes("isTermDue(item, now)") && app.includes("plannedFlashCount")],
  ["quiz reveal before scheduling", app.includes('setFlashReviewStage("answer")') && !app.includes('if (option === savedTermStudyMeaning(currentFlashTerm)) {\n                            reviewSavedTerm')],
  ["reachable limited daily goal", app.includes("plannedDailyGoal") && app.includes("flashSessionGoal")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
