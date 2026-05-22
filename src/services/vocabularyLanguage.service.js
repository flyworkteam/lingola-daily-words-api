import {
  createVocabularyItem,
  findUserLearningProfile,
  findVocabularyItemForImport,
  updateVocabularyItem,
  upsertVocabularyTranslationRow,
} from '../db/repositories.js';
import {
  DEFAULT_TARGET_LANG,
  FIXED_SOURCE_LANG,
  normalizeSupportedTargetLang,
} from '../constants/supportedLanguages.js';

export const DEFAULT_SOURCE_LANG = FIXED_SOURCE_LANG;
export { DEFAULT_TARGET_LANG };
export const FALLBACK_TARGET_LANG = DEFAULT_TARGET_LANG;

export function translationLangsForQuery(targetLang) {
  if (targetLang === FALLBACK_TARGET_LANG) {
    return [FALLBACK_TARGET_LANG];
  }
  return [targetLang, FALLBACK_TARGET_LANG];
}

export async function resolveUserLanguagePair(userId) {
  const profile = await findUserLearningProfile(userId);
  return {
    sourceLang: FIXED_SOURCE_LANG,
    targetLang: normalizeSupportedTargetLang(profile?.targetLang),
  };
}

export function resolveLanguagePairFromQuery(query, profile = null) {
  const targetFromQuery =
    typeof query.targetLang === 'string' && query.targetLang.length > 0
      ? query.targetLang
      : undefined;

  return {
    sourceLang: FIXED_SOURCE_LANG,
    targetLang: normalizeSupportedTargetLang(targetFromQuery ?? profile?.targetLang),
  };
}

export function applyVocabularyLanguageFilter(where, languages, options = {}) {
  const translationLang = options.translationTargetLang ?? languages.targetLang;
  return {
    ...where,
    sourceLang: FIXED_SOURCE_LANG,
    translationLang,
  };
}

export function resolveItemTranslation(item, targetLang) {
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

export function mapVocabularyItemForTargetLang(item, targetLang) {
  const meaning = resolveItemTranslation(item, targetLang);
  return {
    ...item,
    targetText: meaning.targetText,
    exampleTranslation: meaning.exampleTranslation,
  };
}

export async function upsertVocabularyTranslation(
  vocabularyItemId,
  targetLang,
  targetText,
  exampleTranslation,
) {
  const lang = normalizeSupportedTargetLang(targetLang, DEFAULT_TARGET_LANG);
  await upsertVocabularyTranslationRow(
    vocabularyItemId,
    lang,
    targetText,
    exampleTranslation ?? null,
  );
}

export async function findOrCreateVocabularyItemForImport(args, connection = null) {
  const sourceLang = DEFAULT_SOURCE_LANG;
  const targetLang = normalizeSupportedTargetLang(args.targetLang, DEFAULT_TARGET_LANG);

  let item = await findVocabularyItemForImport(
    args.sourceText,
    sourceLang,
    args.levelId,
    connection,
  );

  if (!item) {
    item = await createVocabularyItem(
      {
        sourceText: args.sourceText,
        targetText: args.targetText,
        sourceLang,
        targetLang,
        pronunciationText: args.pronunciationText ?? null,
        levelId: args.levelId,
        categoryId: args.categoryId,
        isActive: true,
      },
      connection,
    );
  }

  await upsertVocabularyTranslationRow(
    item.id,
    targetLang,
    args.targetText,
    item.exampleTranslation,
    connection,
  );

  if (targetLang === FALLBACK_TARGET_LANG) {
    await updateVocabularyItem(
      item.id,
      {
        targetText: args.targetText,
        targetLang,
      },
      connection,
    );
  }

  return item;
}
