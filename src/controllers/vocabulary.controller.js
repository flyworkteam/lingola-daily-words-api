import {
  findSavedVocabularyProgress,
  findVocabularyItemById,
  findVocabularyProgressByItemIds,
} from '../db/repositories.js';
import {
  getDailyWordForUser,
  resolveVocabularyLevel,
} from '../services/dailyWord.service.js';
import {
  mapVocabularyItemForTargetLang,
  resolveUserLanguagePair,
  translationLangsForQuery,
} from '../services/vocabularyLanguage.service.js';
import { buildLevelWhere } from '../services/vocabularyFilters.js';
import {
  findAndCountVocabularyForUserLanguage,
  findVocabularyForUserLanguage,
  resolveRequestLanguagePair,
  resolveVocabularyContext,
} from '../services/vocabularyQuery.service.js';
import { FIXED_SOURCE_LANG } from "../constants/supportedLanguages.js";
function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
function sendPaginatedSuccess(res, data, pagination) {
  return res.status(200).json({ success: true, data, pagination });
}
function sendError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}
function parseLimit(value) {
  if (value === void 0) {
    return null;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return limit;
}
function parseLimitWithDefault(value, defaultValue) {
  if (value === void 0) {
    return defaultValue;
  }
  return parseLimit(value);
}
function parseOffset(value) {
  if (value === void 0) {
    return 0;
  }
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    return null;
  }
  return offset;
}
function parseDictionaryLimit(value) {
  if (value === void 0) {
    return 50;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return Math.min(limit, 100);
}
function compareReviewPriority(a, b) {
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
function serializeProgress(progress) {
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
    isSaved: progress.isSaved
  };
}
function toReviewItem(item, progress, targetLang) {
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
    progress: serializeProgress(progress)
  };
}
function resolveCommonExampleSentence(sourceText, existing) {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }
  const word = sourceText.trim();
  if (!word) {
    return "I use the word in daily life.";
  }
  return `I use the word ${word} in daily life.`;
}
function resolveCommonExampleTranslation(targetText, existing) {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }
  const word = targetText.trim();
  if (!word) {
    return "Bu kelime g\xFCnl\xFCk kullan\u0131mda \xF6\u011Frenilebilir.";
  }
  return `${word} kelimesi g\xFCnl\xFCk kullan\u0131mda \xF6\u011Frenilebilir.`;
}
function toCommonTermItem(item, progress, targetLang) {
  const mapped = mapVocabularyItemForTargetLang(item, targetLang);
  return {
    id: mapped.id,
    sourceText: mapped.sourceText,
    targetText: mapped.targetText,
    pronunciationText: mapped.pronunciationText,
    exampleSentence: resolveCommonExampleSentence(
      mapped.sourceText,
      mapped.exampleSentence
    ),
    exampleTranslation: resolveCommonExampleTranslation(
      mapped.targetText,
      mapped.exampleTranslation
    ),
    level: {
      code: mapped.level.code,
      name: mapped.level.name
    },
    category: mapped.category ? {
      slug: mapped.category.slug,
      name: mapped.category.name
    } : null,
    progress: serializeProgress(progress)
  };
}
function buildVocabularyWhere(query, levelCode) {
  const where = { sourceLang: FIXED_SOURCE_LANG };
  const { category } = query;

  if (levelCode) {
    where.levelCode = levelCode;
  } else if (typeof query.level === 'string' && query.level.length > 0) {
    where.levelCode = query.level;
  }

  if (typeof category === 'string' && category.length > 0) {
    where.categorySlug = category;
  }

  return where;
}

function buildDictionaryWhere(query, levelCode) {
  const where = buildVocabularyWhere(query, levelCode);
  const { search, letter } = query;

  if (typeof letter === 'string' && letter.length > 0) {
    where.letter = letter;
  }

  if (typeof search === 'string' && search.trim().length > 0) {
    where.search = search.trim();
  }

  return where;
}

