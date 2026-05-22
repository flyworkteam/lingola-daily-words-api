import type { Prisma, VocabularyItem } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  DEFAULT_TARGET_LANG,
  FIXED_SOURCE_LANG,
  normalizeSupportedTargetLang,
} from '../constants/supportedLanguages.js';

export const DEFAULT_SOURCE_LANG = FIXED_SOURCE_LANG;
export { DEFAULT_TARGET_LANG };
export const FALLBACK_TARGET_LANG = DEFAULT_TARGET_LANG;

export type UserLanguagePair = {
  sourceLang: string;
  targetLang: string;
};

export type VocabularyTranslationRow = {
  targetLang: string;
  targetText: string;
  exampleTranslation: string | null;
};

export type VocabularyItemWithTranslations = VocabularyItem & {
  translations: VocabularyTranslationRow[];
};

export function translationLangsForQuery(targetLang: string): string[] {
  if (targetLang === FALLBACK_TARGET_LANG) {
    return [FALLBACK_TARGET_LANG];
  }
  return [targetLang, FALLBACK_TARGET_LANG];
}

export async function resolveUserLanguagePair(userId: string): Promise<UserLanguagePair> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
    select: { sourceLang: true, targetLang: true },
  });

  return {
    sourceLang: FIXED_SOURCE_LANG,
    targetLang: normalizeSupportedTargetLang(profile?.targetLang),
  };
}

export function resolveLanguagePairFromQuery(
  query: {
    sourceLang?: unknown;
    targetLang?: unknown;
  },
  profile?: UserLanguagePair | null,
): UserLanguagePair {
  const targetFromQuery =
    typeof query.targetLang === 'string' && query.targetLang.length > 0
      ? query.targetLang
      : undefined;

  return {
    sourceLang: FIXED_SOURCE_LANG,
    targetLang: normalizeSupportedTargetLang(
      targetFromQuery ?? profile?.targetLang,
    ),
  };
}

export function vocabularyIncludeForLang(targetLang: string) {
  return {
    level: true,
    category: true,
    translations: {
      where: {
        targetLang: { in: translationLangsForQuery(targetLang) },
      },
    },
  } satisfies Prisma.VocabularyItemInclude;
}

export function applyVocabularyLanguageFilter(
  where: Prisma.VocabularyItemWhereInput,
  languages: UserLanguagePair,
  options?: { translationTargetLang?: string },
): Prisma.VocabularyItemWhereInput {
  const translationLang = options?.translationTargetLang ?? languages.targetLang;

  return {
    ...where,
    sourceLang: FIXED_SOURCE_LANG,
    translations: {
      some: {
        targetLang: translationLang,
      },
    },
  };
}

export function resolveItemTranslation(
  item: VocabularyItemWithTranslations,
  targetLang: string,
): { targetText: string; exampleTranslation: string | null } {
  const byLang = new Map(item.translations.map((row) => [row.targetLang, row]));

  const preferred = byLang.get(targetLang);
  if (preferred) {
    return {
      targetText: preferred.targetText,
      exampleTranslation: preferred.exampleTranslation,
    };
  }

  const fallback = byLang.get(FALLBACK_TARGET_LANG);
  if (fallback) {
    return {
      targetText: fallback.targetText,
      exampleTranslation: fallback.exampleTranslation,
    };
  }

  return {
    targetText: item.targetText,
    exampleTranslation: item.exampleTranslation,
  };
}

export function mapVocabularyItemForTargetLang<T extends VocabularyItemWithTranslations>(
  item: T,
  targetLang: string,
): T & { targetText: string; exampleTranslation: string | null } {
  const meaning = resolveItemTranslation(item, targetLang);
  return {
    ...item,
    targetText: meaning.targetText,
    exampleTranslation: meaning.exampleTranslation,
  };
}

export async function upsertVocabularyTranslation(
  vocabularyItemId: string,
  targetLang: string,
  targetText: string,
  exampleTranslation?: string | null,
) {
  const lang = normalizeSupportedTargetLang(targetLang, DEFAULT_TARGET_LANG);

  return prisma.vocabularyTranslation.upsert({
    where: {
      vocabularyItemId_targetLang: {
        vocabularyItemId,
        targetLang: lang,
      },
    },
    create: {
      vocabularyItemId,
      targetLang: lang,
      targetText,
      exampleTranslation: exampleTranslation ?? null,
    },
    update: {
      targetText,
      exampleTranslation: exampleTranslation ?? null,
    },
  });
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function upsertVocabularyTranslationWithClient(
  db: DbClient,
  vocabularyItemId: string,
  targetLang: string,
  targetText: string,
  exampleTranslation?: string | null,
) {
  const lang = normalizeSupportedTargetLang(targetLang, DEFAULT_TARGET_LANG);

  return db.vocabularyTranslation.upsert({
    where: {
      vocabularyItemId_targetLang: {
        vocabularyItemId,
        targetLang: lang,
      },
    },
    create: {
      vocabularyItemId,
      targetLang: lang,
      targetText,
      exampleTranslation: exampleTranslation ?? null,
    },
    update: {
      targetText,
      exampleTranslation: exampleTranslation ?? null,
    },
  });
}

export async function findOrCreateVocabularyItemForImport(
  args: {
    sourceText: string;
    levelId: string;
    categoryId: string | null;
    targetLang: string;
    targetText: string;
    pronunciationText?: string | null;
  },
  db: DbClient = prisma,
) {
  const sourceLang = DEFAULT_SOURCE_LANG;
  const targetLang = normalizeSupportedTargetLang(args.targetLang, DEFAULT_TARGET_LANG);

  let item = await db.vocabularyItem.findFirst({
    where: {
      sourceText: args.sourceText,
      sourceLang,
      levelId: args.levelId,
    },
  });

  if (!item) {
    item = await db.vocabularyItem.create({
      data: {
        sourceText: args.sourceText,
        targetText: args.targetText,
        sourceLang,
        targetLang,
        pronunciationText: args.pronunciationText ?? null,
        levelId: args.levelId,
        categoryId: args.categoryId,
        isActive: true,
      },
    });
  }

  await upsertVocabularyTranslationWithClient(
    db,
    item.id,
    targetLang,
    args.targetText,
    item.exampleTranslation,
  );

  if (targetLang === FALLBACK_TARGET_LANG) {
    await db.vocabularyItem.update({
      where: { id: item.id },
      data: {
        targetText: args.targetText,
        targetLang,
      },
    });
  }

  return item;
}

/** @deprecated Use findVocabularyForUserLanguage */
export async function findVocabularyWithTargetLangFallback<T>(
  languages: UserLanguagePair,
  fetch: (targetLang: string) => Promise<T[]>,
): Promise<T[]> {
  const result = await fetch(languages.targetLang);
  if (result.length > 0 || languages.targetLang === FALLBACK_TARGET_LANG) {
    return result;
  }
  return fetch(FALLBACK_TARGET_LANG);
}
