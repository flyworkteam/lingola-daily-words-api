import {
  aggregateVocabularyProgress,
  findUserLearningProfile,
  upsertUserLearningProfile,
} from '../db/repositories.js';

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function getNextLevel(currentLevel) {
  const index = LEVEL_ORDER.indexOf(currentLevel);
  if (index < 0 || index >= LEVEL_ORDER.length - 1) {
    return null;
  }
  return LEVEL_ORDER[index + 1];
}

function computeRecommendation(totalAnswered, accuracyRate, averageAnswerTimeMs, currentDifficulty) {
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

export async function getAdaptiveLevelSnapshot(userId) {
  const [profile, aggregates] = await Promise.all([
    findUserLearningProfile(userId),
    aggregateVocabularyProgress(userId),
  ]);

  const currentLevel = profile?.currentLevel ?? 'A1';
  const currentDifficulty = profile?.currentDifficulty ?? 1;
  const totalAnswered = Number(aggregates.answerCount ?? 0);
  const totalCorrect = Number(aggregates.correctCount ?? 0);
  const totalWrong = Number(aggregates.wrongCount ?? 0);
  const totalAnswerTimeMs = Number(aggregates.totalAnswerTimeMs ?? 0);

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

function resolveProfileAfterRecommendation(recommendation, previousLevel, previousDifficulty) {
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
    default:
      return { currentLevel: previousLevel, currentDifficulty: previousDifficulty };
  }
}

export async function applyAdaptiveRecommendation(userId) {
  const snapshot = await getAdaptiveLevelSnapshot(userId);
  const previousLevel = snapshot.currentLevel;
  const previousDifficulty = snapshot.currentDifficulty;
  const { currentLevel, currentDifficulty } = resolveProfileAfterRecommendation(
    snapshot.recommendation,
    previousLevel,
    previousDifficulty,
  );

  if (currentLevel !== previousLevel || currentDifficulty !== previousDifficulty) {
    await upsertUserLearningProfile({
      userId,
      currentLevel,
      currentDifficulty,
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
