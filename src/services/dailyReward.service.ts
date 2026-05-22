import type { Prisma, UserDailyRewardProgress } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export type DailyRewardIncrementType =
  | 'learned_word'
  | 'speaking_practice'
  | 'test_answer'
  | 'review_word'
  | 'review_correct';

export type DailyRewardCategory =
  | 'learned_word'
  | 'speaking_practice'
  | 'test_answer'
  | 'review';

export type IncrementDailyRewardProgressInput = {
  userId: string;
  type: DailyRewardIncrementType;
  amount?: number;
  extra?: Record<string, unknown>;
};

export type AppliedDailyReward = {
  type: DailyRewardCategory;
  gems: number;
  claimIndex: number;
};

export type CalculateAndApplyDailyRewardsResult = {
  awardedGems: number;
  rewards: AppliedDailyReward[];
};

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
} as const;

/** Today at UTC midnight (date-only, no time component). */
export function getTodayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function normalizeAmount(value: number | undefined): number {
  const amount = value ?? 1;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer');
  }
  return amount;
}

function getRewardAmount(baseReward: number, claimIndex: number): number {
  if (claimIndex === 0) {
    return baseReward;
  }
  return Math.floor(baseReward / 5);
}

function getNextReward(baseReward: number, claimCount: number): number {
  return getRewardAmount(baseReward, claimCount);
}

function buildIncrementUpdate(
  type: DailyRewardIncrementType,
  amount: number,
): Prisma.UserDailyRewardProgressUpdateInput {
  switch (type) {
    case 'learned_word':
      return { learnedWordCount: { increment: amount } };
    case 'speaking_practice':
      return { speakingPracticeCount: { increment: amount } };
    case 'test_answer':
      return { testAnswerCount: { increment: amount } };
    case 'review_word':
      return { reviewWordCount: { increment: amount } };
    case 'review_correct':
      return { reviewCorrectCount: { increment: amount } };
    default:
      throw new Error('Invalid daily reward increment type');
  }
}

function computeTierClaims(
  totalCount: number,
  previousClaimCount: number,
  threshold: number,
  baseReward: number,
  type: DailyRewardCategory,
): { gems: number; newClaimCount: number; rewards: AppliedDailyReward[] } {
  const newClaimCount = Math.floor(totalCount / threshold);
  const claimsToAward = newClaimCount - previousClaimCount;
  const rewards: AppliedDailyReward[] = [];
  let gems = 0;

  for (let i = 0; i < claimsToAward; i += 1) {
    const claimIndex = previousClaimCount + i;
    const claimGems = getRewardAmount(baseReward, claimIndex);
    gems += claimGems;
    rewards.push({ type, gems: claimGems, claimIndex });
  }

  return { gems, newClaimCount, rewards };
}

function computeReviewClaims(
  reviewWordCount: number,
  reviewCorrectCount: number,
  previousClaimCount: number,
): { gems: number; newClaimCount: number; rewards: AppliedDailyReward[] } {
  const newClaimCount = Math.min(
    Math.floor(reviewWordCount / REVIEW_WORD_THRESHOLD),
    Math.floor(reviewCorrectCount / REVIEW_CORRECT_THRESHOLD),
  );
  const claimsToAward = newClaimCount - previousClaimCount;
  const rewards: AppliedDailyReward[] = [];
  let gems = 0;

  for (let i = 0; i < claimsToAward; i += 1) {
    const claimIndex = previousClaimCount + i;
    const claimGems = getRewardAmount(REVIEW_BASE_REWARD, claimIndex);
    gems += claimGems;
    rewards.push({ type: 'review', gems: claimGems, claimIndex });
  }

  return { gems, newClaimCount, rewards };
}

async function getOrCreateTodayProgress(userId: string, date = getTodayDateOnly()) {
  return prisma.userDailyRewardProgress.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date },
    update: {},
  });
}

async function getTodayProgress(userId: string, date = getTodayDateOnly()) {
  return prisma.userDailyRewardProgress.findUnique({
    where: { userId_date: { userId, date } },
  });
}

