import { Router } from 'express';
import { asyncHandler } from '../http/async-handler.js';
import { requireFirebaseUser } from '../auth/require-firebase-user.js';
import {
  claimStreakShareRewardHandler,
  getMyDailyRewardSummary,
  getStreakShareRewardStatusHandler,
} from '../controllers/rewards.controller.js';

export const router = Router();

router.use(requireFirebaseUser());

router.get('/daily/me', asyncHandler(getMyDailyRewardSummary));
router.get('/streak-share/status', asyncHandler(getStreakShareRewardStatusHandler));
router.post('/streak-share/claim', asyncHandler(claimStreakShareRewardHandler));
