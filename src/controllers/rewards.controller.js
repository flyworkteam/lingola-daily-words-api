import { getDailyRewardSummary } from "../services/dailyReward.service.js";
import { getIdempotencyKey, runIdempotent } from "../services/idempotency.service.js";
import {
  claimStreakShareReward,
  getStreakShareRewardStatus
} from "../services/streakShareReward.service.js";
function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
function sendError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}
function getAuthUser(req, res) {
  if (!req.user) {
    sendError(res, "Unauthorized", 401);
    return null;
  }
  return req.user;
}
async function getMyDailyRewardSummary(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const summary = await getDailyRewardSummary(user.id);
    return sendSuccess(res, summary);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch daily reward summary");
  }
}
async function getStreakShareRewardStatusHandler(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const data = await getStreakShareRewardStatus(user.id);
    return sendSuccess(res, data);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch streak share reward status");
  }
}
async function claimStreakShareRewardHandler(req, res) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;
    const idempotencyKey = getIdempotencyKey(req);
    const { statusCode, body: payload } = await runIdempotent({
      userId: user.id,
      scope: "rewards:streak-share:claim",
      idempotencyKey,
      execute: async () => {
        const result = await claimStreakShareReward(user.id);
        if (result.alreadyClaimed) {
          return {
            statusCode: 409,
            body: {
              success: false,
              message: "Bug\xFCnk\xFC payla\u015F\u0131m \xF6d\xFCl\xFC zaten al\u0131nd\u0131.",
              data: { alreadyClaimed: true }
            }
          };
        }
        return {
          statusCode: 200,
          body: {
            success: true,
            data: {
              awardedGems: result.awardedGems,
              totalGems: result.totalGems
            }
          }
        };
      }
    });
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to claim streak share reward");
  }
}
export {
  claimStreakShareRewardHandler,
  getMyDailyRewardSummary,
  getStreakShareRewardStatusHandler
};
