import { Router } from 'express';
import { asyncHandler } from '../http/async-handler.js';
import { requireFirebaseUser } from '../auth/require-firebase-user.js';
import {
  applyMyAdaptiveLevel,
  getMyAdaptiveLevel,
  getMyDailyProgress,
  getMyDailyRewardProgress,
  getMyVocabularyProgress,
  markVocabularySeen,
  postDailyActivity,
  postDailyRewardRecord,
  submitVocabularyAnswer,
  toggleVocabularySave,
} from '../controllers/progress.controller.js';

export const router = Router();

router.use(requireFirebaseUser());

router.get('/adaptive-level/me', asyncHandler(getMyAdaptiveLevel));
router.post('/adaptive-level/apply', asyncHandler(applyMyAdaptiveLevel));
router.get('/daily/me', asyncHandler(getMyDailyProgress));
router.post('/daily/activity', asyncHandler(postDailyActivity));
router.get('/daily-reward/me', asyncHandler(getMyDailyRewardProgress));
router.post('/daily-reward/record', asyncHandler(postDailyRewardRecord));

router.get('/vocabulary/me', asyncHandler(getMyVocabularyProgress));
router.post('/vocabulary/:id/seen', asyncHandler(markVocabularySeen));
router.post('/vocabulary/:id/save', asyncHandler(toggleVocabularySave));
router.post('/vocabulary/:id/answer', asyncHandler(submitVocabularyAnswer));
