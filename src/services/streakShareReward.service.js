import {
  claimStreakShareRewardTx,
  ensureUserStats,
  findDailyShareReward,
  isDuplicateEntryError,
} from '../db/repositories.js';
import { getTodayDateOnly } from './dailyReward.service.js';

export const STREAK_SHARE_REWARD_GEMS = 5;

export async function getStreakShareRewardStatus(userId) {
  const date = getTodayDateOnly();

  const [existing, stats] = await Promise.all([
    findDailyShareReward(userId, date),
    ensureUserStats(userId),
  ]);

  return {
    alreadyClaimed: existing !== null,
    rewardGems: STREAK_SHARE_REWARD_GEMS,
    totalGems: stats.gems,
  };
}

export async function claimStreakShareReward(userId) {
  const date = getTodayDateOnly();

  const existing = await findDailyShareReward(userId, date);
  if (existing) {
    return { alreadyClaimed: true };
  }

  try {
    const stats = await claimStreakShareRewardTx(userId, date, STREAK_SHARE_REWARD_GEMS);
    return {
      alreadyClaimed: false,
      awardedGems: STREAK_SHARE_REWARD_GEMS,
      totalGems: stats.gems,
    };
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      return { alreadyClaimed: true };
    }
    throw error;
  }
}
