import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { requireFirebaseUser } from "../auth/require-firebase-user.js";
import {
  getHomeSummaryHandler,
  getLearningProfile,
  saveLearningProfile
} from "../controllers/user.controller.js";
const router = Router();
router.use(requireFirebaseUser());
router.get("/home-summary", asyncHandler(getHomeSummaryHandler));
router.get("/learning-profile", asyncHandler(getLearningProfile));
router.post("/learning-profile", asyncHandler(saveLearningProfile));
export {
  router
};
