import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  getDailyWordForUser,
  resolveVocabularyLevel,
} from '../services/dailyWord.service.js';
import {
  mapVocabularyItemForTargetLang,
  resolveUserLanguagePair,
  vocabularyIncludeForLang,
  type VocabularyItemWithTranslations,
} from '../services/vocabularyLanguage.service.js';
import {
  buildLevelWhere,
  findAndCountVocabularyForUserLanguage,
  findVocabularyForUserLanguage,
  resolveRequestLanguagePair,
  resolveVocabularyContext,
} from '../services/vocabularyQuery.service.js';
import { FIXED_SOURCE_LANG } from '../constants/supportedLanguages.js';

function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendPaginatedSuccess<T>(
  res: Response,
  data: T[],
  pagination: { limit: number; offset: number; count: number },
) {
  return res.status(200).json({ success: true, data, pagination });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) {
    return null;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return limit;
}

function parseLimitWithDefault(value: unknown, defaultValue: number): number | null {
  if (value === undefined) {
    return defaultValue;
  }
  return parseLimit(value);
}

function parseOffset(value: unknown): number | null {
  if (value === undefined) {
    return 0;
  }
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    return null;
  }
  return offset;
}

function parseDictionaryLimit(value: unknown): number | null {
  if (value === undefined) {
    return 50;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return Math.min(limit, 100);
}

type ReviewSortable = {
  wrongCount: number;
  isLearned: boolean;
  seenCount: number;
  lastSeenAt: Date | null;
  order: number;
};

function compareReviewPriority(a: ReviewSortable, b: ReviewSortable): number {
  if (b.wrongCount !== a.wrongCount) {
    return b.wrongCount - a.wrongCount;
  }

  if (Number(a.isLearned) !== Number(b.isLearned)) {
    return Number(a.isLearned) - Number(b.isLearned);
  }

  if (a.seenCount !== b.seenCount) {
    return a.seenCount - b.seenCount;
  }

  const aLastSeen = a.lastSeenAt?.getTime() ?? 0;
  const bLastSeen = b.lastSeenAt?.getTime() ?? 0;
  if (aLastSeen !== bLastSeen) {
    return aLastSeen - bLastSeen;
  }

  return a.order - b.order;
}

type VocabularyItemWithRelations = Prisma.VocabularyItemGetPayload<{
  include: ReturnType<typeof vocabularyIncludeForLang>;
}> &
  VocabularyItemWithTranslations;

function serializeProgress(
  progress: Prisma.UserVocabularyProgressGetPayload<object> | null,
) {
  if (!progress) {
    return null;
  }

  return {
    id: progress.id,
    vocabularyItemId: progress.vocabularyItemId,
    status: progress.status,
    seenCount: progress.seenCount,
    correctCount: progress.correctCount,
    wrongCount: progress.wrongCount,
    lastSeenAt: progress.lastSeenAt?.toISOString() ?? null,
    learnedAt: progress.learnedAt?.toISOString() ?? null,
    isSaved: progress.isSaved,
  };
}

function toReviewItem(
  item: VocabularyItemWithRelations,
  progress: Prisma.UserVocabularyProgressGetPayload<object> | null,
  targetLang: string,
) {
  const mapped = mapVocabularyItemForTargetLang(item, targetLang);
  return {
    id: mapped.id,
    sourceText: mapped.sourceText,
    targetText: mapped.targetText,
    pronunciationText: mapped.pronunciationText,
    exampleSentence: mapped.exampleSentence,
    exampleTranslation: mapped.exampleTranslation,
    level: mapped.level,
    category: mapped.category,
    progress: serializeProgress(progress),
  };
}

function resolveCommonExampleSentence(
  sourceText: string,
  existing: string | null | undefined,
): string {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = sourceText.trim();
  if (!word) {
    return 'I use the word in daily life.';
  }

  return `I use the word ${word} in daily life.`;
}

function resolveCommonExampleTranslation(
  targetText: string,
  existing: string | null | undefined,
): string {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = targetText.trim();
  if (!word) {
    return 'Bu kelime günlük kullanımda öğrenilebilir.';
  }

  return `${word} kelimesi günlük kullanımda öğrenilebilir.`;
}

function toCommonTermItem(
  item: VocabularyItemWithRelations,
  progress: Prisma.UserVocabularyProgressGetPayload<object> | null,
  targetLang: string,
) {
  const mapped = mapVocabularyItemForTargetLang(item, targetLang);
  return {
    id: mapped.id,
    sourceText: mapped.sourceText,
    targetText: mapped.targetText,
    pronunciationText: mapped.pronunciationText,
    exampleSentence: resolveCommonExampleSentence(
      mapped.sourceText,
      mapped.exampleSentence,
    ),
    exampleTranslation: resolveCommonExampleTranslation(
      mapped.targetText,
      mapped.exampleTranslation,
    ),
    level: {
      code: mapped.level.code,
      name: mapped.level.name,
    },
    category: mapped.category
      ? {
          slug: mapped.category.slug,
          name: mapped.category.name,
        }
      : null,
    progress: serializeProgress(progress),
  };
}

function buildVocabularyWhere(
  query: Request['query'],
  levelCode?: string,
): Prisma.VocabularyItemWhereInput {
  const where: Prisma.VocabularyItemWhereInput = { isActive: true };

  const { category } = query;

  if (levelCode) {
    where.level = { code: levelCode, isActive: true };
  } else if (typeof query.level === 'string' && query.level.length > 0) {
    where.level = { code: query.level, isActive: true };
  }

  if (typeof category === 'string' && category.length > 0) {
    where.category = { slug: category, isActive: true };
  }

  return where;
}

function buildDictionaryWhere(
  query: Request['query'],
  levelCode?: string,
): Prisma.VocabularyItemWhereInput {
  const where: Prisma.VocabularyItemWhereInput = { isActive: true };

  const { search, letter } = query;

  if (levelCode) {
    where.level = { code: levelCode, isActive: true };
  } else if (typeof query.level === 'string' && query.level.length > 0) {
    where.level = { code: query.level, isActive: true };
  }

  if (typeof letter === 'string' && letter.length > 0) {
    where.sourceText = { startsWith: letter };
  }

  if (typeof search === 'string' && search.trim().length > 0) {
    const searchTerm = search.trim();
    const searchFilter: Prisma.VocabularyItemWhereInput = {
      OR: [
        { sourceText: { contains: searchTerm } },
        { targetText: { contains: searchTerm } },
        { pronunciationText: { contains: searchTerm } },
        {
          translations: {
            some: { targetText: { contains: searchTerm } },
          },
        },
      ],
    };

    if (where.AND) {
      where.AND = Array.isArray(where.AND) ? [...where.AND, searchFilter] : [where.AND, searchFilter];
    } else {
      where.AND = [searchFilter];
    }
  }

  return where;
}

async function fetchProgressByItemIds(userId: string, itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Map<string, Prisma.UserVocabularyProgressGetPayload<object>>();
  }

  const progressRecords = await prisma.userVocabularyProgress.findMany({
    where: {
      userId,
      vocabularyItemId: { in: itemIds },
    },
  });

  return new Map(progressRecords.map((record) => [record.vocabularyItemId, record]));
}

