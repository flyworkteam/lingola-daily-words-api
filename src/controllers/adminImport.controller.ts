import { createRequire } from 'node:module';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { supportedTargetLangSchema } from '../constants/supportedLanguages.js';
import {
  ensureDailyLifeCategory,
  ensureLevel,
  persistImportedWords,
  type ImportStats,
} from '../services/adminImport.service.js';

const require = createRequire(import.meta.url);
const { fetchWordsByLevelFromExternalApi } = require('../services/externalVerbApi.service.js') as {
  fetchWordsByLevelFromExternalApi: (args: {
    level: string;
    targetLang?: string;
    limit?: number;
    offset?: number;
  }) => Promise<NormalizedWord[]>;
};

const ALL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

type NormalizedWord = {
  sourceText?: string;
  targetText?: string;
  pronunciationText?: string;
  level?: string;
  type: string;
};

const importBodySchema = z.object({
  level: z.string().min(1),
  targetLang: supportedTargetLangSchema.default('tr'),
  limit: z.number().int().positive().max(500).default(50),
  offset: z.number().int().min(0).default(0),
});

const importAllLevelsBodySchema = z.object({
  targetLang: supportedTargetLangSchema.default('tr'),
  limit: z.number().int().positive().max(500).default(50),
  maxOffset: z.number().int().min(0).default(300),
});

function sendImportSuccess(res: Response, data: ImportStats, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function sendImportAllSuccess(
  res: Response,
  data: { levels: Record<string, ImportStats>; totals: ImportStats },
  status = 200,
) {
  return res.status(status).json({ success: true, ...data });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

function emptyStats(): ImportStats {
  return { fetched: 0, inserted: 0, skipped: 0 };
}

function addStats(target: ImportStats, source: ImportStats) {
  target.fetched += source.fetched;
  target.inserted += source.inserted;
  target.skipped += source.skipped;
}

function normalizeWords(words: NormalizedWord[]) {
  return words
    .filter((word) => word.sourceText && word.targetText)
    .map((word) => ({
      sourceText: word.sourceText!.trim(),
      targetText: word.targetText!.trim(),
      pronunciationText: word.pronunciationText ?? null,
    }));
}

async function importWordsForLevel(args: {
  level: string;
  targetLang: string;
  limit: number;
  offset: number;
}): Promise<ImportStats> {
  const words = await fetchWordsByLevelFromExternalApi(args);

  if (words.length === 0) {
    return emptyStats();
  }

  const [levelRecord, category] = await Promise.all([
    ensureLevel(args.level),
    ensureDailyLifeCategory(),
  ]);

  return persistImportedWords({
    words: normalizeWords(words),
    levelId: levelRecord.id,
    categoryId: category.id,
    targetLang: args.targetLang,
  });
}

export async function importWords(req: Request, res: Response) {
  try {
    const { level, targetLang, limit, offset } = importBodySchema.parse(req.body);
    const stats = await importWordsForLevel({ level, targetLang, limit, offset });
    return sendImportSuccess(res, stats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Invalid request body', 400);
    }

    console.error('Admin import words failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to import words';
    return sendError(res, message);
  }
}

export async function importAllLevels(req: Request, res: Response) {
  try {
    const { targetLang, limit, maxOffset } = importAllLevelsBodySchema.parse(req.body);

    const levels: Record<string, ImportStats> = {};
    const totals = emptyStats();

    for (const level of ALL_LEVELS) {
      const levelStats = emptyStats();

      for (let offset = 0; offset < maxOffset; offset += limit) {
        const batchStats = await importWordsForLevel({
          level,
          targetLang,
          limit,
          offset,
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
      return sendError(res, 'Invalid request body', 400);
    }

    console.error('Admin import all levels failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to import all levels';
    return sendError(res, message);
  }
}
