import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { requireFirebaseUserVocabulary } from "../auth/require-firebase-user.js";
import {
  getCommonVocabulary,
  getDailyWord,
  getDictionaryVocabulary,
  getSavedVocabulary,
  getVocabulary,
  getVocabularyById,
  getVocabularyReview
} from "../controllers/vocabulary.controller.js";
const router = Router();
router.get("/review", requireFirebaseUserVocabulary(), asyncHandler(getVocabularyReview));
router.get("/daily-word", requireFirebaseUserVocabulary(), asyncHandler(getDailyWord));
router.get("/common", requireFirebaseUserVocabulary(), asyncHandler(getCommonVocabulary));
router.get("/saved", requireFirebaseUserVocabulary(), asyncHandler(getSavedVocabulary));
router.get("/dictionary", requireFirebaseUserVocabulary(), asyncHandler(getDictionaryVocabulary));
router.get("/", requireFirebaseUserVocabulary(), asyncHandler(getVocabulary));
router.get("/:id", requireFirebaseUserVocabulary(), asyncHandler(getVocabularyById));
export {
  router
};