export async function getVocabulary(req: Request, res: Response) {
  try {
    const limit = parseLimit(req.query.limit);
    if (req.query.limit !== undefined && limit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const { languages, level } = await resolveVocabularyContext(req);
    const baseWhere = buildVocabularyWhere(req.query, level);

    const items = await findVocabularyForUserLanguage(languages, {
      where: baseWhere,
      orderBy: { order: 'asc' },
      ...(limit !== null ? { take: limit } : {}),
    });

    return sendSuccess(res, items);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch vocabulary');
  }
}

export async function getCommonVocabulary(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const limit = parseLimitWithDefault(req.query.limit, 20);
    if (limit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const level = await resolveVocabularyLevel(req.user.id, req.query.level);
    const languages = await resolveUserLanguagePair(req.user.id);

    const items = await findVocabularyForUserLanguage(languages, {
      where: buildLevelWhere(level),
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    if (items.length === 0) {
      return sendSuccess(res, []);
    }

    let progressByItemId = new Map<
      string,
      Prisma.UserVocabularyProgressGetPayload<object>
    >();

    try {
      const progressRecords = await prisma.userVocabularyProgress.findMany({
        where: {
          userId: req.user.id,
          vocabularyItemId: { in: items.map((item) => item.id) },
        },
      });

      progressByItemId = new Map(
        progressRecords.map((record) => [record.vocabularyItemId, record]),
      );
    } catch (progressError) {
      console.error('[getCommonVocabulary] progress query failed:', progressError);
    }

    const result = items.map((item) =>
      toCommonTermItem(
        item as VocabularyItemWithRelations,
        progressByItemId.get(item.id) ?? null,
        languages.targetLang,
      ),
    );

    return sendSuccess(res, result);
  } catch (error) {
    console.error('[getCommonVocabulary] error:', error);
    if (error instanceof Error) {
      console.error('[getCommonVocabulary] stack:', error.stack);
    }
    return sendError(res, 'Sık kullanılan terimler alınamadı');
  }
}

export async function getDailyWord(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const dailyWord = await getDailyWordForUser(req.user.id);
    return sendSuccess(res, dailyWord);
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_VOCABULARY_FOR_DAILY_WORD') {
      return sendError(res, 'No vocabulary available for daily word', 404);
    }
    console.error(error);
    return sendError(res, 'Failed to fetch daily word');
  }
}

export async function getDictionaryVocabulary(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const limit = parseDictionaryLimit(req.query.limit);
    if (limit === null) {
      return sendError(res, 'limit must be a positive integer up to 100', 400);
    }

    const offset = parseOffset(req.query.offset);
    if (offset === null) {
      return sendError(res, 'offset must be a non-negative integer', 400);
    }

    const { languages, level } = await resolveVocabularyContext(req);
    const baseWhere = buildDictionaryWhere(req.query, level);

    const { items, count } = await findAndCountVocabularyForUserLanguage(languages, {
      where: baseWhere,
      orderBy: { sourceText: 'asc' },
      take: limit,
      skip: offset,
    });

    const progressByItemId = await fetchProgressByItemIds(
      req.user.id,
      items.map((item) => item.id),
    );

    const data = items.map((item) =>
      toCommonTermItem(
        item as VocabularyItemWithRelations,
        progressByItemId.get(item.id) ?? null,
        languages.targetLang,
      ),
    );

    return sendPaginatedSuccess(res, data, { limit, offset, count });
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch dictionary vocabulary');
  }
}

