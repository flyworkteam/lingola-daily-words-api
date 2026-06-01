import { countVocabularyItems, findVocabularyItems } from '../db/repositories.js';
import { FIXED_SOURCE_LANG } from '../constants/supportedLanguages.js';
import {
  applyVocabularyLanguageFilter,
  FALLBACK_TARGET_LANG,
  mapVocabularyItemForTargetLang,
  resolveLanguagePairFromQuery,
  resolveUserLanguagePair,
  translationLangsForQuery,
} from './vocabularyLanguage.service.js';
import { resolvePracticeDifficulty, resolveVocabularyLevel } from './dailyWord.service.js';
import {
  buildLevelAndDifficultyWhere,
  buildLevelWhere,
  normalizeVocabularyListWhere,
} from './vocabularyFilters.js';

export { buildLevelWhere, buildLevelAndDifficultyWhere };

const DEFAULT_LEVEL = 'A1';

export async function resolveRequestLanguagePair(req) {
  if (req.user) {
    return resolveUserLanguagePair(req.user.id);
  }
  return resolveLanguagePairFromQuery(req.query);
}

export async function resolveVocabularyContext(req) {
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

function resolveOrderBy(orderBy) {
  if (!orderBy) return 'order';
  if (typeof orderBy === 'string') return orderBy;
  if (orderBy.sourceText) return 'sourceText';
  if (orderBy.order) return 'order';
  if (Array.isArray(orderBy) && orderBy.some((o) => o.createdAt)) return 'createdAt';
  return 'order';
}

async function findManyForTranslationLang(languages, translationLang, args) {
  const normalizedWhere = normalizeVocabularyListWhere(args.where);
  const filters = applyVocabularyLanguageFilter(normalizedWhere, languages, {
    translationTargetLang: translationLang,
  });

  return findVocabularyItems({
    ...filters,
    translationLangs: translationLangsForQuery(languages.targetLang),
    orderBy: resolveOrderBy(args.orderBy),
    take: args.take,
    skip: args.skip,
  });
}

async function countForTranslationLang(languages, translationLang, where) {
  const filters = applyVocabularyLanguageFilter(normalizeVocabularyListWhere(where), languages, {
    translationTargetLang: translationLang,
  });
  return countVocabularyItems(filters);
}

export async function resolveEffectiveTranslationLang(languages, where) {
  const preferred = languages.targetLang;
  const preferredCount = await countForTranslationLang(languages, preferred, where);

  if (preferredCount > 0 || preferred === FALLBACK_TARGET_LANG) {
    return preferred;
  }

  return FALLBACK_TARGET_LANG;
}

export async function findVocabularyForUserLanguage(languages, args) {
  const preferred = languages.targetLang;
  let items = await findManyForTranslationLang(languages, preferred, args);

  if (items.length === 0 && preferred !== FALLBACK_TARGET_LANG) {
    items = await findManyForTranslationLang(languages, FALLBACK_TARGET_LANG, args);
  }

  return items.map((item) => mapVocabularyItemForTargetLang(item, languages.targetLang));
}

async function findLegacyVocabularyItems(languages, filters, listArgs = {}) {
  const legacyItems = await findVocabularyItems({
    ...filters,
    sourceLang: FIXED_SOURCE_LANG,
    translationLangs: translationLangsForQuery(languages.targetLang),
    orderBy: resolveOrderBy(listArgs.orderBy),
    take: listArgs.take,
    skip: listArgs.skip,
  });

  return legacyItems.map((item) =>
    mapVocabularyItemForTargetLang(item, languages.targetLang),
  );
}

async function fetchVocabularyWithLegacyFallback(languages, filters, listArgs = {}) {
  let items = await findVocabularyForUserLanguage(languages, {
    where: filters,
    ...listArgs,
  });

  if (items.length === 0) {
    items = await findLegacyVocabularyItems(languages, filters, listArgs);
  }

  return items;
}

export async function findVocabularyForUserAtLevel(languages, levelCode, listArgs = {}) {
  let items = await fetchVocabularyWithLegacyFallback(
    languages,
    buildLevelWhere(levelCode),
    listArgs,
  );

  if (items.length === 0 && levelCode !== DEFAULT_LEVEL) {
    items = await fetchVocabularyWithLegacyFallback(
      languages,
      buildLevelWhere(DEFAULT_LEVEL),
      listArgs,
    );
  }

  return items;
}

export async function findVocabularyForUserAtLevelAndDifficulty(
  languages,
  levelCode,
  difficulty,
  listArgs = {},
) {
  let items = await fetchVocabularyWithLegacyFallback(
    languages,
    buildLevelAndDifficultyWhere(levelCode, difficulty),
    listArgs,
  );

  if (items.length === 0 && levelCode !== DEFAULT_LEVEL) {
    items = await fetchVocabularyWithLegacyFallback(
      languages,
      buildLevelAndDifficultyWhere(DEFAULT_LEVEL, difficulty),
      listArgs,
    );
  }

  return items;
}

export async function findAndCountVocabularyForUserLanguage(languages, args) {
  const effectiveLang = await resolveEffectiveTranslationLang(languages, args.where);

  const [rawItems, count] = await Promise.all([
    findManyForTranslationLang(languages, effectiveLang, args),
    countForTranslationLang(languages, effectiveLang, args.where),
  ]);

  const items = rawItems.map((item) =>
    mapVocabularyItemForTargetLang(item, languages.targetLang),
  );

  return { items, count };
}
