import { z } from 'zod';
import { supportedTargetLangSchema } from '../constants/supportedLanguages.js';
import {
  ensureDailyLifeCategory,
  ensureLevel,
  persistImportedWords,
} from '../services/adminImport.service.js';
import { fetchWordsByLevelFromExternalApi } from '../services/externalVerbApi.service.js';
const ALL_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const importBodySchema = z.object({
  level: z.string().min(1),
  targetLang: supportedTargetLangSchema.default("tr"),
  limit: z.number().int().positive().max(500).default(50),
  offset: z.number().int().min(0).default(0)
});
const importAllLevelsBodySchema = z.object({
  targetLang: supportedTargetLangSchema.default("tr"),
  limit: z.number().int().positive().max(500).default(50),
  maxOffset: z.number().int().min(0).default(300)
});
function sendImportSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function sendImportAllSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function sendError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}
function emptyStats() {
  return { fetched: 0, inserted: 0, skipped: 0 };
}
function addStats(target, source) {
  target.fetched += source.fetched;
  target.inserted += source.inserted;
  target.skipped += source.skipped;
}
function normalizeWords(words) {
  return words.filter((word) => word.sourceText && word.targetText).map((word) => ({
    sourceText: word.sourceText.trim(),
    targetText: word.targetText.trim(),
    pronunciationText: word.pronunciationText ?? null
  }));
}
async function importWordsForLevel(args) {
  const words = await fetchWordsByLevelFromExternalApi(args);
  if (words.length === 0) {
    return emptyStats();
  }
  const [levelRecord, category] = await Promise.all([
    ensureLevel(args.level),
    ensureDailyLifeCategory()
  ]);
  return persistImportedWords({
    words: normalizeWords(words),
    levelId: levelRecord.id,
    categoryId: category.id,
    targetLang: args.targetLang
  });
}
async function importWords(req, res) {
  try {
    const { level, targetLang, limit, offset } = importBodySchema.parse(req.body);
    const stats = await importWordsForLevel({ level, targetLang, limit, offset });
    return sendImportSuccess(res, stats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, "Invalid request body", 400);
    }
    console.error("Admin import words failed:", error);
    const message = error instanceof Error ? error.message : "Failed to import words";
    return sendError(res, message);
  }
}
async function importAllLevels(req, res) {
  try {
    const { targetLang, limit, maxOffset } = importAllLevelsBodySchema.parse(req.body);
    const levels = {};
    const totals = emptyStats();
    for (const level of ALL_LEVELS) {
      const levelStats = emptyStats();
      for (let offset = 0; offset < maxOffset; offset += limit) {
        const batchStats = await importWordsForLevel({
          level,
          targetLang,
          limit,
          offset
        });
        if (batchStats.fetched === 0) {
          break;
        }
        addStats(levelStats, batchStats);
      }
      levels[level] = levelStats;
      addStats(totals, levelStats);
    }
    return sendImportAllSuccess(res, { levels, totals });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, "Invalid request body", 400);
    }
    console.error("Admin import all levels failed:", error);
    const message = error instanceof Error ? error.message : "Failed to import all levels";
    return sendError(res, message);
  }
}
export {
  importAllLevels,
  importWords
};
