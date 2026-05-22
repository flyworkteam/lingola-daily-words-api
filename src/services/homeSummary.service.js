import { ensureUserStats, findUserLearningProfile } from '../db/repositories.js';
import { getDailySummary } from './dailyActivity.service.js';

const DEFAULT_PROFILE = {
  currentLevel: 'A1',
  currentDifficulty: 1,
  dailyGoal: 10,
};

export async function getHomeSummary(userId) {
  const [dailySummary, profile, stats] = await Promise.all([
    getDailySummary(userId),
    findUserLearningProfile(userId),
    ensureUserStats(userId),
  ]);

  return {
    streak: dailySummary.currentStreak,
    coins: stats.coins,
    gems: stats.gems,
    xp: stats.xp,
    totalXp: stats.totalXp,
    today: {
      seenCount: dailySummary.today.seenCount,
      correctCount: dailySummary.today.correctCount,
      wrongCount: dailySummary.today.wrongCount,
      completedCount: dailySummary.today.completedCount,
      dailyGoal: profile?.dailyGoal ?? DEFAULT_PROFILE.dailyGoal,
      isGoalCompleted: dailySummary.today.isGoalCompleted,
    },
    currentLevel: profile?.currentLevel ?? DEFAULT_PROFILE.currentLevel,
    currentDifficulty: profile?.currentDifficulty ?? DEFAULT_PROFILE.currentDifficulty,
  };
}
