import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { checkDatabaseHealth } from "./health/check.js";
import { errorMiddleware } from "./http/error-middleware.js";
import { router as v1Router } from "./routes/index.js";
import { router as learningRouter } from "./routes/learning.routes.js";
import { router as vocabularyRouter } from "./routes/vocabulary.routes.js";
import { router as practiceRouter } from "./routes/practice.routes.js";
import { router as progressRouter } from "./routes/progress.routes.js";
import { router as adminImportRouter } from "./routes/adminImport.routes.js";
import { router as userRouter } from "./routes/user.routes.js";
import { router as rewardsRouter } from "./routes/rewards.routes.js";
function createApp() {
  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      name: "lingola-daily-words-backend",
      ...(env.PUBLIC_API_BASE_URL ? { publicApiBaseUrl: env.PUBLIC_API_BASE_URL } : {}),
      endpoints: [
        "/health",
        "/api/v1/auth/session",
        "/api/v1/auth/me",
        "/api/languages",
        "/api/levels",
        "/api/categories",
        "/api/lessons",
        "/api/vocabulary",
        "/api/vocabulary/saved",
        "/api/vocabulary/dictionary",
        "/api/vocabulary/review",
        "/api/vocabulary/daily-word",
        "/api/vocabulary/common",
        "/api/practice/multiple-choice",
        "/api/practice/matching",
        "/api/practice/listening",
        "/api/practice/speaking",
        "/api/progress/vocabulary/me",
        "/api/progress/adaptive-level/me",
        "/api/progress/adaptive-level/apply",
        "/api/progress/daily/me",
        "/api/progress/daily/activity",
        "/api/progress/daily-reward/me",
        "/api/progress/daily-reward/record",
        "/api/rewards/daily/me",
        "/api/user/learning-profile",
        "/api/user/home-summary",
        "/api/admin/import-words"
      ]
    });
  });
  app.get("/health", async (_req, res) => {
    const db = await checkDatabaseHealth();
    const status = db.ok ? 200 : 503;
    return res.status(status).json({
      ok: db.ok,
      database: db.database,
      latencyMs: db.latencyMs,
      ...db.error ? { error: db.error } : {}
    });
  });
  app.use("/api/v1", v1Router);
  app.use("/api", learningRouter);
  app.use("/api/vocabulary", vocabularyRouter);
  app.use("/api/practice", practiceRouter);
  app.use("/api/progress", progressRouter);
  app.use("/api/user", userRouter);
  app.use("/api/rewards", rewardsRouter);
  app.use("/api/admin", adminImportRouter);
  app.use(errorMiddleware);
  return app;
}
export {
  createApp
};
