import { z } from 'zod';
import {
  findActiveVocabularyItemById,
  findVocabularyProgressByUser,
  findVocabularyProgressByUserAndItem,
  toggleSavedVocabularyProgress,
  upsertVocabularyProgressAnswer,
  upsertVocabularyProgressSeen,
} from '../db/repositories.js';
import {
  applyAdaptiveRecommendation,
  getAdaptiveLevelSnapshot,
} from '../services/adaptiveLevel.service.js';
import {
  getDailySummary,
  incrementDailyActivity,
  serializeDailyActivity,
} from '../services/dailyActivity.service.js';
import {
  calculateAndApplyDailyRewards,
  getDailyRewardSummary,
  incrementDailyRewardProgress,
} from '../services/dailyReward.service.js';
import { getIdempotencyKey, runIdempotent } from '../services/idempotency.service.js';

const LEARNED_CORRECT_THRESHOLD = 3;

const answerSourceSchema = z.enum(['test', 'speaking', 'review']);
const answerBodySchema = z.object({
  isCorrect: z.boolean(),
  answerTimeMs: z.number().int().min(0).optional(),
  source: answerSourceSchema.optional(),
  activityType: z.enum(['test', 'review']).optional(),
});

const dailyRewardRecordSchema = z.object({
  type: z.enum([
    'learned_word',
    'speaking_practice',
    'test_answer',
    'review_word',
    'review_correct',
    'learned',
    'speaking',
    'test',
    'review',
  ]),
  amount: z.number().int().min(1).optional(),
  count: z.number().int().min(1).optional(),
  correctCount: z.number().int().min(0).optional().default(0),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const dailyActivityBodySchema = z.object({
  seenDelta: z.number().int().min(0).optional().default(0),
  correctDelta: z.number().int().min(0).optional().default(0),
  wrongDelta: z.number().int().min(0).optional().default(0),
  completedDelta: z.number().int().min(0).optional().default(0),
  studySecondsDelta: z.number().int().min(0).optional().default(0),
});

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendProgressSuccess(res, progress, rewardResult) {
  if (rewardResult) {
    return res.status(200).json({ success: true, data: progress, rewardResult });
  }
  return sendSuccess(res, progress);
}

function sendError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}

function isFirstTimeLearned(existing, shouldMarkLearned) {
  if (!shouldMarkLearned) {
    return false;
  }
  return existing?.status !== 'learned' && existing?.learnedAt == null;
}

function resolveAnswerSource(body) {
  if (body.source) {
    return body.source;
  }
  if (body.activityType === 'test') {
    return 'test';
  }
  if (body.activityType === 'review') {
    return 'review';
  }
  return undefined;
}

async function applyAnswerDailyRewards(userId, source, isCorrect, isNewlyLearned) {
  const increments = [];

  if (source === 'test') {
    increments.push({ userId, type: 'test_answer', amount: 1 });
  }
  if (source === 'speaking') {
    increments.push({ userId, type: 'speaking_practice', amount: 1 });
  }
  if (source === 'review') {
    increments.push({ userId, type: 'review_word', amount: 1 });
    if (isCorrect) {
      increments.push({ userId, type: 'review_correct', amount: 1 });
    }
  }
  if (isNewlyLearned) {
    increments.push({ userId, type: 'learned_word', amount: 1 });
  }

  if (increments.length === 0) {
    return null;
  }

  try {
    for (const increment of increments) {
      await incrementDailyRewardProgress(increment);
    }
    return await calculateAndApplyDailyRewards(userId);
  } catch (error) {
    console.error(`[daily-reward] submitVocabularyAnswer failed for user ${userId}`, error);
    return null;
  }
}

function getAuthUser(req, res) {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }
  return req.user;
}

function mapLegacyRewardType(type) {
  switch (type) {
    case 'learned_word':
    case 'speaking_practice':
    case 'test_answer':
    case 'review_word':
    case 'review_correct':
      return type;
    case 'learned':
      return 'learned_word';
    case 'speaking':
      return 'speaking_practice';
    case 'test':
      return 'test_answer';
    case 'review':
      return 'review_batch';
    default:
      throw new Error('Invalid daily reward type');
  }
}

async function recordDailyActivitySafely(deltas, userId, context) {
  try {
    await incrementDailyActivity({ userId, ...deltas });
  } catch (error) {
    console.error(`[daily-activity] ${context} failed for user ${userId}`, error);
  }
}

export async function markVocabularySeen(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const { id: vocabularyItemId } = req.params;
    const vocabularyItem = await findActiveVocabularyItemById(vocabularyItemId);
    if (!vocabularyItem) {
      return sendError(res, 'Vocabulary item not found', 404);
    }

    const progress = await upsertVocabularyProgressSeen(user.id, vocabularyItemId);
    await recordDailyActivitySafely({ seenDelta: 1 }, user.id, 'markVocabularySeen');
    return sendSuccess(res, progress);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to update vocabulary progress');
  }
}

export async function toggleVocabularySave(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const { id: vocabularyItemId } = req.params;
    const vocabularyItem = await findActiveVocabularyItemById(vocabularyItemId);
    if (!vocabularyItem) {
      return sendError(res, 'Vocabulary item not found', 404);
    }

    const progress = await toggleSavedVocabularyProgress(user.id, vocabularyItemId);
    return sendSuccess(res, progress);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to update saved vocabulary');
  }
}