export async function incrementDailyRewardProgress({
  userId,
  type,
  amount,
  extra: _extra,
}: IncrementDailyRewardProgressInput): Promise<UserDailyRewardProgress> {
  const normalizedAmount = normalizeAmount(amount);
  const date = getTodayDateOnly();

  return prisma.userDailyRewardProgress.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      ...(type === 'learned_word' ? { learnedWordCount: normalizedAmount } : {}),
      ...(type === 'speaking_practice' ? { speakingPracticeCount: normalizedAmount } : {}),
      ...(type === 'test_answer' ? { testAnswerCount: normalizedAmount } : {}),
      ...(type === 'review_word' ? { reviewWordCount: normalizedAmount } : {}),
      ...(type === 'review_correct' ? { reviewCorrectCount: normalizedAmount } : {}),
    },
    update: buildIncrementUpdate(type, normalizedAmount),
  });
}

const REWARD_CLAIM_MAX_RETRIES = 5;

type ClaimComputation = {
  learnedResult: ReturnType<typeof computeTierClaims>;
  speakingResult: ReturnType<typeof computeTierClaims>;
  testResult: ReturnType<typeof computeTierClaims>;
  reviewResult: ReturnType<typeof computeReviewClaims>;
  rewards: AppliedDailyReward[];
  awardedGems: number;
};

function computePendingClaims(progress: UserDailyRewardProgress): ClaimComputation {
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

export async function calculateAndApplyDailyRewards(
  userId: string,
): Promise<CalculateAndApplyDailyRewardsResult> {
  const date = getTodayDateOnly();

  for (let attempt = 0; attempt < REWARD_CLAIM_MAX_RETRIES; attempt += 1) {
    const progress = await getOrCreateTodayProgress(userId, date);
    const computation = computePendingClaims(progress);

    if (computation.awardedGems === 0) {
      return { awardedGems: 0, rewards: [] };
    }

    const applied = await prisma.$transaction(async (tx) => {
      const updated = await tx.userDailyRewardProgress.updateMany({
        where: {
          id: progress.id,
          learnedRewardClaimCount: progress.learnedRewardClaimCount,
          speakingRewardClaimCount: progress.speakingRewardClaimCount,
          testRewardClaimCount: progress.testRewardClaimCount,
          reviewRewardClaimCount: progress.reviewRewardClaimCount,
        },
        data: {
          learnedRewardClaimCount: computation.learnedResult.newClaimCount,
          speakingRewardClaimCount: computation.speakingResult.newClaimCount,
          testRewardClaimCount: computation.testResult.newClaimCount,
          reviewRewardClaimCount: computation.reviewResult.newClaimCount,
          earnedGems: { increment: computation.awardedGems },
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.userStats.upsert({
        where: { userId },
        create: {
          userId,
          gems: computation.awardedGems,
        },
        update: {
          gems: { increment: computation.awardedGems },
        },
      });

      return true;
    });

    if (applied) {
      return {
        awardedGems: computation.awardedGems,
        rewards: computation.rewards,
      };
    }
  }

  return { awardedGems: 0, rewards: [] };
}

export async function getDailyRewardSummary(userId: string) {
  const date = getTodayDateOnly();
  const [progress, stats] = await Promise.all([
    getTodayProgress(userId, date),
    prisma.userStats.findUnique({
      where: { userId },
      select: { gems: true, coins: true },
    }),
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

export async function incrementAndApplyDailyReward(
  input: IncrementDailyRewardProgressInput,
): Promise<CalculateAndApplyDailyRewardsResult> {
  await incrementDailyRewardProgress(input);
  return calculateAndApplyDailyRewards(input.userId);
}

export async function incrementAndApplyDailyRewardSafely(
  input: IncrementDailyRewardProgressInput,
  context: string,
) {
  try {
    return await incrementAndApplyDailyReward(input);
  } catch (error) {
    console.error(`[daily-reward] ${context} failed for user ${input.userId}`, error);
    return null;
  }
}

export async function incrementAndApplyDailyRewardsSafely(
  userId: string,
  increments: IncrementDailyRewardProgressInput[],
  context: string,
) {
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