export async function getSavedVocabulary(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const languages = await resolveUserLanguagePair(req.user.id);

    const savedRecords = await prisma.userVocabularyProgress.findMany({
      where: {
        userId: req.user.id,
        isSaved: true,
        vocabularyItem: {
          isActive: true,
          sourceLang: FIXED_SOURCE_LANG,
        },
      },
      include: {
        vocabularyItem: {
          include: vocabularyIncludeForLang(languages.targetLang),
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = savedRecords.map((record) =>
      toCommonTermItem(
        record.vocabularyItem as VocabularyItemWithRelations,
        record,
        languages.targetLang,
      ),
    );

    return sendSuccess(res, result);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch saved vocabulary');
  }
}

export async function getVocabularyReview(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const limit = parseLimitWithDefault(req.query.limit, 10);
    if (limit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const level = await resolveVocabularyLevel(req.user.id, req.query.level);
    const languages = await resolveUserLanguagePair(req.user.id);

    const rawItems = await findVocabularyForUserLanguage(languages, {
      where: buildLevelWhere(level),
      orderBy: { order: 'asc' },
    });

    if (rawItems.length === 0) {
      return sendSuccess(res, []);
    }

    const progressRecords = await prisma.userVocabularyProgress.findMany({
      where: {
        userId: req.user.id,
        vocabularyItemId: { in: rawItems.map((item) => item.id) },
      },
    });

    const progressByItemId = new Map(
      progressRecords.map((record) => [record.vocabularyItemId, record]),
    );

    const rankedItems = rawItems
      .map((item) => {
        const progress = progressByItemId.get(item.id) ?? null;
        return {
          item: item as VocabularyItemWithRelations,
          progress,
          sort: {
            wrongCount: progress?.wrongCount ?? 0,
            isLearned: progress?.status === 'learned',
            seenCount: progress?.seenCount ?? 0,
            lastSeenAt: progress?.lastSeenAt ?? null,
            order: item.order,
          },
        };
      })
      .sort((a, b) => compareReviewPriority(a.sort, b.sort))
      .slice(0, limit)
      .map(({ item, progress }) => toReviewItem(item, progress, languages.targetLang));

    return sendSuccess(res, rankedItems);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch vocabulary review');
  }
}

export async function getVocabularyById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const languages = await resolveRequestLanguagePair(req);

    const item = await prisma.vocabularyItem.findFirst({
      where: { id, isActive: true, sourceLang: FIXED_SOURCE_LANG },
      include: vocabularyIncludeForLang(languages.targetLang),
    });

    if (!item) {
      return sendError(res, 'Vocabulary item not found', 404);
    }

    const mapped = mapVocabularyItemForTargetLang(
      item as VocabularyItemWithTranslations,
      languages.targetLang,
    );

    return sendSuccess(res, mapped);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch vocabulary item');
  }
}
