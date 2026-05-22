import { prisma } from '../db/prisma.js';

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type AdaptiveRecommendation =
  | 'keep_same'
  | 'increase_difficulty'
  | 'decrease_difficulty'
  | 'level_up';

export type AdaptiveLevelSnapshot = {
  currentLevel: string;
  currentDifficulty: number;
  totalAnswered: number;
  accuracyRate: number;
  averageAnswerTimeMs: number;
  recommendation: AdaptiveRecommendation;
  canLevelUp: boolean;
  nextLevel: string | null;
};

export type ApplyAdaptiveRecommendationResult = {
  previousLevel: string;
  currentLevel: string;
  previousDifficulty: number;
  currentDifficulty: number;
  recommendation: AdaptiveRecommendation;
};

function getNextLevel(currentLevel: string): string | null {
  const index = LEVEL_ORDER.indexOf(currentLevel as (typeof LEVEL_ORDER)[number]);
  if (index < 0 || index >= LEVEL_ORDER.length - 1) {
    return null;
  }
  return LEVEL_ORDER[index + 1]!;
}

function computeRecommendation(
  totalAnswered: number,
  accuracyRate: number,
  averageAnswerTimeMs: number,
  currentDifficulty: number,
): AdaptiveRecommendation {
  if (totalAnswered < 20) {
    return 'keep_same';
  }

  if (accuracyRate < 60) {
    return 'decrease_difficulty';
  }

  if (accuracyRate >= 80 && averageAnswerTimeMs <= 5000) {
    if (currentDifficulty < 3) {
      return 'increase_difficulty';
    }
    return 'level_up';
  }

  return 'keep_same';
}

export async function getAdaptiveLevelSnapshot(userId: string): Promise<AdaptiveLevelSnapshot> {
  const [profile, aggregates] = await Promise.all([
    prisma.userLearningProfile.findUnique({
      where: { userId },
      select: { currentLevel: true, currentDifficulty: true },
    }),
    prisma.userVocabularyProgress.aggregate({
      where: { userId },
      _sum: {
        answerCount: true,
        correctCount: true,
        wrongCount: true,
        totalAnswerTimeMs: true,
      },
    }),
  ]);

  const currentLevel = profile?.currentLevel ?? 'A1';
  const currentDifficulty = profile?.currentDifficulty ?? 1;
  const totalAnswered = aggregates._sum.answerCount ?? 0;
  const totalCorrect = aggregates._sum.correctCount ?? 0;
  const totalWrong = aggregates._sum.wrongCount ?? 0;
  const totalAnswerTimeMs = aggregates._sum.totalAnswerTimeMs ?? 0;

  const gradedAnswers = totalCorrect + totalWrong;
  const accuracyRate =
    gradedAnswers > 0 ? Math.round((totalCorrect / gradedAnswers) * 100) : 0;
  const averageAnswerTimeMs =
    totalAnswered > 0 ? Math.round(totalAnswerTimeMs / totalAnswered) : 0;

  const recommendation = computeRecommendation(
    totalAnswered,
    accuracyRate,
    averageAnswerTimeMs,
    currentDifficulty,
  );

  return {
    currentLevel,
    currentDifficulty,
    totalAnswered,
    accuracyRate,
    averageAnswerTimeMs,
    recommendation,
    canLevelUp: recommendation === 'level_up',
    nextLevel: getNextLevel(currentLevel),
  };
}

function resolveProfileAfterRecommendation(
  recommendation: AdaptiveRecommendation,
  previousLevel: string,
  previousDifficulty: number,
): { currentLevel: string; currentDifficulty: number } {
  switch (recommendation) {
    case 'increase_difficulty':
      return {
        currentLevel: previousLevel,
        currentDifficulty: Math.min(3, previousDifficulty + 1),
      };
    case 'decrease_difficulty':
      return {
        currentLevel: previousLevel,
        currentDifficulty: Math.max(1, previousDifficulty - 1),
      };
    case 'level_up': {
      const nextLevel = getNextLevel(previousLevel);
      if (!nextLevel) {
        return { currentLevel: previousLevel, currentDifficulty: previousDifficulty };
      }
      return { currentLevel: nextLevel, currentDifficulty: 1 };
    }
    case 'keep_same':
    default:
      return { currentLevel: previousLevel, currentDifficulty: previousDifficulty };
  }
}

export async function applyAdaptiveRecommendation(
  userId: string,
): Promise<ApplyAdaptiveRecommendationResult> {
  const snapshot = await getAdaptiveLevelSnapshot(userId);
  const previousLevel = snapshot.currentLevel;
  const previousDifficulty = snapshot.currentDifficulty;
  const { currentLevel, currentDifficulty } = resolveProfileAfterRecommendation(
    snapshot.recommendation,
    previousLevel,
    previousDifficulty,
  );

  const profileChanged =
    currentLevel !== previousLevel || currentDifficulty !== previousDifficulty;

  if (profileChanged) {
    await prisma.userLearningProfile.upsert({
      where: { userId },
      create: {
        userId,
        currentLevel,
        currentDifficulty,
      },
      update: {
        currentLevel,
        currentDifficulty,
      },
    });
  }

  return {
    previousLevel,
    currentLevel,
    previousDifficulty,
    currentDifficulty,
    recommendation: snapshot.recommendation,
  };
}
