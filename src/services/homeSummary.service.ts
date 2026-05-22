import { prisma } from '../db/prisma.js';
import { getDailySummary } from './dailyActivity.service.js';

const DEFAULT_PROFILE = {
  currentLevel: 'A1',
  currentDifficulty: 1,
  dailyGoal: 10,
} as const;

export type HomeSummary = {
  streak: number;
  coins: number;
  gems: number;
  xp: number;
  totalXp: number;
  today: {
    seenCount: number;
    correctCount: number;
    wrongCount: number;
    completedCount: number;
    dailyGoal: number;
    isGoalCompleted: boolean;
  };
  currentLevel: string;
  currentDifficulty: number;
};

async function ensureUserStats(userId: string) {
  return prisma.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getHomeSummary(userId: string): Promise<HomeSummary> {
  const [dailySummary, profile, stats] = await Promise.all([
    getDailySummary(userId),
    prisma.userLearningProfile.findUnique({
      where: { userId },
      select: {
        currentLevel: true,
        currentDifficulty: true,
        dailyGoal: true,
      },
    }),
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
