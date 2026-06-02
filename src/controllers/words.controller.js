import { z } from 'zod';
import { supportedTargetLangSchema } from '../constants/supportedLanguages.js';
import {
  ensureDailyLifeCategory,
  ensureLevel,
  persistImportedWords,
} from '../services/adminImport.service.js';

const translateBodySchema = z.object({
  word: z.string().min(1).optional(),
  sourceText: z.string().min(1).optional(),
  targetText: z.string().min(1),
  level: z.string().min(1),
  targetLang: supportedTargetLangSchema.default('tr'),
  pronunciationText: z.string().nullable().optional(),
});

async function translateWord(req, res) {
  try {
    const body = translateBodySchema.parse(req.body);
    const sourceText = (body.sourceText ?? body.word ?? '').trim();
    if (!sourceText) {
      return res.status(400).json({
        success: false,
        message: 'word or sourceText is required',
      });
    }

    const [levelRecord, category] = await Promise.all([
      ensureLevel(body.level),
      ensureDailyLifeCategory(),
    ]);

    const stats = await persistImportedWords({
      words: [
        {
          sourceText,
          targetText: body.targetText.trim(),
          pronunciationText: body.pronunciationText ?? null,
        },
      ],
      levelId: levelRecord.id,
      categoryId: category.id,
      targetLang: body.targetLang,
    });

    return res.status(200).json({
      success: true,
      level: body.level,
      sourceText,
      ...stats,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, message: 'Invalid request body' });
    }
    console.error('POST /api/words/translate failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to save word';
    return res.status(500).json({ success: false, message });
  }
}

export { translateWord };