async function fetchProgressByItemIds(userId, itemIds) {
  if (itemIds.length === 0) {
    return new Map();
  }
  const progressRecords = await findVocabularyProgressByItemIds(userId, itemIds);
  return new Map(progressRecords.map((record) => [record.vocabularyItemId, record]));
}
async function getVocabulary(req, res) {
  try {
    const limit = parseLimit(req.query.limit);
    if (req.query.limit !== void 0 && limit === null) {
      return sendError(res, "limit must be a positive integer", 400);
    }
    const { languages, level } = await resolveVocabularyContext(req);
    const baseWhere = buildVocabularyWhere(req.query, level);
    const items = await findVocabularyForUserLanguage(languages, {
      where: baseWhere,
      orderBy: { order: "asc" },
      ...limit !== null ? { take: limit } : {}
    });
    return sendSuccess(res, items);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch vocabulary");
  }
}
async function getCommonVocabulary(req, res) {
  try {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    const limit = parseLimitWithDefault(req.query.limit, 20);
    if (limit === null) {
      return sendError(res, "limit must be a positive integer", 400);
    }
    const level = await resolveVocabularyLevel(req.user.id, req.query.level);
    const languages = await resolveUserLanguagePair(req.user.id);
    const items = await findVocabularyForUserLanguage(languages, {
      where: buildLevelWhere(level),
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      take: limit
    });
    if (items.length === 0) {
      return sendSuccess(res, []);
    }
    let progressByItemId = /* @__PURE__ */ new Map();
    try {
      const progressRecords = await findVocabularyProgressByItemIds(
        req.user.id,
        items.map((item) => item.id),
      );
      progressByItemId = new Map(
        progressRecords.map((record) => [record.vocabularyItemId, record])
      );
    } catch (progressError) {
      console.error("[getCommonVocabulary] progress query failed:", progressError);
    }
    const result = items.map(
      (item) => toCommonTermItem(
        item,
        progressByItemId.get(item.id) ?? null,
        languages.targetLang
      )
    );
    return sendSuccess(res, result);
  } catch (error) {
    console.error("[getCommonVocabulary] error:", error);
    if (error instanceof Error) {
      console.error("[getCommonVocabulary] stack:", error.stack);
    }
    return sendError(res, "S\u0131k kullan\u0131lan terimler al\u0131namad\u0131");
  }
}
async function getDailyWord(req, res) {
  try {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    const dailyWord = await getDailyWordForUser(req.user.id);
    return sendSuccess(res, dailyWord);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_VOCABULARY_FOR_DAILY_WORD") {
      return sendError(res, "No vocabulary available for daily word", 404);
    }
    console.error(error);
    return sendError(res, "Failed to fetch daily word");
  }
}
async function getDictionaryVocabulary(req, res) {
  try {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    const limit = parseDictionaryLimit(req.query.limit);
    if (limit === null) {
      return sendError(res, "limit must be a positive integer up to 100", 400);
    }
    const offset = parseOffset(req.query.offset);
    if (offset === null) {
      return sendError(res, "offset must be a non-negative integer", 400);
    }
    const { languages, level } = await resolveVocabularyContext(req);
    const baseWhere = buildDictionaryWhere(req.query, level);
    const { items, count } = await findAndCountVocabularyForUserLanguage(languages, {
      where: baseWhere,
      orderBy: { sourceText: "asc" },
      take: limit,
      skip: offset
    });
    const progressByItemId = await fetchProgressByItemIds(
      req.user.id,
      items.map((item) => item.id)
    );
    const data = items.map(
      (item) => toCommonTermItem(
        item,
        progressByItemId.get(item.id) ?? null,
        languages.targetLang
      )
    );
    return sendPaginatedSuccess(res, data, { limit, offset, count });
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch dictionary vocabulary");
  }
}
async function getSavedVocabulary(req, res) {
  try {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    const languages = await resolveUserLanguagePair(req.user.id);
    const savedRecords = await findSavedVocabularyProgress(
      req.user.id,
      FIXED_SOURCE_LANG,
      translationLangsForQuery(languages.targetLang),
    );
    const result = savedRecords.map((record) =>
      toCommonTermItem(record.vocabularyItem, record, languages.targetLang),
    );
    return sendSuccess(res, result);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch saved vocabulary");
  }
}
async function getVocabularyReview(req, res) {
  try {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    const limit = parseLimitWithDefault(req.query.limit, 10);
    if (limit === null) {
      return sendError(res, "limit must be a positive integer", 400);
    }
    const level = await resolveVocabularyLevel(req.user.id, req.query.level);
    const languages = await resolveUserLanguagePair(req.user.id);
    const rawItems = await findVocabularyForUserLanguage(languages, {
      where: buildLevelWhere(level),
      orderBy: { order: "asc" }
    });
    if (rawItems.length === 0) {
      return sendSuccess(res, []);
    }
    const progressRecords = await findVocabularyProgressByItemIds(
      req.user.id,
      rawItems.map((item) => item.id),
    );
    const progressByItemId = new Map(
      progressRecords.map((record) => [record.vocabularyItemId, record])
    );
    const rankedItems = rawItems.map((item) => {
      const progress = progressByItemId.get(item.id) ?? null;
      return {
        item,
        progress,
        sort: {
          wrongCount: progress?.wrongCount ?? 0,
          isLearned: progress?.status === "learned",
          seenCount: progress?.seenCount ?? 0,
          lastSeenAt: progress?.lastSeenAt ?? null,
          order: item.order
        }
      };
    }).sort((a, b) => compareReviewPriority(a.sort, b.sort)).slice(0, limit).map(({ item, progress }) => toReviewItem(item, progress, languages.targetLang));
    return sendSuccess(res, rankedItems);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch vocabulary review");
  }
}
async function getVocabularyById(req, res) {
  try {
    const { id } = req.params;
    const languages = await resolveRequestLanguagePair(req);
    const item = await findVocabularyItemById(
      id,
      translationLangsForQuery(languages.targetLang),
    );
    if (!item) {
      return sendError(res, "Vocabulary item not found", 404);
    }
    const mapped = mapVocabularyItemForTargetLang(
      item,
      languages.targetLang
    );
    return sendSuccess(res, mapped);
  } catch (error) {
    console.error(error);
    return sendError(res, "Failed to fetch vocabulary item");
  }
}
export {
  getCommonVocabulary,
  getDailyWord,
  getDictionaryVocabulary,
  getSavedVocabulary,
  getVocabulary,
  getVocabularyById,
  getVocabularyReview
};
