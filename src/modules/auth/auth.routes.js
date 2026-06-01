import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../http/async-handler.js";
import { ApiError } from "../../http/api-error.js";
import { ok } from "../../http/response.js";
import { verifyFirebaseIdToken } from "../../auth/firebase-admin.js";
import { toAuthApiError } from "../../auth/auth-errors.js";
import { requireFirebaseUser } from "../../auth/require-firebase-user.js";
import { toPublicUser, upsertUserFromFirebaseToken } from "./auth.service.js";
const router = Router();
const sessionBody = z.object({
  idToken: z.string().min(10)
});
router.post(
  "/session",
  asyncHandler(async (req, res) => {
    const { idToken } = sessionBody.parse(req.body);
    try {
      const decoded = await verifyFirebaseIdToken(idToken);
      const user = await upsertUserFromFirebaseToken(decoded);
      return ok(res, { user: toPublicUser(user) }, 200);
    } catch (error) {
      throw toAuthApiError(error);
    }
  })
);
router.get(
  "/me",
  requireFirebaseUser(),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new ApiError({ status: 401, code: "UNAUTHORIZED" });
    return ok(res, { user: toPublicUser(req.user) });
  })
);
export {
  router
};
