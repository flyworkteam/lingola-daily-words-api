import { DEFAULT_TARGET_LANG, normalizeSupportedTargetLang } from '../constants/supportedLanguages.js';
import {
  findVocabularyBySourceTexts,
  runImportTransaction,
  upsertCategoryBySlug,
  upsertLevelByCode,
} from '../db/repositories.js';
import { findOrCreateVocabularyItemForImport } from './vocabularyLanguage.service.js';

const IMPORT_BATCH_SIZE = 25;

function emptyStats() {
  return { fetched: 0, inserted: 0, skipped: 0 };
}

async function prefetchExistingBySourceTexts(levelId, sourceTexts, targetLang) {
  if (sourceTexts.length === 0) {
    return new Map();
  }

  const items = await findVocabularyBySourceTexts(levelId, sourceTexts, targetLang);
  return new Map(
    items.map((item) => [
      item.sourceText,
      {
        id: item.id,
        translationText: item.translations[0]?.targetText ?? null,
      },
    ]),
  );
}

async function importWordBatch(words, levelId, categoryId, targetLang, existingBySource) {
  const stats = emptyStats();
  stats.fetched = words.length;

  const pending = [];

  for (const word of words) {
    const existing = existingBySource.get(word.sourceText);
    if (existing && existing.translationText === word.targetText) {
      stats.skipped += 1;
      continue;
    }
    pending.push(word);
  }

  if (pending.length === 0) {
    return stats;
  }

  await runImportTransaction(async (conn) => {
    for (const word of pending) {
      await findOrCreateVocabularyItemForImport(
        {
          sourceText: word.sourceText,
          targetText: word.targetText,
          levelId,
          categoryId,
          targetLang,
          pronunciationText: word.pronunciationText ?? null,
        },
        conn,
      );

      existingBySource.set(word.sourceText, {
        id: '',
        translationText: word.targetText,
      });
    }
  });

  stats.inserted = pending.length;
  return stats;
}

function mergeStats(target, source) {
  target.fetched += source.fetched;
  target.inserted += source.inserted;
  target.skipped += source.skipped;
}

export async function persistImportedWords(args) {
  const normalizedLang = normalizeSupportedTargetLang(args.targetLang, DEFAULT_TARGET_LANG);
  const validWords = args.words.filter((word) => word.sourceText.trim() && word.targetText.trim());

  const totals = emptyStats();
  totals.fetched = args.words.length;
  totals.skipped += args.words.length - validWords.length;

  for (let offset = 0; offset < validWords.length; offset += IMPORT_BATCH_SIZE) {
    const chunk = validWords.slice(offset, offset + IMPORT_BATCH_SIZE);
    const sourceTexts = chunk.map((word) => word.sourceText);
    const existingBySource = await prefetchExistingBySourceTexts(
      args.levelId,
      sourceTexts,
      normalizedLang,
    );

    const batchStats = await importWordBatch(
      chunk,
      args.levelId,
      args.categoryId,
      normalizedLang,
      existingBySource,
    );

    mergeStats(totals, batchStats);
  }

  return totals;
}

export async function ensureLevel(code) {
  return upsertLevelByCode(code);
}

export async function ensureDailyLifeCategory() {
  return upsertCategoryBySlug('daily-life', 'Daily Life');
}
