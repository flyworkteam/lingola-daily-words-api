import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getTodayDateOnly } from './dailyReward.service.js';

export const STREAK_SHARE_REWARD_GEMS = 5;

async function ensureUserStats(userId: string) {
  return prisma.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getStreakShareRewardStatus(userId: string) {
  const date = getTodayDateOnly();

  const [existing, stats] = await Promise.all([
    prisma.userDailyShareReward.findUnique({
      where: { userId_date: { userId, date } },
    }),
    ensureUserStats(userId),
  ]);

  return {
    alreadyClaimed: existing !== null,
    rewardGems: STREAK_SHARE_REWARD_GEMS,
    totalGems: stats.gems,
  };
}

type ClaimStreakShareRewardResult =
  | { alreadyClaimed: true }
  | { alreadyClaimed: false; awardedGems: number; totalGems: number };

export async function claimStreakShareReward(
  userId: string,
): Promise<ClaimStreakShareRewardResult> {
  const date = getTodayDateOnly();

  const existing = await prisma.userDailyShareReward.findUnique({
    where: { userId_date: { userId, date } },
  });

  if (existing) {
    return { alreadyClaimed: true };
  }

  try {
    const stats = await prisma.$transaction(async (tx) => {
      await tx.userDailyShareReward.create({
        data: {
          userId,
          date,
          rewardGems: STREAK_SHARE_REWARD_GEMS,
        },
      });

      return tx.userStats.upsert({
        where: { userId },
        create: {
          userId,
          gems: STREAK_SHARE_REWARD_GEMS,
        },
        update: {
          gems: { increment: STREAK_SHARE_REWARD_GEMS },
        },
      });
    });

    return {
      alreadyClaimed: false,
      awardedGems: STREAK_SHARE_REWARD_GEMS,
      totalGems: stats.gems,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { alreadyClaimed: true };
    }
    throw error;
  }
}
