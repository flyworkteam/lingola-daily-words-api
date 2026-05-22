import {
  applyDailyRewardClaims,
  ensureDailyRewardProgress,
  findDailyRewardProgress,
  findUserStats,
  incrementDailyRewardProgressRow,
} from '../db/repositories.js';

const LEARNED_THRESHOLD = 30;
const LEARNED_BASE_REWARD = 35;
const SPEAKING_THRESHOLD = 15;
const SPEAKING_BASE_REWARD = 25;
const TEST_THRESHOLD = 20;
const TEST_BASE_REWARD = 20;
const REVIEW_WORD_THRESHOLD = 20;
const REVIEW_CORRECT_THRESHOLD = 3;
const REVIEW_BASE_REWARD = 20;

const EMPTY_PROGRESS = {
  learnedWordCount: 0,
  speakingPracticeCount: 0,
  testAnswerCount: 0,
  reviewWordCount: 0,
  reviewCorrectCount: 0,
  learnedRewardClaimCount: 0,
  speakingRewardClaimCount: 0,
  testRewardClaimCount: 0,
  reviewRewardClaimCount: 0,
  earnedGems: 0,
};

export function getTodayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function normalizeAmount(value) {
  const amount = value ?? 1;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer');
  }
  return amount;
}

function getRewardAmount(baseReward, claimIndex) {
  if (claimIndex === 0) {
    return baseReward;
  }
  return Math.floor(baseReward / 5);
}

function getNextReward(baseReward, claimCount) {
  return getRewardAmount(baseReward, claimCount);
}

function computeTierClaims(totalCount, previousClaimCount, threshold, baseReward, type) {
  const newClaimCount = Math.floor(totalCount / threshold);
  const claimsToAward = newClaimCount - previousClaimCount;
  const rewards = [];
  let gems = 0;

  for (let i = 0; i < claimsToAward; i += 1) {
    const claimIndex = previousClaimCount + i;
    const claimGems = getRewardAmount(baseReward, claimIndex);
    gems += claimGems;
    rewards.push({ type, gems: claimGems, claimIndex });
  }

  return { gems, newClaimCount, rewards };
}

function computeReviewClaims(reviewWordCount, reviewCorrectCount, previousClaimCount) {
  const newClaimCount = Math.min(
    Math.floor(reviewWordCount / REVIEW_WORD_THRESHOLD),
    Math.floor(reviewCorrectCount / REVIEW_CORRECT_THRESHOLD),
  );
  const claimsToAward = newClaimCount - previousClaimCount;
  const rewards = [];
  let gems = 0;

  for (let i = 0; i < claimsToAward; i += 1) {
    const claimIndex = previousClaimCount + i;
    const claimGems = getRewardAmount(REVIEW_BASE_REWARD, claimIndex);
    gems += claimGems;
    rewards.push({ type: 'review', gems: claimGems, claimIndex });
  }

  return { gems, newClaimCount, rewards };
}

function computePendingClaims(progress) {
  const learnedResult = computeTierClaims(
    progress.learnedWordCount,
    progress.learnedRewardClaimCount,
    LEARNED_THRESHOLD,
    LEARNED_BASE_REWARD,
    'learned_word',
  );
  const speakingResult = computeTierClaims(
    progress.speakingPracticeCount,
    progress.speakingRewardClaimCount,
    SPEAKING_THRESHOLD,
    SPEAKING_BASE_REWARD,
    'speaking_practice',
  );
  const testResult = computeTierClaims(
    progress.testAnswerCount,
    progress.testRewardClaimCount,
    TEST_THRESHOLD,
    TEST_BASE_REWARD,
    'test_answer',
  );
  const reviewResult = computeReviewClaims(
    progress.reviewWordCount,
    progress.reviewCorrectCount,
    progress.reviewRewardClaimCount,
  );

  const rewards = [
    ...learnedResult.rewards,
    ...speakingResult.rewards,
    ...testResult.rewards,
    ...reviewResult.rewards,
  ];
  const awardedGems =
    learnedResult.gems + speakingResult.gems + testResult.gems + reviewResult.gems;

  return {
    learnedResult,
    speakingResult,
    testResult,
    reviewResult,
    rewards,
    awardedGems,
  };
}

const REWARD_CLAIM_MAX_RETRIES = 5;

export async function incrementDailyRewardProgress({ userId, type, amount }) {
  return incrementDailyRewardProgressRow(
    userId,
    getTodayDateOnly(),
    type,
    normalizeAmount(amount),
  );
}

export async function calculateAndApplyDailyRewards(userId) {
  const date = getTodayDateOnly();

  for (let attempt = 0; attempt < REWARD_CLAIM_MAX_RETRIES; attempt += 1) {
    const progress = await ensureDailyRewardProgress(userId, date);
    const computation = computePendingClaims(progress);

    if (computation.awardedGems === 0) {
      return { awardedGems: 0, rewards: [] };
    }

    const applied = await applyDailyRewardClaims(userId, progress, computation);
    if (applied) {
      return {
        awardedGems: computation.awardedGems,
        rewards: computation.rewards,
      };
    }
  }

  return { awardedGems: 0, rewards: [] };
}

export async function getDailyRewardSummary(userId) {
  const date = getTodayDateOnly();
  const [progress, stats] = await Promise.all([
    findDailyRewardProgress(userId, date),
    findUserStats(userId),
  ]);

  const current = progress ?? EMPTY_PROGRESS;
  const totalGems = stats?.gems ?? stats?.coins ?? 0;

  return {
    learnedWords: {
      current: current.learnedWordCount,
      target: LEARNED_THRESHOLD,
      baseReward: LEARNED_BASE_REWARD,
      nextReward: getNextReward(LEARNED_BASE_REWARD, current.learnedRewardClaimCount),
    },
    speaking: {
      current: current.speakingPracticeCount,
      target: SPEAKING_THRESHOLD,
      baseReward: SPEAKING_BASE_REWARD,
      nextReward: getNextReward(SPEAKING_BASE_REWARD, current.speakingRewardClaimCount),
    },
    test: {
      current: current.testAnswerCount,
      target: TEST_THRESHOLD,
      baseReward: TEST_BASE_REWARD,
      nextReward: getNextReward(TEST_BASE_REWARD, current.testRewardClaimCount),
    },
    review: {
      current: current.reviewWordCount,
      correct: current.reviewCorrectCount,
      target: REVIEW_WORD_THRESHOLD,
      requiredCorrect: REVIEW_CORRECT_THRESHOLD,
      baseReward: REVIEW_BASE_REWARD,
      nextReward: getNextReward(REVIEW_BASE_REWARD, current.reviewRewardClaimCount),
    },
    earnedGemsToday: current.earnedGems,
    totalGems,
  };
}

export async function incrementAndApplyDailyReward(input) {
  await incrementDailyRewardProgress(input);
  return calculateAndApplyDailyRewards(input.userId);
}

export async function incrementAndApplyDailyRewardSafely(input, context) {
  try {
    return await incrementAndApplyDailyReward(input);
  } catch (error) {
    console.error(`[daily-reward] ${context} failed for user ${input.userId}`, error);
    return null;
  }
}

export async function incrementAndApplyDailyRewardsSafely(userId, increments, context) {
  try {
    for (const increment of increments) {
      await incrementDailyRewardProgress({ ...increment, userId });
    }
    return await calculateAndApplyDailyRewards(userId);
  } catch (error) {
    console.error(`[daily-reward] ${context} failed for user ${userId}`, error);
    return null;
  }
}
