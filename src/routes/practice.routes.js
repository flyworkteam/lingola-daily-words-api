import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { requireFirebaseUserVocabulary } from "../auth/require-firebase-user.js";
import {
  getListening,
  getMatching,
  getMultipleChoice,
  getSpeaking
} from "../controllers/practice.controller.js";
const router = Router();
router.get("/multiple-choice", requireFirebaseUserVocabulary(), asyncHandler(getMultipleChoice));
router.get("/matching", requireFirebaseUserVocabulary(), asyncHandler(getMatching));
router.get("/listening", requireFirebaseUserVocabulary(), asyncHandler(getListening));
router.get("/speaking", requireFirebaseUserVocabulary(), asyncHandler(getSpeaking));
export {
  router
};
