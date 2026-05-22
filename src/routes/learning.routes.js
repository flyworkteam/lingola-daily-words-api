import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import {
  getCategories,
  getLanguages,
  getLessonById,
  getLessonItems,
  getLessons,
  getLevels
} from "../controllers/learning.controller.js";
const router = Router();
router.get("/languages", asyncHandler(getLanguages));
router.get("/levels", asyncHandler(getLevels));
router.get("/categories", asyncHandler(getCategories));
router.get("/lessons", asyncHandler(getLessons));
router.get("/lessons/:id/items", asyncHandler(getLessonItems));
router.get("/lessons/:id", asyncHandler(getLessonById));
export {
  router
};
