import type { UserDailyActivity } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const STREAK_LOOKBACK_DAYS = 400;

export type DailyActivityDeltas = {
  userId: string;
  seenDelta?: number;
  correctDelta?: number;
  wrongDelta?: number;
  completedDelta?: number;
  studySecondsDelta?: number;
};

export type SerializedDailyActivity = {
  id: string;
  userId: string;
  date: string;
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  completedCount: number;
  studySeconds: number;
  isGoalCompleted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Today at UTC midnight (date-only, no time component). */
export function getTodayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeDelta(value: number | undefined): number {
  const delta = value ?? 0;
  if (!Number.isInteger(delta) || delta < 0) {
    throw new Error('Delta values must be non-negative integers');
  }
  return delta;
}

export function isDayActive(activity: {
  seenCount: number;
  correctCount: number;
  wrongCount: number;
  completedCount: number;
}): boolean {
  return (
    activity.seenCount +
      activity.correctCount +
      activity.wrongCount +
      activity.completedCount >
    0
  );
}

export function serializeDailyActivity(activity: UserDailyActivity): SerializedDailyActivity {
  return {
    id: activity.id,
    userId: activity.userId,
    date: formatDateOnly(activity.date),
    seenCount: activity.seenCount,
    correctCount: activity.correctCount,
    wrongCount: activity.wrongCount,
    completedCount: activity.completedCount,
    studySeconds: activity.studySeconds,
    isGoalCompleted: activity.isGoalCompleted,
    isActive: isDayActive(activity),
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

export function calculateCurrentStreak(
  activitiesByDate: Map<string, UserDailyActivity>,
  today: Date = getTodayDateOnly(),
): number {
  const todayKey = formatDateOnly(today);
  const todayRecord = activitiesByDate.get(todayKey);
  let cursor =
    todayRecord && isDayActive(todayRecord) ? today : addDays(today, -1);

  let streak = 0;
  while (true) {
    const key = formatDateOnly(cursor);
    const record = activitiesByDate.get(key);
    if (!record || !isDayActive(record)) {
      break;
    }
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export async function incrementDailyActivity(deltas: DailyActivityDeltas) {
  const {
    userId,
    seenDelta,
    correctDelta,
    wrongDelta,
    completedDelta,
    studySecondsDelta,
  } = deltas;

  const seen = normalizeDelta(seenDelta);
  const correct = normalizeDelta(correctDelta);
  const wrong = normalizeDelta(wrongDelta);
  const completed = normalizeDelta(completedDelta);
  const studySeconds = normalizeDelta(studySecondsDelta);

  const date = getTodayDateOnly();

  return prisma.userDailyActivity.upsert({
    where: {
      userId_date: {
        userId,
        date,
      },
    },
    create: {
      userId,
      date,
      seenCount: seen,
      correctCount: correct,
      wrongCount: wrong,
      completedCount: completed,
      studySeconds,
    },
    update: {
      seenCount: { increment: seen },
      correctCount: { increment: correct },
      wrongCount: { increment: wrong },
      completedCount: { increment: completed },
      studySeconds: { increment: studySeconds },
    },
  });
}

function buildActivitiesMap(activities: UserDailyActivity[]) {
  const map = new Map<string, UserDailyActivity>();
  for (const activity of activities) {
    map.set(formatDateOnly(activity.date), activity);
  }
  return map;
}

function emptyDayActivity(userId: string, date: Date): SerializedDailyActivity {
  const dateKey = formatDateOnly(date);
  return {
    id: '',
    userId,
    date: dateKey,
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    completedCount: 0,
    studySeconds: 0,
    isGoalCompleted: false,
    isActive: false,
    createdAt: '',
    updatedAt: '',
  };
}

export async function getDailySummary(userId: string) {
  const today = getTodayDateOnly();
  const last7DaysStart = addDays(today, -6);
  const streakLookbackStart = addDays(today, -STREAK_LOOKBACK_DAYS);

  const activities = await prisma.userDailyActivity.findMany({
    where: {
      userId,
      date: { gte: streakLookbackStart },
    },
    orderBy: { date: 'desc' },
  });

  const activitiesByDate = buildActivitiesMap(activities);
  const currentStreak = calculateCurrentStreak(activitiesByDate, today);

  const todayKey = formatDateOnly(today);
  const todayRecord = activitiesByDate.get(todayKey);
  const todayActivity = todayRecord
    ? serializeDailyActivity(todayRecord)
    : emptyDayActivity(userId, today);

  const last7Days: SerializedDailyActivity[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    const key = formatDateOnly(day);
    const record = activitiesByDate.get(key);
    last7Days.push(record ? serializeDailyActivity(record) : emptyDayActivity(userId, day));
  }

  return {
    today: todayActivity,
    currentStreak,
    last7Days,
  };
}
