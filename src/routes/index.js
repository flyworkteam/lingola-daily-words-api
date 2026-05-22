import { Router } from "express";
import { router as authRouter } from "../modules/auth/auth.routes.js";
const router = Router();
router.use("/auth", authRouter);
export {
  router
};
