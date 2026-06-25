import fs from "node:fs";

const store = fs.readFileSync("apps/reader/src/lib/streakStore.ts", "utf8");
const app = fs.readFileSync("apps/reader/src/App.tsx", "utf8");

const checks = [
  ["storage key", store.includes("six-sigma-study:daily-streak:v1")],
  ["base goal", store.includes("defaultBaseGoal = 8")],
  ["catch-up cap", store.includes("maxCatchUpExtra = 12")],
  ["missed days", store.includes("missedDays") && store.includes("daysSinceCheckIn - 1")],
  ["auto check-in", store.includes("checkedInToday: true") && store.includes("lastCheckInDate: current.day")],
  ["home status", app.includes("今日目标") && app.includes("连续天数")],
  ["vocab status", app.includes("完成目标后自动打卡")]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed: failed.map(([name]) => name) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: checks.map(([name]) => name) }, null, 2));
