import { Router } from "express";
import { requireAdmin } from "../auth/require-admin.js";
import { asyncHandler } from "../http/async-handler.js";
import { importAllLevels, importWords } from "../controllers/adminImport.controller.js";
const router = Router();
router.use(requireAdmin());
router.post("/import-words", asyncHandler(importWords));
router.post("/import-all-levels", asyncHandler(importAllLevels));
export {
  router
};
