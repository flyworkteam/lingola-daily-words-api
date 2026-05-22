import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../db/prisma.js';
import {
  applyVocabularyLanguageFilter,
  FALLBACK_TARGET_LANG,
  mapVocabularyItemForTargetLang,
  resolveLanguagePairFromQuery,
  resolveUserLanguagePair,
  vocabularyIncludeForLang,
  type UserLanguagePair,
  type VocabularyItemWithTranslations,
} from './vocabularyLanguage.service.js';
import { resolvePracticeDifficulty, resolveVocabularyLevel } from './dailyWord.service.js';

export type VocabularyFindManyArgs = {
  where: Prisma.VocabularyItemWhereInput;
  orderBy?:
    | Prisma.VocabularyItemOrderByWithRelationInput
    | Prisma.VocabularyItemOrderByWithRelationInput[];
  take?: number;
  skip?: number;
};

export type ResolvedVocabularyContext = {
  languages: UserLanguagePair;
  level: string;
  difficulty: number;
};

export async function resolveRequestLanguagePair(
  req: Pick<Request, 'user' | 'query'>,
): Promise<UserLanguagePair> {
  if (req.user) {
    return resolveUserLanguagePair(req.user.id);
  }
  return resolveLanguagePairFromQuery(req.query);
}

export async function resolveVocabularyContext(
  req: Pick<Request, 'user' | 'query'>,
): Promise<ResolvedVocabularyContext> {
  const languages = await resolveRequestLanguagePair(req);

  if (req.user) {
    const [level, difficulty] = await Promise.all([
      resolveVocabularyLevel(req.user.id, req.query.level),
      resolvePracticeDifficulty(req.user.id, req.query.difficulty),
    ]);
    return { languages, level, difficulty };
  }

  const levelFromQuery =
    typeof req.query.level === 'string' && req.query.level.length > 0
      ? req.query.level
      : null;
  const difficultyFromQuery = Number(req.query.difficulty);
  const difficulty =
    Number.isInteger(difficultyFromQuery) &&
    difficultyFromQuery >= 1 &&
    difficultyFromQuery <= 3
      ? difficultyFromQuery
      : 1;

  return {
    languages,
    level: levelFromQuery ?? 'A1',
    difficulty,
  };
}

export function buildLevelWhere(levelCode: string): Prisma.VocabularyItemWhereInput {
  return {
    isActive: true,
    level: { code: levelCode, isActive: true },
  };
}

export function buildLevelAndDifficultyWhere(
  levelCode: string,
  difficulty: number,
): Prisma.VocabularyItemWhereInput {
  return {
    ...buildLevelWhere(levelCode),
    difficultyScore: difficulty,
  };
}

async function findManyForTranslationLang(
  languages: UserLanguagePair,
  translationLang: string,
  args: VocabularyFindManyArgs,
) {
  return prisma.vocabularyItem.findMany({
    where: applyVocabularyLanguageFilter(args.where, languages, {
      translationTargetLang: translationLang,
    }),
    include: vocabularyIncludeForLang(languages.targetLang),
    orderBy: args.orderBy,
    take: args.take,
    skip: args.skip,
  });
}

async function countForTranslationLang(
  languages: UserLanguagePair,
  translationLang: string,
  where: Prisma.VocabularyItemWhereInput,
) {
  return prisma.vocabularyItem.count({
    where: applyVocabularyLanguageFilter(where, languages, {
      translationTargetLang: translationLang,
    }),
  });
}

export async function resolveEffectiveTranslationLang(
  languages: UserLanguagePair,
  where: Prisma.VocabularyItemWhereInput,
): Promise<string> {
  const preferred = languages.targetLang;
  const preferredCount = await countForTranslationLang(languages, preferred, where);

  if (preferredCount > 0 || preferred === FALLBACK_TARGET_LANG) {
    return preferred;
  }

  return FALLBACK_TARGET_LANG;
}

export async function findVocabularyForUserLanguage(
  languages: UserLanguagePair,
  args: VocabularyFindManyArgs,
) {
  const preferred = languages.targetLang;
  let items = await findManyForTranslationLang(languages, preferred, args);

  if (items.length === 0 && preferred !== FALLBACK_TARGET_LANG) {
    items = await findManyForTranslationLang(languages, FALLBACK_TARGET_LANG, args);
  }

  return items.map((item) =>
    mapVocabularyItemForTargetLang(
      item as VocabularyItemWithTranslations,
      languages.targetLang,
    ),
  );
}

export async function findAndCountVocabularyForUserLanguage(
  languages: UserLanguagePair,
  args: VocabularyFindManyArgs,
) {
  const effectiveLang = await resolveEffectiveTranslationLang(languages, args.where);

  const [rawItems, count] = await Promise.all([
    findManyForTranslationLang(languages, effectiveLang, args),
    countForTranslationLang(languages, effectiveLang, args.where),
  ]);

  const items = rawItems.map((item) =>
    mapVocabularyItemForTargetLang(
      item as VocabularyItemWithTranslations,
      languages.targetLang,
    ),
  );

  return { items, count };
}
