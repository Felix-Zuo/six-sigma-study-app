export type DailyStudyStats = {
  planVersion: number;
  day: string;
  baseGoal: number;
  goal: number;
  completed: number;
  streak: number;
  missedDays: number;
  checkedInToday: boolean;
  lastCheckInDate?: string;
  updatedAt: string;
};

const storageKey = "six-sigma-study:daily-streak:v1";
const currentPlanVersion = 2;
const defaultBaseGoal = 20;
const maxCatchUpExtra = 12;
const dayMs = 24 * 60 * 60 * 1000;

function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayDiff(from: string | undefined, to: string): number {
  if (!from) {
    return 0;
  }
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const diff = Math.round((toDate.getTime() - fromDate.getTime()) / dayMs);
  return Number.isFinite(diff) ? diff : 0;
}

function toSafeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function normalizeDailyStats(input: Partial<DailyStudyStats> | null | undefined, now = new Date()): DailyStudyStats {
  const today = localDayKey(now);
  const storedPlanVersion = toSafeNumber(input?.planVersion, 0);
  const storedBaseGoal = toSafeNumber(input?.baseGoal, defaultBaseGoal);
  const migratingLegacyEightWordPlan = storedPlanVersion < currentPlanVersion && storedBaseGoal === 8;
  const baseGoal = Math.max(1, Math.min(40,
    migratingLegacyEightWordPlan ? defaultBaseGoal : storedBaseGoal
  ));
  const storedDay = typeof input?.day === "string" ? input.day : today;
  const lastCheckInDate = typeof input?.lastCheckInDate === "string" ? input.lastCheckInDate : undefined;
  const daysSinceCheckIn = dayDiff(lastCheckInDate, today);
  const missedDays = Math.max(0, daysSinceCheckIn - 1);
  const catchUpExtra = Math.min(maxCatchUpExtra, missedDays * 2);
  const calculatedGoal = baseGoal + catchUpExtra;
  const isToday = storedDay === today;
  const checkedInToday = lastCheckInDate === today;
  const storedGoal = migratingLegacyEightWordPlan ? calculatedGoal : toSafeNumber(input?.goal, calculatedGoal);
  const goal = isToday
    ? Math.max(1, Math.min(calculatedGoal, storedGoal))
    : calculatedGoal;

  return {
    planVersion: currentPlanVersion,
    day: today,
    baseGoal,
    goal,
    completed: isToday ? Math.min(toSafeNumber(input?.completed, 0), goal) : 0,
    streak: missedDays > 0 && !checkedInToday ? 0 : toSafeNumber(input?.streak, 0),
    missedDays,
    checkedInToday,
    lastCheckInDate,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : now.toISOString()
  };
}

export function updateDailyBaseGoal(
  stats: DailyStudyStats,
  requestedGoal: number,
  now = new Date()
): DailyStudyStats {
  const current = normalizeDailyStats(stats, now);
  const baseGoal = Math.max(10, Math.min(40, Math.round(requestedGoal / 10) * 10));
  const catchUpExtra = Math.min(maxCatchUpExtra, current.missedDays * 2);
  return normalizeDailyStats({
    ...current,
    planVersion: currentPlanVersion,
    baseGoal,
    goal: baseGoal + catchUpExtra
  }, now);
}

export function loadDailyStats(now = new Date()): DailyStudyStats {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return normalizeDailyStats(undefined, now);
    }
    const parsed = JSON.parse(raw) as Partial<DailyStudyStats>;
    const normalized = normalizeDailyStats(parsed, now);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      persistDailyStats(normalized);
    }
    return normalized;
  } catch {
    return normalizeDailyStats(undefined, now);
  }
}

export function persistDailyStats(stats: DailyStudyStats): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stats));
  } catch {
    // Offline study remains usable if private browsing blocks storage.
  }
}

export function recordDailyReviewCompletion(
  stats: DailyStudyStats,
  count = 1,
  now = new Date(),
  sessionGoal?: number
): DailyStudyStats {
  const current = normalizeDailyStats(stats, now);
  const targetGoal = typeof sessionGoal === "number" && Number.isFinite(sessionGoal)
    ? Math.max(1, Math.min(current.goal, Math.round(sessionGoal)))
    : current.goal;
  const completed = Math.min(targetGoal, current.completed + Math.max(1, count));
  if (completed < targetGoal || current.checkedInToday) {
    return {
      ...current,
      goal: targetGoal,
      completed,
      updatedAt: now.toISOString()
    };
  }

  const yesterday = localDayKey(new Date(now.getTime() - dayMs));
  const continues = current.lastCheckInDate === yesterday;
  return {
    ...current,
    goal: targetGoal,
    completed,
    checkedInToday: true,
    streak: continues ? current.streak + 1 : 1,
    missedDays: 0,
    lastCheckInDate: current.day,
    updatedAt: now.toISOString()
  };
}

export function resetDailyStatsForTests(): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Test helper only.
  }
}