export async function submitVocabularyAnswer(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const { id: vocabularyItemId } = req.params;
    const parsedBody = answerBodySchema.parse(req.body);
    const { isCorrect, answerTimeMs } = parsedBody;
    const source = resolveAnswerSource(parsedBody);

    const vocabularyItem = await findActiveVocabularyItemById(vocabularyItemId);
    if (!vocabularyItem) {
      return sendError(res, 'Vocabulary item not found', 404);
    }

    const existing = await findVocabularyProgressByUserAndItem(user.id, vocabularyItemId);
    const now = new Date();
    const nextCorrectCount = (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0);
    const shouldMarkLearned = isCorrect && nextCorrectCount >= LEARNED_CORRECT_THRESHOLD;
    const isNewlyLearned = isFirstTimeLearned(existing, shouldMarkLearned);

    const progress = await upsertVocabularyProgressAnswer(user.id, vocabularyItemId, {
      correctCount: isCorrect ? 1 : 0,
      wrongCount: isCorrect ? 0 : 1,
      correctDelta: isCorrect ? 1 : 0,
      wrongDelta: isCorrect ? 0 : 1,
      totalAnswerTimeMs: answerTimeMs ?? 0,
      learnedAt: shouldMarkLearned ? existing?.learnedAt ?? now : null,
      status: shouldMarkLearned ? 'learned' : 'learning',
    });

    await recordDailyActivitySafely(
      isCorrect ? { seenDelta: 1, correctDelta: 1 } : { seenDelta: 1, wrongDelta: 1 },
      user.id,
      'submitVocabularyAnswer',
    );

    const rewardResult = await applyAnswerDailyRewards(
      user.id,
      source,
      isCorrect,
      isNewlyLearned,
    );

    return sendProgressSuccess(res, progress, rewardResult);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Invalid request body', 400);
    }
    console.error(error);
    return sendError(res, 'Failed to record vocabulary answer');
  }
}

export async function getMyAdaptiveLevel(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const snapshot = await getAdaptiveLevelSnapshot(user.id);
    return sendSuccess(res, snapshot);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch adaptive level');
  }
}

export async function applyMyAdaptiveLevel(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const result = await applyAdaptiveRecommendation(user.id);
    return sendSuccess(res, result);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to apply adaptive level');
  }
}

export async function getMyDailyProgress(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const summary = await getDailySummary(user.id);
    return sendSuccess(res, summary);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch daily progress');
  }
}

export async function postDailyActivity(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const body = dailyActivityBodySchema.parse(req.body);
    const activity = await incrementDailyActivity({
      userId: user.id,
      seenDelta: body.seenDelta,
      correctDelta: body.correctDelta,
      wrongDelta: body.wrongDelta,
      completedDelta: body.completedDelta,
      studySecondsDelta: body.studySecondsDelta,
    });

    return sendSuccess(res, serializeDailyActivity(activity));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Invalid request body', 400);
    }
    if (error instanceof Error && error.message.includes('Delta values')) {
      return sendError(res, error.message, 400);
    }
    console.error(error);
    return sendError(res, 'Failed to update daily activity');
  }
}

export async function getMyDailyRewardProgress(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const summary = await getDailyRewardSummary(user.id);
    return sendSuccess(res, summary);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch daily reward progress');
  }
}

export async function postDailyRewardRecord(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const body = dailyRewardRecordSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKey(req);

    const { statusCode, body: payload } = await runIdempotent({
      userId: user.id,
      scope: 'progress:daily-reward:record',
      idempotencyKey,
      execute: async () => {
        const amount = body.amount ?? body.count ?? 1;
        const mappedType = mapLegacyRewardType(body.type);

        if (mappedType === 'review_batch') {
          await incrementDailyRewardProgress({
            userId: user.id,
            type: 'review_word',
            amount,
            extra: body.extra,
          });
          if (body.correctCount > 0) {
            await incrementDailyRewardProgress({
              userId: user.id,
              type: 'review_correct',
              amount: body.correctCount,
              extra: body.extra,
            });
          }
        } else {
          await incrementDailyRewardProgress({
            userId: user.id,
            type: mappedType,
            amount,
            extra: body.extra,
          });
        }

        const rewardResult = await calculateAndApplyDailyRewards(user.id);
        const summary = await getDailyRewardSummary(user.id);

        return {
          statusCode: 200,
          body: {
            ...summary,
            awardedGems: rewardResult.awardedGems,
            rewards: rewardResult.rewards,
          },
        };
      },
    });

    return sendSuccess(res, payload, statusCode);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Invalid request body', 400);
    }
    if (error instanceof Error && error.message.includes('Amount must')) {
      return sendError(res, error.message, 400);
    }
    console.error(error);
    return sendError(res, 'Failed to record daily reward activity');
  }
}

export async function getMyVocabularyProgress(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const progress = await findVocabularyProgressByUser(user.id);
    return sendSuccess(res, progress);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch vocabulary progress');
  }
}
