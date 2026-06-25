export type DailyStudyStats = {
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
const defaultBaseGoal = 8;
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
  const baseGoal = Math.max(1, Math.min(40, toSafeNumber(input?.baseGoal, defaultBaseGoal)));
  const storedDay = typeof input?.day === "string" ? input.day : today;
  const lastCheckInDate = typeof input?.lastCheckInDate === "string" ? input.lastCheckInDate : undefined;
  const daysSinceCheckIn = dayDiff(lastCheckInDate, today);
  const missedDays = Math.max(0, daysSinceCheckIn - 1);
  const catchUpExtra = Math.min(maxCatchUpExtra, missedDays * 2);
  const goal = baseGoal + catchUpExtra;
  const isToday = storedDay === today;
  const checkedInToday = lastCheckInDate === today;

  return {
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

export function loadDailyStats(now = new Date()): DailyStudyStats {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return normalizeDailyStats(undefined, now);
    }
    return normalizeDailyStats(JSON.parse(raw), now);
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

export function recordDailyReviewCompletion(stats: DailyStudyStats, count = 1, now = new Date()): DailyStudyStats {
  const current = normalizeDailyStats(stats, now);
  const completed = Math.min(current.goal, current.completed + Math.max(1, count));
  if (completed < current.goal || current.checkedInToday) {
    return {
      ...current,
      completed,
      updatedAt: now.toISOString()
    };
  }

  const yesterday = localDayKey(new Date(now.getTime() - dayMs));
  const continues = current.lastCheckInDate === yesterday;
  return {
    ...current,
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
