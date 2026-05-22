import {
  findDailyActivitiesSince,
  upsertDailyActivityIncrement,
} from '../db/repositories.js';

const STREAK_LOOKBACK_DAYS = 400;

/** Today at UTC midnight (date-only, no time component). */
export function getTodayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeDelta(value) {
  const delta = value ?? 0;
  if (!Number.isInteger(delta) || delta < 0) {
    throw new Error('Delta values must be non-negative integers');
  }
  return delta;
}

export function isDayActive(activity) {
  return (
    activity.seenCount +
      activity.correctCount +
      activity.wrongCount +
      activity.completedCount >
    0
  );
}

export function serializeDailyActivity(activity) {
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

export function calculateCurrentStreak(activitiesByDate, today = getTodayDateOnly()) {
  const todayKey = formatDateOnly(today);
  const todayRecord = activitiesByDate.get(todayKey);
  let cursor = todayRecord && isDayActive(todayRecord) ? today : addDays(today, -1);

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

export async function incrementDailyActivity(deltas) {
  const {
    userId,
    seenDelta,
    correctDelta,
    wrongDelta,
    completedDelta,
    studySecondsDelta,
  } = deltas;

  return upsertDailyActivityIncrement({
    userId,
    date: getTodayDateOnly(),
    seenDelta: normalizeDelta(seenDelta),
    correctDelta: normalizeDelta(correctDelta),
    wrongDelta: normalizeDelta(wrongDelta),
    completedDelta: normalizeDelta(completedDelta),
    studySecondsDelta: normalizeDelta(studySecondsDelta),
  });
}

function buildActivitiesMap(activities) {
  const map = new Map();
  for (const activity of activities) {
    map.set(formatDateOnly(activity.date), activity);
  }
  return map;
}

function emptyDayActivity(userId, date) {
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

export async function getDailySummary(userId) {
  const today = getTodayDateOnly();
  const streakLookbackStart = addDays(today, -STREAK_LOOKBACK_DAYS);

  const activities = await findDailyActivitiesSince(userId, streakLookbackStart);
  const activitiesByDate = buildActivitiesMap(activities);
  const currentStreak = calculateCurrentStreak(activitiesByDate, today);

  const todayKey = formatDateOnly(today);
  const todayRecord = activitiesByDate.get(todayKey);
  const todayActivity = todayRecord
    ? serializeDailyActivity(todayRecord)
    : emptyDayActivity(userId, today);

  const last7Days = [];
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
