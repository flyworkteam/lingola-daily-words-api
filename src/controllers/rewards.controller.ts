import type { Request, Response } from 'express';
import { getDailyRewardSummary } from '../services/dailyReward.service.js';
import { getIdempotencyKey, runIdempotent } from '../services/idempotency.service.js';
import {
  claimStreakShareReward,
  getStreakShareRewardStatus,
} from '../services/streakShareReward.service.js';

function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

function getAuthUser(req: Request, res: Response) {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }
  return req.user;
}

export async function getMyDailyRewardSummary(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const summary = await getDailyRewardSummary(user.id);
    return sendSuccess(res, summary);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch daily reward summary');
  }
}

export async function getStreakShareRewardStatusHandler(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const data = await getStreakShareRewardStatus(user.id);
    return sendSuccess(res, data);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch streak share reward status');
  }
}

export async function claimStreakShareRewardHandler(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const idempotencyKey = getIdempotencyKey(req);
    type ClaimResponseBody =
      | {
          success: false;
          message: string;
          data: { alreadyClaimed: true };
        }
      | {
          success: true;
          data: { awardedGems: number; totalGems: number };
        };

    const { statusCode, body: payload } = await runIdempotent<ClaimResponseBody>({
      userId: user.id,
      scope: 'rewards:streak-share:claim',
      idempotencyKey,
      execute: async () => {
        const result = await claimStreakShareReward(user.id);

        if (result.alreadyClaimed) {
          return {
            statusCode: 409,
            body: {
              success: false as const,
              message: 'Bugünkü paylaşım ödülü zaten alındı.',
              data: { alreadyClaimed: true as const },
            },
          };
        }

        return {
          statusCode: 200,
          body: {
            success: true as const,
            data: {
              awardedGems: result.awardedGems,
              totalGems: result.totalGems,
            },
          },
        };
      },
    });

    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to claim streak share reward');
  }
}
