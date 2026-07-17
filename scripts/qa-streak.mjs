import fs from "node:fs";

const store = fs.readFileSync("apps/reader/src/lib/streakStore.ts", "utf8");
const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");

const checks = [
  ["storage key", store.includes("six-sigma-study:daily-streak:v1")],
  ["base goal", store.includes("defaultBaseGoal = 20")],
  ["legacy eight-word migration", store.includes("storedBaseGoal === 8") && store.includes("currentPlanVersion")],
  ["adjustable daily goal", store.includes("updateDailyBaseGoal") && app.includes('aria-label="每日学习数量"')],
  ["catch-up cap", store.includes("maxCatchUpExtra = 12")],
  ["missed days", store.includes("missedDays") && store.includes("daysSinceCheckIn - 1")],
  ["auto check-in", store.includes("checkedInToday: true") && store.includes("lastCheckInDate: current.day")],
  ["home status", app.includes("今日目标") && app.includes("连续天数")],
  ["vocab status", app.includes("开始今日学习") && app.includes("今日已完成")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
