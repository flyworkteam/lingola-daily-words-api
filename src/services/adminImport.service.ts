import { DEFAULT_TARGET_LANG, FIXED_SOURCE_LANG, normalizeSupportedTargetLang } from '../constants/supportedLanguages.js';
import { prisma } from '../db/prisma.js';
import { findOrCreateVocabularyItemForImport } from './vocabularyLanguage.service.js';

const DEFAULT_SOURCE_LANG = FIXED_SOURCE_LANG;

const IMPORT_BATCH_SIZE = 25;

export type ImportWordInput = {
  sourceText: string;
  targetText: string;
  pronunciationText?: string | null;
};

export type ImportStats = {
  fetched: number;
  inserted: number;
  skipped: number;
};

function emptyStats(): ImportStats {
  return { fetched: 0, inserted: 0, skipped: 0 };
}

async function prefetchExistingBySourceTexts(
  levelId: string,
  sourceTexts: string[],
  targetLang: string,
) {
  if (sourceTexts.length === 0) {
    return new Map<string, { id: string; translationText: string | null }>();
  }

  const items = await prisma.vocabularyItem.findMany({
    where: {
      sourceLang: DEFAULT_SOURCE_LANG,
      levelId,
      sourceText: { in: sourceTexts },
    },
    select: {
      id: true,
      sourceText: true,
      translations: {
        where: { targetLang },
        select: { targetText: true },
        take: 1,
      },
    },
  });

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

async function importWordBatch(
  words: ImportWordInput[],
  levelId: string,
  categoryId: string,
  targetLang: string,
  existingBySource: Map<string, { id: string; translationText: string | null }>,
): Promise<ImportStats> {
  const stats = emptyStats();
  stats.fetched = words.length;

  const pending: ImportWordInput[] = [];

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

  await prisma.$transaction(async (tx) => {
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
        tx,
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

function mergeStats(target: ImportStats, source: ImportStats) {
  target.fetched += source.fetched;
  target.inserted += source.inserted;
  target.skipped += source.skipped;
}

export async function persistImportedWords(args: {
  words: ImportWordInput[];
  levelId: string;
  categoryId: string;
  targetLang: string;
}): Promise<ImportStats> {
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

export async function ensureLevel(code: string) {
  const levelCount = await prisma.level.count();
  return prisma.level.upsert({
    where: { code },
    update: { name: code, isActive: true },
    create: {
      code,
      name: code,
      order: levelCount + 1,
      isActive: true,
    },
  });
}

export async function ensureDailyLifeCategory() {
  return prisma.category.upsert({
    where: { slug: 'daily-life' },
    update: { name: 'Daily Life', isActive: true },
    create: { name: 'Daily Life', slug: 'daily-life', isActive: true },
  });
}
